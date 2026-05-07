import type { PDFDocumentProxy } from "pdfjs-dist";

export type AnimateClipBbox = readonly [x1: number, y1: number, x2: number, y2: number];

export type AnimateClip = {
	/** 0-based page index. */
	pageIndex: number;
	/** Animation index within the document (corresponds to `anmN` and `N.M` in /T). */
	animationIndex: number;
	/** Bounding box in PDF user space (origin bottom-left), shared by all frames + controller. */
	bbox: AnimateClipBbox;
	/**
	 * PDF.js annotation `id` for each frame in playback order (frame 0 first).
	 * The Widget annotation owning this id has `/AP /N` pointing at the frame's Form XObject.
	 */
	frameAnnotationIds: string[];
	/** PDF.js annotation `id` of the controller widget (`/T anmN`). */
	controllerAnnotationId: string;
	/** Frames per second declared by the controller (e.g. `a1_fps=8`). */
	fps: number;
	/** Total frame count (frame indices 0..frameCount-1). */
	frameCount: number;
	/** True when the controller's `/PO` script invokes `aN_playFwd()` / `aN_playBwd()` at the tail. */
	autoplay: boolean;
	/** True when the controller defines a wrap-around branch in its goto-next handler. */
	loop: boolean;
};

type RawAnnotation = {
	id?: string;
	subtype?: string;
	fieldName?: string;
	rect?: number[];
	actions?: Record<string, string[]>;
};

const FRAME_NAME_RE = /^(\d+)\.(\d+)$/;
const CONTROLLER_NAME_RE = /^anm(\d+)$/;

/**
 * Fallback FPS when the controller's PageOpen JS literal is missing or
 * unparseable. Overridden at runtime by the `[animate].default_fps` config
 * value via `setDefaultAnimateFps`.
 */
let defaultFps = 12;

export function setDefaultAnimateFps(value: number): void {
	if (Number.isFinite(value) && value > 0) defaultFps = value;
}

function bboxFromRect(rect: number[] | undefined): AnimateClipBbox | null {
	if (!rect || rect.length !== 4) return null;
	const [a, b, c, d] = rect;
	return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
}

function bboxKey(bbox: AnimateClipBbox): string {
	return bbox.map((n) => n.toFixed(3)).join("|");
}

function joinActionScripts(actions: Record<string, string[]> | undefined, name: string): string {
	const scripts = actions?.[name];
	if (!scripts || scripts.length === 0) return "";
	return scripts.join("\n");
}

function extractFps(script: string, idx: number): number {
	const re = new RegExp(`a${idx}_fps\\s*=\\s*([\\d.]+)`);
	const match = re.exec(script);
	if (!match) return defaultFps;
	const value = Number.parseFloat(match[1]);
	return Number.isFinite(value) && value > 0 ? value : defaultFps;
}

function extractFrameCount(script: string): number | null {
	const match = /for\s*\(\s*var\s+i\s*=\s*0\s*;\s*i\s*<=\s*(\d+)/.exec(script);
	if (!match) return null;
	const last = Number.parseInt(match[1], 10);
	if (!Number.isFinite(last) || last < 0) return null;
	return last + 1;
}

function detectAutoplay(script: string, idx: number): boolean {
	return new RegExp(`a${idx}_play(Fwd|Bwd)\\s*\\(`).test(script);
}

function detectLoop(script: string, idx: number): boolean {
	const re = new RegExp(
		`if\\s*\\(\\s*a${idx}_playing\\s*\\)\\s*\\{\\s*a${idx}_seekFrame\\s*\\(\\s*0\\s*\\)`,
	);
	return re.test(script);
}

type FrameSlot = { id: string; index: number };

type WorkingClip = {
	animationIndex: number;
	bbox: AnimateClipBbox;
	frames: FrameSlot[];
	controller?: { id: string; script: string };
};

function ingestAnnotation(annotation: RawAnnotation, clips: Map<string, WorkingClip>) {
	if (annotation.subtype !== "Widget") return;
	const fieldName = annotation.fieldName;
	const id = annotation.id;
	const bbox = bboxFromRect(annotation.rect);
	if (!fieldName || !id || !bbox) return;

	const frameMatch = FRAME_NAME_RE.exec(fieldName);
	if (frameMatch) {
		const animationIndex = Number.parseInt(frameMatch[1], 10);
		const frameIndex = Number.parseInt(frameMatch[2], 10);
		const key = `${animationIndex}@${bboxKey(bbox)}`;
		const existing = clips.get(key) ?? {
			animationIndex,
			bbox,
			frames: [],
		};
		existing.frames.push({ id, index: frameIndex });
		clips.set(key, existing);
		return;
	}

	const controllerMatch = CONTROLLER_NAME_RE.exec(fieldName);
	if (controllerMatch) {
		const animationIndex = Number.parseInt(controllerMatch[1], 10);
		const key = `${animationIndex}@${bboxKey(bbox)}`;
		const existing = clips.get(key) ?? {
			animationIndex,
			bbox,
			frames: [],
		};
		existing.controller = {
			id,
			script: joinActionScripts(annotation.actions, "PageOpen"),
		};
		clips.set(key, existing);
	}
}

function finalizeClip(pageIndex: number, working: WorkingClip): AnimateClip | null {
	if (!working.controller) return null;
	if (working.frames.length === 0) return null;

	const idx = working.animationIndex;
	const script = working.controller.script;

	const fps = extractFps(script, idx);
	const declaredCount = extractFrameCount(script);
	const frames = [...working.frames].sort((a, b) => a.index - b.index);
	const frameCount = declaredCount ?? frames.length;
	if (frameCount <= 1) return null;

	return {
		pageIndex,
		animationIndex: idx,
		bbox: working.bbox,
		frameAnnotationIds: frames.slice(0, frameCount).map((f) => f.id),
		controllerAnnotationId: working.controller.id,
		fps,
		frameCount,
		autoplay: detectAutoplay(script, idx),
		loop: detectLoop(script, idx),
	};
}

export type DetectAnimateClipsOptions = {
	/** Aborts the walk between pages. Already-collected clips are returned. */
	signal?: AbortSignal;
};

/**
 * Walk every page's annotations, group `animate` widget triplets, and return
 * one descriptor per detected clip. Returns `[]` for PDFs that don't use the
 * `animate` package — never throws.
 *
 * Yields to the event loop between pages so other PDF.js worker requests
 * (canvas rendering, text-content extraction for the visible page) can
 * interleave instead of being serialized behind a full-document scan.
 */
export async function detectAnimateClips(
	pdf: PDFDocumentProxy,
	options?: DetectAnimateClipsOptions,
): Promise<AnimateClip[]> {
	const signal = options?.signal;
	const result: AnimateClip[] = [];
	for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex += 1) {
		if (signal?.aborted) return result;
		try {
			const page = await pdf.getPage(pageIndex + 1);
			if (signal?.aborted) return result;
			const annotations = (await page.getAnnotations({
				intent: "display",
			})) as RawAnnotation[];
			const working = new Map<string, WorkingClip>();
			for (const ann of annotations) {
				ingestAnnotation(ann, working);
			}
			for (const clip of working.values()) {
				const finalized = finalizeClip(pageIndex, clip);
				if (finalized) result.push(finalized);
			}
		} catch (err) {
			console.warn(`animate detect: page ${pageIndex + 1} failed`, err);
		}
		if (pageIndex + 1 < pdf.numPages) {
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
		}
	}
	return result;
}
