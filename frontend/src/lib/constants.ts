import { getConfig } from "./config";

// PDF Viewer constants
export const DPR_CAP = getConfig().dpr_cap;
export const PAGE_GAP_PX = 16;
export const RENDER_BUFFER = 1;
export const ZOOM_STEP = getConfig().zoom_step;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 5;
export const PDFJS_ASSET_BASE = "/pdfjs/";
export const LINE_SCROLL_PX = 64;
export const CONT_SCROLL_PER_FRAME = 14;
export const CONT_SCROLL_FAST = 28;

// Toolbar actions
export const toolbarActions = [
	{ key: "openMain", label: "Open (Main)", hint: "Pick a PDF for MAIN" },
	{ key: "openSub", label: "Open (Sub)", hint: "Use CLI --sub" },
	{ key: "closeSub", label: "Close (Sub)", hint: "Remove SUB pane" },
	{ key: "swap", label: "Swap", hint: "Switch left/right (s)" },
	{ key: "reloadMain", label: "Reload (Main)", hint: "Refresh MAIN" },
	{ key: "help", label: "Help", hint: "Overlay" },
] as const;
