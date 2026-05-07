import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useSwapPanes } from "./useKeyboardNavigation";
import type { ViewerHandle } from "../lib/types";

const createViewerHandle = (): ViewerHandle => ({
	scrollLine: vi.fn(),
	scrollHalfPage: vi.fn(),
	scrollHorizontal: vi.fn(),
	startContinuousScroll: vi.fn(),
	stopContinuousScroll: vi.fn(),
	jumpToTop: vi.fn(),
	jumpToBottom: vi.fn(),
	jumpByPages: vi.fn(),
	jumpToPage: vi.fn(),
	zoomIn: vi.fn(),
	zoomOut: vi.fn(),
	fitToWidth: vi.fn(),
	rerender: vi.fn(),
	getSnapshot: vi.fn().mockReturnValue({ x: 1, y: 2, zoom: 1 }),
	restoreSnapshot: vi.fn(),
});

const createViewerRef = () => ({
	current: createViewerHandle(),
});

describe("useSwapPanes", () => {
	it("prevents swapping when SUB is missing", () => {
		const hasSubRef = { current: false } as React.RefObject<boolean>;
		const mainViewerRef = createViewerRef();
		const subViewerRef = createViewerRef();
		const setPaneOrder = vi.fn();
		const addToast = vi.fn();

		const { result } = renderHook(() =>
			useSwapPanes(hasSubRef, mainViewerRef, subViewerRef, setPaneOrder, addToast),
		);

		const [swapPanes] = result.current;
		const swapped = swapPanes();
		expect(swapped).toBe(false);
		expect(addToast).toHaveBeenCalledWith("Cannot swap without SUB", "error");
		expect(setPaneOrder).not.toHaveBeenCalled();
	});

	it("captures snapshots and toggles pane order", () => {
		const hasSubRef = { current: true } as React.RefObject<boolean>;
		const mainViewerRef = createViewerRef();
		const subViewerRef = createViewerRef();
		const setPaneOrder = vi.fn();
		const addToast = vi.fn();

		const { result } = renderHook(() =>
			useSwapPanes(hasSubRef, mainViewerRef, subViewerRef, setPaneOrder, addToast),
		);

		const [swapPanes, snapshotsRef] = result.current;
		act(() => {
			swapPanes();
		});

		expect(setPaneOrder).toHaveBeenCalledWith(expect.any(Function));
		expect(addToast).toHaveBeenCalledWith("Swapped MAIN/SUB order", "info");
		expect(snapshotsRef.current?.main).toEqual({ x: 1, y: 2, zoom: 1 });
		expect(snapshotsRef.current?.sub).toEqual({ x: 1, y: 2, zoom: 1 });
	});
});
