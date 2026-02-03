import { useCallback, useEffect, useRef } from "react";
import {
	CONT_SCROLL_FAST,
	CONT_SCROLL_PER_FRAME,
	SCROLL_STEP_HORIZONTAL,
	SCROLL_STEP_VERTICAL,
} from "../lib/constants";
import { getKeys } from "../lib/config";
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

// Helper to check if a key matches a keybinding
function matchesKey(event: KeyboardEvent, binding: string): boolean {
	const key = event.key;
	const keyLower = key?.toLowerCase?.() ?? "";
	const codeLower = event.code?.toLowerCase?.() ?? "";

	// Handle special key names
	if (binding === "Tab") {
		return key === "Tab";
	}

	// Handle compound keys like 'gg' - these are handled separately
	if (binding.length > 1 && !binding.startsWith("Arrow")) {
		return false;
	}

	// Check if binding matches key or code
	if (binding === key) return true;
	if (binding.toLowerCase() === keyLower) return true;
	if (`key${binding.toLowerCase()}` === codeLower) return true;

	return false;
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
		const keys = getKeys();

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

			const consume = () => {
				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();
			};

			const targetViewer =
				focusedPaneRef.current === "sub" && hasSubRef.current
					? subViewerRef.current
					: mainViewerRef.current;

			// Handle compound key: gg (jump to top)
			if (keys.jump_top === "gg") {
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
			}
			clearSequence();

			// Swap panes
			if (matchesKey(event, keys.swap_panes)) {
				consume();
				if (event.repeat) return;
				targetViewer?.stopContinuousScroll();
				swapPanes();
				return;
			}

			// Scroll down
			if (matchesKey(event, keys.scroll_down)) {
				consume();
				if (event.repeat) {
					targetViewer?.startContinuousScroll(0, CONT_SCROLL_PER_FRAME);
				} else {
					targetViewer?.scrollLine(SCROLL_STEP_VERTICAL);
				}
				return;
			}

			// Scroll up
			if (matchesKey(event, keys.scroll_up)) {
				consume();
				if (event.repeat) {
					targetViewer?.startContinuousScroll(0, -CONT_SCROLL_PER_FRAME);
				} else {
					targetViewer?.scrollLine(-SCROLL_STEP_VERTICAL);
				}
				return;
			}

			// Scroll left
			if (matchesKey(event, keys.scroll_left)) {
				consume();
				if (event.repeat) {
					targetViewer?.startContinuousScroll(-CONT_SCROLL_PER_FRAME, 0);
				} else {
					targetViewer?.scrollHorizontal(-SCROLL_STEP_HORIZONTAL);
				}
				return;
			}

			// Scroll right
			if (matchesKey(event, keys.scroll_right)) {
				consume();
				if (event.repeat) {
					targetViewer?.startContinuousScroll(CONT_SCROLL_PER_FRAME, 0);
				} else {
					targetViewer?.scrollHorizontal(SCROLL_STEP_HORIZONTAL);
				}
				return;
			}

			// Half page down
			if (matchesKey(event, keys.half_page_down)) {
				consume();
				if (event.repeat) {
					targetViewer?.startContinuousScroll(0, CONT_SCROLL_FAST);
				} else {
					targetViewer?.scrollHalfPage(1);
				}
				return;
			}

			// Half page up
			if (matchesKey(event, keys.half_page_up)) {
				consume();
				if (event.repeat) {
					targetViewer?.startContinuousScroll(0, -CONT_SCROLL_FAST);
				} else {
					targetViewer?.scrollHalfPage(-1);
				}
				return;
			}

			// Jump to bottom
			if (matchesKey(event, keys.jump_bottom)) {
				consume();
				targetViewer?.jumpToBottom();
				return;
			}

			// Next page
			if (matchesKey(event, keys.next_page)) {
				consume();
				targetViewer?.jumpByPages(1);
				return;
			}

			// Previous page
			if (matchesKey(event, keys.prev_page)) {
				consume();
				targetViewer?.jumpByPages(-1);
				return;
			}

			// Zoom in
			if (matchesKey(event, keys.zoom_in)) {
				consume();
				targetViewer?.zoomIn();
				return;
			}

			// Zoom out
			if (matchesKey(event, keys.zoom_out)) {
				consume();
				targetViewer?.zoomOut();
				return;
			}

			// Fit to width
			if (matchesKey(event, keys.fit_width)) {
				consume();
				targetViewer?.fitToWidth();
				return;
			}

			// Toggle focus
			if (matchesKey(event, keys.toggle_focus)) {
				consume();
				targetViewer?.stopContinuousScroll();
				if (hasSubRef.current) {
					setFocusedPane(focusedPaneRef.current === "main" ? "sub" : "main");
				} else {
					setFocusedPane("main");
				}
				return;
			}

			// Reload main
			if (matchesKey(event, keys.reload_main)) {
				consume();
				setMainReloadKey((v) => v + 1);
				setFocusedPane("main");
				addToast("MAIN: reloading…", "info");
				return;
			}

			// Reload all
			if (matchesKey(event, keys.reload_all)) {
				consume();
				setMainReloadKey((v) => v + 1);
				if (hasSubRef.current) {
					subViewerRef.current?.rerender();
				}
				setFocusedPane("main");
				addToast(hasSubRef.current ? "MAIN: reload (re-render SUB)" : "MAIN: reloading…", "info");
				return;
			}

			// Tab switch (H/L for SUB pane tabs)
			if (event.key === "H") {
				consume();
				if (hasSubRef.current && focusedPaneRef.current === "sub") {
					onTabSwitchRef.current?.("prev");
				} else {
					targetViewer?.scrollHorizontal(-SCROLL_STEP_HORIZONTAL * 5);
				}
				return;
			}
			if (event.key === "L") {
				consume();
				if (hasSubRef.current && focusedPaneRef.current === "sub") {
					onTabSwitchRef.current?.("next");
				} else {
					targetViewer?.scrollHorizontal(SCROLL_STEP_HORIZONTAL * 5);
				}
				return;
			}

			// Toggle help
			if (matchesKey(event, keys.toggle_help)) {
				consume();
				setShowHelp((open) => !open);
				return;
			}

			// Quit
			if (matchesKey(event, keys.quit)) {
				consume();
				if (showHelpRef.current) {
					setShowHelp(false);
				} else {
					addToast("Close the tab to quit", "info");
				}
				return;
			}
		};

		window.addEventListener("keydown", handleKey, { capture: true });

		// Get scroll-related keys for keyup handling
		const scrollKeys = [
			keys.scroll_down,
			keys.scroll_up,
			keys.scroll_left,
			keys.scroll_right,
			keys.half_page_down,
			keys.half_page_up,
		];

		const handleKeyUp = (event: KeyboardEvent) => {
			if (!keysEnabledRef.current) return;
			if (scrollKeys.includes(event.key)) {
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
