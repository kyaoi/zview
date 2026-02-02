import type { RenderTask } from "pdfjs-dist";

export type ViewerRole = "MAIN" | "SUB";

export type ActionKey =
	| "openMain"
	| "openSub"
	| "closeSub"
	| "closeSubTab"
	| "swap"
	| "reloadMain"
	| "help";

export type SubTab = {
	id: string;
	name: string;
};

export type PdfViewerState =
	| { phase: "idle" | "loading" }
	| { phase: "ready"; summary: string }
	| { phase: "error"; detail: string };

export type ZoomMode = "fit-width" | "manual";

export type ScrollSnapshot = {
	topPageIndex: number;
	offsetPx: number;
	zoomMode: ZoomMode;
	manualScale: number;
	scrollRatio: number;
	pageCount: number;
};

export type PageSlotRef = {
	container: HTMLDivElement | null;
	canvas: HTMLCanvasElement | null;
	renderTask: RenderTask | null;
	renderedScale: number | null;
};

export type ViewerHandle = {
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

export type ToastType = "info" | "success" | "error";
