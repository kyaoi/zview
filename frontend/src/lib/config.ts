export const getConfig = () => {
	const defaults = {
		watch: true,
		zoom_step: 1.2,
		dpr_cap: 2.0,
	};
	if (typeof window !== "undefined" && window.ZVIEW_CONFIG) {
		return { ...defaults, ...window.ZVIEW_CONFIG };
	}
	return defaults;
};
