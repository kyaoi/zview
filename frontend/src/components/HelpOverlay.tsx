interface HelpOverlayProps {
	onClose: () => void;
}

export function HelpOverlay({ onClose }: HelpOverlayProps) {
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
