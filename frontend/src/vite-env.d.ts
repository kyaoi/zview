/// <reference types="vite/client" />

interface ZviewAnimateConfig {
	enabled: boolean;
	default_fps: number;
	max_active_clips: number;
}

interface ZviewConfig {
	watch: boolean;
	zoom_step: number;
	dpr_cap: number;
	scroll_step_vertical: number;
	scroll_step_horizontal: number;
	page_scroll_ratio: number;
	text_select?: boolean;
	animate?: ZviewAnimateConfig;
	keys?: Record<string, string | string[]>;
	blocked_keys?: string[] | string;
	disable_browser_shortcuts?: boolean;
}

interface Window {
	ZVIEW_CONFIG?: ZviewConfig;
}
