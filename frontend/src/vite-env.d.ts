/// <reference types="vite/client" />

interface Window {
	ZVIEW_CONFIG?: {
		watch: boolean;
		zoom_step: number;
		dpr_cap: number;
		scroll_step_vertical: number;
		scroll_step_horizontal: number;
		page_scroll_ratio: number;
		keys?: {
			scroll_down?: string;
			scroll_up?: string;
			scroll_left?: string;
			scroll_right?: string;
			half_page_down?: string;
			half_page_up?: string;
			jump_top?: string;
			jump_bottom?: string;
			next_page?: string;
			prev_page?: string;
			zoom_in?: string;
			zoom_out?: string;
			fit_width?: string;
			toggle_focus?: string;
			swap_panes?: string;
			reload_main?: string;
			reload_all?: string;
			toggle_help?: string;
			quit?: string;
		};
	};
}
