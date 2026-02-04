import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useKeyboardNavigation } from "./useKeyboardNavigation";
import * as config from "../lib/config";

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
import { createActionHandlers } from "../lib/actionHandlers";

describe("useKeyboardNavigation", () => {
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
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(createActionHandlers).mockReturnValue(mockActionHandlers);
		vi.mocked(config.getKeyBinding).mockImplementation((id: string) => {
			if (id === "scroll_down") return ["j"];
			if (id === "focus_next") return ["Tab"];
			if (id === "reload_main") return ["r"];
			if (id === "next_page") return ["n"];
			if (id === "prev_page") return ["p"];
			if (id === "prev_tab") return ["H"];
			if (id === "next_tab") return ["L"];
			return [];
		});
		vi.mocked(config.isKeySequence).mockReturnValue(false);
	});

	const defaultProps = {
		keysEnabled: true,
		focusedPane: "main" as const,
		hasSub: false,
		showHelp: false,
		mainViewerRef: { current: null },
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
});
