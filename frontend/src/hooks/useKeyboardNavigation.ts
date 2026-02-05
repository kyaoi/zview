import { useCallback, useEffect, useRef } from "react";
import {
	getKeyBinding,
	isKeySequence,
	parseKeySequence,
	validateKeyConflicts,
	getBlockedKeys,
	getDisableBrowserShortcuts,
} from "../lib/config";
import { keyActionDefs } from "../lib/keyActions";
import { matchesAnyKey } from "../lib/keyMatcher";
import {
	createActionHandlers,
	handleHelpOverlayNavigation,
	SCROLL_ACTION_IDS,
	type ActionContext,
} from "../lib/actionHandlers";
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
		const warnings = validateKeyConflicts();
		for (const warning of warnings) {
			console.warn(warning);
			addToast(warning.message, "warning");
		}
	}, [addToast]);

	useEffect(() => {
		// Create action handlers with current callbacks
		const actionHandlers = createActionHandlers({
			setFocusedPane,
			setMainReloadKey,
			setShowHelp,
			swapPanes,
			addToast,
			onTabSwitch: (...args) => onTabSwitchRef.current?.(...args),
		});

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

		const consume = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
		};

		const getContext = (): ActionContext => ({
			hasSub: hasSubRef.current,
			focusedPane: focusedPaneRef.current,
			showHelp: showHelpRef.current,
			subViewerRef,
		});

		const getTargetViewer = () =>
			focusedPaneRef.current === "sub" && hasSubRef.current
				? subViewerRef.current
				: mainViewerRef.current;

		const findSequenceCompletion = (event: KeyboardEvent): string | null => {
			const lastKey = lastKeyRef.current;
			if (!lastKey) return null;

			for (const actionDef of keyActionDefs) {
				const bindings = getKeyBinding(actionDef.id);
				for (const binding of bindings) {
					if (!isKeySequence(binding)) continue;
					const parts = parseKeySequence(binding);
					if (parts.length !== 2) continue;
					const [first, second] = parts;
					if (first !== lastKey) continue;
					if (matchesAnyKey(event, [second])) {
						return actionDef.id;
					}
				}
			}
			return null;
		};

		const findSingleMatchId = (event: KeyboardEvent): string | null => {
			let matchId: string | null = null;
			for (const actionDef of keyActionDefs) {
				const bindings = getKeyBinding(actionDef.id);
				const singleKeys = bindings.filter((b) => !isKeySequence(b));
				if (matchesAnyKey(event, singleKeys)) {
					matchId = actionDef.id;
				}
			}
			return matchId;
		};

		const findSequenceStartKey = (event: KeyboardEvent): string | null => {
			for (const actionDef of keyActionDefs) {
				const bindings = getKeyBinding(actionDef.id);
				for (const binding of bindings) {
					if (!isKeySequence(binding)) continue;
					const [first] = parseKeySequence(binding);
					if (!first) continue;
					if (matchesAnyKey(event, [first])) {
						return first;
					}
				}
			}
			return null;
		};

		const handleHelpModeAction = (actionId: string, _event: KeyboardEvent): boolean => {
			const helpContent = document.getElementById("help-overlay-content");
			if (!helpContent) return false;

			// Allow quit/toggle_help
			if (actionId === "quit" || actionId === "toggle_help") {
				return false; // Let normal handler execute
			}

			// Redirect navigation keys to scroll the help content
			const def = keyActionDefs.find((d) => d.id === actionId);
			if (def?.category === "navigation") {
				return handleHelpOverlayNavigation(actionId, helpContent);
			}

			// Block all other actions
			return true;
		};

		const handleKey = (event: KeyboardEvent) => {
			if (!keysEnabledRef.current) return;
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable)
				return;

			// Check blocked keys first
			const blockedKeys = getBlockedKeys();
			if (matchesAnyKey(event, blockedKeys)) {
				consume(event);
				return;
			}

			const targetViewer = getTargetViewer();
			const context = getContext();

			// 1. Check if we are completing a sequence
			const sequenceMatchId = findSequenceCompletion(event);
			if (sequenceMatchId) {
				consume(event);
				clearSequence();

				if (context.showHelp && handleHelpModeAction(sequenceMatchId, event)) {
					return;
				}

				actionHandlers[sequenceMatchId]?.(targetViewer, event, context);
				return;
			}
			if (lastKeyRef.current) {
				clearSequence();
			}

			// 2. Check for Single Key Match
			const singleMatchId = findSingleMatchId(event);
			if (singleMatchId) {
				consume(event);

				if (context.showHelp && handleHelpModeAction(singleMatchId, event)) {
					return;
				}

				actionHandlers[singleMatchId]?.(targetViewer, event, context);
				return;
			}

			// 3. Check for Sequence Start
			const sequenceStartKey = findSequenceStartKey(event);
			if (sequenceStartKey) {
				consume(event);
				lastKeyRef.current = sequenceStartKey;
				scheduleSequenceClear();
				return;
			}

			// If no action matched, check if we should block browser shortcuts
			if (getDisableBrowserShortcuts()) {
				// Block if any modifier is used (Ctrl, Alt, Meta)
				if (event.ctrlKey || event.altKey || event.metaKey) {
					consume(event);
				}
			}
		};

		window.addEventListener("keydown", handleKey, { capture: true });

		const handleKeyUp = (event: KeyboardEvent) => {
			if (!keysEnabledRef.current) return;

			// Check if released key was a scroll key
			for (const actionId of SCROLL_ACTION_IDS) {
				const keys = getKeyBinding(actionId);
				if (matchesAnyKey(event, keys)) {
					const targetViewer = getTargetViewer();
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
