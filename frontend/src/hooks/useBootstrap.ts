import { useCallback, useEffect, useState } from "react";
import type { ToastType } from "../lib/types";

interface BootstrapData {
	focus: "main" | "sub";
	hasMain: boolean;
	hasSub: boolean;
	watch: boolean;
}

interface UseBootstrapResult {
	hasMain: boolean;
	hasSub: boolean;
	setHasSub: (value: boolean) => void;
	watchEnabled: boolean;
	initialFocus: "main" | "sub";
	isLoaded: boolean;
}

export function useBootstrap(addToast: (message: string, type: ToastType) => void): UseBootstrapResult {
	const [hasMain, setHasMain] = useState(false);
	const [hasSub, setHasSub] = useState(false);
	const [watchEnabled, setWatchEnabled] = useState(true);
	const [initialFocus, setInitialFocus] = useState<"main" | "sub">("main");
	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		let aborted = false;
		async function loadBootstrap() {
			try {
				const res = await fetch("/api/bootstrap", { cache: "no-store" });
				if (!res.ok) throw new Error(`status ${res.status}`);
				const data: BootstrapData = await res.json();
				if (aborted) return;
				setHasMain(data.hasMain);
				setHasSub(data.hasSub);
				setWatchEnabled(data.watch);
				setInitialFocus(data.focus === "sub" && data.hasSub ? "sub" : "main");
				setIsLoaded(true);
			} catch (_err) {
				if (aborted) return;
				setHasMain(false);
				setHasSub(false);
				setWatchEnabled(true);
				setInitialFocus("main");
				setIsLoaded(true);
				addToast("Failed to fetch bootstrap info", "error");
			}
		}

		loadBootstrap();
		return () => {
			aborted = true;
		};
	}, [addToast]);

	const setHasSubExternal = useCallback((value: boolean) => {
		setHasSub(value);
	}, []);

	return {
		hasMain,
		hasSub,
		setHasSub: setHasSubExternal,
		watchEnabled,
		initialFocus,
		isLoaded,
	};
}
