import { describe, it, expect } from "vitest";
import { keyActionDefs, getKeyActionDef, getActionsByCategory } from "./keyActions";

const unique = <T>(items: T[]) => new Set(items).size === items.length;

describe("keyActions", () => {
	it("defines unique action IDs with defaults", () => {
		const ids = keyActionDefs.map((d) => d.id);
		expect(unique(ids)).toBe(true);
		for (const def of keyActionDefs) {
			expect(def.defaultKeys.length).toBeGreaterThan(0);
			expect(def.description.length).toBeGreaterThan(0);
		}
	});

	it("gets action definitions by ID", () => {
		const def = getKeyActionDef("scroll_down");
		expect(def?.id).toBe("scroll_down");
		expect(getKeyActionDef("missing")).toBeUndefined();
	});

	it("groups actions by category", () => {
		const grouped = getActionsByCategory();
		const seen = new Set<string>();
		for (const defs of Object.values(grouped)) {
			for (const def of defs) {
				seen.add(def.id);
			}
		}
		expect(seen.size).toBe(keyActionDefs.length);
		for (const def of keyActionDefs) {
			expect(seen.has(def.id)).toBe(true);
		}
	});
});
