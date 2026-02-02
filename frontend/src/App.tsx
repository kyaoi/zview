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
import type { ActionKey, ToastType, ViewerHandle } from "./lib/types";
import { classNames } from "./lib/utils";

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
	const { hasMain, hasSub, setHasSub, watchEnabled, initialFocus, isLoaded } =
		useBootstrap(addToast);

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
	});

	const handleAction = (key: ActionKey) => {
		switch (key) {
			case "openMain":
				addToast("MAIN: open dialog not implemented", "info");
				setFocusedPane("main");
				break;
			case "openSub":
				document.getElementById("sub-file-input")?.click();
				break;
			case "closeSub":
				if (!hasSub) return;
				fetch("/api/sub", { method: "DELETE" })
					.then(() => {
						setHasSub(false);
						setFocusedPane("main");
						addToast("SUB: Closed", "info");
					})
					.catch(() => addToast("Failed to close SUB", "error"));
				break;
			case "swap":
				swapPanes();
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

			setHasSub(true);
			setFocusedPane("sub");
			setSubReloadKey((v) => v + 1); // Force reload
			addToast(`SUB: Loaded ${file.name}`, "success");
		} catch (err) {
			console.error(err);
			addToast("SUB: Upload failed", "error");
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
					<PdfViewer
						paneRole="MAIN"
						status={watchEnabled ? "watching" : "manual"}
						onFocus={() => setFocusedPane("main")}
						url="/api/main.pdf"
						ref={mainViewerRef}
						onNotify={addToast}
						reloadKey={mainReloadKey}
					/>
				</Pane>
			</div>
		);

		const subPane = hasSub ? (
			<div key="pane-sub" className="flex-1 basis-1/2 min-w-0">
				<Pane
					key="sub"
					focused={focusedPane === "sub"}
					paneRole="SUB"
					status="static"
					onFocus={() => setFocusedPane("sub")}
				>
					<PdfViewer
						paneRole="SUB"
						status="static"
						onFocus={() => setFocusedPane("sub")}
						url="/api/sub.pdf"
						ref={subViewerRef}
						onNotify={addToast}
						reloadKey={subReloadKey}
					/>
				</Pane>
			</div>
		) : null;

		if (!subPane) return [mainPane];
		return paneOrder === "main-first" ? [mainPane, subPane] : [subPane, mainPane];
	}, [addToast, focusedPane, hasSub, mainReloadKey, subReloadKey, paneOrder, watchEnabled]);

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

			{showHelp ? <HelpOverlay onClose={() => setShowHelp(false)} /> : null}

			<input
				type="file"
				id="sub-file-input"
				className="hidden"
				accept=".pdf"
				onChange={handleSubFileUpload}
			/>

			<ToastContainer toasts={toasts} removeToast={removeToast} />
		</div>
	);
}
