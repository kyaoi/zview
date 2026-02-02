import { useEffect } from "react";
import type { ToastType } from "../lib/types";

export function useFileWatcher(
	watchEnabled: boolean,
	hasMain: boolean,
	onMainChange: () => void,
	addToast: (message: string, type: ToastType) => void,
) {
	useEffect(() => {
		if (!watchEnabled || !hasMain) return;
		const source = new EventSource("/events");
		const handleChange = () => {
			onMainChange();
			addToast("MAIN: file changed", "info");
		};
		source.addEventListener("main-change", handleChange);
		source.onerror = () => {
			// Silent retry used by EventSource
		};
		return () => {
			source.removeEventListener("main-change", handleChange);
			source.close();
		};
	}, [addToast, hasMain, watchEnabled, onMainChange]);
}
