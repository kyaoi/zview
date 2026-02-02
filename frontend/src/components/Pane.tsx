import { classNames } from "../lib/utils";

interface PaneProps {
	children: React.ReactNode;
	focused: boolean;
	paneRole: "MAIN" | "SUB";
	status: string;
	onFocus: () => void;
}

export function Pane({ children, focused, paneRole, status, onFocus }: PaneProps) {
	return (
		<section
			className={classNames(
				"w-full text-left relative flex h-full flex-col transition-all duration-200 outline-none",
				focused
					? "bg-slate-900/30 z-10"
					: "bg-transparent opacity-60 hover:opacity-80 scale-[0.99]",
			)}
			onClick={onFocus}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					onFocus();
				}
			}}
			tabIndex={-1}
			aria-label={`${paneRole} pane`}
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
		</section>
	);
}
