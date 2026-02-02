/// <reference types="vite/client" />

interface Window {
	ZVIEW_CONFIG?: {
		watch: boolean;
		zoom_step: number;
		dpr_cap: number;
		scroll_step_vertical: number;
		scroll_step_horizontal: number;
		page_scroll_ratio: number;
	};
}
