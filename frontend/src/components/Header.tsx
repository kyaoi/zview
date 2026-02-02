interface HeaderProps {
	onMenuToggle: () => void;
	menuOpen: boolean;
}

export function Header({ onMenuToggle, menuOpen }: HeaderProps) {
	return (
		<div className="flex-none p-2 border-b border-slate-800 bg-slate-900/50 backdrop-blur flex items-center justify-between">
			<h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-accent to-brand bg-clip-text text-transparent px-2">
				ZView
			</h1>
			<div className="flex items-center gap-2">
				<button
					type="button"
					className="rounded-lg border border-slate-700/70 bg-slate-900/90 px-3 py-2 text-sm font-semibold text-slate-100 shadow-glow hover:border-brand/70"
					onClick={onMenuToggle}
					aria-expanded={menuOpen}
					aria-label="Toggle menu"
				>
					☰
				</button>
			</div>
		</div>
	);
}
