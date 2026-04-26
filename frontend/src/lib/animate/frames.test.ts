import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { describe, expect, it, vi } from "vitest";
import type { AnimateClip } from "./detect";
import { AnimateFrameCache, type CachedClipFrames } from "./frames";

const pdf = {} as PDFDocumentProxy;
const page = {} as PDFPageProxy;

function makeClip(id: string, frameCount = 4): AnimateClip {
	return {
		pageIndex: 0,
		animationIndex: 0,
		bbox: [0, 0, 100, 100],
		frameAnnotationIds: Array.from({ length: frameCount }, (_, i) => `${id}-f${i}`),
		controllerAnnotationId: id,
		fps: 12,
		frameCount,
		autoplay: true,
		loop: true,
	};
}

function fakeFrames(
	clipId: string,
	scale: number,
	dpr: number,
	frameCount: number,
): CachedClipFrames {
	return {
		clipId,
		scale,
		dpr,
		pixelBox: { x: 0, y: 0, width: 100 * scale, height: 100 * scale },
		frames: Array.from({ length: frameCount }, () => ({}) as HTMLCanvasElement),
	};
}

describe("AnimateFrameCache", () => {
	it("calls the builder once per (clip, scale, dpr) combination", async () => {
		const builder = vi.fn(async (_p, _pg, clip: AnimateClip, scale, dpr) =>
			fakeFrames(clip.controllerAnnotationId, scale, dpr, clip.frameCount),
		);
		const cache = new AnimateFrameCache({ builder });
		const clip = makeClip("anm0R");

		const a = await cache.ensure(pdf, page, clip, 1, 2);
		const b = await cache.ensure(pdf, page, clip, 1, 2);
		expect(builder).toHaveBeenCalledTimes(1);
		expect(a).toBe(b);

		const c = await cache.ensure(pdf, page, clip, 1.5, 2);
		expect(builder).toHaveBeenCalledTimes(2);
		expect(c.scale).toBe(1.5);
	});

	it("dedupes concurrent in-flight builds for the same key", async () => {
		let resolveBuild: ((value: CachedClipFrames) => void) | undefined;
		const builder = vi.fn(
			() =>
				new Promise<CachedClipFrames>((resolve) => {
					resolveBuild = resolve;
				}),
		);
		const cache = new AnimateFrameCache({ builder });
		const clip = makeClip("anm0R");

		const p1 = cache.ensure(pdf, page, clip, 1, 1);
		const p2 = cache.ensure(pdf, page, clip, 1, 1);

		// Allow the serialization chain to flush its initial microtask before
		// asserting how many times the underlying builder ran.
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(builder).toHaveBeenCalledTimes(1);
		resolveBuild?.(fakeFrames("anm0R", 1, 1, 4));
		const [r1, r2] = await Promise.all([p1, p2]);
		expect(r1).toBe(r2);
	});

	it("evicts the least-recently-used entry past maxActiveClips", async () => {
		const builder = vi.fn(async (_p, _pg, clip: AnimateClip, scale, dpr) =>
			fakeFrames(clip.controllerAnnotationId, scale, dpr, clip.frameCount),
		);
		const cache = new AnimateFrameCache({ builder, maxActiveClips: 2 });

		const c0 = makeClip("anm0R");
		const c1 = makeClip("anm1R");
		const c2 = makeClip("anm2R");

		await cache.ensure(pdf, page, c0, 1, 1);
		await cache.ensure(pdf, page, c1, 1, 1);
		// Touch c0 to make it more recent than c1.
		await cache.ensure(pdf, page, c0, 1, 1);
		await cache.ensure(pdf, page, c2, 1, 1);

		expect(cache.peek(c0, 1, 1)).toBeDefined();
		expect(cache.peek(c2, 1, 1)).toBeDefined();
		expect(cache.peek(c1, 1, 1)).toBeUndefined();
	});

	it("invalidateOther drops mismatched scale/dpr entries only", async () => {
		const builder = vi.fn(async (_p, _pg, clip: AnimateClip, scale, dpr) =>
			fakeFrames(clip.controllerAnnotationId, scale, dpr, clip.frameCount),
		);
		const cache = new AnimateFrameCache({ builder });
		const clip = makeClip("anm0R");

		await cache.ensure(pdf, page, clip, 1, 1);
		await cache.ensure(pdf, page, clip, 1.5, 1);
		await cache.ensure(pdf, page, clip, 1, 2);

		cache.invalidateOther(1, 1);
		expect(cache.peek(clip, 1, 1)).toBeDefined();
		expect(cache.peek(clip, 1.5, 1)).toBeUndefined();
		expect(cache.peek(clip, 1, 2)).toBeUndefined();
	});

	it("serializes builds across keys to avoid annotationStorage races", async () => {
		const order: string[] = [];
		let activeBuilds = 0;
		let maxConcurrent = 0;
		const builder = vi.fn(async (_p, _pg, clip: AnimateClip, scale, dpr) => {
			activeBuilds += 1;
			maxConcurrent = Math.max(maxConcurrent, activeBuilds);
			order.push(`start:${clip.controllerAnnotationId}`);
			await new Promise((resolve) => setTimeout(resolve, 5));
			order.push(`end:${clip.controllerAnnotationId}`);
			activeBuilds -= 1;
			return fakeFrames(clip.controllerAnnotationId, scale, dpr, clip.frameCount);
		});
		const cache = new AnimateFrameCache({ builder });
		const a = makeClip("anm0R");
		const b = makeClip("anm1R");
		const c = makeClip("anm2R");

		await Promise.all([
			cache.ensure(pdf, page, a, 1, 1),
			cache.ensure(pdf, page, b, 1, 1),
			cache.ensure(pdf, page, c, 1, 1),
		]);

		expect(maxConcurrent).toBe(1);
		expect(order).toEqual([
			"start:anm0R",
			"end:anm0R",
			"start:anm1R",
			"end:anm1R",
			"start:anm2R",
			"end:anm2R",
		]);
	});

	it("releaseClip drops every scale of one clip without touching others", async () => {
		const builder = vi.fn(async (_p, _pg, clip: AnimateClip, scale, dpr) =>
			fakeFrames(clip.controllerAnnotationId, scale, dpr, clip.frameCount),
		);
		const cache = new AnimateFrameCache({ builder });
		const a = makeClip("anm0R");
		const b = makeClip("anm1R");

		await cache.ensure(pdf, page, a, 1, 1);
		await cache.ensure(pdf, page, a, 1.5, 1);
		await cache.ensure(pdf, page, b, 1, 1);

		cache.releaseClip("anm0R");
		expect(cache.peek(a, 1, 1)).toBeUndefined();
		expect(cache.peek(a, 1.5, 1)).toBeUndefined();
		expect(cache.peek(b, 1, 1)).toBeDefined();
	});
});
