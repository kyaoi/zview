/**
 * Hook for managing PDF zoom state and operations.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { ZOOM_STEP, PAGE_GAP_PX } from "../lib/constants";
import { clampScaleValue } from "../lib/utils";
import type { ZoomMode } from "../lib/types";

export interface UseZoomManagerOptions {
	/** Reference to the scrollable element */
	scrollRef: React.RefObject<HTMLDivElement | null>;
	/** Current page size (before scaling) */
	pageSize: { width: number; height: number } | null;
	/** Total number of pages */
	pageCount: number;
}

export interface UseZoomManagerResult {
	/** Current zoom mode */
	zoomMode: ZoomMode;
	/** Fit-to-width scale */
	fitScale: number;
	/** Manual zoom scale */
	manualScale: number;
	/** Effective layout scale based on current mode */
	layoutScale: number;
	/** Set fit scale (called from resize observer) */
	setFitScale: (scale: number) => void;
	/** Zoom in */
	zoomIn: () => void;
	/** Zoom out */
	zoomOut: () => void;
	/** Switch to fit-width mode */
	fitToWidth: () => void;
	/** Whether manual scale has been initialized */
	isManualScaleInitialized: () => boolean;
	/** Mark manual scale as initialized */
	markManualScaleInitialized: () => void;
}

/**
 * Hook that manages zoom state and operations for PDF viewer.
 */
export function useZoomManager({
	scrollRef,
	pageSize,
	pageCount,
}: UseZoomManagerOptions): UseZoomManagerResult {
	const [zoomMode, setZoomMode] = useState<ZoomMode>("fit-width");
	const [fitScale, setFitScale] = useState(1);
	const [manualScale, setManualScale] = useState(1);
	const manualScaleInitializedRef = useRef(false);

	const layoutScale = useMemo(
		() => (zoomMode === "fit-width" ? fitScale : manualScale),
		[fitScale, manualScale, zoomMode],
	);

	/** Capture anchor point before zoom to restore scroll position */
	const captureAnchor = useCallback(() => {
		const scrollEl = scrollRef.current;
		if (!scrollEl || !pageSize || pageCount === 0) return null;

		const pageHeight = pageSize.height * layoutScale + PAGE_GAP_PX;
		const currentScrollTop = scrollEl.scrollTop;
		const pageIndex = Math.floor(currentScrollTop / pageHeight);
		const offsetInPage = currentScrollTop - pageIndex * pageHeight;

		return { pageIndex, offsetInPage, layoutScale };
	}, [scrollRef, pageSize, pageCount, layoutScale]);

	/** Restore scroll position after zoom */
	const restoreFromAnchor = useCallback(
		(
			anchor: { pageIndex: number; offsetInPage: number; layoutScale: number },
			newScale: number,
		) => {
			const scrollEl = scrollRef.current;
			if (!scrollEl || !pageSize) return;

			const scaleFactor = newScale / anchor.layoutScale;
			const newPageHeight = pageSize.height * newScale + PAGE_GAP_PX;
			const targetTop = anchor.pageIndex * newPageHeight + anchor.offsetInPage * scaleFactor;

			scrollEl.scrollTo({ top: targetTop, behavior: "auto" });
		},
		[scrollRef, pageSize],
	);

	const zoomIn = useCallback(() => {
		if (!pageSize) return;

		const anchor = captureAnchor();
		const base = zoomMode === "fit-width" ? fitScale : manualScale;
		const nextScale = clampScaleValue(base * ZOOM_STEP);

		setManualScale(nextScale);
		setZoomMode("manual");

		if (anchor) {
			// Use requestAnimationFrame to apply scroll after render
			requestAnimationFrame(() => {
				restoreFromAnchor(anchor, nextScale);
			});
		}
	}, [captureAnchor, fitScale, manualScale, pageSize, restoreFromAnchor, zoomMode]);

	const zoomOut = useCallback(() => {
		if (!pageSize) return;

		const anchor = captureAnchor();
		const base = zoomMode === "fit-width" ? fitScale : manualScale;
		const nextScale = clampScaleValue(base / ZOOM_STEP);

		setManualScale(nextScale);
		setZoomMode("manual");

		if (anchor) {
			requestAnimationFrame(() => {
				restoreFromAnchor(anchor, nextScale);
			});
		}
	}, [captureAnchor, fitScale, manualScale, pageSize, restoreFromAnchor, zoomMode]);

	const fitToWidth = useCallback(() => {
		if (!pageSize) return;

		const anchor = captureAnchor();
		setZoomMode("fit-width");

		if (anchor) {
			requestAnimationFrame(() => {
				restoreFromAnchor(anchor, fitScale);
			});
		}
	}, [captureAnchor, fitScale, pageSize, restoreFromAnchor]);

	const isManualScaleInitialized = useCallback(() => {
		return manualScaleInitializedRef.current;
	}, []);

	const markManualScaleInitialized = useCallback(() => {
		manualScaleInitializedRef.current = true;
	}, []);

	return {
		zoomMode,
		fitScale,
		manualScale,
		layoutScale,
		setFitScale,
		zoomIn,
		zoomOut,
		fitToWidth,
		isManualScaleInitialized,
		markManualScaleInitialized,
	};
}
