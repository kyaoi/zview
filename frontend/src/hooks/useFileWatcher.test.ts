import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useFileWatcher } from "./useFileWatcher";

class MockEventSource {
	static instances: MockEventSource[] = [];
	url: string;
	listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
	onerror: ((this: EventSource, ev: Event) => void) | null = null;
	close = vi.fn();

	constructor(url: string) {
		this.url = url;
		MockEventSource.instances.push(this);
	}

	addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
		if (!this.listeners.has(type)) {
			this.listeners.set(type, new Set());
		}
		this.listeners.get(type)?.add(listener);
	}

	removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
		this.listeners.get(type)?.delete(listener);
	}

	emit(type: string, event: Event) {
		for (const listener of this.listeners.get(type) ?? []) {
			if (typeof listener === "function") {
				listener(event);
			} else {
				listener.handleEvent(event);
			}
		}
	}
}

describe("useFileWatcher", () => {
	const originalEventSource = globalThis.EventSource;

	beforeEach(() => {
		MockEventSource.instances = [];
		globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
	});

	afterEach(() => {
		globalThis.EventSource = originalEventSource;
	});

	it("does not start EventSource when disabled", () => {
		renderHook(() => useFileWatcher(false, true, vi.fn(), vi.fn()));
		expect(MockEventSource.instances).toHaveLength(0);
	});

	it("does not start EventSource when MAIN is missing", () => {
		renderHook(() => useFileWatcher(true, false, vi.fn(), vi.fn()));
		expect(MockEventSource.instances).toHaveLength(0);
	});

	it("subscribes to events and cleans up", () => {
		const onMainChange = vi.fn();
		const addToast = vi.fn();
		const { unmount } = renderHook(() => useFileWatcher(true, true, onMainChange, addToast));

		expect(MockEventSource.instances).toHaveLength(1);
		const instance = MockEventSource.instances[0];
		expect(instance.url).toBe("/events");

		instance.emit("main-change", new Event("main-change"));
		expect(onMainChange).toHaveBeenCalledTimes(1);
		expect(addToast).toHaveBeenCalledWith("MAIN: file changed", "info");

		unmount();
		expect(instance.close).toHaveBeenCalled();
	});
});
