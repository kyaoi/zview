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
