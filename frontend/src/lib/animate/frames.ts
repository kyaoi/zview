import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { AnimateClip } from "./detect";

const ANNOTATION_MODE_ENABLE_STORAGE = 3;

const DEFAULT_MAX_ACTIVE_CLIPS = 4;
const SCALE_KEY_DECIMALS = 3;
const DPR_KEY_DECIMALS = 2;

export type ClipPixelBox = {
	/** Top-left x in viewport CSS pixels (origin top-left). */
	x: number;
	/** Top-left y in viewport CSS pixels (origin top-left). */
	y: number;
	width: number;
	height: number;
};

export type CachedClipFrames = {
	/** Stable identity key — currently the controller annotation id. */
	clipId: string;
	scale: number;
	dpr: number;
	/** CSS-pixel bounding box on the page canvas, top-left origin. */
	pixelBox: ClipPixelBox;
	/** One canvas per frame in playback order; pixel-sized at `pixelBox * dpr`. */
	frames: HTMLCanvasElement[];
};

/** Optional streaming hook fired as each frame canvas becomes available. */
export type FrameStreamCallback = (index: number, canvas: HTMLCanvasElement) => void;

export type EnsureOptions = {
	onFrame?: FrameStreamCallback;
};

type Builder = (
	pdf: PDFDocumentProxy,
	page: PDFPageProxy,
	clip: AnimateClip,
	scale: number,
	dpr: number,
	onFrame?: FrameStreamCallback,
) => Promise<CachedClipFrames>;

export type AnimateFrameCacheOptions = {
	maxActiveClips?: number;
	/** Override frame builder (used by tests). */
	builder?: Builder;
};

function clipKey(clip: AnimateClip, scale: number, dpr: number): string {
	return [
		clip.controllerAnnotationId,
		scale.toFixed(SCALE_KEY_DECIMALS),
		dpr.toFixed(DPR_KEY_DECIMALS),
	].join("@");
}

export function clipPixelBox(clip: AnimateClip, page: PDFPageProxy, scale: number): ClipPixelBox {
	const viewport = page.getViewport({ scale });
	const [a, b, c, d] = viewport.convertToViewportRectangle([...clip.bbox]);
	const x = Math.min(a, c);
	const y = Math.min(b, d);
	const width = Math.abs(c - a);
	const height = Math.abs(d - b);
	return { x, y, width, height };
}

async function defaultBuilder(
	pdf: PDFDocumentProxy,
	page: PDFPageProxy,
	clip: AnimateClip,
	scale: number,
	dpr: number,
	onFrame?: FrameStreamCallback,
): Promise<CachedClipFrames> {
	// Render directly into a clip-bbox-sized canvas. The full-page op list still
	// runs in the worker, but Canvas2D skips paint operations that fall outside
	// the small canvas — significantly cheaper than full-page rendering, while
	// preserving native rendering scale (no display-time upscaling).
	const viewport = page.getViewport({ scale });
	const pixelBox = clipPixelBox(clip, page, scale);

	const clipWidthPx = Math.max(1, Math.floor(pixelBox.width * dpr));
	const clipHeightPx = Math.max(1, Math.floor(pixelBox.height * dpr));
	const offsetX = -pixelBox.x * dpr;
	const offsetY = -pixelBox.y * dpr;

	const renderCanvas = document.createElement("canvas");
	renderCanvas.width = clipWidthPx;
	renderCanvas.height = clipHeightPx;
	const renderCtx = renderCanvas.getContext("2d", { willReadFrequently: false });
	if (!renderCtx) {
		throw new Error("animate frames: failed to get render 2d context");
	}

	for (const id of clip.frameAnnotationIds) {
		pdf.annotationStorage.setValue(id, { noView: true });
	}

	const frames: HTMLCanvasElement[] = [];

	try {
		for (let f = 0; f < clip.frameCount; f += 1) {
			// Reveal only this frame just before dispatching the render. The
			// snapshot of `pdf.annotationStorage` is captured synchronously by
			// `page.render()`, so we can safely re-hide right after dispatch —
			// that lets a concurrent build for another clip see a clean
			// "all hidden" state when it sets up its own next frame.
			pdf.annotationStorage.setValue(clip.frameAnnotationIds[f], {
				noView: false,
			});

			renderCtx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
			const renderTask = page.render({
				canvas: renderCanvas,
				canvasContext: renderCtx,
				viewport,
				annotationMode: ANNOTATION_MODE_ENABLE_STORAGE,
				// Pre-viewport transform: scale by dpr, then translate so that the
				// clip's top-left lands at (0,0) of `renderCanvas`.
				transform: [dpr, 0, 0, dpr, offsetX, offsetY],
			});

			// Snapshot already captured — restore the clean baseline before any
			// `await` yields control back to the event loop.
			pdf.annotationStorage.setValue(clip.frameAnnotationIds[f], {
				noView: true,
			});

			await renderTask.promise;

			const frameCanvas = document.createElement("canvas");
			frameCanvas.width = renderCanvas.width;
			frameCanvas.height = renderCanvas.height;
			const fctx = frameCanvas.getContext("2d");
			if (!fctx) {
				throw new Error("animate frames: failed to get frame 2d context");
			}
			fctx.drawImage(renderCanvas, 0, 0);
			frames.push(frameCanvas);
			onFrame?.(f, frameCanvas);
		}
	} finally {
		for (const id of clip.frameAnnotationIds) {
			pdf.annotationStorage.setValue(id, { noView: true });
		}
	}

	return {
		clipId: clip.controllerAnnotationId,
		scale,
		dpr,
		pixelBox,
		frames,
	};
}

/**
 * LRU-bounded cache of pre-rendered animate frames, keyed by
 * `(clip, scale, dpr)`. The default builder pre-renders each frame
 * via `page.render({ annotationMode: ENABLE_STORAGE })` after toggling
 * `noView` on the clip's frame widgets.
 */
export class AnimateFrameCache {
	private readonly map = new Map<string, CachedClipFrames>();
	private order: string[] = [];
	private readonly maxClips: number;
	private readonly builder: Builder;
	private readonly inflight = new Map<string, Promise<CachedClipFrames>>();

	constructor(options: AnimateFrameCacheOptions = {}) {
		this.maxClips = options.maxActiveClips ?? DEFAULT_MAX_ACTIVE_CLIPS;
		this.builder = options.builder ?? defaultBuilder;
	}

	get size(): number {
		return this.map.size;
	}

	peek(clip: AnimateClip, scale: number, dpr: number): CachedClipFrames | undefined {
		return this.map.get(clipKey(clip, scale, dpr));
	}

	/**
	 * Return cached frames for `(clip, scale, dpr)`. If absent or invalidated,
	 * builds them. Concurrent calls for the same key share a single build.
	 */
	async ensure(
		pdf: PDFDocumentProxy,
		page: PDFPageProxy,
		clip: AnimateClip,
		scale: number,
		dpr: number,
		options: EnsureOptions = {},
	): Promise<CachedClipFrames> {
		const key = clipKey(clip, scale, dpr);
		const cached = this.map.get(key);
		if (cached) {
			this.touch(key);
			// Re-emit cached frames so callers get a uniform streaming contract
			// even on cache hits.
			const onFrame = options.onFrame;
			if (onFrame) {
				cached.frames.forEach((canvas, idx) => {
					onFrame(idx, canvas);
				});
			}
			return cached;
		}
		const pending = this.inflight.get(key);
		if (pending) return pending;

		// Builders run concurrently — `defaultBuilder` keeps each frame's noView
		// mutation tightly scoped (set, dispatch render, restore) so that
		// PDF.js's per-render storage snapshot is always correct, and the worker
		// queues per-frame renders in submission order. Net result: with two
		// clips ensure'd at the same time, the worker processes A.0, B.0, A.1,
		// B.1, ... so each clip's first frame lands within ~1 frame of the
		// other.
		const promise = (async () => {
			const entry = await this.builder(pdf, page, clip, scale, dpr, options.onFrame);
			this.map.set(key, entry);
			this.touch(key);
			this.evict();
			return entry;
		})();
		this.inflight.set(key, promise);
		try {
			return await promise;
		} finally {
			this.inflight.delete(key);
		}
	}

	/** Drop cached entries whose scale or dpr no longer matches. */
	invalidateOther(scale: number, dpr: number): void {
		const targetScale = Number(scale.toFixed(SCALE_KEY_DECIMALS));
		const targetDpr = Number(dpr.toFixed(DPR_KEY_DECIMALS));
		for (const [key, entry] of [...this.map]) {
			if (
				Number(entry.scale.toFixed(SCALE_KEY_DECIMALS)) !== targetScale ||
				Number(entry.dpr.toFixed(DPR_KEY_DECIMALS)) !== targetDpr
			) {
				this.map.delete(key);
				this.order = this.order.filter((k) => k !== key);
			}
		}
	}

	releaseClip(clipId: string): void {
		for (const [key, entry] of [...this.map]) {
			if (entry.clipId === clipId) {
				this.map.delete(key);
				this.order = this.order.filter((k) => k !== key);
			}
		}
	}

	releaseAll(): void {
		this.map.clear();
		this.order = [];
	}

	private touch(key: string): void {
		this.order = this.order.filter((k) => k !== key);
		this.order.push(key);
	}

	private evict(): void {
		while (this.order.length > this.maxClips) {
			const oldest = this.order.shift();
			if (oldest !== undefined) this.map.delete(oldest);
		}
	}
}
