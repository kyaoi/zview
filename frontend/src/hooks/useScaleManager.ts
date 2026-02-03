import { useCallback, useRef } from "react";
import { PAGE_GAP_PX, ZOOM_STEP } from "../lib/constants";
import type { ZoomMode } from "../lib/types";
import { clampScaleValue } from "../lib/utils";

interface UseScaleManagerOptions {
	scrollRef: React.RefObject<HTMLDivElement | null>;
	pageSize: { width: number; height: number } | null;
	pageCount: number;
	fitScale: number;
	manualScale: number;
	setManualScale: React.Dispatch<React.SetStateAction<number>>;
	zoomMode: ZoomMode;
	setZoomMode: React.Dispatch<React.SetStateAction<ZoomMode>>;
}

interface UseScaleManagerResult {
	layoutScale: number;
	zoomIn: () => void;
	zoomOut: () => void;
	fitToWidth: () => void;
	anchorRef: React.RefObject<{ x: number; y: number } | null>;
}

export function useScaleManager({
	scrollRef,
	pageSize,
	pageCount,
	fitScale,
	manualScale,
	setManualScale,
	zoomMode,
	setZoomMode,
}: UseScaleManagerOptions): UseScaleManagerResult {
	const anchorRef = useRef<{ x: number; y: number } | null>(null);

	const layoutScale = zoomMode === "fit-width" ? fitScale : manualScale;

	const captureAnchor = useCallback(() => {
		if (!pageSize) return;
		const scrollEl = scrollRef.current;
		if (scrollEl && pageCount > 0) {
			const pageBlock = Math.round(pageSize.height * layoutScale) + PAGE_GAP_PX;
			const totalHeight = Math.max(1, pageCount * pageBlock - PAGE_GAP_PX);
			const totalWidth = Math.max(1, pageSize.width * layoutScale);
			const centerY = scrollEl.scrollTop + scrollEl.clientHeight / 2;
			const centerX = scrollEl.scrollLeft + scrollEl.clientWidth / 2;
			anchorRef.current = {
				x: Math.min(1, Math.max(0, centerX / totalWidth)),
				y: Math.min(1, Math.max(0, centerY / totalHeight)),
			};
		}
	}, [scrollRef, pageSize, pageCount, layoutScale]);

	const zoomIn = useCallback(() => {
		if (!pageSize) return;
		captureAnchor();
		setManualScale((prev) => {
			const base = zoomMode === "fit-width" ? fitScale : prev;
			return clampScaleValue(base * ZOOM_STEP);
		});
		setZoomMode("manual");
	}, [captureAnchor, fitScale, pageSize, setManualScale, setZoomMode, zoomMode]);

	const zoomOut = useCallback(() => {
		if (!pageSize) return;
		captureAnchor();
		setManualScale((prev) => {
			const base = zoomMode === "fit-width" ? fitScale : prev;
			return clampScaleValue(base / ZOOM_STEP);
		});
		setZoomMode("manual");
	}, [captureAnchor, fitScale, pageSize, setManualScale, setZoomMode, zoomMode]);

	const fitToWidth = useCallback(() => {
		if (!pageSize) return;
		captureAnchor();
		setZoomMode("fit-width");
	}, [captureAnchor, pageSize, setZoomMode]);

	return {
		layoutScale,
		zoomIn,
		zoomOut,
		fitToWidth,
		anchorRef,
	};
}
