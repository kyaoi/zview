import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useZoomManager } from "./useZoomManager";

describe("useZoomManager", () => {
	const mockScrollRef = {
		current: {
			scrollTop: 0,
			scrollTo: vi.fn(),
		} as unknown as HTMLDivElement,
	};

	const defaultProps = {
		scrollRef: mockScrollRef,
		pageSize: { width: 800, height: 1000 },
		pageCount: 10,
	};

	it("should initialize with fit-width mode", () => {
		const { result } = renderHook(() => useZoomManager(defaultProps));
		expect(result.current.zoomMode).toBe("fit-width");
		expect(result.current.fitScale).toBe(1);
		expect(result.current.manualScale).toBe(1);
	});

	it("should handle zoom in", () => {
		const { result } = renderHook(() => useZoomManager(defaultProps));

		act(() => {
			result.current.zoomIn();
		});

		expect(result.current.zoomMode).toBe("manual");
		expect(result.current.manualScale).toBeGreaterThan(1);
	});

	it("should handle zoom out", () => {
		const { result } = renderHook(() => useZoomManager(defaultProps));

		// First zoom in to have something to zoom out from
		act(() => {
			result.current.zoomIn();
			result.current.zoomIn();
		});
		const scaleAfterZoomIn = result.current.manualScale;

		act(() => {
			result.current.zoomOut();
		});

		expect(result.current.zoomMode).toBe("manual");
		expect(result.current.manualScale).toBeLessThan(scaleAfterZoomIn);
	});

	it("should switch to fit-width mode", () => {
		const { result } = renderHook(() => useZoomManager(defaultProps));

		act(() => {
			result.current.zoomIn();
		});
		expect(result.current.zoomMode).toBe("manual");

		act(() => {
			result.current.fitToWidth();
		});

		expect(result.current.zoomMode).toBe("fit-width");
	});

	it("should handle setFitScale", () => {
		const { result } = renderHook(() => useZoomManager(defaultProps));

		act(() => {
			result.current.setFitScale(1.5);
		});

		expect(result.current.fitScale).toBe(1.5);
		// If in fit-width mode, layoutScale should reflect fitScale
		expect(result.current.layoutScale).toBe(1.5);
	});
});
