import { getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";
import { PDFJS_ASSET_BASE } from "../lib/constants";
import type { PdfViewerState, ScrollSnapshot, ToastType, ViewerRole } from "../lib/types";
import { clampScaleValue, withCacheBust } from "../lib/utils";

interface UsePdfDocumentOptions {
	url: string;
	role: ViewerRole;
	reloadKey: number;
	sessionNonce: number;
	initialSnapshot?: ScrollSnapshot | null;
	scrollRef: React.RefObject<HTMLDivElement | null>;
	onNotify: (message: string, type: ToastType) => void;
}

interface UsePdfDocumentResult {
	pdf: PDFDocumentProxy | null;
	pdfRef: React.RefObject<PDFDocumentProxy | null>;
	state: PdfViewerState;
	pageCount: number;
	pageSize: { width: number; height: number } | null;
	fitScale: number;
	setFitScale: React.Dispatch<React.SetStateAction<number>>;
	manualScale: number;
	setManualScale: React.Dispatch<React.SetStateAction<number>>;
	zoomMode: "fit-width" | "manual";
	setZoomMode: React.Dispatch<React.SetStateAction<"fit-width" | "manual">>;
	currentPage: number;
	setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
	pendingRestoreRef: React.RefObject<{ reloadKey: number; snapshot: ScrollSnapshot | null } | null>;
	loadedKeyRef: React.RefObject<number>;
	manualScaleInitializedRef: React.RefObject<boolean>;
	renderNonce: number;
	setRenderNonce: React.Dispatch<React.SetStateAction<number>>;
	resetPageSlots: () => void;
}

export function usePdfDocument({
	url,
	role,
	reloadKey,
	sessionNonce,
	initialSnapshot,
	scrollRef,
	onNotify,
}: UsePdfDocumentOptions): UsePdfDocumentResult {
	const [state, setState] = useState<PdfViewerState>({ phase: "idle" });
	const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
	const [pageCount, setPageCount] = useState(0);
	const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
	const [zoomMode, setZoomMode] = useState<"fit-width" | "manual">("fit-width");
	const [fitScale, setFitScale] = useState(1);
	const [manualScale, setManualScale] = useState(1);
	const [currentPage, setCurrentPage] = useState(1);
	const [renderNonce, setRenderNonce] = useState(0);

	const pdfRef = useRef<PDFDocumentProxy | null>(null);
	const pendingRestoreRef = useRef<{ reloadKey: number; snapshot: ScrollSnapshot | null } | null>(
		null,
	);
	const loadedKeyRef = useRef(-1);
	const manualScaleInitializedRef = useRef(false);

	// Page slots management (minimal version - full implementation stays in PdfViewer)
	const pageSlotsRef = useRef<unknown[]>([]);
	const resetPageSlots = useCallback(() => {
		pageSlotsRef.current = [];
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reload処理はキー変化時のみ走らせ、現在の表示状態をスナップショットするため依存を限定
	useEffect(() => {
		let cancelled = false;
		const bustToken = reloadKey + sessionNonce;
		const requestUrl = withCacheBust(url, bustToken);

		if (initialSnapshot) {
			pendingRestoreRef.current = { reloadKey, snapshot: initialSnapshot };
		} else if (pdfRef.current && pageSize) {
			// Capture current snapshot before reload
			const scrollEl = scrollRef.current;
			if (scrollEl) {
				const layoutScale = zoomMode === "fit-width" ? fitScale : manualScale;
				if (layoutScale > 0) {
					const PAGE_GAP_PX = 16;
					const viewTop = scrollEl.scrollTop;
					const pageBlock = Math.round(pageSize.height * layoutScale) + PAGE_GAP_PX;
					const topPageIndex = Math.min(
						pageCount - 1,
						Math.max(0, Math.floor(viewTop / pageBlock)),
					);
					const offsetPx = viewTop - topPageIndex * pageBlock;
					const totalHeight = Math.max(1, pageCount * pageBlock - PAGE_GAP_PX);
					const scrollRatio = Math.min(1, Math.max(0, viewTop / totalHeight));
					pendingRestoreRef.current = {
						reloadKey,
						snapshot: {
							topPageIndex,
							offsetPx,
							zoomMode,
							manualScale,
							scrollRatio,
							pageCount,
						},
					};
				}
			}
		}

		setState({ phase: "loading" });
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
				loadedKeyRef.current = reloadKey;
				setPageCount(loaded.numPages);
				setPageSize({ width: baseViewport.width, height: baseViewport.height });
				setState({ phase: "ready", summary: `Page 1 / ${loaded.numPages}` });
				setFitScale(nextFitScale);
				setManualScale(restoredManualScale);
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

	// Cleanup on unmount
	useEffect(
		() => () => {
			resetPageSlots();
			pdfRef.current?.destroy();
		},
		[resetPageSlots],
	);

	// FitScale resize observer
	useEffect(() => {
		if (!pageSize || !scrollRef.current) return;

		const node = scrollRef.current;
		const updateScale = () => {
			const height = node.clientHeight || pageSize.height;
			if (height <= 0) return;
			const nextFit = height / pageSize.height;
			setFitScale(nextFit);
		};

		updateScale();
		const observer = new ResizeObserver(updateScale);
		observer.observe(node);
		return () => observer.disconnect();
	}, [pageSize, scrollRef]);

	// Initialize manual scale from fit scale
	useEffect(() => {
		if (!manualScaleInitializedRef.current && fitScale > 0) {
			setManualScale(fitScale);
			manualScaleInitializedRef.current = true;
		}
	}, [fitScale]);

	return {
		pdf,
		pdfRef,
		state,
		pageCount,
		pageSize,
		fitScale,
		setFitScale,
		manualScale,
		setManualScale,
		zoomMode,
		setZoomMode,
		currentPage,
		setCurrentPage,
		pendingRestoreRef,
		loadedKeyRef,
		manualScaleInitializedRef,
		renderNonce,
		setRenderNonce,
		resetPageSlots,
	};
}
