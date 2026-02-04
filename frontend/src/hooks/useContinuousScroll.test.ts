import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useContinuousScroll } from "./useContinuousScroll";

describe("useContinuousScroll", () => {
	let requestAnimationFrameSpy: any;
	let cancelAnimationFrameSpy: any;

	beforeEach(() => {
		vi.useFakeTimers();
		requestAnimationFrameSpy = vi
			.spyOn(window, "requestAnimationFrame")
			.mockImplementation((cb: any) => setTimeout(cb, 16));
		cancelAnimationFrameSpy = vi
			.spyOn(window, "cancelAnimationFrame")
			.mockImplementation(clearTimeout);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("should initialize with zero velocity", () => {
		const scrollRef = { current: document.createElement("div") };
		const { result } = renderHook(() => useContinuousScroll({ scrollRef }));

		expect(result.current.getVelocity()).toEqual({ x: 0, y: 0 });
	});

	it("should start scrolling and decay velocity", () => {
		const scrollRef = { current: document.createElement("div") };
		scrollRef.current.scrollBy = vi.fn();

		const { result } = renderHook(() => useContinuousScroll({ scrollRef }));

		act(() => {
			result.current.startContinuousScroll(10, 20);
		});

		const initialVelocity = result.current.getVelocity();
		// Since we add to existing velocity (0,0), it should be 10, 20
		expect(initialVelocity).toEqual({ x: 10, y: 20 });

		// Advance time to trigger scrollStep
		act(() => {
			vi.advanceTimersByTime(20);
		});

		expect(scrollRef.current.scrollBy).toHaveBeenCalled();

		const dampedVelocity = result.current.getVelocity();
		// Should have damped
		expect(dampedVelocity.x).toBeLessThan(10);
		expect(dampedVelocity.y).toBeLessThan(20);
	});

	it("should stop scrolling when requested", () => {
		const scrollRef = { current: document.createElement("div") };
		const { result } = renderHook(() => useContinuousScroll({ scrollRef }));

		act(() => {
			result.current.startContinuousScroll(10, 20);
		});

		expect(result.current.getVelocity()).not.toEqual({ x: 0, y: 0 });

		act(() => {
			result.current.stopContinuousScroll();
		});

		expect(result.current.getVelocity()).toEqual({ x: 0, y: 0 });
	});
});
