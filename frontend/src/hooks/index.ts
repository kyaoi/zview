// Hooks barrel export

// Keyboard and pane management
export { useKeyboardNavigation, useSwapPanes } from "./useKeyboardNavigation";

// State initialization
export { useBootstrap } from "./useBootstrap";
export { useFileWatcher } from "./useFileWatcher";

// PDF Viewer helpers
export {
	useContinuousScroll,
	type UseContinuousScrollOptions,
	type UseContinuousScrollResult,
} from "./useContinuousScroll";
export {
	useZoomManager,
	type UseZoomManagerOptions,
	type UseZoomManagerResult,
} from "./useZoomManager";

// Tab management
export {
	useTabManager,
	type UseTabManagerOptions,
	type UseTabManagerResult,
} from "./useTabManager";
