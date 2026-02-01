import {
	GlobalWorkerOptions,
	getDocument,
	type PDFDocumentProxy,
	type RenderTask,
} from "pdfjs-dist";
// @ts-expect-error
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
	forwardRef,
	type ReactNode,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { ToastContainer, type ToastMessage, type ToastType } from "./components/Toast";

GlobalWorkerOptions.workerSrc = workerSrc;

const DPR_CAP = 2;
const PAGE_GAP_PX = 16;
const RENDER_BUFFER = 1;
const ZOOM_STEP = 1.1;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 5;
const PDFJS_ASSET_BASE = "/pdfjs/";
const LINE_SCROLL_PX = 64;
const CONT_SCROLL_PER_FRAME = 14;
const CONT_SCROLL_FAST = 28;
const clampScaleValue = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

function withCacheBust(url: string, token: number) {
	if (token <= 0) return url;
	const joiner = url.includes("?") ? "&" : "?";
	return `${url}${joiner}cb=${token}-${Date.now()}`;
}

const toolbarActions = [
	{ key: "openMain", label: "Open (Main)", hint: "Pick a PDF for MAIN" },
	{ key: "openSub", label: "Open (Sub)", hint: "Use CLI --sub" },
	{ key: "closeSub", label: "Close (Sub)", hint: "Remove SUB pane" },
	{ key: "swap", label: "Swap", hint: "Switch left/right (s)" },
	{ key: "reloadMain", label: "Reload (Main)", hint: "Refresh MAIN" },
	{ key: "help", label: "Help", hint: "Overlay" },
] as const;

type ActionKey = (typeof toolbarActions)[number]["key"];
type ViewerRole = "MAIN" | "SUB";

function classNames(...tokens: Array<string | false | null | undefined>) {
	return tokens.filter(Boolean).join(" ");
}

type PdfViewerState =
	| { phase: "idle" | "loading" }
	| { phase: "ready"; summary: string }
	| { phase: "error"; detail: string };

type PageSlotRef = {
	container: HTMLDivElement | null;
	canvas: HTMLCanvasElement | null;
	renderTask: RenderTask | null;
	renderedScale: number | null;
};

const releasePageSlot = (slot: PageSlotRef | undefined) => {
	if (!slot) return;
	if (slot.renderTask) {
		slot.renderTask.cancel();
	}
	slot.renderTask = null;
	slot.renderedScale = null;
	if (slot.canvas) {
		slot.canvas.width = 0;
		slot.canvas.height = 0;
		slot.canvas.style.width = "0px";
		slot.canvas.style.height = "0px";
	}
};

type ZoomMode = "fit-width" | "manual";
type ScrollSnapshot = {
	topPageIndex: number;
	offsetPx: number;
	zoomMode: ZoomMode;
	manualScale: number;
	scrollRatio: number;
	pageCount: number;
};

type ViewerHandle = {
	scrollLine: (deltaPx: number) => void;
	scrollHalfPage: (direction: 1 | -1) => void;
	scrollHorizontal: (deltaPx: number) => void;
	startContinuousScroll: (vx: number, vy: number) => void;
	stopContinuousScroll: () => void;
	jumpToTop: () => void;
	jumpToBottom: () => void;
	jumpByPages: (delta: number) => void;
	zoomIn: () => void;
	zoomOut: () => void;
	fitToWidth: () => void;
	rerender: () => void;
	getSnapshot: () => ScrollSnapshot | null;
	restoreSnapshot: (snapshot: ScrollSnapshot) => void;
};

const PdfViewer = forwardRef<
	ViewerHandle,
	{
		paneRole: ViewerRole;
		status?: string;
		focused?: boolean;
		url: string;
		onNotify: (message: string, type: ToastType) => void;
		onFocus?: () => void;
		reloadKey?: number;
	}
>(function PdfViewer({ paneRole, status, focused, url, onNotify, onFocus, reloadKey = 0 }, ref) {
	const role = paneRole;
	const sessionNonce = useMemo(() => Math.floor(Math.random() * 1_000_000), []);
	const scrollRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [state, setState] = useState<PdfViewerState>({ phase: "idle" });
	const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
	const [pageCount, setPageCount] = useState(0);
	const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
	const [zoomMode, setZoomMode] = useState<ZoomMode>("fit-width");
	const [fitScale, setFitScale] = useState(1);
	const [manualScale, setManualScale] = useState(1);
	const [visibleRange, setVisibleRange] = useState<[number, number]>([0, 0]);
	const [currentPage, setCurrentPage] = useState(1);
	const [renderNonce, setRenderNonce] = useState(0);
	const rafId = useRef<number | null>(null);
	const pageSlotsRef = useRef<PageSlotRef[]>([]);
	const manualScaleInitializedRef = useRef(false);
	const currentPageRef = useRef(1);
	const pdfRef = useRef<PDFDocumentProxy | null>(null);
	const pendingRestoreRef = useRef<{ reloadKey: number; snapshot: ScrollSnapshot | null } | null>(
		null,
	);
	const anchorRef = useRef<{ x: number; y: number } | null>(null);
	const scrollLoopRef = useRef<number | null>(null);
	const scrollVelocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

	const resetPageSlots = useCallback(() => {
		pageSlotsRef.current.forEach((slot) => {
			releasePageSlot(slot);
		});
		pageSlotsRef.current = [];
	}, []);

	useEffect(
		() => () => {
			if (scrollLoopRef.current !== null) cancelAnimationFrame(scrollLoopRef.current);
			scrollLoopRef.current = null;
			scrollVelocityRef.current = { x: 0, y: 0 };
		},
		[],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reload処理はキー変化時のみ走らせ、現在の表示状態をスナップショットするため依存を限定
	useEffect(() => {
		let cancelled = false;
		const bustToken = reloadKey + sessionNonce;
		const requestUrl = withCacheBust(url, bustToken);

		if (pdfRef.current) {
			const snapshot = (() => {
				const scrollEl = scrollRef.current;
				if (!pageSize || pageCount === 0 || !scrollEl) return null;
				const layoutScale = zoomMode === "fit-width" ? fitScale : manualScale;
				if (layoutScale <= 0) return null;
				const viewTop = scrollEl.scrollTop;
				const pageBlock = Math.round(pageSize.height * layoutScale) + PAGE_GAP_PX;
				const topPageIndex = Math.min(pageCount - 1, Math.max(0, Math.floor(viewTop / pageBlock)));
				const offsetPx = viewTop - topPageIndex * pageBlock;
				const totalHeight = Math.max(1, pageCount * pageBlock - PAGE_GAP_PX);
				const scrollRatio = Math.min(1, Math.max(0, viewTop / totalHeight));
				return {
					topPageIndex,
					offsetPx,
					zoomMode,
					manualScale,
					scrollRatio,
					pageCount,
				} satisfies ScrollSnapshot;
			})();
			pendingRestoreRef.current = { reloadKey, snapshot };
		}

		setState((prev) => (prev.phase === "ready" ? prev : { phase: "loading" }));
		// Only notify if this looks like a reload (manual or verify), not initial load
		if (reloadKey > 0) {
			onNotify(`${role}: Reloading…`, "info");
		}

		async function loadAndRender() {
			try {
				const loaded = await getDocument({
					url: requestUrl,
					cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
					cMapPacked: true,
					standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
					useSystemFonts: true,
				}).promise;
				if (cancelled) {
					await loaded.destroy();
					return;
				}

				const firstPage = await loaded.getPage(1);
				if (cancelled) {
					await loaded.destroy();
					return;
				}

				const baseViewport = firstPage.getViewport({ scale: 1 });
				const hostHeight = scrollRef.current?.clientHeight || baseViewport.height;
				const nextFitScale = hostHeight / baseViewport.height;
				const restoreSnapshot =
					pendingRestoreRef.current?.reloadKey === reloadKey
						? pendingRestoreRef.current.snapshot
						: null;
				const restoredZoomMode = restoreSnapshot?.zoomMode ?? "fit-width";
				const restoredManualScale = clampScaleValue(
					restoreSnapshot && Number.isFinite(restoreSnapshot.manualScale)
						? restoreSnapshot.manualScale
						: nextFitScale,
				);

				resetPageSlots();
				pdfRef.current?.destroy();

				setPdf(loaded);
				pdfRef.current = loaded;
				setPageCount(loaded.numPages);
				setPageSize({ width: baseViewport.width, height: baseViewport.height });
				setState({ phase: "ready", summary: `Page 1 / ${loaded.numPages}` });
				setFitScale(nextFitScale);
				setManualScale(restoredManualScale);
				setVisibleRange([0, 0]);
				setCurrentPage(
					restoreSnapshot
						? Math.min(loaded.numPages, Math.max(1, restoreSnapshot.topPageIndex + 1))
						: 1,
				);
				setZoomMode(restoredZoomMode);
				setRenderNonce((v) => v + 1);
				manualScaleInitializedRef.current = Boolean(restoreSnapshot);
				onNotify(restoreSnapshot ? `${role}: restored scroll` : `${role}: loaded`, "success");
			} catch (err) {
				if (cancelled) return;
				const detail = err instanceof Error ? err.message : String(err);
				setState((prev) => {
					if (pdfRef.current && prev.phase === "ready") return prev;
					return { phase: "error", detail };
				});
				onNotify(pdfRef.current ? `${role}: reload failed` : `${role}: failed to load`, "error");
			}
		}

		loadAndRender();

		return () => {
			cancelled = true;
		};
	}, [onNotify, reloadKey, resetPageSlots, role, url]);

	useEffect(
		() => () => {
			resetPageSlots();
			pdfRef.current?.destroy();
			if (scrollLoopRef.current !== null) cancelAnimationFrame(scrollLoopRef.current);
			scrollLoopRef.current = null;
			scrollVelocityRef.current = { x: 0, y: 0 };
		},
		[resetPageSlots],
	);

	useEffect(() => {
		if (!pageSize || !scrollRef.current) return;

		const node = scrollRef.current;
		const updateScale = () => {
			const height = node.clientHeight || pageSize.height;
			if (height <= 0) return; // Prevent invalid scale
			const nextFit = height / pageSize.height;
			setFitScale(nextFit);
		};

		updateScale();
		const observer = new ResizeObserver(updateScale);
		observer.observe(node);
		return () => observer.disconnect();
	}, [pageSize]);

	useEffect(() => {
		if (!manualScaleInitializedRef.current && fitScale > 0) {
			setManualScale(fitScale);
			manualScaleInitializedRef.current = true;
		}
	}, [fitScale]);

	const measureVisibility = useCallback(() => {
		const layoutScale = zoomMode === "fit-width" ? fitScale : manualScale;
		const scrollEl = scrollRef.current;
		if (!pageSize || !scrollEl || pageCount === 0) return;
		const viewTop = scrollEl.scrollTop;
		const viewBottom = viewTop + scrollEl.clientHeight;
		const pageBlock = Math.round(pageSize.height * layoutScale) + PAGE_GAP_PX;
		const start = Math.max(0, Math.floor(viewTop / pageBlock) - RENDER_BUFFER);
		const end = Math.min(pageCount - 1, Math.ceil(viewBottom / pageBlock) + RENDER_BUFFER);
		const current = Math.min(pageCount - 1, Math.max(0, Math.floor(viewTop / pageBlock)));

		setVisibleRange((prev) => {
			if (prev[0] === start && prev[1] === end) return prev;
			return [start, end];
		});
		currentPageRef.current = current + 1;
		setCurrentPage(current + 1);
	}, [fitScale, manualScale, pageCount, pageSize, zoomMode]);

	useEffect(() => {
		const scrollEl = scrollRef.current;
		if (!scrollEl) return;
		const handleScroll = () => {
			if (rafId.current) return;
			rafId.current = requestAnimationFrame(() => {
				rafId.current = null;
				measureVisibility();
			});
		};

		scrollEl.addEventListener("scroll", handleScroll, { passive: true });
		window.addEventListener("resize", handleScroll);
		measureVisibility();
		return () => {
			scrollEl.removeEventListener("scroll", handleScroll);
			window.removeEventListener("resize", handleScroll);
			if (rafId.current) cancelAnimationFrame(rafId.current);
		};
	}, [measureVisibility]);

	useEffect(() => {
		void renderNonce; // Ensure effect runs when renderNonce changes
		const pending = pendingRestoreRef.current;
		if (
			!pending ||
			pending.reloadKey !== reloadKey ||
			state.phase !== "ready" ||
			!pageSize ||
			pageCount === 0
		) {
			return;
		}

		const snapshot = pending.snapshot;
		const layoutScale = zoomMode === "fit-width" ? fitScale : manualScale;
		const scrollEl = scrollRef.current;
		if (!scrollEl || layoutScale <= 0) return;

		const pageBlock = Math.round(pageSize.height * layoutScale) + PAGE_GAP_PX;
		const totalHeight = Math.max(0, pageCount * pageBlock - PAGE_GAP_PX);
		const ratio = snapshot ? Math.min(1, Math.max(0, snapshot.scrollRatio)) : 0;
		const pageCountDropped = snapshot ? snapshot.pageCount > pageCount : false;

		let targetTop: number;
		if (snapshot && !pageCountDropped && snapshot.topPageIndex < pageCount) {
			const clampedOffset = Math.min(Math.max(snapshot.offsetPx, 0), pageBlock);
			targetTop = snapshot.topPageIndex * pageBlock + clampedOffset;
		} else {
			targetTop = Math.min(totalHeight, Math.max(0, Math.round(totalHeight * ratio)));
		}

		scrollEl.scrollTo({ top: targetTop, behavior: "auto" });
		pendingRestoreRef.current = null;

		requestAnimationFrame(() => {
			measureVisibility();
		});
	}, [
		fitScale,
		manualScale,
		measureVisibility,
		pageCount,
		pageSize,
		reloadKey,
		state.phase,
		zoomMode,
		renderNonce,
	]);

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
					canvas,
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
		void renderNonce;
		const layoutScale = zoomMode === "fit-width" ? fitScale : manualScale;
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
			const outsideBuffer =
				index < visibleRange[0] - RENDER_BUFFER || index > visibleRange[1] + RENDER_BUFFER;
			if (outsideBuffer) {
				releasePageSlot(slot);
			} else if (slot?.renderTask && (index < visibleRange[0] || index > visibleRange[1])) {
				slot.renderTask.cancel();
				slot.renderTask = null;
				slot.renderedScale = null;
			}
		});
	}, [
		fitScale,
		manualScale,
		pageCount,
		pageSize,
		pdf,
		renderNonce,
		renderPage,
		visibleRange,
		zoomMode,
	]);

	useEffect(() => {
		if (state.phase !== "ready" || pageCount === 0) return;
		// Status update for page number could go here if we had a persistent status bar
	}, [pageCount, state.phase]);

	const layoutScale = useMemo(
		() => (zoomMode === "fit-width" ? fitScale : manualScale),
		[fitScale, manualScale, zoomMode],
	);

	const announceZoom = useCallback(
		(_nextScale: number, _mode: ZoomMode) => {
			// Optional: could toast on zoom, but acts as noise. Keeping silent for now.
			// const percent = Math.round(nextScale * 100);
			// onNotify(`${role}: zoom ${percent}%`, "info");
		},
		[], // removed onNotify dependency
	);

	const zoomIn = useCallback(() => {
		if (!pageSize) return;
		const layoutScale = zoomMode === "fit-width" ? fitScale : manualScale;
		const scrollEl = scrollRef.current;
		if (scrollEl && pageCount > 0) {
			const pageBlock = Math.round(pageSize.height * layoutScale) + PAGE_GAP_PX;
			const totalHeight = Math.max(1, pageCount * pageBlock - PAGE_GAP_PX);
			const totalWidth = Math.max(1, pageSize.width * layoutScale);
			const centerY = scrollEl.scrollTop + scrollEl.clientHeight / 2;
			const centerX = scrollEl.scrollLeft + scrollEl.clientWidth / 2;
			anchorRef.current = {
				x: Math.min(1, Math.max(0, centerX / totalWidth)),
				y: Math.min(1, Math.max(0, centerY / totalHeight)),
			};
		}
		let nextScale = manualScale;
		setManualScale((prev) => {
			const base = zoomMode === "fit-width" ? fitScale : prev;
			const next = clampScaleValue(base * ZOOM_STEP);
			nextScale = next;
			return next;
		});
		setZoomMode("manual");
		announceZoom(nextScale, "manual");
	}, [announceZoom, fitScale, manualScale, pageCount, pageSize, zoomMode]);

	const zoomOut = useCallback(() => {
		if (!pageSize) return;
		const layoutScale = zoomMode === "fit-width" ? fitScale : manualScale;
		const scrollEl = scrollRef.current;
		if (scrollEl && pageCount > 0) {
			const pageBlock = Math.round(pageSize.height * layoutScale) + PAGE_GAP_PX;
			const totalHeight = Math.max(1, pageCount * pageBlock - PAGE_GAP_PX);
			const totalWidth = Math.max(1, pageSize.width * layoutScale);
			const centerY = scrollEl.scrollTop + scrollEl.clientHeight / 2;
			const centerX = scrollEl.scrollLeft + scrollEl.clientWidth / 2;
			anchorRef.current = {
				x: Math.min(1, Math.max(0, centerX / totalWidth)),
				y: Math.min(1, Math.max(0, centerY / totalHeight)),
			};
		}
		let nextScale = manualScale;
		setManualScale((prev) => {
			const base = zoomMode === "fit-width" ? fitScale : prev;
			const next = clampScaleValue(base / ZOOM_STEP);
			nextScale = next;
			return next;
		});
		setZoomMode("manual");
		announceZoom(nextScale, "manual");
	}, [announceZoom, fitScale, manualScale, pageCount, pageSize, zoomMode]);

	const fitToWidth = useCallback(() => {
		if (!pageSize) return;
		const layoutScale = zoomMode === "fit-width" ? fitScale : manualScale;
		const scrollEl = scrollRef.current;
		if (scrollEl && pageCount > 0) {
			const pageBlock = Math.round(pageSize.height * layoutScale) + PAGE_GAP_PX;
			const totalHeight = Math.max(1, pageCount * pageBlock - PAGE_GAP_PX);
			const totalWidth = Math.max(1, pageSize.width * layoutScale);
			const centerY = scrollEl.scrollTop + scrollEl.clientHeight / 2;
			const centerX = scrollEl.scrollLeft + scrollEl.clientWidth / 2;
			anchorRef.current = {
				x: Math.min(1, Math.max(0, centerX / totalWidth)),
				y: Math.min(1, Math.max(0, centerY / totalHeight)),
			};
		}
		setZoomMode("fit-width");
		announceZoom(fitScale, "fit-width");
	}, [announceZoom, fitScale, manualScale, pageCount, pageSize, zoomMode]);

	const scrollLine = useCallback((deltaPx: number) => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollBy({ top: deltaPx, behavior: "smooth" });
	}, []);

	const scrollHalfPage = useCallback((direction: 1 | -1) => {
		const el = scrollRef.current;
		if (!el) return;
		const amount = Math.max(1, el.clientHeight / 2);
		el.scrollBy({ top: direction * amount, behavior: "smooth" });
	}, []);

	const scrollHorizontal = useCallback((deltaPx: number) => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollBy({ left: deltaPx, behavior: "smooth" });
	}, []);

	const stopContinuousScroll = useCallback(() => {
		scrollVelocityRef.current = { x: 0, y: 0 };
	}, []);

	const continuousScrollStep = useCallback(() => {
		const el = scrollRef.current;
		if (!el) {
			scrollLoopRef.current = null;
			return;
		}
		const { x, y } = scrollVelocityRef.current;
		if (x === 0 && y === 0) {
			scrollLoopRef.current = null;
			return;
		}
		el.scrollBy({ left: x, top: y, behavior: "auto" });
		scrollLoopRef.current = requestAnimationFrame(continuousScrollStep);
	}, []);

	const startContinuousScroll = useCallback(
		(vx: number, vy: number) => {
			scrollVelocityRef.current = { x: vx, y: vy };
			if (scrollLoopRef.current === null) {
				scrollLoopRef.current = requestAnimationFrame(continuousScrollStep);
			}
		},
		[continuousScrollStep],
	);

	const jumpToTop = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		el.scrollTo({ top: 0, behavior: "smooth" });
	}, []);

	const jumpToBottom = useCallback(() => {
		const el = scrollRef.current;
		if (!pageSize || pageCount === 0 || !el) return;
		const pageBlock = Math.round(pageSize.height * layoutScale) + PAGE_GAP_PX;
		const totalHeight = pageCount * pageBlock - PAGE_GAP_PX;
		el.scrollTo({
			top: Math.max(0, totalHeight - el.clientHeight + PAGE_GAP_PX),
			behavior: "smooth",
		});
	}, [layoutScale, pageCount, pageSize]);

	const jumpByPages = useCallback(
		(delta: number) => {
			const el = scrollRef.current;
			if (!pageSize || pageCount === 0 || !el) return;
			const targetIndex = Math.min(pageCount - 1, Math.max(0, currentPageRef.current - 1 + delta));
			const pageBlock = Math.round(pageSize.height * layoutScale) + PAGE_GAP_PX;
			const offset = targetIndex * pageBlock;
			el.scrollTo({ top: offset, behavior: "smooth" });
		},
		[layoutScale, pageCount, pageSize],
	);

	useEffect(() => {
		const anchor = anchorRef.current;
		const el = scrollRef.current;
		if (!anchor || !el || !pageSize || pageCount === 0) return;

		const pageBlock = Math.round(pageSize.height * layoutScale) + PAGE_GAP_PX;
		const totalHeight = Math.max(1, pageCount * pageBlock - PAGE_GAP_PX);
		const totalWidth = Math.max(1, pageSize.width * layoutScale);
		const nextTop = Math.max(0, anchor.y * totalHeight - el.clientHeight / 2);
		const nextLeft = Math.max(0, anchor.x * totalWidth - el.clientWidth / 2);
		el.scrollTo({ top: nextTop, left: nextLeft, behavior: "auto" });
		anchorRef.current = null;
		requestAnimationFrame(() => measureVisibility());
	}, [layoutScale, measureVisibility, pageCount, pageSize]);

	useImperativeHandle(
		ref,
		() => ({
			scrollLine,
			scrollHalfPage,
			scrollHorizontal,
			startContinuousScroll,
			stopContinuousScroll,
			jumpToTop,
			jumpToBottom,
			jumpByPages,
			zoomIn,
			zoomOut,
			fitToWidth,
			rerender: () => {
				resetPageSlots();
				setRenderNonce((v) => v + 1);
				onNotify(`${role}: re-rendering`, "info");
			},
			getSnapshot: () => {
				const scrollEl = scrollRef.current;
				if (!pageSize || pageCount === 0 || !scrollEl) return null;
				const layoutScale = zoomMode === "fit-width" ? fitScale : manualScale;
				if (layoutScale <= 0) return null;
				const viewTop = scrollEl.scrollTop;
				const pageBlock = Math.round(pageSize.height * layoutScale) + PAGE_GAP_PX;
				const topPageIndex = Math.min(pageCount - 1, Math.max(0, Math.floor(viewTop / pageBlock)));
				const offsetPx = viewTop - topPageIndex * pageBlock;
				const totalHeight = Math.max(1, pageCount * pageBlock - PAGE_GAP_PX);
				const scrollRatio = Math.min(1, Math.max(0, viewTop / totalHeight));
				return {
					topPageIndex,
					offsetPx,
					zoomMode,
					manualScale,
					scrollRatio,
					pageCount,
				} satisfies ScrollSnapshot;
			},
			restoreSnapshot: (snapshot: ScrollSnapshot) => {
				pendingRestoreRef.current = { reloadKey, snapshot };
				// Trigger re-measure/re-scroll logic
				setRenderNonce((v) => v + 1);
				requestAnimationFrame(() => measureVisibility());
			},
		}),
		[
			fitToWidth,
			jumpByPages,
			jumpToBottom,
			jumpToTop,
			onNotify,
			resetPageSlots,
			scrollHalfPage,
			scrollHorizontal,
			startContinuousScroll,
			stopContinuousScroll,
			scrollLine,
			zoomIn,
			zoomOut,
			role,
			// Snapshot dependencies
			zoomMode,
			fitScale,
			manualScale,
			pageCount,
			pageSize,
			reloadKey,
			measureVisibility,
			// scrollRef is static but let's include it if linter wants
			// scrollRef // actually ref objects are stable, linter usually knows.
			// But diagnostics complained about lines 662 which used scrollRef.current
			// Diagnostics for lines 684-699 complained about zoomMode, fitScale, manualScale, pageCount, pageSize.
		],
	);

	const displayWidth = pageSize ? Math.round(pageSize.width * layoutScale) : null;
	const placeholderHeight = pageSize ? Math.round(pageSize.height * layoutScale) : null;
	const listStyle = { gap: `${PAGE_GAP_PX}px` };

	return (
		<div
			className="relative flex h-full w-full flex-col overflow-hidden bg-slate-900/30"
			ref={containerRef}
		>
			{/* Floating Page Indicator */}
			<div className="absolute bottom-6 right-6 z-10 select-none rounded-full border border-slate-700/50 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-200 shadow-lg backdrop-blur transition-opacity duration-300 hover:opacity-100 opacity-60">
				Page {currentPage} <span className="text-slate-500">/</span> {pageCount}
			</div>

			<div
				ref={scrollRef}
				className="flex-1 w-full overflow-auto scrollbar-hide overscroll-none"
				style={{
					...listStyle,
				}}
			>
				<div
					className="mx-auto flex flex-col items-center py-4"
					style={{
						...listStyle,
						width: displayWidth ? `${displayWidth}px` : "100%",
						minWidth: displayWidth ? `${displayWidth}px` : "100%",
					}}
				>
					{pageCount === 0 || !pageSize ? (
						<div className="rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-10 text-center text-sm text-slate-300">
							Loading {role} PDF…
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
								<div key={`page-${index + 1}`} className="flex flex-col items-center gap-2">
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
										className="relative overflow-visible bg-slate-950/60 shadow-lg"
										style={{
											margin: "0 auto",
											height: placeholderHeight
												? `${placeholderHeight}px`
												: `${Math.round(pageSize.height * layoutScale)}px`,
											width: displayWidth ? `${displayWidth}px` : "auto",
											minWidth: displayWidth ? `${displayWidth}px` : "auto",
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
											aria-label={`${role} PDF page ${index + 1}`}
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
});

function HelpOverlay({ onClose }: { onClose: () => void }) {
	return (
		<div
			className="fixed inset-0 z-30 grid place-items-center bg-slate-950/70 px-4"
			role="dialog"
			aria-modal="true"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape" || e.key === "Enter" || e.key === " ") onClose();
			}}
			tabIndex={-1}
			aria-label="Help overlay"
		>
			<div
				className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/90 p-5 shadow-2xl"
				role="dialog"
				aria-modal="true"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					e.stopPropagation();
					if (e.key === "Escape" || e.key === "Enter" || e.key === " ") onClose();
				}}
			>
				<header className="mb-3">
					<p className="text-xs uppercase tracking-[0.2em] text-slate-400">Guide</p>
					<h3 className="text-lg font-semibold text-slate-50">Keybindings</h3>
				</header>
				<div className="mb-4 grid grid-cols-1 gap-3 text-sm text-slate-200">
					<div>
						<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
							Navigation
						</p>
						<ul className="list-disc space-y-1 pl-5">
							<li>`j` / `k` — scroll down / up</li>
							<li>`h` / `l` — scroll left / right</li>
							<li>`d` / `u` — half-page down / up</li>
							<li>`gg` — top, `G` — bottom</li>
							<li>`n` / `p` — next / previous page</li>
						</ul>
					</div>
					<div>
						<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
							Zoom
						</p>
						<ul className="list-disc space-y-1 pl-5">
							<li>`+` / `-` — zoom in / out</li>
							<li>`=` — fit to width</li>
						</ul>
					</div>
					<div>
						<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
							Panes
						</p>
						<ul className="list-disc space-y-1 pl-5">
							<li>`Tab` — toggle focus (MAIN ↔ SUB)</li>
							<li>`s` — swap pane positions</li>
						</ul>
					</div>
					<div>
						<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
							Reload / misc
						</p>
						<ul className="list-disc space-y-1 pl-5">
							<li>`r` — reload MAIN</li>
							<li>`R` — reload MAIN (re-render SUB)</li>
							<li>`?` — toggle this overlay</li>
							<li>`q` — quit (close tab)</li>
						</ul>
					</div>
				</div>
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
	const [hasMain, setHasMain] = useState(false);
	const [hasSub, setHasSub] = useState(false);
	const [watchEnabled, setWatchEnabled] = useState(true);
	const [focusedPane, setFocusedPane] = useState<"main" | "sub">("main");
	const [paneOrder, setPaneOrder] = useState<"main-first" | "sub-first">("main-first");
	const [toasts, setToasts] = useState<ToastMessage[]>([]);
	const [mainReloadKey, setMainReloadKey] = useState(0);
	const [subReloadKey, setSubReloadKey] = useState(0);
	const [showHelp, setShowHelp] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const [keysEnabled, setKeysEnabled] = useState(true);
	const mainViewerRef = useRef<ViewerHandle | null>(null);
	const subViewerRef = useRef<ViewerHandle | null>(null);
	const keySeqTimeoutRef = useRef<number | null>(null);
	const lastKeyRef = useRef<string | null>(null);
	const hasSubRef = useRef(hasSub);
	const focusedPaneRef = useRef<"main" | "sub">(focusedPane);
	const showHelpRef = useRef(showHelp);

	const keysEnabledRef = useRef(keysEnabled);
	const swapSnapshotsRef = useRef<{
		main: ScrollSnapshot | null;
		sub: ScrollSnapshot | null;
	} | null>(null);

	const addToast = useCallback((message: string, type: ToastType = "info") => {
		const id = Math.random().toString(36).substring(2, 9);
		setToasts((prev) => [...prev, { id, message, type }]);
	}, []);

	const removeToast = useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const swapPanes = useCallback(() => {
		if (!hasSubRef.current) {
			addToast("Cannot swap without SUB", "error");
			return false;
		}
		// Capture snapshots before state update triggers re-render/layout
		const mainSnap = mainViewerRef.current?.getSnapshot() ?? null;
		const subSnap = subViewerRef.current?.getSnapshot() ?? null;
		swapSnapshotsRef.current = { main: mainSnap, sub: subSnap };

		setPaneOrder((prev) => (prev === "main-first" ? "sub-first" : "main-first"));
		addToast("Swapped MAIN/SUB order", "info");
		return true;
	}, [addToast]);

	// Restore snapshots after layout change (swap)
	useEffect(() => {
		void paneOrder; // Ensure effect runs on order change
		const snaps = swapSnapshotsRef.current;
		if (!snaps) return;

		// Use requestAnimationFrame to ensure layout has settled?
		// Actually useEffect fires after paint, so refs should be attached to new locations.
		const main = mainViewerRef.current;
		const sub = subViewerRef.current;

		if (main && snaps.main) main.restoreSnapshot(snaps.main);
		if (sub && snaps.sub) sub.restoreSnapshot(snaps.sub);

		swapSnapshotsRef.current = null;
	}, [paneOrder]);

	useEffect(() => {
		hasSubRef.current = hasSub;
	}, [hasSub]);
	useEffect(() => {
		focusedPaneRef.current = focusedPane;
	}, [focusedPane]);
	useEffect(() => {
		showHelpRef.current = showHelp;
	}, [showHelp]);
	useEffect(() => {
		keysEnabledRef.current = keysEnabled;
	}, [keysEnabled]);

	useEffect(() => {
		let aborted = false;
		async function loadBootstrap() {
			try {
				const res = await fetch("/api/bootstrap", { cache: "no-store" });
				if (!res.ok) throw new Error(`status ${res.status}`);
				const data: {
					focus: "main" | "sub";
					hasMain: boolean;
					hasSub: boolean;
					watch: boolean;
				} = await res.json();
				if (aborted) return;
				setHasMain(data.hasMain);
				setHasSub(data.hasSub);
				setWatchEnabled(data.watch);
				setFocusedPane(data.focus === "sub" && data.hasSub ? "sub" : "main");
			} catch (_err) {
				if (aborted) return;
				setHasMain(false);
				setHasSub(false);
				setWatchEnabled(true);
				setFocusedPane("main");
				addToast("Failed to fetch bootstrap info", "error");
			}
		}

		loadBootstrap();
		return () => {
			aborted = true;
		};
	}, [addToast]);

	useEffect(() => {
		if (!watchEnabled || !hasMain) return;
		const source = new EventSource("/events");
		const handleChange = () => {
			setMainReloadKey((v) => v + 1);
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
	}, [addToast, hasMain, watchEnabled]);

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
			addToast("SUB: Loaded " + file.name, "success");
		} catch (err) {
			console.error(err);
			addToast("SUB: Upload failed", "error");
		}
	};

	useEffect(() => {
		const clearSequence = () => {
			if (keySeqTimeoutRef.current) {
				window.clearTimeout(keySeqTimeoutRef.current);
				keySeqTimeoutRef.current = null;
			}
			lastKeyRef.current = null;
		};

		const scheduleSequenceClear = () => {
			if (keySeqTimeoutRef.current) window.clearTimeout(keySeqTimeoutRef.current);
			keySeqTimeoutRef.current = window.setTimeout(() => {
				lastKeyRef.current = null;
				keySeqTimeoutRef.current = null;
			}, 600);
		};

		const handleKey = (event: KeyboardEvent) => {
			if (!keysEnabledRef.current) return;
			const target = event.target as HTMLElement | null;
			const tag = target?.tagName?.toLowerCase();
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable)
				return;

			const keyLower = event.key?.toLowerCase?.() ?? "";
			const codeLower = event.code?.toLowerCase?.() ?? "";

			const consume = () => {
				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();
			};

			// const targetRole: ViewerRole =
			// 	focusedPaneRef.current === "sub" && hasSubRef.current ? "SUB" : "MAIN";
			const targetViewer =
				focusedPaneRef.current === "sub" && hasSubRef.current
					? subViewerRef.current
					: mainViewerRef.current;

			// multi-key: gg
			if (event.key === "g") {
				if (lastKeyRef.current === "g") {
					consume();
					clearSequence();
					targetViewer?.jumpToTop();
					// announce(`${targetRole}: jump to top`);
					return;
				}
				lastKeyRef.current = "g";
				scheduleSequenceClear();
				return;
			}
			clearSequence();

			if (codeLower === "keys" || keyLower === "s") {
				consume();
				if (event.repeat) return;
				swapPanes();
				return;
			}
			switch (event.key) {
				case "j":
					consume();
					if (event.repeat) {
						targetViewer?.startContinuousScroll(0, CONT_SCROLL_PER_FRAME);
					} else {
						targetViewer?.scrollLine(LINE_SCROLL_PX);
					}
					// announce(`${targetRole}: scroll down`);
					return;
				case "k":
					consume();
					if (event.repeat) {
						targetViewer?.startContinuousScroll(0, -CONT_SCROLL_PER_FRAME);
					} else {
						targetViewer?.scrollLine(-LINE_SCROLL_PX);
					}
					// announce(`${targetRole}: scroll up`);
					return;
				case "h":
					consume();
					if (event.repeat) {
						targetViewer?.startContinuousScroll(-CONT_SCROLL_PER_FRAME, 0);
					} else {
						targetViewer?.scrollHorizontal(-LINE_SCROLL_PX);
					}
					// announce(`${targetRole}: scroll left`);
					return;
				case "l":
					consume();
					if (event.repeat) {
						targetViewer?.startContinuousScroll(CONT_SCROLL_PER_FRAME, 0);
					} else {
						targetViewer?.scrollHorizontal(LINE_SCROLL_PX);
					}
					// announce(`${targetRole}: scroll right`);
					return;
				case "d":
					consume();
					if (event.repeat) {
						targetViewer?.startContinuousScroll(0, CONT_SCROLL_FAST);
					} else {
						targetViewer?.scrollHalfPage(1);
					}
					// announce(`${targetRole}: half-page down`);
					return;
				case "u":
					consume();
					if (event.repeat) {
						targetViewer?.startContinuousScroll(0, -CONT_SCROLL_FAST);
					} else {
						targetViewer?.scrollHalfPage(-1);
					}
					// announce(`${targetRole}: half-page up`);
					return;
				case "G":
					consume();
					targetViewer?.jumpToBottom();
					// announce(`${targetRole}: jump to bottom`);
					return;
				case "n":
					consume();
					targetViewer?.jumpByPages(1);
					// announce(`${targetRole}: next page`);
					return;
				case "p":
					consume();
					targetViewer?.jumpByPages(-1);
					// announce(`${targetRole}: previous page`);
					return;
				case "+":
					consume();
					targetViewer?.zoomIn();
					return;
				case "-":
					consume();
					targetViewer?.zoomOut();
					return;
				case "=":
					consume();
					targetViewer?.fitToWidth();
					return;
				case "Tab":
					consume();
					if (hasSubRef.current) {
						setFocusedPane((prev) => (prev === "main" ? "sub" : "main"));
					} else {
						setFocusedPane("main");
					}
					return;
				case "r":
					consume();
					setMainReloadKey((v) => v + 1);
					setFocusedPane("main");
					addToast("MAIN: reloading…", "info");
					return;
				case "R":
					consume();
					setMainReloadKey((v) => v + 1);
					if (hasSubRef.current) {
						subViewerRef.current?.rerender();
					}
					setFocusedPane("main");
					addToast(hasSubRef.current ? "MAIN: reload (re-render SUB)" : "MAIN: reloading…", "info");
					return;
				case "?":
					consume();
					setShowHelp((open) => !open);
					// announce("Toggled help");
					return;
				case "q":
					consume();
					if (showHelpRef.current) {
						setShowHelp(false);
						// announce("Help closed");
					} else {
						addToast("Close the tab to quit", "info");
					}
					return;
				default:
					return;
			}
		};

		window.addEventListener("keydown", handleKey, { capture: true });
		const handleKeyUp = (event: KeyboardEvent) => {
			if (!keysEnabledRef.current) return;
			if (["j", "k", "h", "l", "d", "u"].includes(event.key)) {
				const targetViewer =
					focusedPaneRef.current === "sub" && hasSubRef.current
						? subViewerRef.current
						: mainViewerRef.current;
				targetViewer?.stopContinuousScroll();
			}
		};
		window.addEventListener("keyup", handleKeyUp);
		return () => {
			window.removeEventListener("keydown", handleKey);
			window.removeEventListener("keyup", handleKeyUp);
			if (keySeqTimeoutRef.current) window.clearTimeout(keySeqTimeoutRef.current);
		};
	}, [addToast, swapPanes]);

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
						key={subReloadKey}
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
			<div className="flex-none p-2 border-b border-slate-800 bg-slate-900/50 backdrop-blur flex items-center justify-between">
				<h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-accent to-brand bg-clip-text text-transparent px-2">
					ZView
				</h1>
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="rounded-lg border border-slate-700/70 bg-slate-900/90 px-3 py-2 text-sm font-semibold text-slate-100 shadow-glow hover:border-brand/70"
						onClick={() => setMenuOpen((v) => !v)}
						aria-expanded={menuOpen}
						aria-label="Toggle menu"
					>
						☰
					</button>
				</div>
			</div>

			{menuOpen ? (
				<>
					<button
						type="button"
						className="fixed inset-0 z-20 bg-slate-950/60 backdrop-blur-sm"
						onClick={() => setMenuOpen(false)}
						onKeyDown={(e) => {
							if (e.key === "Escape" || e.key === "Enter" || e.key === " ") setMenuOpen(false);
						}}
						aria-label="Close menu"
					/>
					<aside className="fixed right-4 top-16 z-30 flex h-[calc(100vh-5rem)] w-72 flex-col gap-3 overflow-auto rounded-xl border border-slate-800/70 bg-slate-950/95 p-3 shadow-2xl scrollbar-hide">
						<div className="flex items-center gap-3">
							<div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand to-accent text-sm font-bold uppercase text-slate-950">
								zv
							</div>
							<div className="flex flex-col leading-tight">
								<span className="text-sm font-semibold tracking-wide text-slate-50">zview</span>
								<span className="text-xs text-slate-400">fast, read-only PDF viewer</span>
							</div>
						</div>
						<nav className="grid grid-cols-1 gap-2" aria-label="Primary actions">
							{toolbarActions.map(({ key, label, hint }) => (
								<button
									key={key}
									type="button"
									onClick={() => {
										handleAction(key);
										setMenuOpen(false);
									}}
									className="glass flex flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-100 transition hover:-translate-y-0.5 hover:border-brand/70 hover:text-slate-50"
								>
									<span>{label}</span>
									<small className="text-xs font-normal text-slate-300">{hint}</small>
								</button>
							))}
						</nav>
						<div className="flex flex-col gap-2 text-xs text-slate-200">
							<div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-2">
								<span>Keybinds</span>
								<label className="flex items-center gap-1">
									<input
										type="checkbox"
										checked={keysEnabled}
										onChange={(e) => setKeysEnabled(e.target.checked)}
									/>
									<span>{keysEnabled ? "ON" : "OFF"}</span>
								</label>
							</div>
						</div>
					</aside>
				</>
			) : null}

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

function Pane({
	children,
	focused,
	paneRole,
	status,
	onFocus,
}: {
	children: React.ReactNode;
	focused: boolean;
	paneRole: "MAIN" | "SUB";
	status: string;
	onFocus: () => void;
}) {
	return (
		<button
			type="button"
			className={classNames(
				"w-full text-left relative flex h-full flex-col transition-all duration-200",
				focused
					? "bg-slate-900/30 z-10"
					: "bg-transparent opacity-60 hover:opacity-80 scale-[0.99]",
			)}
			onClick={onFocus}
		>
			{/* Pane Header Overlay */}
			<div
				className={classNames(
					"absolute top-4 left-6 z-20 flex items-center gap-2 pointer-events-none transition-opacity duration-200",
					focused ? "opacity-100" : "opacity-40",
				)}
			>
				<div
					className={classNames(
						"px-2 py-0.5 rounded text-xs font-bold shadow-sm backdrop-blur border border-white/5",
						paneRole === "MAIN" ? "bg-brand/80 text-white" : "bg-fuchsia-600/80 text-white",
					)}
				>
					{paneRole}
				</div>
				{status === "watching" && (
					<div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 backdrop-blur">
						<span className="relative flex h-1.5 w-1.5">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
							<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
						</span>
						<span className="text-[10px] font-bold text-emerald-400 tracking-wide">LIVE</span>
					</div>
				)}
			</div>

			{/* Content Container */}
			<div
				className={classNames(
					"flex-1 w-full h-full min-h-0 relative rounded-none",
					focused && "ring-1 ring-inset ring-brand/30",
				)}
			>
				{children}
			</div>
		</button>
	);
}
