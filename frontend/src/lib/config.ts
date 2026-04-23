import { getKeyActionDef } from "./keyActions";

// Get keybinding for an action (returns array of keys)
// Handles both string and array config values
export const getKeyBinding = (actionId: string): string[] => {
	const def = getKeyActionDef(actionId);
	const defaultKeys = def?.defaultKeys ?? [];

	if (typeof window === "undefined" || !window.ZVIEW_CONFIG?.keys) {
		return defaultKeys;
	}

	const userConfig = window.ZVIEW_CONFIG.keys[actionId];
	if (userConfig === undefined) {
		return defaultKeys;
	}

	// Normalize: string -> array
	if (typeof userConfig === "string") {
		return [userConfig];
	}
	if (Array.isArray(userConfig)) {
		return userConfig as string[];
	}

	return defaultKeys;
};

export const getBlockedKeys = (): string[] => {
	if (typeof window === "undefined" || !window.ZVIEW_CONFIG?.blocked_keys) {
		return [];
	}
	// Normalize to array just in case
	const blocked = window.ZVIEW_CONFIG.blocked_keys;
	if (Array.isArray(blocked)) return blocked;
	if (typeof blocked === "string") return [blocked];
	return [];
};

export const getDisableBrowserShortcuts = (): boolean => {
	return window.ZVIEW_CONFIG?.disable_browser_shortcuts ?? false;
};

export const getTextSelect = (): boolean => {
	if (typeof window === "undefined") return true;
	return window.ZVIEW_CONFIG?.text_select ?? true;
};

// Format keys for display (e.g., ["j", "ArrowDown"] -> "`j` / `ArrowDown`")
export const formatKeysForDisplay = (keys: string[]): string => {
	return keys.map((k) => `\`${k}\``).join(" / ");
};

export const getConfig = () => {
	const defaults = {
		watch: true,
		zoom_step: 1.2,
		dpr_cap: 2.0,
		scroll_step_vertical: 64.0,
		scroll_step_horizontal: 64.0,
		page_scroll_ratio: 0.5,
		text_select: true,
	};
	if (typeof window !== "undefined" && window.ZVIEW_CONFIG) {
		return { ...defaults, ...window.ZVIEW_CONFIG };
	}
	return defaults;
};

/**
 * Checks if a key string represents a sequence (space-separated).
 * e.g., "g t" -> true, "j" -> false
 * Note: <Space> should NOT be treated as a separator.
 * We use regex to split by spaces ONLY if they are not inside <...>.
 */
export const isKeySequence = (key: string): boolean => {
	// A simple check is usually enough, but strictly we should check
	// if there is a space that is NOT inside <...>.
	// For simplicity, we can reuse parseKeySequence results.
	const parts = parseKeySequence(key);
	return parts.length > 1;
};

/**
 * Parses a key string into a sequence of keys.
 * Handles <Space> correctly by using regex.
 * e.g., "g t" -> ["g", "t"]
 * e.g., "<Space> j" -> ["<Space>", "j"]
 */
export const parseKeySequence = (key: string): string[] => {
	// Split by space, but respect <...> blocks.
	// Regex explanation:
	// \s+ : match one or more spaces...
	// (?![^<]*>) : ...that are NOT followed by a closing > without an opening < before it.
	// Actually simple space splitting is dangerous if we have "<Space>".
	// Better approach: Match strictly tokens.

	const tokens: string[] = [];
	// This regex matches either <...> or non-whitespace characters
	const regex = /<[^>]+>|\S+/g;
	let match: RegExpExecArray | null;

	// biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
	while ((match = regex.exec(key)) !== null) {
		tokens.push(match[0]);
	}
	return tokens;
};

/**
 * Validates key configurations for conflicts.
 * returns a list of KeyConflict objects for UI handling.
 */
export interface KeyConflict {
	key: string;
	boundActionId: string;
	conflictingSequenceActionId: string;
	message: string;
}

export const validateKeyConflicts = (): KeyConflict[] => {
	if (typeof window === "undefined" || !window.ZVIEW_CONFIG?.keys) {
		return [];
	}

	const conflicts: KeyConflict[] = [];
	const singleKeys = new Map<string, string>(); // key -> actionId
	const sequences = new Map<string, string>(); // firstKey -> actionId (of the sequence)

	// First pass: Collect all bindings
	for (const [actionId, configValue] of Object.entries(window.ZVIEW_CONFIG.keys)) {
		const keys = Array.isArray(configValue) ? configValue : [configValue];
		for (const key of keys as string[]) {
			if (isKeySequence(key)) {
				const [first] = parseKeySequence(key);
				if (first) {
					sequences.set(first, actionId);
				}
			} else {
				singleKeys.set(key, actionId);
			}
		}
	}

	// Second pass: Check for prefix conflicts
	for (const [singleKey, singleAction] of singleKeys.entries()) {
		if (sequences.has(singleKey)) {
			const seqAction = sequences.get(singleKey) ?? "";
			conflicts.push({
				key: singleKey,
				boundActionId: singleAction,
				conflictingSequenceActionId: seqAction,
				message: `Conflict: '${singleKey}' (${singleAction}) vs Start of '${seqAction}'`,
			});
		}
	}

	return conflicts;
};
