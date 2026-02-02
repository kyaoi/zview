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
				"w-full text-left relative flex h-full flex-col transition-all duration-300 outline-none rounded-lg overflow-hidden",
				focused
					? "bg-slate-900/30 z-10 ring-2 ring-brand shadow-2xl shadow-brand/20"
					: "bg-transparent border border-white/5",
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
					"absolute top-4 left-6 z-20 flex items-center gap-2 pointer-events-none transition-all duration-300 origin-left",
					focused ? "opacity-100 scale-100 translate-x-0" : "opacity-80 scale-90 -translate-x-2",
				)}
			>
				<div
					className={classNames(
						"px-2.5 py-1 rounded-md text-xs font-bold shadow-md backdrop-blur border border-white/10 tracking-wide",
						paneRole === "MAIN"
							? "bg-brand/90 text-white shadow-brand/20"
							: "bg-fuchsia-600/90 text-white shadow-fuchsia-500/20",
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
			<div className={classNames("flex-1 w-full h-full min-h-0 relative rounded-none")}>
				{children}
			</div>
		</section>
	);
}
