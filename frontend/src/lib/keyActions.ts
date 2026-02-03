// Key action definitions - single source of truth for keybindings
export type KeyCategory = "navigation" | "zoom" | "panes" | "misc";

export interface KeyActionDef {
	id: string; // Config key name (e.g., "scroll_down")
	defaultKeys: string[]; // Default keybindings
	description: string; // Help text
	category: KeyCategory;
}

// All key action definitions with their defaults and descriptions
export const keyActionDefs: KeyActionDef[] = [
	// Navigation
	{ id: "scroll_down", defaultKeys: ["j"], description: "scroll down", category: "navigation" },
	{ id: "scroll_up", defaultKeys: ["k"], description: "scroll up", category: "navigation" },
	{ id: "scroll_left", defaultKeys: ["h"], description: "scroll left", category: "navigation" },
	{ id: "scroll_right", defaultKeys: ["l"], description: "scroll right", category: "navigation" },
	{
		id: "half_page_down",
		defaultKeys: ["d"],
		description: "half-page down",
		category: "navigation",
	},
	{ id: "half_page_up", defaultKeys: ["u"], description: "half-page up", category: "navigation" },
	{ id: "jump_top", defaultKeys: ["g g"], description: "jump to top", category: "navigation" },
	{ id: "jump_bottom", defaultKeys: ["G"], description: "jump to bottom", category: "navigation" },
	{ id: "next_page", defaultKeys: ["n"], description: "next page", category: "navigation" },
	{ id: "prev_page", defaultKeys: ["p"], description: "previous page", category: "navigation" },

	// Zoom
	{ id: "zoom_in", defaultKeys: ["+"], description: "zoom in", category: "zoom" },
	{ id: "zoom_out", defaultKeys: ["-"], description: "zoom out", category: "zoom" },
	{ id: "fit_width", defaultKeys: ["="], description: "fit to width", category: "zoom" },

	// Panes
	{
		id: "toggle_focus",
		defaultKeys: ["<Tab>"],
		description: "toggle focus (MAIN ↔ SUB)",
		category: "panes",
	},
	{ id: "swap_panes", defaultKeys: ["s"], description: "swap pane positions", category: "panes" },
	{
		id: "prev_tab",
		defaultKeys: ["H"],
		description: "previous tab (SUB) / fast left",
		category: "panes",
	},
	{
		id: "next_tab",
		defaultKeys: ["L"],
		description: "next tab (SUB) / fast right",
		category: "panes",
	},

	// Misc
	{ id: "reload_main", defaultKeys: ["r"], description: "reload MAIN", category: "misc" },
	{
		id: "reload_all",
		defaultKeys: ["R"],
		description: "reload MAIN (re-render SUB)",
		category: "misc",
	},
	{ id: "toggle_help", defaultKeys: ["?"], description: "toggle help overlay", category: "misc" },
	{ id: "quit", defaultKeys: ["q", "<Escape>"], description: "quit (close tab)", category: "misc" },
];

// Category display names
export const categoryLabels: Record<KeyCategory, string> = {
	navigation: "Navigation",
	zoom: "Zoom",
	panes: "Panes",
	misc: "Misc",
};

// Get key action definition by id
export const getKeyActionDef = (id: string): KeyActionDef | undefined => {
	return keyActionDefs.find((a) => a.id === id);
};

// Group actions by category
export const getActionsByCategory = (): Record<KeyCategory, KeyActionDef[]> => {
	return keyActionDefs.reduce(
		(acc, action) => {
			if (!acc[action.category]) {
				acc[action.category] = [];
			}
			acc[action.category].push(action);
			return acc;
		},
		{} as Record<KeyCategory, KeyActionDef[]>,
	);
};
