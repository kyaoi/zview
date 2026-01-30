import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	GlobalWorkerOptions,
	getDocument,
	type PDFDocumentProxy,
	type RenderTask,
} from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerSrc;

const DPR_CAP = 2;
const PAGE_GAP_PX = 16;
const RENDER_BUFFER = 1;

const toolbarActions = [
	{ key: "openMain", label: "Open (Main)", hint: "Pick a PDF for MAIN" },
	{ key: "openSub", label: "Open (Sub)", hint: "Add an optional SUB" },
	{ key: "swap", label: "Swap", hint: "Switch left/right" },
	{ key: "reloadMain", label: "Reload (Main)", hint: "Refresh MAIN" },
	{ key: "help", label: "Help", hint: "Overlay" },
] as const;

type ActionKey = (typeof toolbarActions)[number]["key"];

type PaneProps = {
	paneRole: "MAIN" | "SUB";
	status: string;
	focused: boolean;
	onFocus: () => void;
	children?: ReactNode;
};

function classNames(...tokens: Array<string | false | null | undefined>) {
	return tokens.filter(Boolean).join(" ");
}

function Pane({ paneRole, status, focused, onFocus, children }: PaneProps) {
	return (
		<section
			className={classNames(
				"group relative flex flex-col gap-3 rounded-2xl border border-slate-700/70 bg-slate-900/70 px-4 py-4 shadow-glow transition",
				focused
					? "ring-2 ring-accent/70 border-accent/70 -translate-y-0.5"
					: "hover:border-slate-500/70 hover:-translate-y-0.5",
			)}
		>
			<header className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span
						className={classNames(
							"inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide",
							paneRole === "MAIN"
								? "border-brand/50 bg-brand/15 text-brand"
								: "border-accent/60 bg-accent/15 text-accent",
						)}
					>
						{paneRole}
					</span>
					<span className="text-sm font-semibold text-slate-300">{status}</span>
				</div>
				<div className="flex items-center gap-2 text-xs text-slate-400">
					<span>{focused ? "focused" : "ready"}</span>
					{!focused ? (
						<button
							type="button"
							className="rounded-full border border-brand/60 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand hover:border-brand hover:bg-brand/20"
							onClick={onFocus}
						>
							Focus
						</button>
					) : null}
				</div>
			</header>

			<div className="rounded-xl border border-slate-700/50 bg-slate-900/60 px-4 py-4">
				{children}
			</div>
		</section>
	);
}

type MainViewerState =
	| { phase: "idle" | "loading" }
	| { phase: "ready"; summary: string }
	| { phase: "error"; detail: string };

type PageSlotRef = {
	container: HTMLDivElement | null;
	canvas: HTMLCanvasElement | null;
	renderTask: RenderTask | null;
	renderedScale: number | null;
};

function friendlyError(detail: string) {
	if (detail.includes("Missing PDF")) return "MAIN PDF が指定されていません";
	if (detail.includes("Unexpected server response")) return "MAIN PDF の取得に失敗しました";
	return "MAIN を読み込めませんでした";
}

function MainViewer({
	onStatus,
	reloadKey,
}: {
	onStatus: (message: string) => void;
	reloadKey: number;
}) {
	const hostRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [state, setState] = useState<MainViewerState>({ phase: "idle" });
	const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
	const [pageCount, setPageCount] = useState(0);
	const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
	const [layoutScale, setLayoutScale] = useState(1);
	const [visibleRange, setVisibleRange] = useState<[number, number]>([0, 0]);
	const [currentPage, setCurrentPage] = useState(1);
	const rafId = useRef<number | null>(null);
	const pageSlotsRef = useRef<PageSlotRef[]>([]);

	const resetPageSlots = useCallback(() => {
		pageSlotsRef.current.forEach((slot) => {
			slot?.renderTask?.cancel();
			slot.renderTask = null;
		});
		pageSlotsRef.current = [];
	}, []);

	useEffect(() => {
		let cancelled = false;
		resetPageSlots();
		setPdf(null);
		setPageCount(0);
		setPageSize(null);
		setVisibleRange([0, 0]);
		setCurrentPage(1);

		async function loadAndRender() {
			setState({ phase: "loading" });
			onStatus(reloadKey > 0 ? "MAIN: 再読み込み中…" : "MAIN: 読み込み中…");

			try {
				const loaded = await getDocument({ url: "/api/main.pdf" }).promise;
				if (cancelled) return;

				const firstPage = await loaded.getPage(1);
				if (cancelled) return;

				const baseViewport = firstPage.getViewport({ scale: 1 });
				setPdf(loaded);
				setPageCount(loaded.numPages);
				setPageSize({ width: baseViewport.width, height: baseViewport.height });
				setState({ phase: "ready", summary: `Page 1 / ${loaded.numPages}` });
				onStatus("MAIN: 1ページ目を表示中");
			} catch (err) {
				if (cancelled) return;
				resetPageSlots();
				const detail = err instanceof Error ? err.message : String(err);
				setState({ phase: "error", detail });
				onStatus("MAIN: 読み込みに失敗しました");
			}
		}

		loadAndRender();

		return () => {
			cancelled = true;
			resetPageSlots();
		};
	}, [onStatus, reloadKey, resetPageSlots]);

	useEffect(() => {
		if (!pageSize || !hostRef.current) return;

		const node = hostRef.current;
		const updateScale = () => {
			const width = node.clientWidth || pageSize.width;
			const fitScale = width / pageSize.width;
			setLayoutScale(fitScale);
		};

		updateScale();
		const observer = new ResizeObserver(updateScale);
		observer.observe(node);
		return () => observer.disconnect();
	}, [pageSize]);

	const measureVisibility = useCallback(() => {
		if (!pageSize || !hostRef.current || pageCount === 0) return;
		const hostTop = hostRef.current.getBoundingClientRect().top + window.scrollY;
		const viewTop = window.scrollY - hostTop;
		const viewBottom = viewTop + window.innerHeight;
		const pageBlock = Math.round(pageSize.height * layoutScale) + PAGE_GAP_PX;
		const start = Math.max(0, Math.floor(viewTop / pageBlock) - RENDER_BUFFER);
		const end = Math.min(pageCount - 1, Math.ceil(viewBottom / pageBlock) + RENDER_BUFFER);
		const current = Math.min(pageCount - 1, Math.max(0, Math.floor(viewTop / pageBlock)));

		setVisibleRange((prev) => {
			if (prev[0] === start && prev[1] === end) return prev;
			return [start, end];
		});
		setCurrentPage(current + 1);
	}, [layoutScale, pageCount, pageSize]);

	useEffect(() => {
		const handleScroll = () => {
			if (rafId.current) return;
			rafId.current = requestAnimationFrame(() => {
				rafId.current = null;
				measureVisibility();
			});
		};

		window.addEventListener("scroll", handleScroll, { passive: true });
		window.addEventListener("resize", handleScroll);
		measureVisibility();
		return () => {
			window.removeEventListener("scroll", handleScroll);
			window.removeEventListener("resize", handleScroll);
			if (rafId.current) cancelAnimationFrame(rafId.current);
		};
	}, [measureVisibility]);

	const renderPage = useCallback(
		async (pageIndex: number, slot: PageSlotRef, displayScale: number) => {
			if (!pdf || !pageSize) return;
			const canvas = slot.canvas;
			if (!canvas) return;
			const outputScale = Math.min(window.devicePixelRatio || 1, DPR_CAP);
			try {
				const page = await pdf.getPage(pageIndex + 1);
				const viewport = page.getViewport({ scale: displayScale * outputScale });
				const context = canvas.getContext("2d");
				if (!context) return;

				slot.renderTask?.cancel();
				slot.renderedScale = null;
				canvas.width = Math.floor(viewport.width);
				canvas.height = Math.floor(viewport.height);
				canvas.style.width = `${Math.floor(viewport.width / outputScale)}px`;
				canvas.style.height = `${Math.floor(viewport.height / outputScale)}px`;
				canvas.style.backgroundColor = "#0f172a";

				slot.renderTask = page.render({
					canvasContext: context,
					viewport,
					transform: outputScale !== 1 ? [1 / outputScale, 0, 0, 1 / outputScale, 0, 0] : undefined,
				});

				await slot.renderTask.promise;
				slot.renderedScale = displayScale;
			} catch (err) {
				if (err instanceof Error && err.name === "RenderingCancelledException") return;
				console.error(`Failed to render page ${pageIndex + 1}:`, err);
			}
		},
		[pdf, pageSize],
	);

	useEffect(() => {
		if (!pdf || !pageSize || pageCount === 0) return;

		for (let i = visibleRange[0]; i <= visibleRange[1]; i += 1) {
			if (!pageSlotsRef.current[i]) {
				pageSlotsRef.current[i] = {
					container: null,
					canvas: null,
					renderTask: null,
					renderedScale: null,
				};
			}
			const slot = pageSlotsRef.current[i];
			if (!slot?.canvas) continue;
			if (slot.renderedScale === layoutScale) continue;
			renderPage(i, slot, layoutScale);
		}

		pageSlotsRef.current.forEach((slot, index) => {
			if (!slot?.renderTask) return;
			if (index < visibleRange[0] - 1 || index > visibleRange[1] + 1) {
				slot.renderTask.cancel();
				slot.renderTask = null;
				slot.renderedScale = null;
			}
		});
	}, [layoutScale, pageCount, pageSize, pdf, renderPage, visibleRange]);

	useEffect(() => {
		if (state.phase !== "ready" || pageCount === 0) return;
		onStatus(`MAIN: ページ ${currentPage} / ${pageCount}`);
	}, [currentPage, onStatus, pageCount, state.phase]);

	const displayWidth = pageSize ? Math.round(pageSize.width * layoutScale) : null;
	const displayHeight = pageSize ? Math.round(pageSize.height * layoutScale) : null;
	const listStyle = { gap: `${PAGE_GAP_PX}px` };

	return (
		<div className="flex flex-col gap-3" ref={containerRef}>
			<div className="flex items-center justify-between gap-2 text-sm text-slate-300">
				<span>
					{state.phase === "ready"
						? pageCount > 0 && displayWidth && displayHeight
							? `Page ${currentPage} / ${pageCount} • ${displayWidth}×${displayHeight} px`
							: state.summary
						: state.phase === "error"
							? friendlyError(state.detail)
							: "MAINを読み込み中"}
				</span>
				<span className="rounded-full border border-slate-700/70 bg-slate-800/80 px-2 py-1 text-xs">
					PDF.js worker bundled
				</span>
			</div>
			<div className="flex flex-col" ref={hostRef} style={listStyle}>
				{state.phase === "ready" && pageCount > 0 && pageSize ? (
					<div className="flex flex-col gap-2 text-xs text-slate-400">
						<span>Continuous scroll • gap {PAGE_GAP_PX}px</span>
						<span>
							Current page (top-aligned estimate): {currentPage} / {pageCount}
						</span>
					</div>
				) : null}
				<div className="flex flex-col" style={listStyle}>
					{pageCount === 0 || !pageSize ? (
						<div className="rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-10 text-center text-sm text-slate-300">
							MAIN PDF を読み込んでいます…
						</div>
					) : (
						Array.from({ length: pageCount }).map((_, index) => {
							if (!pageSlotsRef.current[index]) {
								pageSlotsRef.current[index] = {
									container: null,
									canvas: null,
									renderTask: null,
									renderedScale: null,
								};
							}
							const isVisible = index >= visibleRange[0] && index <= visibleRange[1];
							return (
								<div key={`page-${index + 1}`} className="flex flex-col gap-2">
									<div className="flex items-center justify-between text-xs text-slate-400">
										<span>Page {index + 1}</span>
										{currentPage - 1 === index ? (
											<span className="rounded-full bg-brand/20 px-2 py-0.5 text-[11px] text-brand">
												viewing
											</span>
										) : null}
									</div>
									<div
										ref={(node) => {
											const existing = pageSlotsRef.current[index];
											if (existing) {
												existing.container = node;
											} else {
												pageSlotsRef.current[index] = {
													container: node,
													canvas: null,
													renderTask: null,
													renderedScale: null,
												};
											}
										}}
										className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 shadow-inner"
										style={{
											minHeight: `${Math.round(pageSize.height * layoutScale)}px`,
										}}
									>
									<canvas
										ref={(node) => {
											const existing = pageSlotsRef.current[index];
											if (existing) {
												existing.canvas = node;
											} else {
												pageSlotsRef.current[index] = {
													container: null,
													canvas: node,
													renderTask: null,
													renderedScale: null,
												};
											}
										}}
										className="block h-full w-full bg-slate-900"
										aria-label={`MAIN PDF page ${index + 1}`}
										style={{
											opacity: isVisible ? 1 : 0.4,
											}}
										/>
										{!isVisible ? (
											<div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-900/70 via-slate-900/30 to-slate-900/70" />
										) : null}
									</div>
								</div>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
	return (
		<div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/70 px-4">
			<div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/90 p-5 shadow-2xl">
				<header className="mb-3">
					<p className="text-xs uppercase tracking-[0.2em] text-slate-400">Guide</p>
					<h3 className="text-lg font-semibold text-slate-50">Skeleton UI</h3>
				</header>
				<ul className="mb-4 list-disc space-y-2 pl-5 text-sm text-slate-200">
					<li>Toolbar hooks up to pickers and reloads in later tasks.</li>
					<li>MAIN badge stays visible; SUB appears after you add it.</li>
					<li>Focus ring shows which pane will react to keybindings.</li>
				</ul>
				<button
					type="button"
					className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-brand/60 hover:bg-slate-800/80"
					onClick={onClose}
				>
					Close
				</button>
			</div>
		</div>
	);
}

export default function App() {
	const [hasSub, setHasSub] = useState(false);
	const [focusedPane, setFocusedPane] = useState<"main" | "sub">("main");
	const [paneOrder, setPaneOrder] = useState<"main-first" | "sub-first">("main-first");
	const [status, setStatus] = useState("Ready to open MAIN");
	const [reloadKey, setReloadKey] = useState(0);
	const [showHelp, setShowHelp] = useState(false);

	const announce = useCallback((message: string) => setStatus(message), []);

	const handleAction = (key: ActionKey) => {
		switch (key) {
			case "openMain":
				announce("MAIN: open dialog (stub)");
				setFocusedPane("main");
				break;
			case "openSub":
				setHasSub(true);
				setFocusedPane("sub");
				announce("SUB slot is ready (static)");
				break;
			case "swap":
				if (!hasSub) {
					announce("Add a SUB pane before swapping");
					return;
				}
				setPaneOrder((prev) => (prev === "main-first" ? "sub-first" : "main-first"));
				announce("Swapped pane order");
				break;
			case "reloadMain":
				announce("MAIN: 再読み込み中…");
				setReloadKey((v) => v + 1);
				setFocusedPane("main");
				break;
			case "help":
				setShowHelp((open) => !open);
				break;
			default:
				announce("Action pending wiring");
		}
	};

	const paneSequence = useMemo(() => {
		const mainPane = (
			<Pane
				key="main"
				paneRole="MAIN"
				status="manual"
				focused={focusedPane === "main"}
				onFocus={() => setFocusedPane("main")}
			>
				<MainViewer onStatus={announce} reloadKey={reloadKey} />
			</Pane>
		);

		const subPane = hasSub ? (
			<Pane
				key="sub"
				paneRole="SUB"
				status="static"
				focused={focusedPane === "sub"}
				onFocus={() => setFocusedPane("sub")}
			/>
		) : null;

		if (!subPane) return [mainPane];
		return paneOrder === "main-first" ? [mainPane, subPane] : [subPane, mainPane];
	}, [announce, focusedPane, hasSub, paneOrder, reloadKey]);

	return (
		<div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pb-6 pt-4">
			<header className="sticky top-0 z-10 grid grid-cols-1 gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/90 px-4 py-3 shadow-glow backdrop-blur md:grid-cols-[240px_1fr_220px]">
				<div className="flex items-center gap-3">
					<div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand to-accent text-base font-bold uppercase text-slate-950">
						zv
					</div>
					<div className="flex flex-col leading-tight">
						<span className="text-base font-semibold tracking-wide text-slate-50">zview</span>
						<span className="text-sm text-slate-300">fast, read-only PDF viewer</span>
					</div>
				</div>

				<nav
					className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5"
					aria-label="Primary actions"
				>
					{toolbarActions.map(({ key, label, hint }) => (
						<button
							key={key}
							type="button"
							onClick={() => handleAction(key)}
							className="glass flex flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-100 transition hover:-translate-y-0.5 hover:border-brand/70 hover:text-slate-50"
						>
							<span>{label}</span>
							<small className="text-xs font-normal text-slate-300">{hint}</small>
						</button>
					))}
				</nav>

				<div className="flex items-center justify-end">
					<div className="glass max-w-full truncate rounded-xl px-3 py-2 text-sm text-slate-200">
						{status}
					</div>
				</div>
			</header>

			<main
				className={classNames(
					"grid gap-3",
					hasSub ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1",
					paneOrder === "sub-first" && hasSub ? "md:[&>section:nth-child(1)]:order-2" : "",
				)}
			>
				{paneSequence}

				{!hasSub && (
					<div className="flex flex-col justify-between rounded-2xl border border-dashed border-slate-700/60 bg-slate-900/60 px-4 py-4">
						<div className="flex items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<span className="inline-flex items-center gap-2 rounded-full border border-accent/60 bg-accent/10 px-3 py-1 text-xs font-semibold tracking-wide text-accent">
									SUB
								</span>
								<span className="text-sm font-semibold text-slate-300">static</span>
							</div>
							<span className="text-xs text-slate-400">hidden until opened</span>
						</div>
						<div className="mt-4 flex items-center justify-between rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
							<span>Open Sub to reveal the second pane.</span>
							<button
								type="button"
								className="rounded-lg border border-accent/60 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent hover:border-accent hover:bg-accent/25"
								onClick={() => handleAction("openSub")}
							>
								Open Sub
							</button>
						</div>
					</div>
				)}
			</main>

			{showHelp ? <HelpOverlay onClose={() => setShowHelp(false)} /> : null}
		</div>
	);
}
