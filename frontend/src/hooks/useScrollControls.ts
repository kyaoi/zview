import { useCallback, useRef } from "react";
import { PAGE_GAP_PX, PAGE_SCROLL_RATIO } from "../lib/constants";

interface UseScrollControlsOptions {
	scrollRef: React.RefObject<HTMLDivElement | null>;
	pageSize: { width: number; height: number } | null;
	pageCount: number;
	layoutScale: number;
	currentPageRef: React.RefObject<number>;
}

interface UseScrollControlsResult {
	scrollLine: (deltaPx: number) => void;
	scrollHalfPage: (direction: 1 | -1) => void;
	scrollHorizontal: (deltaPx: number) => void;
	startContinuousScroll: (vx: number, vy: number) => void;
	stopContinuousScroll: () => void;
	jumpToTop: () => void;
	jumpToBottom: () => void;
	jumpByPages: (delta: number) => void;
	scrollLoopRef: React.RefObject<number | null>;
	scrollVelocityRef: React.RefObject<{ x: number; y: number }>;
}

export function useScrollControls({
	scrollRef,
	pageSize,
	pageCount,
	layoutScale,
	currentPageRef,
}: UseScrollControlsOptions): UseScrollControlsResult {
	const scrollLoopRef = useRef<number | null>(null);
	const scrollVelocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

	const scrollLine = useCallback(
		(deltaPx: number) => {
			const el = scrollRef.current;
			if (!el) return;
			el.scrollBy({ top: deltaPx, behavior: "smooth" });
		},
		[scrollRef],
	);

	const scrollHalfPage = useCallback(
		(direction: 1 | -1) => {
			const el = scrollRef.current;
			if (!el) return;
			const amount = el.clientHeight * PAGE_SCROLL_RATIO;
			el.scrollBy({ top: direction * amount, behavior: "smooth" });
		},
		[scrollRef],
	);

	const scrollHorizontal = useCallback(
		(deltaPx: number) => {
			const el = scrollRef.current;
			if (!el) return;
			el.scrollBy({ left: deltaPx, behavior: "smooth" });
		},
		[scrollRef],
	);

	const stopContinuousScroll = useCallback(() => {
		scrollVelocityRef.current = { x: 0, y: 0 };
	}, []);

	const continuousScrollStep = useCallback(() => {
		const el = scrollRef.current;
		if (!el) {
			scrollLoopRef.current = null;
			return;
		}
		const { x, y } = scrollVelocityRef.current;
		if (x === 0 && y === 0) {
			scrollLoopRef.current = null;
			return;
		}
		el.scrollBy({ left: x, top: y, behavior: "auto" });
		scrollLoopRef.current = requestAnimationFrame(continuousScrollStep);
	}, [scrollRef]);

	const startContinuousScroll = useCallback(
		(vx: number, vy: number) => {
			scrollVelocityRef.current = { x: vx, y: vy };
			if (scrollLoopRef.current === null) {
				scrollLoopRef.current = requestAnimationFrame(continuousScrollStep);
			}
		},
		[continuousScrollStep],
	);

	const jumpToTop = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTo({ top: 0, behavior: "smooth" });
	}, [scrollRef]);

	const jumpToBottom = useCallback(() => {
		const el = scrollRef.current;
		if (!pageSize || pageCount === 0 || !el) return;
		const pageBlock = Math.round(pageSize.height * layoutScale) + PAGE_GAP_PX;
		const totalHeight = pageCount * pageBlock - PAGE_GAP_PX;
		el.scrollTo({
			top: Math.max(0, totalHeight - el.clientHeight + PAGE_GAP_PX),
			behavior: "smooth",
		});
	}, [scrollRef, layoutScale, pageCount, pageSize]);

	const jumpByPages = useCallback(
		(delta: number) => {
			const el = scrollRef.current;
			if (!pageSize || pageCount === 0 || !el) return;
			const targetIndex = Math.min(pageCount - 1, Math.max(0, currentPageRef.current - 1 + delta));
			const pageBlock = Math.round(pageSize.height * layoutScale) + PAGE_GAP_PX;
			const offset = targetIndex * pageBlock;
			el.scrollTo({ top: offset, behavior: "smooth" });
		},
		[scrollRef, layoutScale, pageCount, pageSize, currentPageRef],
	);

	return {
		scrollLine,
		scrollHalfPage,
		scrollHorizontal,
		startContinuousScroll,
		stopContinuousScroll,
		jumpToTop,
		jumpToBottom,
		jumpByPages,
		scrollLoopRef,
		scrollVelocityRef,
	};
}
