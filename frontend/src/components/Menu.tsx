import { toolbarActions } from "../lib/constants";
import type { ActionKey } from "../lib/types";

interface MenuProps {
	open: boolean;
	onClose: () => void;
	onAction: (key: ActionKey) => void;
	keysEnabled: boolean;
	onKeysEnabledChange: (enabled: boolean) => void;
}

export function Menu({ open, onClose, onAction, keysEnabled, onKeysEnabledChange }: MenuProps) {
	if (!open) return null;

	return (
		<>
			<button
				type="button"
				className="fixed inset-0 z-20 bg-slate-950/60 backdrop-blur-sm"
				onClick={onClose}
				onKeyDown={(e) => {
					if (e.key === "Escape" || e.key === "Enter" || e.key === " ") onClose();
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
								onAction(key);
								onClose();
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
								onChange={(e) => onKeysEnabledChange(e.target.checked)}
							/>
							<span>{keysEnabled ? "ON" : "OFF"}</span>
						</label>
					</div>
				</div>
			</aside>
		</>
	);
}
