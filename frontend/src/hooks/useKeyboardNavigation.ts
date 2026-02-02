import { useCallback, useEffect, useRef } from "react";
import { CONT_SCROLL_FAST, CONT_SCROLL_PER_FRAME, LINE_SCROLL_PX } from "../lib/constants";
import type { ScrollSnapshot, ToastType, ViewerHandle } from "../lib/types";

interface UseKeyboardNavigationOptions {
	keysEnabled: boolean;
	focusedPane: "main" | "sub";
	hasSub: boolean;
	showHelp: boolean;
	mainViewerRef: React.RefObject<ViewerHandle | null>;
	subViewerRef: React.RefObject<ViewerHandle | null>;
	setFocusedPane: (pane: "main" | "sub") => void;
	setMainReloadKey: React.Dispatch<React.SetStateAction<number>>;
	setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
	swapPanes: () => boolean;
	addToast: (message: string, type: ToastType) => void;
	onTabSwitch?: (direction: "prev" | "next") => void;
}

export function useKeyboardNavigation({
	keysEnabled,
	focusedPane,
	hasSub,
	showHelp,
	mainViewerRef,
	subViewerRef,
	setFocusedPane,
	setMainReloadKey,
	setShowHelp,
	swapPanes,
	addToast,
	onTabSwitch,
}: UseKeyboardNavigationOptions) {
	const keySeqTimeoutRef = useRef<number | null>(null);
	const lastKeyRef = useRef<string | null>(null);
	const hasSubRef = useRef(hasSub);
	const focusedPaneRef = useRef<"main" | "sub">(focusedPane);
	const showHelpRef = useRef(showHelp);
	const keysEnabledRef = useRef(keysEnabled);
	const onTabSwitchRef = useRef(onTabSwitch);
	useEffect(() => {
		onTabSwitchRef.current = onTabSwitch;
	}, [onTabSwitch]);

	useEffect(() => {
		hasSubRef.current = hasSub;
	}, [hasSub]);
	useEffect(() => {
		focusedPaneRef.current = focusedPane;
	}, [focusedPane]);
	useEffect(() => {
		showHelpRef.current = showHelp;
	}, [showHelp]);
	useEffect(() => {
		keysEnabledRef.current = keysEnabled;
	}, [keysEnabled]);

	useEffect(() => {
		const clearSequence = () => {
			if (keySeqTimeoutRef.current) {
				window.clearTimeout(keySeqTimeoutRef.current);
				keySeqTimeoutRef.current = null;
			}
			lastKeyRef.current = null;
		};

		const scheduleSequenceClear = () => {
			if (keySeqTimeoutRef.current) window.clearTimeout(keySeqTimeoutRef.current);
			keySeqTimeoutRef.current = window.setTimeout(() => {
				lastKeyRef.current = null;
				keySeqTimeoutRef.current = null;
			}, 600);
		};

		const handleKey = (event: KeyboardEvent) => {
			if (!keysEnabledRef.current) return;
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable)
				return;

			const keyLower = event.key?.toLowerCase?.() ?? "";
			const codeLower = event.code?.toLowerCase?.() ?? "";

			const consume = () => {
				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();
			};

			const targetViewer =
				focusedPaneRef.current === "sub" && hasSubRef.current
					? subViewerRef.current
					: mainViewerRef.current;

			// multi-key: gg
			if (event.key === "g") {
				if (lastKeyRef.current === "g") {
					consume();
					clearSequence();
					targetViewer?.jumpToTop();
					return;
				}
				lastKeyRef.current = "g";
				scheduleSequenceClear();
				return;
			}
			clearSequence();

			if (codeLower === "keys" || keyLower === "s") {
				consume();
				if (event.repeat) return;
				targetViewer?.stopContinuousScroll();
				swapPanes();
				return;
			}
			switch (event.key) {
				case "j":
					consume();
					if (event.repeat) {
						targetViewer?.startContinuousScroll(0, CONT_SCROLL_PER_FRAME);
					} else {
						targetViewer?.scrollLine(LINE_SCROLL_PX);
					}
					return;
				case "k":
					consume();
					if (event.repeat) {
						targetViewer?.startContinuousScroll(0, -CONT_SCROLL_PER_FRAME);
					} else {
						targetViewer?.scrollLine(-LINE_SCROLL_PX);
					}
					return;
				case "h":
					consume();
					if (event.repeat) {
						targetViewer?.startContinuousScroll(-CONT_SCROLL_PER_FRAME, 0);
					} else {
						targetViewer?.scrollHorizontal(-LINE_SCROLL_PX);
					}
					return;
				case "l":
					consume();
					if (event.repeat) {
						targetViewer?.startContinuousScroll(CONT_SCROLL_PER_FRAME, 0);
					} else {
						targetViewer?.scrollHorizontal(LINE_SCROLL_PX);
					}
					return;
				case "d":
					consume();
					if (event.repeat) {
						targetViewer?.startContinuousScroll(0, CONT_SCROLL_FAST);
					} else {
						targetViewer?.scrollHalfPage(1);
					}
					return;
				case "u":
					consume();
					if (event.repeat) {
						targetViewer?.startContinuousScroll(0, -CONT_SCROLL_FAST);
					} else {
						targetViewer?.scrollHalfPage(-1);
					}
					return;
				case "G":
					consume();
					targetViewer?.jumpToBottom();
					return;
				case "n":
					consume();
					targetViewer?.jumpByPages(1);
					return;
				case "p":
					consume();
					targetViewer?.jumpByPages(-1);
					return;
				case "+":
					consume();
					targetViewer?.zoomIn();
					return;
				case "-":
					consume();
					targetViewer?.zoomOut();
					return;
				case "=":
					consume();
					targetViewer?.fitToWidth();
					return;
				case "Tab":
					consume();
					targetViewer?.stopContinuousScroll();
					if (hasSubRef.current) {
						setFocusedPane(focusedPaneRef.current === "main" ? "sub" : "main");
					} else {
						setFocusedPane("main");
					}
					return;
				case "r":
					consume();
					setMainReloadKey((v) => v + 1);
					setFocusedPane("main");
					addToast("MAIN: reloading…", "info");
					return;
				case "R":
					consume();
					setMainReloadKey((v) => v + 1);
					if (hasSubRef.current) {
						subViewerRef.current?.rerender();
					}
					setFocusedPane("main");
					addToast(hasSubRef.current ? "MAIN: reload (re-render SUB)" : "MAIN: reloading…", "info");
					return;
				case "H":
					consume();
					if (hasSubRef.current && focusedPaneRef.current === "sub") {
						onTabSwitchRef.current?.("prev");
					} else {
						// Fallback or do nothing
						targetViewer?.scrollHorizontal(-LINE_SCROLL_PX * 5); // Faster scroll? Or just ignore
					}
					return;
				case "L":
					consume();
					if (hasSubRef.current && focusedPaneRef.current === "sub") {
						onTabSwitchRef.current?.("next");
					} else {
						targetViewer?.scrollHorizontal(LINE_SCROLL_PX * 5);
					}
					return;
				case "?":
					consume();
					setShowHelp((open) => !open);
					return;
				case "q":
					consume();
					if (showHelpRef.current) {
						setShowHelp(false);
					} else {
						addToast("Close the tab to quit", "info");
					}
					return;
				default:
					return;
			}
		};

		window.addEventListener("keydown", handleKey, { capture: true });
		const handleKeyUp = (event: KeyboardEvent) => {
			if (!keysEnabledRef.current) return;
			if (["j", "k", "h", "l", "d", "u"].includes(event.key)) {
				const targetViewer =
					focusedPaneRef.current === "sub" && hasSubRef.current
						? subViewerRef.current
						: mainViewerRef.current;
				targetViewer?.stopContinuousScroll();
			}
		};
		window.addEventListener("keyup", handleKeyUp);
		return () => {
			window.removeEventListener("keydown", handleKey);
			window.removeEventListener("keyup", handleKeyUp);
			if (keySeqTimeoutRef.current) window.clearTimeout(keySeqTimeoutRef.current);
		};
	}, [
		addToast,
		swapPanes,
		mainViewerRef,
		subViewerRef,
		setFocusedPane,
		setMainReloadKey,
		setShowHelp,
		// onTabSwitch removed from deps, ref used
	]);
}

export function useSwapPanes(
	hasSubRef: React.RefObject<boolean>,
	mainViewerRef: React.RefObject<ViewerHandle | null>,
	subViewerRef: React.RefObject<ViewerHandle | null>,
	setPaneOrder: React.Dispatch<React.SetStateAction<"main-first" | "sub-first">>,
	addToast: (message: string, type: ToastType) => void,
): [
	() => boolean,
	React.MutableRefObject<{ main: ScrollSnapshot | null; sub: ScrollSnapshot | null } | null>,
] {
	const swapSnapshotsRef = useRef<{
		main: ScrollSnapshot | null;
		sub: ScrollSnapshot | null;
	} | null>(null);

	const swapPanes = useCallback(() => {
		if (!hasSubRef.current) {
			addToast("Cannot swap without SUB", "error");
			return false;
		}
		// Capture snapshots before state update triggers re-render/layout
		const mainSnap = mainViewerRef.current?.getSnapshot() ?? null;
		const subSnap = subViewerRef.current?.getSnapshot() ?? null;
		swapSnapshotsRef.current = { main: mainSnap, sub: subSnap };

		setPaneOrder((prev) => (prev === "main-first" ? "sub-first" : "main-first"));
		addToast("Swapped MAIN/SUB order", "info");
		return true;
	}, [addToast, hasSubRef, mainViewerRef, subViewerRef, setPaneOrder]);

	return [swapPanes, swapSnapshotsRef];
}
