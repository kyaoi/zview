import { describe, it, expect } from "vitest";
import { keyActionDefs } from "./keyActions";
import { matchesAnyKey } from "./keyMatcher";
import { isKeySequence, parseKeySequence } from "./config";

const createEventForBinding = (binding: string): KeyboardEvent => {
	if (binding.startsWith("<") && binding.endsWith(">")) {
		const content = binding.slice(1, -1);
		const key = content === "Space" ? " " : content;
		const code = content === "Space" ? "Space" : content;
		return new KeyboardEvent("keydown", { key, code });
	}

	const isUpper =
		binding.length === 1 && binding.toUpperCase() === binding && binding.toLowerCase() !== binding;
	return new KeyboardEvent("keydown", {
		key: binding,
		code: binding.length === 1 ? `Key${binding.toUpperCase()}` : undefined,
		shiftKey: isUpper,
	});
};

describe("default keybindings", () => {
	for (const action of keyActionDefs) {
		it(`has matchable defaults for ${action.id}`, () => {
			for (const binding of action.defaultKeys) {
				if (isKeySequence(binding)) {
					const parts = parseKeySequence(binding);
					expect(parts.length).toBeGreaterThan(1);
					const first = parts[0];
					const event = createEventForBinding(first);
					expect(matchesAnyKey(event, [first])).toBe(true);
					continue;
				}

				const event = createEventForBinding(binding);
				expect(matchesAnyKey(event, [binding])).toBe(true);
			}
		});
	}
});
