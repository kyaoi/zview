import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { type CSSProperties, type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AnimateClip } from "../../lib/animate/detect";
import { type AnimateFrameCache, type ClipPixelBox, clipPixelBox } from "../../lib/animate/frames";
import { DPR_CAP } from "../../lib/constants";

interface AnimatePlayerProps {
	clip: AnimateClip;
	pdf: PDFDocumentProxy | null;
	cache: AnimateFrameCache;
	scale: number;
}

function blit(canvas: HTMLCanvasElement | null, source: HTMLCanvasElement | undefined) {
	if (!canvas || !source) return;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
}

export function AnimatePlayer({ clip, pdf, cache, scale }: AnimatePlayerProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const containerRef = useRef<HTMLButtonElement | null>(null);
	const frameIdxRef = useRef(0);

	const [page, setPage] = useState<PDFPageProxy | null>(null);
	const [box, setBox] = useState<ClipPixelBox | null>(null);
	const [frames, setFrames] = useState<HTMLCanvasElement[] | null>(null);
	const [isOnscreen, setIsOnscreen] = useState(false);
	const [isPlaying, setIsPlaying] = useState<boolean>(clip.autoplay);

	const dpr = useMemo(() => Math.min(window.devicePixelRatio || 1, DPR_CAP), []);

	useEffect(() => {
		if (!pdf) {
			setPage(null);
			return;
		}
		let cancelled = false;
		pdf.getPage(clip.pageIndex + 1).then((p) => {
			if (!cancelled) setPage(p);
		});
		return () => {
			cancelled = true;
		};
	}, [pdf, clip.pageIndex]);

	useEffect(() => {
		if (!page) return;
		setBox(clipPixelBox(clip, page, scale));
	}, [page, scale, clip]);

	useEffect(() => {
		if (!pdf || !page) return;
		let cancelled = false;
		const t0 = performance.now();
		console.info(
			`[animate] building cache: clip=${clip.controllerAnnotationId} ` +
				`page=${clip.pageIndex + 1} frames=${clip.frameCount} ` +
				`scale=${scale.toFixed(3)} dpr=${dpr}`,
		);
		cache
			.ensure(pdf, page, clip, scale, dpr)
			.then((cached) => {
				if (cancelled) return;
				const ms = performance.now() - t0;
				console.info(
					`[animate] cache ready: clip=${clip.controllerAnnotationId} ` +
						`frames=${cached.frames.length} in ${ms.toFixed(0)}ms ` +
						`bbox=${JSON.stringify(cached.pixelBox)}`,
				);
				setFrames(cached.frames);
				setBox(cached.pixelBox);
			})
			.catch((err) => {
				if (!cancelled) {
					console.error(
						`[animate] cache build failed for ${clip.controllerAnnotationId}`,
						err,
					);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [pdf, page, cache, clip, scale, dpr]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run when `box` first becomes non-null so containerRef has mounted; the value itself isn't read inside the effect.
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					setIsOnscreen(entry.isIntersecting);
				}
			},
			{ threshold: 0 },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [box]);

	// Paint the current frame whenever new frames arrive or canvas remounts.
	useEffect(() => {
		if (!frames) return;
		blit(canvasRef.current, frames[frameIdxRef.current]);
	}, [frames]);

	useEffect(() => {
		if (!frames || !isOnscreen || !isPlaying) return;
		const intervalMs = Math.max(1, 1000 / clip.fps);
		let nextFrameAt = performance.now() + intervalMs;
		let raf = 0;

		const tick = (now: number) => {
			while (now >= nextFrameAt) {
				nextFrameAt += intervalMs;
				const next = frameIdxRef.current + 1;
				if (next >= clip.frameCount) {
					if (clip.loop) {
						frameIdxRef.current = 0;
					} else {
						frameIdxRef.current = clip.frameCount - 1;
						blit(canvasRef.current, frames[frameIdxRef.current]);
						setIsPlaying(false);
						return;
					}
				} else {
					frameIdxRef.current = next;
				}
				blit(canvasRef.current, frames[frameIdxRef.current]);
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			if (raf !== 0) cancelAnimationFrame(raf);
		};
	}, [frames, isOnscreen, isPlaying, clip.fps, clip.frameCount, clip.loop]);

	const onPlayerClick = (event: MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		if (!frames) return;
		if (event.shiftKey) {
			const next = (frameIdxRef.current + 1) % clip.frameCount;
			frameIdxRef.current = next;
			blit(canvasRef.current, frames[next]);
			setIsPlaying(false);
			return;
		}
		setIsPlaying((prev) => !prev);
	};

	if (!box) return null;

	const containerStyle: CSSProperties = {
		position: "absolute",
		left: `${box.x}px`,
		top: `${box.y}px`,
		width: `${box.width}px`,
		height: `${box.height}px`,
		pointerEvents: "auto",
		zIndex: 2,
		cursor: frames ? "pointer" : "wait",
		// Debug aid (Task B3 verification): visible outline + label until cache lands.
		outline: frames ? "none" : "2px dashed rgb(28 202 216 / 0.85)",
		outlineOffset: "-2px",
	};

	const canvasWidth = Math.max(1, Math.floor(box.width * dpr));
	const canvasHeight = Math.max(1, Math.floor(box.height * dpr));

	return (
		<button
			ref={containerRef}
			type="button"
			style={{ ...containerStyle, padding: 0, border: 0, background: "transparent" }}
			onClick={onPlayerClick}
			aria-label={`Animation ${clip.animationIndex + 1} on page ${clip.pageIndex + 1}: ${isPlaying ? "pause" : "play"}`}
		>
			<canvas
				ref={canvasRef}
				width={canvasWidth}
				height={canvasHeight}
				style={{
					display: "block",
					width: `${box.width}px`,
					height: `${box.height}px`,
				}}
			/>
		</button>
	);
}
