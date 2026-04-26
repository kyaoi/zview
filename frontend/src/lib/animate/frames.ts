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

type Builder = (
	pdf: PDFDocumentProxy,
	page: PDFPageProxy,
	clip: AnimateClip,
	scale: number,
	dpr: number,
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
			pdf.annotationStorage.setValue(clip.frameAnnotationIds[f], {
				noView: false,
			});
			if (f > 0) {
				pdf.annotationStorage.setValue(clip.frameAnnotationIds[f - 1], {
					noView: true,
				});
			}

			renderCtx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);
			await page.render({
				canvas: renderCanvas,
				canvasContext: renderCtx,
				viewport,
				annotationMode: ANNOTATION_MODE_ENABLE_STORAGE,
				// Pre-viewport transform: scale by dpr, then translate so that the
				// clip's top-left lands at (0,0) of `renderCanvas`.
				transform: [dpr, 0, 0, dpr, offsetX, offsetY],
			}).promise;

			const frameCanvas = document.createElement("canvas");
			frameCanvas.width = renderCanvas.width;
			frameCanvas.height = renderCanvas.height;
			const fctx = frameCanvas.getContext("2d");
			if (!fctx) {
				throw new Error("animate frames: failed to get frame 2d context");
			}
			fctx.drawImage(renderCanvas, 0, 0);
			frames.push(frameCanvas);
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
	private buildChain: Promise<unknown> = Promise.resolve();

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
	): Promise<CachedClipFrames> {
		const key = clipKey(clip, scale, dpr);
		const cached = this.map.get(key);
		if (cached) {
			this.touch(key);
			return cached;
		}
		const pending = this.inflight.get(key);
		if (pending) return pending;

		// Serialize cross-clip builds so concurrent ensures don't race on the
		// shared `pdf.annotationStorage` mutated by `defaultBuilder`.
		const previousChain = this.buildChain;
		const promise = (async () => {
			await previousChain.catch(() => undefined);
			const entry = await this.builder(pdf, page, clip, scale, dpr);
			this.map.set(key, entry);
			this.touch(key);
			this.evict();
			return entry;
		})();
		this.buildChain = promise.catch(() => undefined);
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
