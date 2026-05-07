import { describe, it, expect, vi } from "vitest";
import {
	createActionHandlers,
	handleHelpOverlayNavigation,
	HELP_SCROLL_LINE,
	HELP_SCROLL_PAGE_FACTOR,
} from "./actionHandlers";
import {
	CONT_SCROLL_FAST,
	CONT_SCROLL_PER_FRAME,
	SCROLL_STEP_HORIZONTAL,
	SCROLL_STEP_VERTICAL,
} from "./constants";
import type { ViewerHandle } from "./types";

const createViewer = (): ViewerHandle => ({
	startContinuousScroll: vi.fn(),
	scrollLine: vi.fn(),
	scrollHorizontal: vi.fn(),
	scrollHalfPage: vi.fn(),
	jumpToTop: vi.fn(),
	jumpToBottom: vi.fn(),
	jumpByPages: vi.fn(),
	jumpToPage: vi.fn(),
	zoomIn: vi.fn(),
	zoomOut: vi.fn(),
	fitToWidth: vi.fn(),
	stopContinuousScroll: vi.fn(),
	rerender: vi.fn(),
	getSnapshot: vi.fn(),
	restoreSnapshot: vi.fn(),
});

describe("createActionHandlers", () => {
	it("handles scroll actions with and without repeat", () => {
		const viewer = createViewer();
		const callbacks = {
			setFocusedPane: vi.fn(),
			setMainReloadKey: vi.fn(),
			setShowHelp: vi.fn(),
			swapPanes: vi.fn(),
			addToast: vi.fn(),
		};
		const handlers = createActionHandlers(callbacks);
		const repeatEvent = new KeyboardEvent("keydown", { repeat: true });
		const onceEvent = new KeyboardEvent("keydown", { repeat: false });

		handlers.scroll_down(viewer, onceEvent, {} as never);
		expect(viewer.scrollLine).toHaveBeenCalledWith(SCROLL_STEP_VERTICAL);

		handlers.scroll_down(viewer, repeatEvent, {} as never);
		expect(viewer.startContinuousScroll).toHaveBeenCalledWith(0, CONT_SCROLL_PER_FRAME);

		handlers.scroll_up(viewer, onceEvent, {} as never);
		expect(viewer.scrollLine).toHaveBeenCalledWith(-SCROLL_STEP_VERTICAL);

		handlers.scroll_up(viewer, repeatEvent, {} as never);
		expect(viewer.startContinuousScroll).toHaveBeenCalledWith(0, -CONT_SCROLL_PER_FRAME);

		handlers.scroll_left(viewer, onceEvent, {} as never);
		expect(viewer.scrollHorizontal).toHaveBeenCalledWith(-SCROLL_STEP_HORIZONTAL);

		handlers.scroll_left(viewer, repeatEvent, {} as never);
		expect(viewer.startContinuousScroll).toHaveBeenCalledWith(-CONT_SCROLL_PER_FRAME, 0);

		handlers.scroll_right(viewer, onceEvent, {} as never);
		expect(viewer.scrollHorizontal).toHaveBeenCalledWith(SCROLL_STEP_HORIZONTAL);

		handlers.scroll_right(viewer, repeatEvent, {} as never);
		expect(viewer.startContinuousScroll).toHaveBeenCalledWith(CONT_SCROLL_PER_FRAME, 0);
	});

	it("handles half-page scroll actions", () => {
		const viewer = createViewer();
		const callbacks = {
			setFocusedPane: vi.fn(),
			setMainReloadKey: vi.fn(),
			setShowHelp: vi.fn(),
			swapPanes: vi.fn(),
			addToast: vi.fn(),
		};
		const handlers = createActionHandlers(callbacks);
		const repeatEvent = new KeyboardEvent("keydown", { repeat: true });
		const onceEvent = new KeyboardEvent("keydown", { repeat: false });

		handlers.half_page_down(viewer, onceEvent, {} as never);
		expect(viewer.scrollHalfPage).toHaveBeenCalledWith(1);

		handlers.half_page_down(viewer, repeatEvent, {} as never);
		expect(viewer.startContinuousScroll).toHaveBeenCalledWith(0, CONT_SCROLL_FAST);

		handlers.half_page_up(viewer, onceEvent, {} as never);
		expect(viewer.scrollHalfPage).toHaveBeenCalledWith(-1);

		handlers.half_page_up(viewer, repeatEvent, {} as never);
		expect(viewer.startContinuousScroll).toHaveBeenCalledWith(0, -CONT_SCROLL_FAST);
	});

	it("handles jump and zoom actions", () => {
		const viewer = createViewer();
		const callbacks = {
			setFocusedPane: vi.fn(),
			setMainReloadKey: vi.fn(),
			setShowHelp: vi.fn(),
			swapPanes: vi.fn(),
			addToast: vi.fn(),
		};
		const handlers = createActionHandlers(callbacks);

		handlers.jump_top(viewer, new KeyboardEvent("keydown"), {} as never);
		expect(viewer.jumpToTop).toHaveBeenCalled();

		handlers.jump_bottom(viewer, new KeyboardEvent("keydown"), {} as never);
		expect(viewer.jumpToBottom).toHaveBeenCalled();

		handlers.next_page(viewer, new KeyboardEvent("keydown"), {} as never);
		expect(viewer.jumpByPages).toHaveBeenCalledWith(1);

		handlers.prev_page(viewer, new KeyboardEvent("keydown"), {} as never);
		expect(viewer.jumpByPages).toHaveBeenCalledWith(-1);

		handlers.zoom_in(viewer, new KeyboardEvent("keydown"), {} as never);
		expect(viewer.zoomIn).toHaveBeenCalled();

		handlers.zoom_out(viewer, new KeyboardEvent("keydown"), {} as never);
		expect(viewer.zoomOut).toHaveBeenCalled();

		handlers.fit_width(viewer, new KeyboardEvent("keydown"), {} as never);
		expect(viewer.fitToWidth).toHaveBeenCalled();
	});

	it("multiplies scroll step by count when provided", () => {
		const viewer = createViewer();
		const handlers = createActionHandlers({
			setFocusedPane: vi.fn(),
			setMainReloadKey: vi.fn(),
			setShowHelp: vi.fn(),
			swapPanes: vi.fn(),
			addToast: vi.fn(),
		});
		const e = new KeyboardEvent("keydown", { repeat: false });

		handlers.scroll_down(viewer, e, {} as never, 5);
		expect(viewer.scrollLine).toHaveBeenCalledWith(SCROLL_STEP_VERTICAL * 5);

		handlers.scroll_up(viewer, e, {} as never, 3);
		expect(viewer.scrollLine).toHaveBeenCalledWith(-SCROLL_STEP_VERTICAL * 3);

		handlers.scroll_left(viewer, e, {} as never, 2);
		expect(viewer.scrollHorizontal).toHaveBeenCalledWith(-SCROLL_STEP_HORIZONTAL * 2);

		handlers.scroll_right(viewer, e, {} as never, 4);
		expect(viewer.scrollHorizontal).toHaveBeenCalledWith(SCROLL_STEP_HORIZONTAL * 4);
	});

	it("repeats half-page scroll by count", () => {
		const viewer = createViewer();
		const handlers = createActionHandlers({
			setFocusedPane: vi.fn(),
			setMainReloadKey: vi.fn(),
			setShowHelp: vi.fn(),
			swapPanes: vi.fn(),
			addToast: vi.fn(),
		});
		const e = new KeyboardEvent("keydown", { repeat: false });

		handlers.half_page_down(viewer, e, {} as never, 3);
		expect(viewer.scrollHalfPage).toHaveBeenCalledTimes(3);
		expect(viewer.scrollHalfPage).toHaveBeenNthCalledWith(1, 1);
	});

	it("uses count as page jump for jump_top / jump_bottom", () => {
		const viewer = createViewer();
		const handlers = createActionHandlers({
			setFocusedPane: vi.fn(),
			setMainReloadKey: vi.fn(),
			setShowHelp: vi.fn(),
			swapPanes: vi.fn(),
			addToast: vi.fn(),
		});

		handlers.jump_top(viewer, new KeyboardEvent("keydown"), {} as never, 7);
		expect(viewer.jumpToPage).toHaveBeenCalledWith(7);
		expect(viewer.jumpToTop).not.toHaveBeenCalled();

		handlers.jump_bottom(viewer, new KeyboardEvent("keydown"), {} as never, 12);
		expect(viewer.jumpToPage).toHaveBeenCalledWith(12);
		expect(viewer.jumpToBottom).not.toHaveBeenCalled();

		// No count → default behavior preserved
		handlers.jump_top(viewer, new KeyboardEvent("keydown"), {} as never);
		expect(viewer.jumpToTop).toHaveBeenCalled();
		handlers.jump_bottom(viewer, new KeyboardEvent("keydown"), {} as never);
		expect(viewer.jumpToBottom).toHaveBeenCalled();
	});

	it("multiplies next_page / prev_page by count", () => {
		const viewer = createViewer();
		const handlers = createActionHandlers({
			setFocusedPane: vi.fn(),
			setMainReloadKey: vi.fn(),
			setShowHelp: vi.fn(),
			swapPanes: vi.fn(),
			addToast: vi.fn(),
		});

		handlers.next_page(viewer, new KeyboardEvent("keydown"), {} as never, 5);
		expect(viewer.jumpByPages).toHaveBeenCalledWith(5);

		handlers.prev_page(viewer, new KeyboardEvent("keydown"), {} as never, 3);
		expect(viewer.jumpByPages).toHaveBeenCalledWith(-3);
	});

	it("handles focus and pane swapping", () => {
		const viewer = createViewer();
		const setFocusedPane = vi.fn();
		const swapPanes = vi.fn().mockReturnValue(true);
		const callbacks = {
			setFocusedPane,
			setMainReloadKey: vi.fn(),
			setShowHelp: vi.fn(),
			swapPanes,
			addToast: vi.fn(),
		};
		const handlers = createActionHandlers(callbacks);

		handlers.toggle_focus(viewer, new KeyboardEvent("keydown"), {
			hasSub: true,
			focusedPane: "main",
			showHelp: false,
			subViewerRef: { current: null },
		});
		expect(setFocusedPane).toHaveBeenCalledWith("sub");
		expect(viewer.stopContinuousScroll).toHaveBeenCalled();

		setFocusedPane.mockClear();
		handlers.toggle_focus(viewer, new KeyboardEvent("keydown"), {
			hasSub: false,
			focusedPane: "sub",
			showHelp: false,
			subViewerRef: { current: null },
		});
		expect(setFocusedPane).toHaveBeenCalledWith("main");

		const repeatEvent = new KeyboardEvent("keydown", { repeat: true });
		handlers.swap_panes(viewer, repeatEvent, {
			hasSub: true,
			focusedPane: "main",
			showHelp: false,
			subViewerRef: { current: null },
		});
		expect(swapPanes).not.toHaveBeenCalled();

		const onceEvent = new KeyboardEvent("keydown", { repeat: false });
		handlers.swap_panes(viewer, onceEvent, {
			hasSub: true,
			focusedPane: "main",
			showHelp: false,
			subViewerRef: { current: null },
		});
		expect(swapPanes).toHaveBeenCalled();
		expect(setFocusedPane).toHaveBeenCalledWith("sub");
	});

	it("handles reload actions", () => {
		const viewer = createViewer();
		const setFocusedPane = vi.fn();
		const setMainReloadKey = vi.fn();
		const setShowHelp = vi.fn();
		const addToast = vi.fn();
		const subViewerRef = { current: viewer };
		const handlers = createActionHandlers({
			setFocusedPane,
			setMainReloadKey,
			setShowHelp,
			swapPanes: vi.fn(),
			addToast,
		});

		handlers.reload_main(viewer, new KeyboardEvent("keydown"), {
			hasSub: false,
			focusedPane: "main",
			showHelp: false,
			subViewerRef: { current: null },
		});
		expect(setMainReloadKey).toHaveBeenCalledWith(expect.any(Function));
		const updater = setMainReloadKey.mock.calls[0]?.[0] as (v: number) => number;
		expect(updater(1)).toBe(2);
		expect(setFocusedPane).toHaveBeenCalledWith("main");
		expect(addToast).toHaveBeenCalledWith("MAIN: reloading…", "info");

		setMainReloadKey.mockClear();
		addToast.mockClear();
		handlers.reload_all(viewer, new KeyboardEvent("keydown"), {
			hasSub: true,
			focusedPane: "main",
			showHelp: false,
			subViewerRef,
		});
		expect(setMainReloadKey).toHaveBeenCalledWith(expect.any(Function));
		expect(subViewerRef.current?.rerender).toHaveBeenCalled();
		expect(addToast).toHaveBeenCalledWith("MAIN: reload (re-render SUB)", "info");
	});

	it("handles help and quit actions", () => {
		const viewer = createViewer();
		const setShowHelp = vi.fn();
		const addToast = vi.fn();
		const handlers = createActionHandlers({
			setFocusedPane: vi.fn(),
			setMainReloadKey: vi.fn(),
			setShowHelp,
			swapPanes: vi.fn(),
			addToast,
		});

		handlers.toggle_help(viewer, new KeyboardEvent("keydown"), {
			hasSub: false,
			focusedPane: "main",
			showHelp: false,
			subViewerRef: { current: null },
		});
		expect(setShowHelp).toHaveBeenCalledWith(expect.any(Function));

		setShowHelp.mockClear();
		handlers.quit(viewer, new KeyboardEvent("keydown"), {
			hasSub: false,
			focusedPane: "main",
			showHelp: true,
			subViewerRef: { current: null },
		});
		expect(setShowHelp).toHaveBeenCalledWith(false);

		setShowHelp.mockClear();
		handlers.quit(viewer, new KeyboardEvent("keydown"), {
			hasSub: false,
			focusedPane: "main",
			showHelp: false,
			subViewerRef: { current: null },
		});
		expect(addToast).toHaveBeenCalledWith("Close the tab to quit", "info");
	});

	it("handles tab switching vs fast pan", () => {
		const viewer = createViewer();
		const onTabSwitch = vi.fn();
		const handlers = createActionHandlers({
			setFocusedPane: vi.fn(),
			setMainReloadKey: vi.fn(),
			setShowHelp: vi.fn(),
			swapPanes: vi.fn(),
			addToast: vi.fn(),
			onTabSwitch,
		});

		handlers.prev_tab(viewer, new KeyboardEvent("keydown"), {
			hasSub: true,
			focusedPane: "sub",
			showHelp: false,
			subViewerRef: { current: null },
		});
		expect(onTabSwitch).toHaveBeenCalledWith("prev");

		onTabSwitch.mockClear();
		handlers.next_tab(viewer, new KeyboardEvent("keydown"), {
			hasSub: false,
			focusedPane: "main",
			showHelp: false,
			subViewerRef: { current: null },
		});
		expect(viewer.scrollHorizontal).toHaveBeenCalledWith(SCROLL_STEP_HORIZONTAL * 5);
	});
});

describe("handleHelpOverlayNavigation", () => {
	it("scrolls help content for navigation actions", () => {
		const helpContent = document.createElement("div") as HTMLElement & {
			scrollBy: (options: ScrollToOptions) => void;
			scrollTo: (options: ScrollToOptions) => void;
		};
		helpContent.scrollBy = vi.fn();
		helpContent.scrollTo = vi.fn();
		Object.defineProperty(helpContent, "clientHeight", { value: 200 });
		Object.defineProperty(helpContent, "scrollHeight", { value: 800 });

		expect(handleHelpOverlayNavigation("scroll_down", helpContent)).toBe(true);
		expect(helpContent.scrollBy).toHaveBeenCalledWith({
			top: HELP_SCROLL_LINE,
			behavior: "smooth",
		});

		helpContent.scrollBy = vi.fn();
		expect(handleHelpOverlayNavigation("half_page_down", helpContent)).toBe(true);
		const pageAmount = 200 * HELP_SCROLL_PAGE_FACTOR;
		expect(helpContent.scrollBy).toHaveBeenCalledWith({ top: pageAmount, behavior: "smooth" });

		expect(handleHelpOverlayNavigation("jump_top", helpContent)).toBe(true);
		expect(helpContent.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });

		expect(handleHelpOverlayNavigation("jump_bottom", helpContent)).toBe(true);
		expect(helpContent.scrollTo).toHaveBeenCalledWith({ top: 800, behavior: "smooth" });

		expect(handleHelpOverlayNavigation("toggle_help", helpContent)).toBe(false);
	});
});
