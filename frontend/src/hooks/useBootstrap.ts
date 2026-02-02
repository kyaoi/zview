import { useCallback, useEffect, useState } from "react";
import type { SubTab, ToastType } from "../lib/types";

interface BootstrapData {
	focus: "main" | "sub";
	hasMain: boolean;
	hasSub: boolean;
	watch: boolean;
	subTabs?: SubTab[];
	activeSubId?: string;
}

interface UseBootstrapResult {
	hasMain: boolean;
	setHasMain: (value: boolean) => void;
	hasSub: boolean;
	setHasSub: (value: boolean) => void;
	watchEnabled: boolean;
	initialFocus: "main" | "sub";
	isLoaded: boolean;
	subTabs: SubTab[];
	setSubTabs: React.Dispatch<React.SetStateAction<SubTab[]>>;
	activeSubId: string | null;
	setActiveSubId: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useBootstrap(
	addToast: (message: string, type: ToastType) => void,
): UseBootstrapResult {
	const [hasMain, setHasMain] = useState(false);
	const [hasSub, setHasSub] = useState(false);
	const [watchEnabled, setWatchEnabled] = useState(true);
	const [initialFocus, setInitialFocus] = useState<"main" | "sub">("main");
	const [isLoaded, setIsLoaded] = useState(false);
	const [subTabs, setSubTabs] = useState<SubTab[]>([]);
	const [activeSubId, setActiveSubId] = useState<string | null>(null);

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
				if (data.subTabs) setSubTabs(data.subTabs);
				if (data.activeSubId) setActiveSubId(data.activeSubId);
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

	const setHasMainExternal = useCallback((value: boolean) => {
		setHasMain(value);
	}, []);

	return {
		hasMain,
		setHasMain: setHasMainExternal,
		hasSub,
		setHasSub: setHasSubExternal,
		watchEnabled,
		initialFocus,
		isLoaded,
		subTabs,
		setSubTabs,
		activeSubId,
		setActiveSubId,
	};
}
