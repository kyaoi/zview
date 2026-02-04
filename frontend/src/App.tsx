import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Header } from "./components/Header";
import { HelpOverlay } from "./components/HelpOverlay";
import { Menu } from "./components/Menu";
import { Pane } from "./components/Pane";
import { PdfViewer } from "./components/PdfViewer";
import { ToastContainer, type ToastMessage } from "./components/Toast";
import { useBootstrap } from "./hooks/useBootstrap";
import { useFileWatcher } from "./hooks/useFileWatcher";
import { useKeyboardNavigation, useSwapPanes } from "./hooks/useKeyboardNavigation";
import { useTabManager } from "./hooks/useTabManager";
import type { ActionKey, ToastType, ViewerHandle } from "./lib/types";
import { classNames } from "./lib/utils";
import { SubTabBar } from "./components/SubTabBar";

export default function App() {
	const [toasts, setToasts] = useState<ToastMessage[]>([]);
	const [focusedPane, setFocusedPane] = useState<"main" | "sub">("main");
	const [paneOrder, setPaneOrder] = useState<"main-first" | "sub-first">("main-first");
	const [mainReloadKey, setMainReloadKey] = useState(0);
	const [subReloadKey, setSubReloadKey] = useState(0);
	const [showHelp, setShowHelp] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const [keysEnabled, setKeysEnabled] = useState(true);

	const mainViewerRef = useRef<ViewerHandle | null>(null);
	const subViewerRef = useRef<ViewerHandle | null>(null);
	const hasSubRef = useRef(false);

	const addToast = useCallback((message: string, type: ToastType = "info") => {
		const id = Math.random().toString(36).substring(2, 9);
		setToasts((prev) => [...prev, { id, message, type }]);
	}, []);

	const removeToast = useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	// Bootstrap: fetch initial state from backend
	const {
		hasMain,
		setHasMain,
		// hasSub is derived from subTabs length now
		watchEnabled,
		initialFocus,
		isLoaded,
		subTabs, // derived from bootstrap
		setSubTabs,
		activeSubId,
		setActiveSubId,
	} = useBootstrap(addToast);

	// Tab Manager Hook
	const {
		tabSnapshotsRef,
		subViewerRefs,
		handleTabSelect,
		handleSubClose,
		handleTabSwitch,
		registerSubViewer,
		saveCurrentSnapshot,
	} = useTabManager({
		subTabs,
		setSubTabs,
		activeSubId,
		setActiveSubId,
		subViewerRef,
		setFocusedPane,
		addToast,
	});

	// Derived hasSub based on tabs presence
	const hasSub = subTabs.length > 0;

	// Set initial focus when bootstrap loads
	useEffect(() => {
		if (isLoaded) {
			setFocusedPane(initialFocus);
		}
	}, [isLoaded, initialFocus]);

	// Keep hasSubRef in sync
	useEffect(() => {
		hasSubRef.current = hasSub;
	}, [hasSub]);

	// Sync subViewerRef (for keyboard nav) with active sub tab
	// biome-ignore lint/correctness/useExhaustiveDependencies: subViewerRefs is a ref
	useEffect(() => {
		if (activeSubId && hasSub) {
			const ref = subViewerRefs.current.get(activeSubId);
			subViewerRef.current = ref || null;
		} else {
			subViewerRef.current = null;
		}
	}, [activeSubId, hasSub]);

	// Swap panes logic
	const [swapPanes, swapSnapshotsRef] = useSwapPanes(
		hasSubRef,
		mainViewerRef,
		subViewerRef,
		setPaneOrder,
		addToast,
	);

	// Restore snapshots after layout change (swap)
	useEffect(() => {
		void paneOrder; // Ensure effect runs on order change
		const snaps = swapSnapshotsRef.current;
		if (!snaps) return;

		const main = mainViewerRef.current;
		const sub = subViewerRef.current;

		if (main && snaps.main) main.restoreSnapshot(snaps.main);
		if (sub && snaps.sub) sub.restoreSnapshot(snaps.sub);

		swapSnapshotsRef.current = null;
	}, [paneOrder, swapSnapshotsRef]);

	// File watcher: SSE for MAIN changes
	const handleMainChange = useCallback(() => {
		setMainReloadKey((v) => v + 1);
	}, []);
	useFileWatcher(watchEnabled, hasMain, handleMainChange, addToast);

	// Keyboard navigation
	useKeyboardNavigation({
		keysEnabled,
		focusedPane,
		hasSub,
		showHelp,
		mainViewerRef,
		subViewerRef,
		setFocusedPane,
		setMainReloadKey,
		setShowHelp,
		swapPanes,
		addToast,
		onTabSwitch: handleTabSwitch,
	});

	const handleAction = (key: ActionKey) => {
		switch (key) {
			case "openMain":
				document.getElementById("main-file-input")?.click();
				break;
			case "openSub":
				document.getElementById("sub-file-input")?.click();
				break;
			case "closeSub":
				if (!hasSub) return;
				// Close all tabs (legacy behavior implies clearing SUB pane)
				fetch("/api/sub", { method: "DELETE" }) // No ID means clear all/active? Handlers need check.
					.then(() => {
						setSubTabs([]);
						setActiveSubId(null);
						tabSnapshotsRef.current.clear();
						setFocusedPane("main");
						addToast("SUB: Closed all", "info");
					})
					.catch(() => addToast("Failed to close SUB", "error"));
				break;
			case "closeSubTab":
				if (activeSubId) {
					handleSubClose(activeSubId);
				}
				break;
			case "swap":
				if (swapPanes()) {
					setFocusedPane((prev) => (prev === "main" ? "sub" : "main"));
				}
				break;
			case "reloadMain":
				setMainReloadKey((v) => v + 1);
				setFocusedPane("main");
				break;
			case "help":
				setShowHelp((open) => !open);
				break;
			default:
				addToast("Action pending wiring", "info");
		}
	};

	const handleSubFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		// Reset value so same file can be selected again if needed
		e.target.value = "";

		const formData = new FormData();
		formData.append("file", file);

		addToast("SUB: Uploading…", "info");
		try {
			const res = await fetch("/api/sub/upload", {
				method: "POST",
				body: formData,
			});
			if (!res.ok) throw new Error("Upload failed");

			const data: { id: string; name: string } = await res.json();

			setSubTabs((prev) => {
				// Don't duplicate if already exists? ID is random so new upload = new tab always.
				return [...prev, data];
			});

			// Save snapshot of current before switching
			if (activeSubId && subViewerRef.current) {
				const snap = subViewerRef.current.getSnapshot();
				if (snap) tabSnapshotsRef.current.set(activeSubId, snap);
			}

			setActiveSubId(data.id);
			setFocusedPane("sub");
			setSubReloadKey((v) => v + 1); // Force reload (though ID change triggers it too)
			addToast(`SUB: Loaded ${file.name}`, "success");
		} catch (err) {
			console.error(err);
			addToast("SUB: Upload failed", "error");
		}
	};

	const handleMainFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		// Reset value so same file can be selected again if needed
		e.target.value = "";

		const formData = new FormData();
		formData.append("file", file);

		addToast("MAIN: Uploading…", "info");
		try {
			const res = await fetch("/api/main/upload", {
				method: "POST",
				body: formData,
			});
			if (!res.ok) throw new Error("Upload failed");

			setHasMain(true);
			setFocusedPane("main");
			setMainReloadKey((v) => v + 1); // Force reload
			addToast(`MAIN: Loaded ${file.name}`, "success");
		} catch (err) {
			console.error(err);
			addToast("MAIN: Upload failed", "error");
		}
	};

	const paneSequence = useMemo(() => {
		const mainPane = (
			<div
				key="pane-main"
				className={classNames(
					hasSub ? "flex-1 basis-1/2 min-w-0 border-r border-slate-800" : "flex-1 w-full",
				)}
			>
				<Pane
					key="main"
					focused={focusedPane === "main"}
					paneRole="MAIN"
					status={watchEnabled ? "watching" : "manual"}
					onFocus={() => setFocusedPane("main")}
				>
					{hasMain ? (
						<PdfViewer
							paneRole="MAIN"
							status={watchEnabled ? "watching" : "manual"}
							onFocus={() => setFocusedPane("main")}
							url="/api/main.pdf"
							ref={mainViewerRef}
							onNotify={addToast}
							reloadKey={mainReloadKey}
						/>
					) : (
						<div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-slate-900/50">
							<div className="text-center">
								<svg
									aria-hidden="true"
									className="mx-auto h-16 w-16 text-slate-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
									/>
								</svg>
								<p className="mt-4 text-lg font-medium text-slate-400">No PDF Loaded</p>
								<p className="mt-1 text-sm text-slate-500">Select a PDF file to start viewing</p>
							</div>
							<button
								type="button"
								onClick={() => document.getElementById("main-file-input")?.click()}
								className="flex items-center gap-2 rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-brand/90 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand/50 focus:ring-offset-2 focus:ring-offset-slate-900"
							>
								<svg
									aria-hidden="true"
									className="h-5 w-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M12 6v6m0 0v6m0-6h6m-6 0H6"
									/>
								</svg>
								Open Main PDF
							</button>
						</div>
					)}
				</Pane>
			</div>
		);

		const subPane = hasSub ? (
			<div key="pane-sub" className="flex-1 basis-1/2 min-w-0 flex flex-col">
				{/* Tab Bar within the Pane area */}
				<Pane
					key="sub"
					focused={focusedPane === "sub"}
					paneRole="SUB"
					status="static"
					onFocus={() => setFocusedPane("sub")}
				>
					<div className="flex flex-col h-full w-full">
						<SubTabBar
							tabs={subTabs}
							activeTabId={activeSubId}
							onSelect={handleTabSelect}
							onClose={handleSubClose}
						/>
						<div className="flex-1 min-h-0 relative">
							{subTabs.map((tab) => (
								<div
									key={tab.id}
									className={classNames(
										"absolute inset-0 h-full w-full bg-slate-900", // absolute to stack them
										activeSubId === tab.id ? "z-10 visible" : "z-0 invisible",
									)}
								>
									<PdfViewer
										paneRole="SUB"
										status="static"
										onFocus={() => setFocusedPane("sub")}
										url={`/api/sub.pdf?id=${tab.id}`}
										ref={(el) => {
											registerSubViewer(tab.id, el);
											if (tab.id === activeSubId) {
												subViewerRef.current = el;
											}
										}}
										onNotify={addToast}
										reloadKey={subReloadKey}
										initialSnapshot={
											activeSubId === tab.id ? tabSnapshotsRef.current.get(tab.id) : undefined
										}
									/>
								</div>
							))}
						</div>
					</div>
				</Pane>
			</div>
		) : null;

		if (!subPane) return [mainPane];
		return paneOrder === "main-first" ? [mainPane, subPane] : [subPane, mainPane];
	}, [
		addToast,
		focusedPane,
		hasMain,
		hasSub,
		mainReloadKey,
		subReloadKey,
		paneOrder,
		watchEnabled,
		subTabs,
		activeSubId,
		handleTabSelect,
		handleSubClose,
		registerSubViewer,
		// biome-ignore lint/correctness/useExhaustiveDependencies: tabSnapshotsRef is a ref
		tabSnapshotsRef,
	]);

	return (
		<div className="relative mx-auto flex h-screen w-full flex-col gap-0 bg-slate-950 text-slate-100 overflow-hidden">
			<Header onMenuToggle={() => setMenuOpen((v) => !v)} menuOpen={menuOpen} />

			<Menu
				open={menuOpen}
				onClose={() => setMenuOpen(false)}
				onAction={handleAction}
				keysEnabled={keysEnabled}
				onKeysEnabledChange={setKeysEnabled}
			/>

			<div className="flex flex-1 min-h-0 w-full flex-row gap-0">{paneSequence}</div>

			{showHelp ? <HelpOverlay onClose={() => setShowHelp(false)} visible={true} /> : null}

			<input
				type="file"
				id="sub-file-input"
				className="hidden"
				accept=".pdf"
				onChange={handleSubFileUpload}
			/>

			<input
				type="file"
				id="main-file-input"
				className="hidden"
				accept=".pdf"
				onChange={handleMainFileUpload}
			/>

			<ToastContainer toasts={toasts} removeToast={removeToast} />
		</div>
	);
}
