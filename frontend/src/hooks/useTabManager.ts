/**
 * Hook for managing SUB pane tabs.
 * Handles tab selection, closing, and switching between tabs.
 */
import { useCallback, useRef } from "react";
import type { ScrollSnapshot, SubTab, ToastType, ViewerHandle } from "../lib/types";

export interface UseTabManagerOptions {
	/** Current list of sub tabs */
	subTabs: SubTab[];
	/** Setter for sub tabs */
	setSubTabs: React.Dispatch<React.SetStateAction<SubTab[]>>;
	/** Currently active sub tab ID */
	activeSubId: string | null;
	/** Setter for active sub ID */
	setActiveSubId: React.Dispatch<React.SetStateAction<string | null>>;
	/** Current sub viewer reference */
	subViewerRef: React.RefObject<ViewerHandle | null>;
	/** Function to set focused pane */
	setFocusedPane: (pane: "main" | "sub") => void;
	/** Toast notification function */
	addToast: (message: string, type: ToastType) => void;
}

export interface UseTabManagerResult {
	/** Map of tab snapshots for restoring scroll position */
	tabSnapshotsRef: React.MutableRefObject<Map<string, ScrollSnapshot>>;
	/** Map of viewer refs by tab ID */
	subViewerRefs: React.MutableRefObject<Map<string, ViewerHandle>>;
	/** Handle tab selection */
	handleTabSelect: (id: string) => void;
	/** Handle closing a tab */
	handleSubClose: (id: string) => Promise<void>;
	/** Handle switching tabs by direction */
	handleTabSwitch: (direction: "prev" | "next") => void;
	/** Register a viewer ref for a tab */
	registerSubViewer: (id: string, viewer: ViewerHandle | null) => void;
	/** Get snapshot for a tab */
	getTabSnapshot: (id: string) => ScrollSnapshot | undefined;
	/** Save current tab snapshot */
	saveCurrentSnapshot: () => void;
}

/**
 * Hook that manages SUB pane tab state and operations.
 */
export function useTabManager({
	subTabs,
	setSubTabs,
	activeSubId,
	setActiveSubId,
	subViewerRef,
	setFocusedPane,
	addToast,
}: UseTabManagerOptions): UseTabManagerResult {
	// Snapshots for tabs to restore state when switching back
	const tabSnapshotsRef = useRef<Map<string, ScrollSnapshot>>(new Map());
	const subViewerRefs = useRef<Map<string, ViewerHandle>>(new Map());

	const saveCurrentSnapshot = useCallback(() => {
		if (activeSubId && subViewerRef.current) {
			const snap = subViewerRef.current.getSnapshot();
			if (snap) {
				tabSnapshotsRef.current.set(activeSubId, snap);
			}
		}
	}, [activeSubId, subViewerRef]);

	const handleTabSelect = useCallback(
		(id: string) => {
			if (id === activeSubId) return;

			// Save current snapshot before switching
			saveCurrentSnapshot();
			setActiveSubId(id);
		},
		[activeSubId, saveCurrentSnapshot, setActiveSubId],
	);

	const handleSubClose = useCallback(
		async (id: string) => {
			try {
				const res = await fetch(`/api/sub?id=${id}`, { method: "DELETE" });
				if (!res.ok) throw new Error("Failed to close tab");

				// Remove snapshot
				tabSnapshotsRef.current.delete(id);
				subViewerRefs.current.delete(id);

				setSubTabs((prev) => {
					const next = prev.filter((t) => t.id !== id);

					// If we closed the active tab, switch to another one
					if (id === activeSubId) {
						if (next.length > 0) {
							const closedIndex = prev.findIndex((t) => t.id === id);
							const nextActive = next[Math.min(closedIndex, next.length - 1)];
							setActiveSubId(nextActive.id);
						} else {
							setActiveSubId(null);
							setFocusedPane("main");
						}
					}

					return next;
				});
			} catch (e) {
				console.error(e);
				addToast("Failed to close tab", "error");
			}
		},
		[activeSubId, addToast, setActiveSubId, setFocusedPane, setSubTabs],
	);

	const handleTabSwitch = useCallback(
		(direction: "prev" | "next") => {
			if (subTabs.length <= 1) return;

			const currentIndex = subTabs.findIndex((t) => t.id === activeSubId);
			if (currentIndex === -1) return;

			let nextIndex: number;
			if (direction === "prev") {
				nextIndex = (currentIndex - 1 + subTabs.length) % subTabs.length;
			} else {
				nextIndex = (currentIndex + 1) % subTabs.length;
			}

			handleTabSelect(subTabs[nextIndex].id);
		},
		[subTabs, activeSubId, handleTabSelect],
	);

	const registerSubViewer = useCallback((id: string, viewer: ViewerHandle | null) => {
		if (viewer) {
			subViewerRefs.current.set(id, viewer);
		} else {
			subViewerRefs.current.delete(id);
		}
	}, []);

	const getTabSnapshot = useCallback((id: string) => {
		return tabSnapshotsRef.current.get(id);
	}, []);

	return {
		tabSnapshotsRef,
		subViewerRefs,
		handleTabSelect,
		handleSubClose,
		handleTabSwitch,
		registerSubViewer,
		getTabSnapshot,
		saveCurrentSnapshot,
	};
}
