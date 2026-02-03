/**
 * Action handlers for keyboard navigation.
 */
import {
	CONT_SCROLL_FAST,
	CONT_SCROLL_PER_FRAME,
	SCROLL_STEP_HORIZONTAL,
	SCROLL_STEP_VERTICAL,
} from "./constants";
import type { ScrollSnapshot, ToastType, ViewerHandle } from "./types";

/**
 * Context passed to action handlers.
 */
export interface ActionContext {
	hasSub: boolean;
	focusedPane: "main" | "sub";
	showHelp: boolean;
	subViewerRef: React.RefObject<ViewerHandle | null>;
}

/**
 * Type for action handler functions.
 */
export type ActionHandler = (
	viewer: ViewerHandle | null,
	event: KeyboardEvent,
	context: ActionContext,
) => void;

/**
 * Action handler functions that are passed to callbacks.
 * These use the callback functions directly passed as arguments.
 */
export interface ActionCallbacks {
	setFocusedPane: (pane: "main" | "sub") => void;
	setMainReloadKey: React.Dispatch<React.SetStateAction<number>>;
	setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;
	swapPanes: () => boolean;
	addToast: (message: string, type: ToastType) => void;
	onTabSwitch?: (direction: "prev" | "next") => void;
}

/**
 * Create action handlers map with given callbacks.
 */
export function createActionHandlers(callbacks: ActionCallbacks): Record<string, ActionHandler> {
	const { setFocusedPane, setMainReloadKey, setShowHelp, swapPanes, addToast, onTabSwitch } =
		callbacks;

	return {
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
				onTabSwitch?.("prev");
			} else {
				v?.scrollHorizontal(-SCROLL_STEP_HORIZONTAL * 5);
			}
		},
		next_tab: (v, _e, ctx) => {
			// Special behavior: Switch tab if in SUB, otherwise fast scroll right
			if (ctx.hasSub && ctx.focusedPane === "sub") {
				onTabSwitch?.("next");
			} else {
				v?.scrollHorizontal(SCROLL_STEP_HORIZONTAL * 5);
			}
		},
	};
}

/**
 * Scroll amounts for help overlay navigation.
 */
export const HELP_SCROLL_LINE = 60;
export const HELP_SCROLL_PAGE_FACTOR = 0.8;

/**
 * Handle navigation keys in help overlay mode.
 * Returns true if the key was handled, false otherwise.
 */
export function handleHelpOverlayNavigation(actionId: string, helpContent: HTMLElement): boolean {
	const scrollAmount = HELP_SCROLL_LINE;
	const pageAmount = helpContent.clientHeight * HELP_SCROLL_PAGE_FACTOR;

	switch (actionId) {
		case "scroll_down":
			helpContent.scrollBy({ top: scrollAmount, behavior: "smooth" });
			return true;
		case "scroll_up":
			helpContent.scrollBy({ top: -scrollAmount, behavior: "smooth" });
			return true;
		case "half_page_down":
		case "next_page":
			helpContent.scrollBy({ top: pageAmount, behavior: "smooth" });
			return true;
		case "half_page_up":
		case "prev_page":
			helpContent.scrollBy({ top: -pageAmount, behavior: "smooth" });
			return true;
		case "jump_top":
			helpContent.scrollTo({ top: 0, behavior: "smooth" });
			return true;
		case "jump_bottom":
			helpContent.scrollTo({ top: helpContent.scrollHeight, behavior: "smooth" });
			return true;
		default:
			return false;
	}
}

/**
 * IDs of scroll-related actions that need keyup handling.
 */
export const SCROLL_ACTION_IDS = [
	"scroll_down",
	"scroll_up",
	"scroll_left",
	"scroll_right",
	"half_page_down",
	"half_page_up",
] as const;
