import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	getKeyBinding,
	getBlockedKeys,
	getDisableBrowserShortcuts,
	formatKeysForDisplay,
	parseKeySequence,
	isKeySequence,
	validateKeyConflicts,
} from "./config";
import { getKeyActionDef } from "./keyActions";

describe("config", () => {
	const originalConfig = window.ZVIEW_CONFIG;
	const baseConfig: ZviewConfig = {
		watch: true,
		zoom_step: 1.2,
		dpr_cap: 2.0,
		scroll_step_vertical: 64.0,
		scroll_step_horizontal: 64.0,
		page_scroll_ratio: 0.5,
	};

	beforeEach(() => {
		window.ZVIEW_CONFIG = undefined;
	});

	afterEach(() => {
		window.ZVIEW_CONFIG = originalConfig;
	});

	it("returns default keys when no config", () => {
		const def = getKeyActionDef("scroll_down");
		expect(getKeyBinding("scroll_down")).toEqual(def?.defaultKeys ?? []);
	});

	it("normalizes string keybindings to arrays", () => {
		window.ZVIEW_CONFIG = { ...baseConfig, keys: { scroll_down: "x" } };
		expect(getKeyBinding("scroll_down")).toEqual(["x"]);
	});

	it("returns array keybindings as-is", () => {
		window.ZVIEW_CONFIG = { ...baseConfig, keys: { scroll_down: ["x", "y"] } };
		expect(getKeyBinding("scroll_down")).toEqual(["x", "y"]);
	});

	it("falls back to defaults for invalid keybinding types", () => {
		window.ZVIEW_CONFIG = { ...baseConfig, keys: { scroll_down: 123 as unknown as string } };
		const def = getKeyActionDef("scroll_down");
		expect(getKeyBinding("scroll_down")).toEqual(def?.defaultKeys ?? []);
	});

	it("normalizes blocked keys", () => {
		window.ZVIEW_CONFIG = { ...baseConfig, blocked_keys: "<Tab>" };
		expect(getBlockedKeys()).toEqual(["<Tab>"]);
		window.ZVIEW_CONFIG = { ...baseConfig, blocked_keys: ["<Tab>", "j"] };
		expect(getBlockedKeys()).toEqual(["<Tab>", "j"]);
	});

	it("returns disable_browser_shortcuts flag", () => {
		window.ZVIEW_CONFIG = { ...baseConfig, disable_browser_shortcuts: true };
		expect(getDisableBrowserShortcuts()).toBe(true);
		window.ZVIEW_CONFIG = { ...baseConfig };
		expect(getDisableBrowserShortcuts()).toBe(false);
	});

	it("formats keys for display", () => {
		expect(formatKeysForDisplay(["j", "<Tab>"])).toBe("`j` / `<Tab>`");
	});

	it("parses key sequences and detects sequences", () => {
		expect(parseKeySequence("g g")).toEqual(["g", "g"]);
		expect(parseKeySequence("<Space> j")).toEqual(["<Space>", "j"]);
		expect(isKeySequence("g g")).toBe(true);
		expect(isKeySequence("<Space>")).toBe(false);
	});

	it("detects conflicts between single keys and sequences", () => {
		window.ZVIEW_CONFIG = {
			...baseConfig,
			keys: {
				scroll_down: "j",
				jump_top: "j k",
			},
		};
		const conflicts = validateKeyConflicts();
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]?.key).toBe("j");
		window.ZVIEW_CONFIG = undefined;
		expect(validateKeyConflicts()).toEqual([]);
	});
});
