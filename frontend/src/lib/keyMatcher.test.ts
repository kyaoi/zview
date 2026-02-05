import { describe, expect, it } from "vitest";
import { matchesAnyKey } from "./keyMatcher";

const createEvent = (init: KeyboardEventInit & { key: string }) =>
	new KeyboardEvent("keydown", init);

describe("matchesAnyKey", () => {
	it("matches single character keys", () => {
		const event = createEvent({ key: "j", code: "KeyJ" });
		expect(matchesAnyKey(event, ["j"])).toBe(true);
		expect(matchesAnyKey(event, ["k"])).toBe(false);
	});

	it("matches special keys in <...> form", () => {
		const spaceEvent = createEvent({ key: " ", code: "Space" });
		const tabEvent = createEvent({ key: "Tab", code: "Tab" });
		expect(matchesAnyKey(spaceEvent, ["<Space>"])).toBe(true);
		expect(matchesAnyKey(tabEvent, ["<Tab>"])).toBe(true);
	});

	it("matches modifier combinations", () => {
		const event = createEvent({ key: "j", code: "KeyJ", ctrlKey: true, metaKey: true });
		expect(matchesAnyKey(event, ["<C-M-j>"])).toBe(true);
		expect(matchesAnyKey(event, ["<C-j>"])).toBe(false);
	});

	it("matches special key with modifiers", () => {
		const event = createEvent({ key: "Enter", code: "Enter", ctrlKey: true });
		expect(matchesAnyKey(event, ["<C-Enter>"])).toBe(true);
	});

	it("matches uppercase keys with shift", () => {
		const event = createEvent({ key: "G", code: "KeyG", shiftKey: true });
		expect(matchesAnyKey(event, ["G"])).toBe(true);
	});

	it("does not match single-character bindings with extra modifiers", () => {
		const event = createEvent({
			key: "G",
			code: "KeyG",
			shiftKey: true,
			ctrlKey: true,
		});
		expect(matchesAnyKey(event, ["G"])).toBe(false);
	});

	it("requires explicit shift for special keys when specified", () => {
		const shiftedTab = createEvent({ key: "Tab", code: "Tab", shiftKey: true });
		expect(matchesAnyKey(shiftedTab, ["<S-Tab>"])).toBe(true);
		expect(matchesAnyKey(shiftedTab, ["<Tab>"])).toBe(false);
	});
});
