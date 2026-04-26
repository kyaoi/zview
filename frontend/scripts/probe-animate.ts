/**
 * Probe script for Initiative B: validates the animate detector and
 * the proposed Strategy 1 visibility-toggle approach against the real
 * `sample/sample_animation.pdf` fixture.
 *
 *   cd frontend && pnpm tsx scripts/probe-animate.ts
 *
 * This script is throwaway-ish: useful while building B2/B3, then either
 * promoted to a permanent integration test or removed.
 */

import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error - explicit .ts extension is required for node --experimental-strip-types
import { detectAnimateClips } from "../src/lib/animate/detect.ts";

const here = dirname(fileURLToPath(import.meta.url));
const samplePath = resolve(here, "../../sample/sample_animation.pdf");

async function main() {
	const buffer = await readFile(samplePath);
	console.log(`Loaded ${samplePath} (${buffer.byteLength} bytes)`);

	// Use the legacy build for Node compatibility (no DOMMatrix/etc. shims needed).
	const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
	const loadingTask = pdfjs.getDocument({
		data: new Uint8Array(buffer),
		isEvalSupported: false,
		disableFontFace: true,
		useSystemFonts: false,
	});
	const pdf = await loadingTask.promise;
	console.log(`pdfjs-dist loaded: ${pdf.numPages} pages`);

	const t0 = performance.now();
	const clips = await detectAnimateClips(pdf);
	const detectMs = performance.now() - t0;
	console.log(
		`detectAnimateClips: ${clips.length} clips in ${detectMs.toFixed(1)}ms`,
	);
	for (const clip of clips) {
		console.log(
			`  page=${clip.pageIndex + 1} anim=${clip.animationIndex} ` +
				`frames=${clip.frameCount} fps=${clip.fps} ` +
				`autoplay=${clip.autoplay} loop=${clip.loop} ` +
				`bbox=[${clip.bbox.map((n) => n.toFixed(1)).join(", ")}] ` +
				`controller=${clip.controllerAnnotationId} ` +
				`firstFrame=${clip.frameAnnotationIds[0]}`,
		);
	}

	if (clips.length === 0) {
		console.warn("No clips detected — bailing on render probe.");
		await pdf.destroy();
		return;
	}

	// Strategy 1 probe: do annotationStorage `noView` overrides actually
	// suppress widget appearance streams in the operator list?
	const clip = clips[0];
	const page = await pdf.getPage(clip.pageIndex + 1);

	const baseline = await page.getOperatorList({ annotationMode: 1 }); // ENABLE
	console.log(
		`baseline operator list: fnArray=${baseline.fnArray.length} (with all annotations)`,
	);

	pdf.annotationStorage.setValue(clip.frameAnnotationIds[0], { noView: true });
	const oneHidden = await page.getOperatorList({ annotationMode: 3 }); // ENABLE_STORAGE
	console.log(
		`with frame[0].noView=true (storage): fnArray=${oneHidden.fnArray.length}`,
	);

	for (const id of clip.frameAnnotationIds) {
		pdf.annotationStorage.setValue(id, { noView: true });
	}
	const allHidden = await page.getOperatorList({ annotationMode: 3 });
	console.log(
		`with all frames[].noView=true: fnArray=${allHidden.fnArray.length}`,
	);

	for (const id of clip.frameAnnotationIds) {
		pdf.annotationStorage.setValue(id, { noView: true });
	}
	pdf.annotationStorage.setValue(clip.frameAnnotationIds[5], { noView: false });
	const onlyOne = await page.getOperatorList({ annotationMode: 3 });
	console.log(
		`with only frame[5] visible: fnArray=${onlyOne.fnArray.length}`,
	);

	console.log(
		"\nDelta interpretation: smaller fnArray when more frames are hidden ⇒ Strategy 1 viable.",
	);

	await pdf.destroy();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
