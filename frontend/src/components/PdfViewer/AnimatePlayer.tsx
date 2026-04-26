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

	// Live frame buffer: index → canvas. Frames stream in during cache build,
	// so this is a sparse-then-dense array that grows over time. The RAF loop
	// reads from this ref directly so it never has to re-subscribe to state.
	const liveFramesRef = useRef<HTMLCanvasElement[]>([]);
	const tipMaxRef = useRef(-1);

	const [page, setPage] = useState<PDFPageProxy | null>(null);
	const [box, setBox] = useState<ClipPixelBox | null>(null);
	const [hasFrames, setHasFrames] = useState(false);
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
		if (!isOnscreen) return;

		liveFramesRef.current = [];
		tipMaxRef.current = -1;
		frameIdxRef.current = 0;
		setHasFrames(false);

		let cancelled = false;
		const t0 = performance.now();
		let firstSeenAt: number | null = null;
		console.info(
			`[animate] building cache: clip=${clip.controllerAnnotationId} ` +
				`page=${clip.pageIndex + 1} frames=${clip.frameCount} ` +
				`scale=${scale.toFixed(3)} dpr=${dpr}`,
		);
		cache
			.ensure(pdf, page, clip, scale, dpr, {
				onFrame: (idx, canvas) => {
					if (cancelled) return;
					liveFramesRef.current[idx] = canvas;
					if (idx > tipMaxRef.current) tipMaxRef.current = idx;
					if (firstSeenAt === null) {
						firstSeenAt = performance.now();
						console.info(
							`[animate] first frame: clip=${clip.controllerAnnotationId} ` +
								`in ${(firstSeenAt - t0).toFixed(0)}ms`,
						);
						// Trigger one re-render so the RAF loop and the static-paint
						// effect see the first cached frame.
						setHasFrames(true);
					}
				},
			})
			.then((cached) => {
				if (cancelled) return;
				const ms = performance.now() - t0;
				console.info(
					`[animate] cache ready: clip=${clip.controllerAnnotationId} ` +
						`frames=${cached.frames.length} in ${ms.toFixed(0)}ms ` +
						`bbox=${JSON.stringify(cached.pixelBox)}`,
				);
				setBox(cached.pixelBox);
				// Flag triggers React effects regardless of cache-hit vs build path.
				setHasFrames(true);
			})
			.catch((err) => {
				if (!cancelled) {
					console.error(`[animate] cache build failed for ${clip.controllerAnnotationId}`, err);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [pdf, page, cache, clip, scale, dpr, isOnscreen]);

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
			// Pre-warm cache slightly before the clip enters the viewport so the
			// user doesn't watch a blank box while scrolling toward it.
			{ threshold: 0, rootMargin: "200px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [box]);

	// Paint frame 0 once we have it (covers the static frame the PdfViewer
	// drew underneath while the cache was building).
	useEffect(() => {
		if (!hasFrames) return;
		const idx = frameIdxRef.current;
		const canvas = liveFramesRef.current[idx] ?? liveFramesRef.current[0];
		blit(canvasRef.current, canvas);
	}, [hasFrames]);

	useEffect(() => {
		if (!hasFrames || !isOnscreen || !isPlaying) return;
		const intervalMs = Math.max(1, 1000 / clip.fps);
		let nextFrameAt = performance.now() + intervalMs;
		let raf = 0;

		const tick = (now: number) => {
			while (now >= nextFrameAt) {
				nextFrameAt += intervalMs;
				const tip = tipMaxRef.current;
				let next = frameIdxRef.current + 1;
				if (next >= clip.frameCount) {
					if (clip.loop) {
						next = 0;
					} else {
						frameIdxRef.current = clip.frameCount - 1;
						blit(canvasRef.current, liveFramesRef.current[frameIdxRef.current]);
						setIsPlaying(false);
						return;
					}
				} else if (next > tip) {
					// Cache hasn't reached this frame yet; hold on the previous one
					// rather than skip ahead. nextFrameAt still advances, so when the
					// build catches up the playhead resumes without drift.
					next = frameIdxRef.current;
				}
				if (next !== frameIdxRef.current) {
					frameIdxRef.current = next;
					blit(canvasRef.current, liveFramesRef.current[next]);
				}
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			if (raf !== 0) cancelAnimationFrame(raf);
		};
	}, [hasFrames, isOnscreen, isPlaying, clip.fps, clip.frameCount, clip.loop]);

	const onPlayerClick = (event: MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		if (!hasFrames) return;
		if (event.shiftKey) {
			const tip = tipMaxRef.current;
			if (tip < 0) return;
			const next = (frameIdxRef.current + 1) % (tip + 1);
			frameIdxRef.current = next;
			blit(canvasRef.current, liveFramesRef.current[next]);
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
		cursor: hasFrames ? "pointer" : "wait",
		// Debug aid (Task B3 verification): visible outline + label until cache lands.
		outline: hasFrames ? "none" : "2px dashed rgb(28 202 216 / 0.85)",
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
