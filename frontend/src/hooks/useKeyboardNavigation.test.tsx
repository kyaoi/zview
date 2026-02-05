import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useKeyboardNavigation } from "./useKeyboardNavigation";
import * as config from "../lib/config";
import type { ViewerHandle } from "../lib/types";

// Mock dependencies
vi.mock("../lib/config", () => ({
	getKeyBinding: vi.fn(),
	isKeySequence: vi.fn(),
	parseKeySequence: vi.fn(),
	validateKeyConflicts: vi.fn().mockReturnValue([]),
	getBlockedKeys: vi.fn().mockReturnValue([]),
	getDisableBrowserShortcuts: vi.fn().mockReturnValue(false),
}));

vi.mock("../lib/keyActions", () => ({
	keyActionDefs: [
		{ id: "scroll_down", label: "Scroll Down", category: "navigation" },
		{ id: "jump_top", label: "Jump Top", category: "navigation" },
		{ id: "toggle_help", label: "Help", category: "misc" },
		{ id: "quit", label: "Quit", category: "misc" },
		{ id: "focus_next", label: "Next Pane", category: "window" },
		{ id: "reload_main", label: "Reload Main", category: "misc" },
		{ id: "next_page", label: "Next Page", category: "navigation" },
		{ id: "prev_page", label: "Prev Page", category: "navigation" },
		{ id: "prev_tab", label: "Prev Tab", category: "panes" },
		{ id: "next_tab", label: "Next Tab", category: "panes" },
	],
}));

vi.mock("../lib/actionHandlers", () => ({
	createActionHandlers: vi.fn().mockReturnValue({
		scroll_down: vi.fn(),
		jump_top: vi.fn(),
		toggle_help: vi.fn(),
		quit: vi.fn(),
		focus_next: vi.fn(),
		reload_main: vi.fn(),
		next_page: vi.fn(),
		prev_page: vi.fn(),
		prev_tab: vi.fn(),
		next_tab: vi.fn(),
	}),
	handleHelpOverlayNavigation: vi.fn(),
	SCROLL_ACTION_IDS: ["scroll_down"],
}));

vi.mock("../lib/keyMatcher", () => ({
	matchesAnyKey: vi.fn((): boolean => false), // Default no match
}));

import { matchesAnyKey } from "../lib/keyMatcher";
import { createActionHandlers, handleHelpOverlayNavigation } from "../lib/actionHandlers";

describe("useKeyboardNavigation", () => {
	const createViewerHandle = (): ViewerHandle => ({
		scrollLine: vi.fn(),
		scrollHalfPage: vi.fn(),
		scrollHorizontal: vi.fn(),
		startContinuousScroll: vi.fn(),
		stopContinuousScroll: vi.fn(),
		jumpToTop: vi.fn(),
		jumpToBottom: vi.fn(),
		jumpByPages: vi.fn(),
		zoomIn: vi.fn(),
		zoomOut: vi.fn(),
		fitToWidth: vi.fn(),
		rerender: vi.fn(),
		getSnapshot: vi.fn().mockReturnValue(null),
		restoreSnapshot: vi.fn(),
	});
	const mockSetFocusedPane = vi.fn();
	const mockSetMainReloadKey = vi.fn();
	const mockSetShowHelp = vi.fn();
	const mockSwapPanes = vi.fn();
	const mockAddToast = vi.fn();
	const mockActionHandlers = {
		scroll_down: vi.fn(),
		focus_next: vi.fn(),
		reload_main: vi.fn(),
		next_page: vi.fn(),
		prev_page: vi.fn(),
		prev_tab: vi.fn(),
		next_tab: vi.fn(),
		jump_top: vi.fn(),
		toggle_help: vi.fn(),
		quit: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(createActionHandlers).mockReturnValue(mockActionHandlers);
		vi.mocked(config.getKeyBinding).mockImplementation((id: string) => {
			if (id === "scroll_down") return ["j"];
			if (id === "jump_top") return ["g g"];
			if (id === "toggle_help") return ["?"];
			if (id === "quit") return ["q"];
			if (id === "focus_next") return ["Tab"];
			if (id === "reload_main") return ["r"];
			if (id === "next_page") return ["n"];
			if (id === "prev_page") return ["p"];
			if (id === "prev_tab") return ["H"];
			if (id === "next_tab") return ["L"];
			return [];
		});
		vi.mocked(config.validateKeyConflicts).mockReturnValue([]);
		vi.mocked(config.isKeySequence).mockReturnValue(false);
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	const defaultProps = {
		keysEnabled: true,
		focusedPane: "main" as const,
		hasSub: false,
		showHelp: false,
		mainViewerRef: { current: createViewerHandle() },
		subViewerRef: { current: null },
		setFocusedPane: mockSetFocusedPane,
		setMainReloadKey: mockSetMainReloadKey,
		setShowHelp: mockSetShowHelp,
		swapPanes: mockSwapPanes,
		addToast: mockAddToast,
	};

	it("should register event listeners", () => {
		const addSpy = vi.spyOn(window, "addEventListener");
		const removeSpy = vi.spyOn(window, "removeEventListener");

		const { unmount } = renderHook(() => useKeyboardNavigation(defaultProps));

		expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function), { capture: true });
		expect(addSpy).toHaveBeenCalledWith("keyup", expect.any(Function));

		unmount();

		expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
		expect(removeSpy).toHaveBeenCalledWith("keyup", expect.any(Function));
	});

	it("should not handle keys when keysEnabled is false", () => {
		renderHook(() => useKeyboardNavigation({ ...defaultProps, keysEnabled: false }));

		// Mock matchesAnyKey to return true so we know logic would proceed if enabled
		vi.mocked(matchesAnyKey).mockReturnValue(true);

		const event = new KeyboardEvent("keydown", { key: "j" });
		window.dispatchEvent(event);

		expect(mockActionHandlers.scroll_down).not.toHaveBeenCalled();
	});

	it("should handle reload_main action (r)", () => {
		vi.mocked(matchesAnyKey).mockImplementation((_e, keys) => keys.includes("r"));

		renderHook(() => useKeyboardNavigation(defaultProps));

		const event = new KeyboardEvent("keydown", { key: "r" });
		window.dispatchEvent(event);

		expect(mockActionHandlers.reload_main).toHaveBeenCalled();
	});

	it("ignores key events from form fields and contentEditable", () => {
		vi.mocked(matchesAnyKey).mockImplementation((_e, keys) => keys.includes("j"));

		renderHook(() => useKeyboardNavigation(defaultProps));

		const elements: HTMLElement[] = [
			document.createElement("input"),
			document.createElement("textarea"),
			document.createElement("select"),
		];
		const editable = document.createElement("div");
		editable.contentEditable = "true";
		elements.push(editable);

		for (const el of elements) {
			document.body.appendChild(el);
			const event = new KeyboardEvent("keydown", { key: "j", bubbles: true, cancelable: true });
			el.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(false);
		}

		expect(mockActionHandlers.scroll_down).not.toHaveBeenCalled();
		for (const el of elements) {
			el.remove();
		}
	});

	it("should handle jump actions (n, p)", () => {
		vi.mocked(config.getKeyBinding).mockImplementation((id: string) => {
			if (id === "next_page") return ["n"];
			if (id === "prev_page") return ["p"];
			return [];
		});
		vi.mocked(matchesAnyKey).mockImplementation((_e, keys) => keys.includes(_e.key));

		renderHook(() => useKeyboardNavigation(defaultProps));

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "n" }));
		expect(mockActionHandlers.next_page).toHaveBeenCalled();

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }));
		expect(mockActionHandlers.prev_page).toHaveBeenCalled();
	});

	it("should handle tab switching / fast pan (H, L)", () => {
		vi.mocked(config.getKeyBinding).mockImplementation((id: string) => {
			if (id === "prev_tab") return ["H"];
			if (id === "next_tab") return ["L"];
			return [];
		});
		vi.mocked(matchesAnyKey).mockImplementation((_e, keys) => keys.includes(_e.key));

		renderHook(() => useKeyboardNavigation(defaultProps));

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "H" }));
		expect(mockActionHandlers.prev_tab).toHaveBeenCalled();

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "L" }));
		expect(mockActionHandlers.next_tab).toHaveBeenCalled();
	});

	it("handles key sequences (g g)", () => {
		vi.mocked(config.getKeyBinding).mockImplementation((id: string) => {
			if (id === "jump_top") return ["g g"];
			return [];
		});
		vi.mocked(config.isKeySequence).mockImplementation((binding: string) => binding.includes(" "));
		vi.mocked(config.parseKeySequence).mockImplementation((binding: string) => binding.split(" "));
		vi.mocked(matchesAnyKey).mockImplementation((event, keys) => keys.includes(event.key));

		renderHook(() => useKeyboardNavigation(defaultProps));

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", cancelable: true }));
		expect(mockActionHandlers.jump_top).not.toHaveBeenCalled();

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", cancelable: true }));
		expect(mockActionHandlers.jump_top).toHaveBeenCalled();
	});

	it("handles sequences with special tokens (<Space> j)", () => {
		vi.mocked(config.getKeyBinding).mockImplementation((id: string) => {
			if (id === "jump_top") return ["<Space> j"];
			return [];
		});
		vi.mocked(config.isKeySequence).mockImplementation((binding: string) => binding.includes(" "));
		vi.mocked(config.parseKeySequence).mockImplementation((binding: string) => binding.split(" "));
		vi.mocked(matchesAnyKey).mockImplementation((event, keys) =>
			keys.some((key) => {
				if (key === "<Space>") return event.key === " ";
				return key === event.key;
			}),
		);

		renderHook(() => useKeyboardNavigation(defaultProps));

		window.dispatchEvent(
			new KeyboardEvent("keydown", { key: " ", code: "Space", cancelable: true }),
		);
		expect(mockActionHandlers.jump_top).not.toHaveBeenCalled();

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "j", cancelable: true }));
		expect(mockActionHandlers.jump_top).toHaveBeenCalled();
	});

	it("clears pending sequences after timeout", () => {
		vi.useFakeTimers();
		vi.mocked(config.getKeyBinding).mockImplementation((id: string) => {
			if (id === "jump_top") return ["g g"];
			return [];
		});
		vi.mocked(config.isKeySequence).mockImplementation((binding: string) => binding.includes(" "));
		vi.mocked(config.parseKeySequence).mockImplementation((binding: string) => binding.split(" "));
		vi.mocked(matchesAnyKey).mockImplementation((event, keys) => keys.includes(event.key));

		renderHook(() => useKeyboardNavigation(defaultProps));

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", cancelable: true }));
		vi.advanceTimersByTime(700);

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", cancelable: true }));
		expect(mockActionHandlers.jump_top).not.toHaveBeenCalled();
	});

	it("blocks configured blocked keys", () => {
		vi.mocked(config.getBlockedKeys).mockReturnValue(["j"]);
		vi.mocked(matchesAnyKey).mockImplementation((event, keys) => keys.includes(event.key));

		renderHook(() => useKeyboardNavigation(defaultProps));

		const event = new KeyboardEvent("keydown", { key: "j", cancelable: true });
		window.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(mockActionHandlers.scroll_down).not.toHaveBeenCalled();
	});

	it("handles help overlay navigation and blocks other actions", () => {
		vi.mocked(config.getKeyBinding).mockImplementation((id: string) => {
			if (id === "scroll_down") return ["j"];
			if (id === "quit") return ["q"];
			return [];
		});
		vi.mocked(matchesAnyKey).mockImplementation((event, keys) => keys.includes(event.key));
		vi.mocked(handleHelpOverlayNavigation).mockReturnValue(true);

		document.body.innerHTML = '<div id="help-overlay-content"></div>';

		renderHook(() =>
			useKeyboardNavigation({
				...defaultProps,
				showHelp: true,
			}),
		);

		const navEvent = new KeyboardEvent("keydown", { key: "j", cancelable: true });
		window.dispatchEvent(navEvent);
		expect(navEvent.defaultPrevented).toBe(true);
		expect(mockActionHandlers.scroll_down).not.toHaveBeenCalled();

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "q", cancelable: true }));
		expect(mockActionHandlers.quit).toHaveBeenCalled();
		document.body.innerHTML = "";
	});

	it("warns and toasts on key conflicts", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.mocked(config.validateKeyConflicts).mockReturnValue([
			{
				key: "j",
				boundActionId: "scroll_down",
				conflictingSequenceActionId: "jump_top",
				message: "Conflict: 'j' (scroll_down) vs Start of 'jump_top'",
			},
		]);

		renderHook(() => useKeyboardNavigation(defaultProps));

		expect(warnSpy).toHaveBeenCalledWith({
			key: "j",
			boundActionId: "scroll_down",
			conflictingSequenceActionId: "jump_top",
			message: "Conflict: 'j' (scroll_down) vs Start of 'jump_top'",
		});
		expect(mockAddToast).toHaveBeenCalledWith(
			"Conflict: 'j' (scroll_down) vs Start of 'jump_top'",
			"warning",
		);

		warnSpy.mockRestore();
	});

	it("stops continuous scroll on keyup for scroll actions", () => {
		vi.mocked(config.getKeyBinding).mockImplementation((id: string) => {
			if (id === "scroll_down") return ["j"];
			return [];
		});
		vi.mocked(matchesAnyKey).mockImplementation((event, keys) => keys.includes(event.key));

		renderHook(() => useKeyboardNavigation(defaultProps));

		window.dispatchEvent(new KeyboardEvent("keyup", { key: "j" }));
		expect(defaultProps.mainViewerRef.current?.stopContinuousScroll).toHaveBeenCalled();
	});

	it("blocks browser shortcuts when configured", () => {
		vi.mocked(config.getDisableBrowserShortcuts).mockReturnValue(true);
		vi.mocked(matchesAnyKey).mockReturnValue(false);

		renderHook(() => useKeyboardNavigation(defaultProps));

		const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, cancelable: true });
		window.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
	});
});
