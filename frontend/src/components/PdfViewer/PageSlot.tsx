import type { PDFDocumentProxy } from "pdfjs-dist";
import { Fragment, memo, type ReactNode, useCallback } from "react";
import type { ViewerRole } from "../../lib/types";

export type OverlayContext = {
	pageIndex: number;
	layoutScale: number;
	displayWidth: number;
	displayHeight: number;
	isVisible: boolean;
	pdf: PDFDocumentProxy | null;
};

export type PageOverlay = {
	key: string;
	render: (ctx: OverlayContext) => ReactNode;
};

interface PageSlotProps {
	pageIndex: number;
	role: ViewerRole;
	isVisible: boolean;
	displayWidth: number;
	displayHeight: number;
	layoutScale: number;
	pdf: PDFDocumentProxy | null;
	registerContainer: (index: number, node: HTMLDivElement | null) => void;
	registerCanvas: (index: number, node: HTMLCanvasElement | null) => void;
	overlays?: readonly PageOverlay[];
}

function PageSlotComponent({
	pageIndex,
	role,
	isVisible,
	displayWidth,
	displayHeight,
	layoutScale,
	pdf,
	registerContainer,
	registerCanvas,
	overlays,
}: PageSlotProps) {
	const onContainerRef = useCallback(
		(node: HTMLDivElement | null) => {
			registerContainer(pageIndex, node);
		},
		[pageIndex, registerContainer],
	);

	const onCanvasRef = useCallback(
		(node: HTMLCanvasElement | null) => {
			registerCanvas(pageIndex, node);
		},
		[pageIndex, registerCanvas],
	);

	const overlayCtx: OverlayContext = {
		pageIndex,
		layoutScale,
		displayWidth,
		displayHeight,
		isVisible,
		pdf,
	};

	return (
		<div className="flex flex-col items-center gap-2">
			<div
				ref={onContainerRef}
				className="relative overflow-visible bg-slate-950/60 shadow-lg"
				style={{
					margin: "0 auto",
					height: `${displayHeight}px`,
					width: `${displayWidth}px`,
					minWidth: `${displayWidth}px`,
				}}
			>
				<canvas
					ref={onCanvasRef}
					className="block h-full w-full bg-slate-900"
					aria-label={`${role} PDF page ${pageIndex + 1}`}
					style={{ opacity: isVisible ? 1 : 0.4 }}
				/>
				{!isVisible ? (
					<div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-900/70 via-slate-900/30 to-slate-900/70" />
				) : null}
				{overlays?.map((overlay) => (
					<Fragment key={overlay.key}>{overlay.render(overlayCtx)}</Fragment>
				))}
			</div>
		</div>
	);
}

export const PageSlot = memo(PageSlotComponent);
