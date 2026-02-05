import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTabManager } from "./useTabManager";
import type { SubTab } from "../lib/types";
import type { ViewerHandle } from "../lib/types";

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
	getSnapshot: vi.fn().mockReturnValue({ x: 1, y: 2, zoom: 1 }),
	restoreSnapshot: vi.fn(),
});

describe("useTabManager", () => {
	const mockSetSubTabs = vi.fn();
	const mockSetActiveSubId = vi.fn();
	const mockSetFocusedPane = vi.fn();
	const mockAddToast = vi.fn();
	const mockSubViewerRef = { current: null as ViewerHandle | null };

	const defaultProps = {
		subTabs: [] as SubTab[],
		setSubTabs: mockSetSubTabs,
		activeSubId: null,
		setActiveSubId: mockSetActiveSubId,
		subViewerRef: mockSubViewerRef,
		setFocusedPane: mockSetFocusedPane,
		addToast: mockAddToast,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		globalThis.fetch = vi.fn(); // Mock fetch
	});

	it("should initialize with empty state", () => {
		const { result } = renderHook(() => useTabManager(defaultProps));
		expect(result.current.tabSnapshotsRef.current.size).toBe(0);
		expect(result.current.subViewerRefs.current.size).toBe(0);
	});

	it("should handle tab selection", () => {
		const { result } = renderHook(() => useTabManager(defaultProps));

		act(() => {
			result.current.handleTabSelect("tab-1");
		});

		// Should call setActiveSubId
		expect(mockSetActiveSubId).toHaveBeenCalledWith("tab-1");
	});

	it("should not re-select active tab", () => {
		const props = { ...defaultProps, activeSubId: "tab-1" };
		const { result } = renderHook(() => useTabManager(props));

		act(() => {
			result.current.handleTabSelect("tab-1");
		});

		expect(mockSetActiveSubId).not.toHaveBeenCalled();
	});

	it("should handle next/prev tab switch", () => {
		const tabs = [
			{ id: "tab-1", file: "a.pdf", name: "A" },
			{ id: "tab-2", file: "b.pdf", name: "B" },
			{ id: "tab-3", file: "c.pdf", name: "C" },
		];
		const props = { ...defaultProps, subTabs: tabs, activeSubId: "tab-1" };
		const { result } = renderHook(() => useTabManager(props));

		// Next
		act(() => {
			result.current.handleTabSwitch("next");
		});
		// Should select tab-2 (id) based on implementation logic which calls handleTabSelect
		// identifying the next index
		expect(mockSetActiveSubId).toHaveBeenCalledWith("tab-2");

		// Prev (from tab-1 should go to tab-3)
		act(() => {
			result.current.handleTabSwitch("prev");
		});
		expect(mockSetActiveSubId).toHaveBeenCalledWith("tab-3");
	});

	it("should handle sub close", async () => {
		// Mock successful DELETE
		globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

		const tabs = [{ id: "tab-1", file: "a.pdf", name: "A" }];
		const props = { ...defaultProps, subTabs: tabs, activeSubId: "tab-1" };
		const { result } = renderHook(() => useTabManager(props));

		await act(async () => {
			await result.current.handleSubClose("tab-1");
		});

		expect(globalThis.fetch).toHaveBeenCalledWith("/api/sub?id=tab-1", { method: "DELETE" });
		// Should call setSubTabs to remove it
		expect(mockSetSubTabs).toHaveBeenCalled();
	});

	it("should store snapshots and retrieve them", () => {
		const viewer = createViewerHandle();
		const props = { ...defaultProps, activeSubId: "tab-1", subViewerRef: { current: viewer } };
		const { result } = renderHook(() => useTabManager(props));

		act(() => {
			result.current.saveCurrentSnapshot();
		});

		expect(result.current.getTabSnapshot("tab-1")).toEqual({ x: 1, y: 2, zoom: 1 });
	});

	it("registers and unregisters sub viewers", () => {
		const viewer = createViewerHandle();
		const { result } = renderHook(() => useTabManager(defaultProps));

		act(() => {
			result.current.registerSubViewer("tab-1", viewer);
		});
		expect(result.current.subViewerRefs.current.get("tab-1")).toBe(viewer);

		act(() => {
			result.current.registerSubViewer("tab-1", null);
		});
		expect(result.current.subViewerRefs.current.has("tab-1")).toBe(false);
	});

	it("shows error toast when closing tab fails", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
		const tabs = [{ id: "tab-1", file: "a.pdf", name: "A" }];
		const props = { ...defaultProps, subTabs: tabs, activeSubId: "tab-1" };
		const { result } = renderHook(() => useTabManager(props));

		await act(async () => {
			await result.current.handleSubClose("tab-1");
		});

		expect(mockAddToast).toHaveBeenCalledWith("Failed to close tab", "error");
	});

	it("selects next tab when closing active tab with remaining tabs", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
		const tabs = [
			{ id: "tab-1", file: "a.pdf", name: "A" },
			{ id: "tab-2", file: "b.pdf", name: "B" },
		];
		const setSubTabs = vi.fn((updater: (prev: SubTab[]) => SubTab[]) => updater(tabs));
		const props = {
			...defaultProps,
			subTabs: tabs,
			activeSubId: "tab-1",
			setSubTabs,
		};
		const { result } = renderHook(() => useTabManager(props));

		await act(async () => {
			await result.current.handleSubClose("tab-1");
		});

		expect(mockSetActiveSubId).toHaveBeenCalledWith("tab-2");
	});

	it("clears focus when closing last active tab", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
		const tabs = [{ id: "tab-1", file: "a.pdf", name: "A" }];
		const setSubTabs = vi.fn((updater: (prev: SubTab[]) => SubTab[]) => updater(tabs));
		const props = {
			...defaultProps,
			subTabs: tabs,
			activeSubId: "tab-1",
			setSubTabs,
		};
		const { result } = renderHook(() => useTabManager(props));

		await act(async () => {
			await result.current.handleSubClose("tab-1");
		});

		expect(mockSetActiveSubId).toHaveBeenCalledWith(null);
		expect(mockSetFocusedPane).toHaveBeenCalledWith("main");
	});

	it("ignores tab switch when only one tab or active tab missing", () => {
		const singleTabProps = {
			...defaultProps,
			subTabs: [{ id: "tab-1", file: "a.pdf", name: "A" }],
			activeSubId: "tab-1",
		};
		const { result: single } = renderHook(() => useTabManager(singleTabProps));
		act(() => {
			single.current.handleTabSwitch("next");
		});
		expect(mockSetActiveSubId).not.toHaveBeenCalled();

		const missingProps = {
			...defaultProps,
			subTabs: [
				{ id: "tab-1", file: "a.pdf", name: "A" },
				{ id: "tab-2", file: "b.pdf", name: "B" },
			],
			activeSubId: "missing",
		};
		const { result: missing } = renderHook(() => useTabManager(missingProps));
		act(() => {
			missing.current.handleTabSwitch("next");
		});
		expect(mockSetActiveSubId).not.toHaveBeenCalled();
	});
});
