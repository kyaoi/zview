/**
 * Hook for managing continuous scroll behavior.
 * Used for smooth, continuous scrolling when holding down navigation keys.
 */
import { useCallback, useRef } from "react";

export interface UseContinuousScrollOptions {
	/** Reference to the scrollable element */
	scrollRef: React.RefObject<HTMLDivElement | null>;
	/** Damping factor for velocity (0-1, lower = more friction) */
	damping?: number;
	/** Minimum velocity before stopping (px/frame) */
	minVelocity?: number;
}

export interface UseContinuousScrollResult {
	/** Start continuous scrolling with given velocity */
	startContinuousScroll: (velocityX: number, velocityY: number) => void;
	/** Stop continuous scrolling */
	stopContinuousScroll: () => void;
	/** Get current velocity (for access from other hooks) */
	getVelocity: () => { x: number; y: number };
}

const DEFAULT_DAMPING = 0.92;
const DEFAULT_MIN_VELOCITY = 0.1;

/**
 * Hook that manages continuous scrolling behavior.
 * Provides start/stop functions for smooth, momentum-based scrolling.
 */
export function useContinuousScroll({
	scrollRef,
	damping = DEFAULT_DAMPING,
	minVelocity = DEFAULT_MIN_VELOCITY,
}: UseContinuousScrollOptions): UseContinuousScrollResult {
	const scrollLoopRef = useRef<number | null>(null);
	const scrollVelocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

	const stopContinuousScroll = useCallback(() => {
		scrollVelocityRef.current = { x: 0, y: 0 };
	}, []);

	const scrollStep = useCallback(() => {
		const el = scrollRef.current;
		if (!el) {
			scrollLoopRef.current = null;
			return;
		}

		const { x, y } = scrollVelocityRef.current;
		if (Math.abs(x) < minVelocity && Math.abs(y) < minVelocity) {
			scrollLoopRef.current = null;
			return;
		}

		el.scrollBy({ left: x, top: y, behavior: "auto" });
		scrollVelocityRef.current = { x: x * damping, y: y * damping };
		scrollLoopRef.current = requestAnimationFrame(scrollStep);
	}, [scrollRef, damping, minVelocity]);

	const startContinuousScroll = useCallback(
		(velocityX: number, velocityY: number) => {
			const { x, y } = scrollVelocityRef.current;
			scrollVelocityRef.current = { x: x + velocityX, y: y + velocityY };

			if (scrollLoopRef.current === null) {
				scrollLoopRef.current = requestAnimationFrame(scrollStep);
			}
		},
		[scrollStep],
	);

	const getVelocity = useCallback(() => {
		return { ...scrollVelocityRef.current };
	}, []);

	return {
		startContinuousScroll,
		stopContinuousScroll,
		getVelocity,
	};
}
