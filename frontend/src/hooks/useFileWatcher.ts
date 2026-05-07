import { useEffect } from "react";
import type { ToastType } from "../lib/types";

/**
 * Holds an EventSource connection to `/events` for the lifetime of the tab.
 *
 * The connection doubles as the server-side liveness signal that drives
 * auto-shutdown: when every browser tab closes its EventSource the backend
 * sees zero clients and exits after a grace period. The connection is opened
 * unconditionally — even when watch / MAIN are disabled — so that the
 * lifeline keeps working in all configurations. The `main-change` listener
 * is only attached when file watching is enabled and a MAIN PDF is loaded.
 */
export function useFileWatcher(
	watchEnabled: boolean,
	hasMain: boolean,
	onMainChange: () => void,
	addToast: (message: string, type: ToastType) => void,
) {
	useEffect(() => {
		const source = new EventSource("/events");
		const listenerActive = watchEnabled && hasMain;
		const handleChange = listenerActive
			? () => {
					onMainChange();
					addToast("MAIN: file changed", "info");
				}
			: null;
		if (handleChange) {
			source.addEventListener("main-change", handleChange);
		}
		source.onerror = () => {
			// EventSource auto-reconnects; on tab close it tears down naturally.
		};
		return () => {
			if (handleChange) {
				source.removeEventListener("main-change", handleChange);
			}
			source.close();
		};
	}, [addToast, hasMain, watchEnabled, onMainChange]);
}
