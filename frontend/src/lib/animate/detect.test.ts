import type { PDFDocumentProxy } from "pdfjs-dist";
import { describe, expect, it } from "vitest";
import { detectAnimateClips } from "./detect";

type Annotation = {
	id: string;
	subtype: string;
	fieldName?: string;
	rect?: number[];
	actions?: Record<string, string[]>;
};

const SHARED_BBOX = [231.087, 52.806, 442.634, 179.734] as const;

/**
 * Build a PageOpen JS string that mirrors what the `animate` package emits
 * for animation N with `frames` frames at `fps` fps.
 */
function buildPoScript(opts: {
	idx: number;
	frames: number;
	fps: number;
	autoplay: boolean;
	loop: boolean;
}): string {
	const last = opts.frames - 1;
	const i = opts.idx;
	const loopBranch = opts.loop
		? `if(a${i}_playing){a${i}_seekFrame(0);a${i}_setFps(${opts.fps});}else{a${i}_stopLast();}`
		: `a${i}_stopLast();`;
	const tail = opts.autoplay ? `if(a${i}_playsRight){a${i}_playFwd();}else{a${i}_playBwd();}` : ``;
	return [
		`var a${i}_idx,a${i}_on,a${i}_fr,a${i}_playsRight,a${i}_isPaused,a${i}_playing,a${i}_int;`,
		`var a${i}_pause,a${i}_playRight,a${i}_playLeft,a${i}_playBwd,a${i}_playFwd;`,
		`var a${i}_fps,a${i}_spd,a${i}_setFps,a${i}_seekFrame,a${i}_gotoNext,a${i}_gotoPrev;`,
		`var a${i}_stopFirst,a${i}_stopLast;`,
		`if(!a${i}_fr){`,
		`  a${i}_fr=new Array();`,
		`  a${i}_on=0;`,
		`  for(var i=0;i<=${last};i++){a${i}_fr[i]=this.getField('${i}.'+i);}`,
		`  a${i}_playsRight=true;a${i}_isPaused=false;a${i}_playing=false;`,
		`  a${i}_fps=${opts.fps};a${i}_spd=1;`,
		`  a${i}_seekFrame=function(f){if(f>${last}||f<0){return -1;}a${i}_idx=f;return 0;};`,
		`  a${i}_gotoNext=function(){if(a${i}_seekFrame(a${i}_idx+1)<0){${loopBranch}}};`,
		`  a${i}_seekFrame(0);`,
		`}`,
		tail,
	].join("\n");
}

function frameAnnotation(opts: {
	id: string;
	idx: number;
	frame: number;
	hidden: boolean;
}): Annotation {
	return {
		id: opts.id,
		subtype: "Widget",
		fieldName: `${opts.idx}.${opts.frame}`,
		rect: [...SHARED_BBOX],
	};
}

function controllerAnnotation(opts: { id: string; idx: number; po: string }): Annotation {
	return {
		id: opts.id,
		subtype: "Widget",
		fieldName: `anm${opts.idx}`,
		rect: [...SHARED_BBOX],
		actions: { PageOpen: [opts.po] },
	};
}

function makePdf(pageAnnotations: Annotation[][]): PDFDocumentProxy {
	const pages = pageAnnotations.map((annotations) => ({
		getAnnotations: async () => annotations,
	}));
	return {
		numPages: pages.length,
		getPage: async (pageNumber: number) => pages[pageNumber - 1],
	} as unknown as PDFDocumentProxy;
}

describe("detectAnimateClips", () => {
	it("returns [] for a PDF with no widgets", async () => {
		const pdf = makePdf([[{ id: "1R", subtype: "Link", rect: [0, 0, 10, 10] }]]);
		const clips = await detectAnimateClips(pdf);
		expect(clips).toEqual([]);
	});

	it("returns [] when frame widgets are missing a controller", async () => {
		const annotations: Annotation[] = Array.from({ length: 3 }, (_, frame) =>
			frameAnnotation({
				id: `f${frame}R`,
				idx: 0,
				frame,
				hidden: frame !== 0,
			}),
		);
		const clips = await detectAnimateClips(makePdf([annotations]));
		expect(clips).toEqual([]);
	});

	it("detects an autoplay+loop clip and reads fps/frameCount", async () => {
		const idx = 1;
		const frames = 41;
		const fps = 8;
		const po = buildPoScript({
			idx,
			frames,
			fps,
			autoplay: true,
			loop: true,
		});
		const annotations: Annotation[] = [
			controllerAnnotation({ id: "anm1R", idx, po }),
			...Array.from({ length: frames }, (_, frame) =>
				frameAnnotation({
					id: `frame${frame}R`,
					idx,
					frame,
					hidden: frame !== 0,
				}),
			),
		];
		const clips = await detectAnimateClips(makePdf([[], annotations]));
		expect(clips).toHaveLength(1);
		const [clip] = clips;
		expect(clip.pageIndex).toBe(1);
		expect(clip.animationIndex).toBe(idx);
		expect(clip.bbox).toEqual([...SHARED_BBOX]);
		expect(clip.fps).toBe(fps);
		expect(clip.frameCount).toBe(frames);
		expect(clip.autoplay).toBe(true);
		expect(clip.loop).toBe(true);
		expect(clip.controllerAnnotationId).toBe("anm1R");
		expect(clip.frameAnnotationIds).toHaveLength(frames);
		expect(clip.frameAnnotationIds[0]).toBe("frame0R");
		expect(clip.frameAnnotationIds[frames - 1]).toBe(`frame${frames - 1}R`);
	});

	it("detects two independent clips on the same page", async () => {
		const make = (idx: number, fps: number) => {
			const po = buildPoScript({
				idx,
				frames: 41,
				fps,
				autoplay: true,
				loop: true,
			});
			return [
				controllerAnnotation({ id: `anm${idx}R`, idx, po }),
				...Array.from({ length: 41 }, (_, frame) =>
					frameAnnotation({
						id: `clip${idx}-frame${frame}R`,
						idx,
						frame,
						hidden: frame !== 0,
					}),
				),
			];
		};
		const clips = await detectAnimateClips(makePdf([[...make(0, 12), ...make(1, 8)]]));
		const sorted = [...clips].sort((a, b) => a.animationIndex - b.animationIndex);
		expect(sorted.map((c) => c.animationIndex)).toEqual([0, 1]);
		expect(sorted[0].fps).toBe(12);
		expect(sorted[1].fps).toBe(8);
	});

	it("flags non-loop / non-autoplay scripts correctly", async () => {
		const idx = 2;
		const po = buildPoScript({
			idx,
			frames: 10,
			fps: 4,
			autoplay: false,
			loop: false,
		});
		const annotations: Annotation[] = [
			controllerAnnotation({ id: "anm2R", idx, po }),
			...Array.from({ length: 10 }, (_, frame) =>
				frameAnnotation({
					id: `f${frame}R`,
					idx,
					frame,
					hidden: frame !== 0,
				}),
			),
		];
		const clips = await detectAnimateClips(makePdf([annotations]));
		expect(clips).toHaveLength(1);
		expect(clips[0].autoplay).toBe(false);
		expect(clips[0].loop).toBe(false);
	});

	it("falls back to the default fps when the literal is unparseable", async () => {
		const idx = 0;
		const po = buildPoScript({
			idx,
			frames: 5,
			fps: 12,
			autoplay: true,
			loop: true,
		}).replace(`a0_fps=12`, "a0_fps=NaN");
		const annotations: Annotation[] = [
			controllerAnnotation({ id: "anm0R", idx, po }),
			...Array.from({ length: 5 }, (_, frame) =>
				frameAnnotation({
					id: `f${frame}R`,
					idx,
					frame,
					hidden: frame !== 0,
				}),
			),
		];
		const clips = await detectAnimateClips(makePdf([annotations]));
		expect(clips).toHaveLength(1);
		expect(clips[0].fps).toBe(12); // matches DEFAULT_FPS in detect.ts
	});

	it("rejects clips with only one frame", async () => {
		const idx = 0;
		const po = buildPoScript({
			idx,
			frames: 1,
			fps: 12,
			autoplay: true,
			loop: true,
		});
		const annotations: Annotation[] = [
			controllerAnnotation({ id: "anm0R", idx, po }),
			frameAnnotation({ id: "f0R", idx, frame: 0, hidden: false }),
		];
		const clips = await detectAnimateClips(makePdf([annotations]));
		expect(clips).toEqual([]);
	});
});
