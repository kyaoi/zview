import { type PDFDocumentProxy, TextLayer } from "pdfjs-dist";
import { type CSSProperties, useEffect, useRef } from "react";

interface TextLayerOverlayProps {
	pageIndex: number;
	pdf: PDFDocumentProxy | null;
	layoutScale: number;
	isVisible: boolean;
}

export function TextLayerOverlay({
	pageIndex,
	pdf,
	layoutScale,
	isVisible,
}: TextLayerOverlayProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!pdf || !isVisible) {
			const container = containerRef.current;
			if (container) container.replaceChildren();
			return;
		}

		let cancelled = false;
		let activeLayer: TextLayer | null = null;
		let idleHandle: number | null = null;
		let timeoutHandle: number | null = null;

		const run = () => {
			(async () => {
				try {
					const page = await pdf.getPage(pageIndex + 1);
					if (cancelled) return;
					const viewport = page.getViewport({ scale: layoutScale });
					const textContentSource = await page.getTextContent();
					const container = containerRef.current;
					if (cancelled || !container) return;
					container.replaceChildren();
					const layer = new TextLayer({
						textContentSource,
						container,
						viewport,
					});
					activeLayer = layer;
					await layer.render();
				} catch (err) {
					if (!cancelled) {
						console.error(`TextLayer failed for page ${pageIndex + 1}:`, err);
					}
				}
			})();
		};

		// Let the canvas render claim the worker first; the text layer is
		// only needed for selection and can come in slightly later without
		// the user noticing.
		if (typeof window.requestIdleCallback === "function") {
			idleHandle = window.requestIdleCallback(run, { timeout: 500 });
		} else {
			timeoutHandle = window.setTimeout(run, 50);
		}

		return () => {
			cancelled = true;
			if (idleHandle !== null && typeof window.cancelIdleCallback === "function") {
				window.cancelIdleCallback(idleHandle);
			}
			if (timeoutHandle !== null) {
				window.clearTimeout(timeoutHandle);
			}
			activeLayer?.cancel();
			const container = containerRef.current;
			if (container) container.replaceChildren();
		};
	}, [pdf, pageIndex, layoutScale, isVisible]);

	const style = {
		["--scale-factor" as string]: layoutScale,
		["--total-scale-factor" as string]: layoutScale,
	} as CSSProperties;

	return <div ref={containerRef} className="textLayer" style={style} />;
}
