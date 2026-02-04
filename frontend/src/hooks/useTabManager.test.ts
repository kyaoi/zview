import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTabManager } from "./useTabManager";
import type { SubTab, ToastType } from "../lib/types";

describe("useTabManager", () => {
	const mockSetSubTabs = vi.fn();
	const mockSetActiveSubId = vi.fn();
	const mockSetFocusedPane = vi.fn();
	const mockAddToast = vi.fn();
	const mockSubViewerRef = { current: null };

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
});
