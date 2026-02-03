import { useCallback, useEffect, useRef } from "react";
import {
	CONT_SCROLL_FAST,
	CONT_SCROLL_PER_FRAME,
	SCROLL_STEP_HORIZONTAL,
	SCROLL_STEP_VERTICAL,
} from "../lib/constants";
import {
	getKeyBinding,
	isKeySequence,
	parseKeySequence,
	validateKeyConflicts,
	getBlockedKeys,
	getDisableBrowserShortcuts,
} from "../lib/config";
import { keyActionDefs } from "../lib/keyActions";
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

// Check if a key event matches any of the keybindings
// Check if a key event matches any of the keybindings
// Check if a key event matches any of the bound keys
// Now supports <Key>, <M-key>, etc.
// Check if a key event matches any of the bound keys
// Now supports <Key>, <M-key>, etc.
function matchesAnyKey(event: KeyboardEvent, keys: string[]): boolean {
	const eventKey = event.key;
	const eventCode = event.code; // e.g., "KeyJ", "Space", "Enter"

	// Normalize modifiers from event
	const modifiers: string[] = [];
	if (event.ctrlKey) modifiers.push("C");
	if (event.metaKey) modifiers.push("M");
	if (event.altKey) modifiers.push("A");
	if (event.shiftKey) modifiers.push("S");
	// Sort modifiers to ensure consistent order
	modifiers.sort();

	for (const binding of keys) {
		// Parse binding: <M-j> -> modifiers=["M"], key="j"
		let bindingKey = binding;
		let bindingModifiers: string[] = [];

		// Check for <...> notation
		if (binding.startsWith("<") && binding.endsWith(">")) {
			// e.g. <C-M-j> or <Space>
			const content = binding.slice(1, -1);
			const parts = content.split("-");
			if (parts.length > 1) {
				// Has modifiers: <Mod-Key>
				// Last part is the key, previous are modifiers
				bindingKey = parts.pop() || "";
				// Normalized modifiers
				bindingModifiers = parts.map((m) => {
					switch (m.toUpperCase()) {
						case "C":
						case "CTRL":
							return "C";
						case "M":
						case "META":
						case "CMD":
						case "WIN":
						case "SUPER":
							return "M";
						case "A":
						case "ALT":
							return "A";
						case "S":
						case "SHIFT":
							return "S";
						default:
							return m;
					}
				});
			} else {
				// Just special key: <Space>, <Tab>
				bindingKey = content;
			}
		}

		// Check modifiers match strictly
		const hasModifiersMismatch = () => {
			const eventMods = new Set(modifiers);
			const bindMods = new Set(bindingModifiers);

			// For single character keys (e.g. "G", "j", "+"), the key value itself
			// encapsulates the Shift state (case-sensitive).
			// So we ignore the "S" modifier in the set comparison for these cases.
			// This allows binding="G" to match Shift+g (event.key="G", mods=["S"])
			// without requiring the binding to explicitly be "<S-g>".
			if (bindingKey.length === 1) {
				eventMods.delete("S");
				bindMods.delete("S");
			}

			if (eventMods.size !== bindMods.size) return true;
			for (const m of eventMods) {
				if (!bindMods.has(m)) return true;
			}
			return false;
		};

		// Key Matching Logic
		let keyMatches = false;

		// Case 1: Special name match (Space, Tab, Escape, etc.)
		if (bindingKey.length > 1) {
			if (eventCode.toLowerCase() === bindingKey.toLowerCase()) keyMatches = true;
			else if (eventCode.toLowerCase() === `key${bindingKey.toLowerCase()}`) keyMatches = true;
			else if (eventKey.toLowerCase() === bindingKey.toLowerCase()) keyMatches = true;
			else if (bindingKey.toLowerCase() === "space" && eventKey === " ") keyMatches = true;
		} else {
			// Single char (e.g. "j", "G", "?")
			// Exact match on key
			if (bindingKey === eventKey) keyMatches = true;
		}

		if (keyMatches) {
			if (!hasModifiersMismatch()) return true;
		}
	}
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
		const warnings = validateKeyConflicts();
		for (const warning of warnings) {
			console.warn(warning);
			addToast(warning.message, "warning");
		}
	}, [addToast]);

	useEffect(() => {
		// Build action handlers map
		type ActionHandler = (
			viewer: ViewerHandle | null,
			event: KeyboardEvent,
			context: {
				hasSub: boolean;
				focusedPane: "main" | "sub";
				showHelp: boolean;
				subViewerRef: React.RefObject<ViewerHandle | null>;
			},
		) => void;

		const actionHandlers: Record<string, ActionHandler> = {
			scroll_down: (v, e) => {
				if (e.repeat) {
					v?.startContinuousScroll(0, CONT_SCROLL_PER_FRAME);
				} else {
					v?.scrollLine(SCROLL_STEP_VERTICAL);
				}
			},
			scroll_up: (v, e) => {
				if (e.repeat) {
					v?.startContinuousScroll(0, -CONT_SCROLL_PER_FRAME);
				} else {
					v?.scrollLine(-SCROLL_STEP_VERTICAL);
				}
			},
			scroll_left: (v, e) => {
				if (e.repeat) {
					v?.startContinuousScroll(-CONT_SCROLL_PER_FRAME, 0);
				} else {
					v?.scrollHorizontal(-SCROLL_STEP_HORIZONTAL);
				}
			},
			scroll_right: (v, e) => {
				if (e.repeat) {
					v?.startContinuousScroll(CONT_SCROLL_PER_FRAME, 0);
				} else {
					v?.scrollHorizontal(SCROLL_STEP_HORIZONTAL);
				}
			},
			half_page_down: (v, e) => {
				if (e.repeat) {
					v?.startContinuousScroll(0, CONT_SCROLL_FAST);
				} else {
					v?.scrollHalfPage(1);
				}
			},
			half_page_up: (v, e) => {
				if (e.repeat) {
					v?.startContinuousScroll(0, -CONT_SCROLL_FAST);
				} else {
					v?.scrollHalfPage(-1);
				}
			},
			jump_top: (v) => v?.jumpToTop(),
			jump_bottom: (v) => v?.jumpToBottom(),
			next_page: (v) => v?.jumpByPages(1),
			prev_page: (v) => v?.jumpByPages(-1),
			zoom_in: (v) => v?.zoomIn(),
			zoom_out: (v) => v?.zoomOut(),
			fit_width: (v) => v?.fitToWidth(),
			toggle_focus: (v, _e, ctx) => {
				v?.stopContinuousScroll();
				if (ctx.hasSub) {
					setFocusedPane(ctx.focusedPane === "main" ? "sub" : "main");
				} else {
					setFocusedPane("main");
				}
			},
			swap_panes: (v, e, ctx) => {
				if (e.repeat) return;
				v?.stopContinuousScroll();
				if (swapPanes()) {
					setFocusedPane(ctx.focusedPane === "main" ? "sub" : "main");
				}
			},
			reload_main: () => {
				setMainReloadKey((v) => v + 1);
				setFocusedPane("main");
				addToast("MAIN: reloading…", "info");
			},
			reload_all: (_v, _e, ctx) => {
				setMainReloadKey((v) => v + 1);
				if (ctx.hasSub) {
					ctx.subViewerRef.current?.rerender();
				}
				setFocusedPane("main");
				addToast(ctx.hasSub ? "MAIN: reload (re-render SUB)" : "MAIN: reloading…", "info");
			},
			toggle_help: () => setShowHelp((open) => !open),
			quit: (_v, _e, ctx) => {
				if (ctx.showHelp) {
					setShowHelp(false);
				} else {
					addToast("Close the tab to quit", "info");
				}
			},
			prev_tab: (v, _e, ctx) => {
				// Special behavior: Switch tab if in SUB, otherwise fast scroll left
				if (ctx.hasSub && ctx.focusedPane === "sub") {
					onTabSwitchRef.current?.("prev");
				} else {
					v?.scrollHorizontal(-SCROLL_STEP_HORIZONTAL * 5);
				}
			},
			next_tab: (v, _e, ctx) => {
				// Special behavior: Switch tab if in SUB, otherwise fast scroll right
				if (ctx.hasSub && ctx.focusedPane === "sub") {
					onTabSwitchRef.current?.("next");
				} else {
					v?.scrollHorizontal(SCROLL_STEP_HORIZONTAL * 5);
				}
			},
		};

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
			if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable)
				return;

			const consume = () => {
				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();
			};

			// Check blocked keys first
			const blockedKeys = getBlockedKeys();
			if (matchesAnyKey(event, blockedKeys)) {
				consume();
				return;
			}

			const targetViewer =
				focusedPaneRef.current === "sub" && hasSubRef.current
					? subViewerRef.current
					: mainViewerRef.current;

			const context = {
				hasSub: hasSubRef.current,
				focusedPane: focusedPaneRef.current,
				showHelp: showHelpRef.current,
				subViewerRef,
			};

			// 1. Check if we are completing a sequence
			if (lastKeyRef.current) {
				const currentKey = event.key;
				const candidateSeq = `${lastKeyRef.current} ${currentKey}`;

				for (const actionDef of keyActionDefs) {
					const bindings = getKeyBinding(actionDef.id);
					if (bindings.includes(candidateSeq)) {
						consume();
						clearSequence();

						if (context.showHelp) {
							if (actionDef.id === "quit" || actionDef.id === "toggle_help") {
								// Run handler
							} else if (actionDef.category === "navigation" || actionDef.id === "jump_top") {
								const helpContent = document.getElementById("help-overlay-content");
								if (helpContent) {
									if (actionDef.id === "jump_top") {
										helpContent.scrollTo({ top: 0, behavior: "smooth" });
									} else if (actionDef.id === "jump_bottom") {
										helpContent.scrollTo({ top: helpContent.scrollHeight, behavior: "smooth" });
									}
									return;
								}
							} else {
								return;
							}
						}

						actionHandlers[actionDef.id]?.(targetViewer, event, context);
						return;
					}
				}
				clearSequence();
			}

			// 2. Check for Single Key Match OR Sequence Start
			let singleMatchId: string | null = null;
			let startsSequence = false;

			for (const actionDef of keyActionDefs) {
				const bindings = getKeyBinding(actionDef.id);

				const singleKeys = bindings.filter((b) => !isKeySequence(b));
				if (matchesAnyKey(event, singleKeys)) {
					singleMatchId = actionDef.id;
				}

				for (const binding of bindings) {
					if (isKeySequence(binding)) {
						const [first] = parseKeySequence(binding);
						if (matchesAnyKey(event, [first])) {
							startsSequence = true;
						}
					}
				}
			}

			if (singleMatchId) {
				consume();

				if (context.showHelp) {
					const helpContent = document.getElementById("help-overlay-content");
					if (helpContent) {
						if (singleMatchId === "quit" || singleMatchId === "toggle_help") {
							// execute
						} else {
							const def = keyActionDefs.find((d) => d.id === singleMatchId);
							if (def?.category === "navigation") {
								const scrollAmount = 60;
								const pageAmount = helpContent.clientHeight * 0.8;
								switch (singleMatchId) {
									case "scroll_down":
										helpContent.scrollBy({ top: scrollAmount, behavior: "smooth" });
										return;
									case "scroll_up":
										helpContent.scrollBy({ top: -scrollAmount, behavior: "smooth" });
										return;
									case "half_page_down":
									case "next_page":
										helpContent.scrollBy({ top: pageAmount, behavior: "smooth" });
										return;
									case "half_page_up":
									case "prev_page":
										helpContent.scrollBy({ top: -pageAmount, behavior: "smooth" });
										return;
									case "jump_top":
										helpContent.scrollTo({ top: 0, behavior: "smooth" });
										return;
									case "jump_bottom":
										helpContent.scrollTo({ top: helpContent.scrollHeight, behavior: "smooth" });
										return;
								}
							}
							return;
						}
					}
				}

				actionHandlers[singleMatchId]?.(targetViewer, event, context);
				return;
			}

			if (startsSequence) {
				consume();
				lastKeyRef.current = event.key;
				scheduleSequenceClear();
				return;
			}

			// Iterate through all actions and check for matches
			for (const actionDef of keyActionDefs) {
				const keys = getKeyBinding(actionDef.id);
				if (matchesAnyKey(event, keys)) {
					consume();

					// Special handling when Help Overlay is open:
					// - Allow quit/toggle_help
					// - Redirect navigation keys to scroll the help content
					// - Block everything else (so PDF doesn't scroll/zoom in background)
					if (context.showHelp) {
						const helpContent = document.getElementById("help-overlay-content");
						if (helpContent) {
							if (actionDef.id === "quit" || actionDef.id === "toggle_help") {
								// Fall through to normal handler
							} else if (actionDef.category === "navigation") {
								const scrollAmount = 60; // Approximate line height * 3
								const pageAmount = helpContent.clientHeight * 0.8;

								switch (actionDef.id) {
									case "scroll_down":
										helpContent.scrollBy({ top: scrollAmount, behavior: "smooth" });
										return;
									case "scroll_up":
										helpContent.scrollBy({ top: -scrollAmount, behavior: "smooth" });
										return;
									case "half_page_down":
									case "next_page":
										helpContent.scrollBy({ top: pageAmount, behavior: "smooth" });
										return;
									case "half_page_up":
									case "prev_page":
										helpContent.scrollBy({ top: -pageAmount, behavior: "smooth" });
										return;
									case "jump_top":
										helpContent.scrollTo({ top: 0, behavior: "smooth" });
										return;
									case "jump_bottom":
										helpContent.scrollTo({ top: helpContent.scrollHeight, behavior: "smooth" });
										return;
									default:
										return; // Ignore other nav keys (left/right etc)
								}
							} else {
								// Block all other actions (zoom, panes, etc)
								return;
							}
						}
					}

					const handler = actionHandlers[actionDef.id];
					if (handler) {
						handler(targetViewer, event, context);
					}
					return;
				}
			}

			// If no action matched, check if we should block browser shortcuts
			if (getDisableBrowserShortcuts()) {
				// Block if any modifier is used (Ctrl, Alt, Meta)
				if (event.ctrlKey || event.altKey || event.metaKey) {
					consume();
				}
			}
		};

		window.addEventListener("keydown", handleKey, { capture: true });

		// Scroll-related action IDs for keyup handling
		const scrollActionIds = [
			"scroll_down",
			"scroll_up",
			"scroll_left",
			"scroll_right",
			"half_page_down",
			"half_page_up",
		];

		const handleKeyUp = (event: KeyboardEvent) => {
			if (!keysEnabledRef.current) return;

			// Check if released key was a scroll key
			for (const actionId of scrollActionIds) {
				const keys = getKeyBinding(actionId);
				if (matchesAnyKey(event, keys)) {
					const targetViewer =
						focusedPaneRef.current === "sub" && hasSubRef.current
							? subViewerRef.current
							: mainViewerRef.current;
					targetViewer?.stopContinuousScroll();
					return;
				}
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
		const mainSnap = mainViewerRef.current?.getSnapshot() ?? null;
		const subSnap = subViewerRef.current?.getSnapshot() ?? null;
		swapSnapshotsRef.current = { main: mainSnap, sub: subSnap };

		setPaneOrder((prev) => (prev === "main-first" ? "sub-first" : "main-first"));
		addToast("Swapped MAIN/SUB order", "info");
		return true;
	}, [addToast, hasSubRef, mainViewerRef, subViewerRef, setPaneOrder]);

	return [swapPanes, swapSnapshotsRef];
}
