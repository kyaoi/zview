import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useBootstrap } from "./useBootstrap";

describe("useBootstrap", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.fetch = vi.fn();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("loads bootstrap data successfully", async () => {
		const addToast = vi.fn();
		const data = {
			focus: "sub",
			hasMain: true,
			hasSub: true,
			watch: false,
			subTabs: [{ id: "sub-1", name: "sub.pdf", path: "/tmp/sub.pdf" }],
			activeSubId: "sub-1",
		};
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: true,
			json: async () => data,
		} as Response);

		const { result } = renderHook(() => useBootstrap(addToast));

		await waitFor(() => expect(result.current.isLoaded).toBe(true));
		expect(result.current.hasMain).toBe(true);
		expect(result.current.hasSub).toBe(true);
		expect(result.current.watchEnabled).toBe(false);
		expect(result.current.initialFocus).toBe("sub");
		expect(result.current.subTabs).toHaveLength(1);
		expect(result.current.activeSubId).toBe("sub-1");
		expect(addToast).not.toHaveBeenCalled();
	});

	it("falls back to defaults on failure", async () => {
		const addToast = vi.fn();
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: false,
			status: 500,
		} as Response);

		const { result } = renderHook(() => useBootstrap(addToast));

		await waitFor(() => expect(result.current.isLoaded).toBe(true));
		expect(result.current.hasMain).toBe(false);
		expect(result.current.hasSub).toBe(false);
		expect(result.current.watchEnabled).toBe(true);
		expect(result.current.initialFocus).toBe("main");
		expect(addToast).toHaveBeenCalledWith("Failed to fetch bootstrap info", "error");
	});

	it("forces initial focus to main when sub is missing", async () => {
		const addToast = vi.fn();
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: true,
			json: async () => ({
				focus: "sub",
				hasMain: true,
				hasSub: false,
				watch: true,
			}),
		} as Response);

		const { result } = renderHook(() => useBootstrap(addToast));
		await waitFor(() => expect(result.current.isLoaded).toBe(true));
		expect(result.current.initialFocus).toBe("main");
	});
});
