/**
 * Key matching utilities for keyboard navigation.
 */

/**
 * Check if a key event matches any of the bound keys.
 * Supports <Key>, <M-key> notation for modifier keys.
 *
 * @param event - The keyboard event to check
 * @param keys - Array of key binding strings (e.g., ["j", "<M-j>", "<Space>"])
 * @returns true if the event matches any of the keys
 */
export function matchesAnyKey(event: KeyboardEvent, keys: string[]): boolean {
	const eventKey = event.key;
	const eventCode = event.code; // e.g., "KeyJ", "Space", "Enter"

	// Normalize modifiers from event
	const modifiers: string[] = [];
	if (event.ctrlKey) modifiers.push("C");
	if (event.metaKey) modifiers.push("M");
	if (event.altKey) modifiers.push("A");
	if (event.shiftKey) modifiers.push("S");
	// Sort modifiers to ensure consistent order
	modifiers.sort();

	for (const binding of keys) {
		// Parse binding: <M-j> -> modifiers=["M"], key="j"
		let bindingKey = binding;
		let bindingModifiers: string[] = [];

		// Check for <...> notation
		if (binding.startsWith("<") && binding.endsWith(">")) {
			// e.g. <C-M-j> or <Space>
			const content = binding.slice(1, -1);
			const parts = content.split("-");
			if (parts.length > 1) {
				// Has modifiers: <Mod-Key>
				// Last part is the key, previous are modifiers
				bindingKey = parts.pop() || "";
				// Normalized modifiers
				bindingModifiers = parts.map((m) => normalizeModifier(m));
			} else {
				// Just special key: <Space>, <Tab>
				bindingKey = content;
			}
		}

		// Check modifiers match strictly
		const modifiersMismatch = checkModifiersMismatch(modifiers, bindingModifiers, bindingKey);

		// Key Matching Logic
		let keyMatches = false;

		// Case 1: Special name match (Space, Tab, Escape, etc.)
		if (bindingKey.length > 1) {
			if (eventCode.toLowerCase() === bindingKey.toLowerCase()) keyMatches = true;
			else if (eventCode.toLowerCase() === `key${bindingKey.toLowerCase()}`) keyMatches = true;
			else if (eventKey.toLowerCase() === bindingKey.toLowerCase()) keyMatches = true;
			else if (bindingKey.toLowerCase() === "space" && eventKey === " ") keyMatches = true;
		} else {
			// Single char (e.g. "j", "G", "?")
			// Exact match on key
			if (bindingKey === eventKey) keyMatches = true;
		}

		if (keyMatches && !modifiersMismatch) {
			return true;
		}
	}
	return false;
}

/**
 * Normalize a modifier string to single-letter form.
 */
function normalizeModifier(m: string): string {
	switch (m.toUpperCase()) {
		case "C":
		case "CTRL":
			return "C";
		case "M":
		case "META":
		case "CMD":
		case "WIN":
		case "SUPER":
			return "M";
		case "A":
		case "ALT":
			return "A";
		case "S":
		case "SHIFT":
			return "S";
		default:
			return m;
	}
}

/**
 * Check if modifiers from event and binding mismatch.
 */
function checkModifiersMismatch(
	eventModifiers: string[],
	bindingModifiers: string[],
	bindingKey: string,
): boolean {
	const eventMods = new Set(eventModifiers);
	const bindMods = new Set(bindingModifiers);

	// For single character keys (e.g. "G", "j", "+"), the key value itself
	// encapsulates the Shift state (case-sensitive).
	// So we ignore the "S" modifier in the set comparison for these cases.
	// This allows binding="G" to match Shift+g (event.key="G", mods=["S"])
	// without requiring the binding to explicitly be "<S-g>".
	if (bindingKey.length === 1) {
		eventMods.delete("S");
		bindMods.delete("S");
	}

	if (eventMods.size !== bindMods.size) return true;
	for (const m of eventMods) {
		if (!bindMods.has(m)) return true;
	}
	return false;
}
