import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
	forwardRef,
	type FormEvent,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	DPR_CAP,
	PAGE_GAP_PX,
	PAGE_SCROLL_RATIO,
	PDFJS_ASSET_BASE,
	RENDER_BUFFER,
	ZOOM_STEP,
} from "../../lib/constants";
import type {
	PageSlotRef,
	PdfViewerState,
	ScrollSnapshot,
	ToastType,
	ViewerHandle,
	ViewerRole,
	ZoomMode,
} from "../../lib/types";
import { clampScaleValue, withCacheBust } from "../../lib/utils";
import { PageSlot, type PageOverlay } from "./PageSlot";
import "./textLayer.css";
import { TextLayerOverlay } from "./TextLayerOverlay";

GlobalWorkerOptions.workerSrc = workerSrc;

const PASSWORD_REASON_NEED = 1;
const PASSWORD_REASON_INCORRECT = 2;

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

interface PdfViewerProps {
	paneRole: ViewerRole;
	status?: string;
	focused?: boolean;
	url: string;
	onNotify: (message: string, type: ToastType) => void;
	onFocus?: () => void;
	reloadKey?: number;
	initialSnapshot?: ScrollSnapshot | null;
	overlays?: readonly PageOverlay[];
}

type PasswordPromptState = {
	reason: "required" | "incorrect";
};

export const PdfViewer = forwardRef<ViewerHandle, PdfViewerProps>(function PdfViewer(
	{ paneRole, url, onNotify, reloadKey = 0, initialSnapshot, overlays },
	ref,
) {
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
	const loadingTaskRef = useRef<ReturnType<typeof getDocument> | null>(null);
	const passwordResolverRef = useRef<((password: string) => void) | null>(null);
	const passwordCacheRef = useRef<string | null>(null);
	const passwordAttemptRef = useRef<string | null>(null);
	const abortReasonRef = useRef<"password-cancel" | "reload" | null>(null);
	const pendingRestoreRef = useRef<{ reloadKey: number; snapshot: ScrollSnapshot | null } | null>(
		null,
	);
	const anchorRef = useRef<{ x: number; y: number } | null>(null);
	const scrollLoopRef = useRef<number | null>(null);
	const scrollVelocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
	const loadedKeyRef = useRef(-1);
	const [passwordPrompt, setPasswordPrompt] = useState<PasswordPromptState | null>(null);
	const [passwordInput, setPasswordInput] = useState("");
	const passwordInputRef = useRef<HTMLInputElement | null>(null);

	const resetPageSlots = useCallback(() => {
		pageSlotsRef.current.forEach((slot) => {
			releasePageSlot(slot);
		});
		pageSlotsRef.current = [];
	}, []);

	const registerContainer = useCallback((index: number, node: HTMLDivElement | null) => {
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
	}, []);

	const registerCanvas = useCallback((index: number, node: HTMLCanvasElement | null) => {
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
		let activeLoadingTask: ReturnType<typeof getDocument> | null = null;
		const bustToken = reloadKey + sessionNonce;
		const requestUrl = withCacheBust(url, bustToken);

		setPasswordPrompt(null);
		setPasswordInput("");
		passwordResolverRef.current = null;
		passwordAttemptRef.current = null;
		abortReasonRef.current = null;

		if (initialSnapshot) {
			pendingRestoreRef.current = { reloadKey, snapshot: initialSnapshot };
		} else if (pdfRef.current) {
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

		setState({ phase: "loading" });
		// Only notify if this looks like a reload (manual or verify), not initial load
		if (reloadKey > 0) {
			onNotify(`${role}: Reloading…`, "info");
		}

		async function loadAndRender() {
			try {
				const loadingTask = getDocument({
					url: requestUrl,
					cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
					cMapPacked: true,
					standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
					useSystemFonts: true,
					password: passwordCacheRef.current ?? undefined,
				});
				activeLoadingTask = loadingTask;
				loadingTaskRef.current = loadingTask;
				loadingTask.onPassword = (updatePassword, reason) => {
					if (cancelled) return;
					const promptReason =
						reason === PASSWORD_REASON_INCORRECT
							? "incorrect"
							: reason === PASSWORD_REASON_NEED
								? "required"
								: "required";
					setPasswordPrompt({ reason: promptReason });
					setPasswordInput("");
					passwordResolverRef.current = (password) => updatePassword(password);
					if (promptReason === "required") {
						onNotify(`${role}: password required`, "info");
					}
				};

				const loaded = await loadingTask.promise;
				if (cancelled) {
					await loaded.destroy();
					return;
				}
				passwordCacheRef.current = passwordAttemptRef.current ?? passwordCacheRef.current;
				passwordAttemptRef.current = null;
				setPasswordPrompt(null);
				setPasswordInput("");
				passwordResolverRef.current = null;

				const firstPage = await loaded.getPage(1);
				if (cancelled) {
					await loaded.destroy();
					return;
				}

				const baseViewport = firstPage.getViewport({ scale: 1 });
				const hostWidth = scrollRef.current?.clientWidth || baseViewport.width;
				const nextFitScale = hostWidth / baseViewport.width;
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
				loadedKeyRef.current = reloadKey;
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
				if (abortReasonRef.current) {
					abortReasonRef.current = null;
					return;
				}
				const detail = err instanceof Error ? err.message : String(err);
				setState((prev) => {
					if (pdfRef.current && prev.phase === "ready") return prev;
					return { phase: "error", detail };
				});
				onNotify(pdfRef.current ? `${role}: reload failed` : `${role}: failed to load`, "error");
			} finally {
				if (activeLoadingTask && loadingTaskRef.current === activeLoadingTask) {
					loadingTaskRef.current = null;
				}
			}
		}

		loadAndRender();

		return () => {
			cancelled = true;
			if (activeLoadingTask && loadingTaskRef.current === activeLoadingTask) {
				abortReasonRef.current = "reload";
				loadingTaskRef.current.destroy();
				loadingTaskRef.current = null;
			}
		};
	}, [onNotify, reloadKey, resetPageSlots, role, url]);

	useEffect(() => {
		if (passwordPrompt) {
			passwordInputRef.current?.focus();
		}
	}, [passwordPrompt]);

	const handlePasswordSubmit = useCallback(
		(event: FormEvent) => {
			event.preventDefault();
			const resolver = passwordResolverRef.current;
			if (!resolver) return;
			passwordAttemptRef.current = passwordInput;
			setPasswordPrompt(null);
			setPasswordInput("");
			passwordResolverRef.current = null;
			resolver(passwordInput);
		},
		[passwordInput],
	);

	const handlePasswordCancel = useCallback(() => {
		setPasswordPrompt(null);
		setPasswordInput("");
		passwordResolverRef.current = null;
		passwordAttemptRef.current = null;
		if (loadingTaskRef.current) {
			abortReasonRef.current = "password-cancel";
			loadingTaskRef.current.destroy();
			loadingTaskRef.current = null;
		}
		if (!pdfRef.current) {
			setState({ phase: "error", detail: "Password entry cancelled" });
		}
		onNotify(`${role}: password entry cancelled`, "warning");
	}, [onNotify, role]);

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
			const width = node.clientWidth || pageSize.width;
			if (width <= 0) return; // Prevent invalid scale
			const nextFit = width / pageSize.width;
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
			loadedKeyRef.current !== reloadKey ||
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
				const viewport = page.getViewport({ scale: displayScale });
				const context = canvas.getContext("2d");
				if (!context) return;

				slot.renderTask?.cancel();
				slot.renderedScale = null;
				canvas.width = Math.floor(viewport.width * outputScale);
				canvas.height = Math.floor(viewport.height * outputScale);
				canvas.style.width = `${Math.floor(viewport.width)}px`;
				canvas.style.height = `${Math.floor(viewport.height)}px`;
				canvas.style.backgroundColor = "#0f172a";

				slot.renderTask = page.render({
					canvasContext: context,
					canvas,
					viewport,
					transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
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

	const combinedOverlays = useMemo<readonly PageOverlay[]>(() => {
		const defaults: PageOverlay[] = [
			{
				key: "textLayer",
				render: (ctx) => (
					<TextLayerOverlay
						pageIndex={ctx.pageIndex}
						pdf={ctx.pdf}
						layoutScale={ctx.layoutScale}
						isVisible={ctx.isVisible}
					/>
				),
			},
		];
		return overlays ? [...defaults, ...overlays] : defaults;
	}, [overlays]);

	const announceZoom = useCallback((_nextScale: number, _mode: ZoomMode) => {
		// Optional: could toast on zoom, but acts as noise. Keeping silent for now.
	}, []);

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
		const amount = el.clientHeight * PAGE_SCROLL_RATIO;
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
			zoomMode,
			fitScale,
			manualScale,
			pageCount,
			pageSize,
			reloadKey,
			measureVisibility,
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
			{passwordPrompt ? (
				<div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
					<form
						onSubmit={handlePasswordSubmit}
						className="w-full max-w-sm rounded-2xl border border-slate-700/80 bg-slate-900/95 p-6 shadow-2xl"
						aria-label={`Password prompt for ${role}`}
					>
						<div className="text-sm font-semibold text-slate-100">Unlock {role} PDF</div>
						<p className="mt-2 text-xs text-slate-400">
							{passwordPrompt.reason === "incorrect"
								? "Incorrect password. Try again."
								: "This PDF is password-protected."}
						</p>
						<input
							ref={passwordInputRef}
							type="password"
							autoComplete="current-password"
							placeholder="Enter password"
							value={passwordInput}
							onChange={(event) => setPasswordInput(event.target.value)}
							className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand focus:ring-2 focus:ring-brand/40"
							data-testid="pdf-password-input"
						/>
						<div className="mt-4 flex items-center justify-end gap-2">
							<button
								type="button"
								onClick={handlePasswordCancel}
								className="rounded-lg border border-slate-700/80 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
							>
								Cancel
							</button>
							<button
								type="submit"
								className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand/90"
							>
								Unlock
							</button>
						</div>
					</form>
				</div>
			) : null}

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
								<PageSlot
									key={`page-${index + 1}`}
									pageIndex={index}
									role={role}
									isVisible={isVisible}
									displayWidth={displayWidth ?? Math.round(pageSize.width * layoutScale)}
									displayHeight={placeholderHeight ?? Math.round(pageSize.height * layoutScale)}
									layoutScale={layoutScale}
									pdf={pdf}
									registerContainer={registerContainer}
									registerCanvas={registerCanvas}
									overlays={combinedOverlays}
								/>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
});
