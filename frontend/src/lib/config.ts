// Keybinding configuration
export interface KeysConfig {
	scroll_down: string;
	scroll_up: string;
	scroll_left: string;
	scroll_right: string;
	half_page_down: string;
	half_page_up: string;
	jump_top: string;
	jump_bottom: string;
	next_page: string;
	prev_page: string;
	zoom_in: string;
	zoom_out: string;
	fit_width: string;
	toggle_focus: string;
	swap_panes: string;
	reload_main: string;
	reload_all: string;
	toggle_help: string;
	quit: string;
}

const defaultKeys: KeysConfig = {
	scroll_down: "j",
	scroll_up: "k",
	scroll_left: "h",
	scroll_right: "l",
	half_page_down: "d",
	half_page_up: "u",
	jump_top: "gg",
	jump_bottom: "G",
	next_page: "n",
	prev_page: "p",
	zoom_in: "+",
	zoom_out: "-",
	fit_width: "=",
	toggle_focus: "Tab",
	swap_panes: "s",
	reload_main: "r",
	reload_all: "R",
	toggle_help: "?",
	quit: "q",
};

// Get keybindings configuration (user config + defaults)
export const getKeys = (): KeysConfig => {
	if (typeof window !== "undefined" && window.ZVIEW_CONFIG?.keys) {
		return { ...defaultKeys, ...window.ZVIEW_CONFIG.keys };
	}
	return defaultKeys;
};

export const getConfig = () => {
	const defaults = {
		watch: true,
		zoom_step: 1.2,
		dpr_cap: 2.0,
		scroll_step_vertical: 64.0,
		scroll_step_horizontal: 64.0,
		page_scroll_ratio: 0.5,
	};
	if (typeof window !== "undefined" && window.ZVIEW_CONFIG) {
		return { ...defaults, ...window.ZVIEW_CONFIG };
	}
	return defaults;
};
