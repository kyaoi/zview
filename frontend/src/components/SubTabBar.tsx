import { classNames } from "../lib/utils";
import type { SubTab } from "../lib/types";

interface SubTabBarProps {
	tabs: SubTab[];
	activeTabId: string | null;
	onSelect: (id: string) => void;
	onClose: (id: string) => void;
}

export function SubTabBar({ tabs, activeTabId, onSelect, onClose }: SubTabBarProps) {
	if (tabs.length === 0) return null;

	return (
		<div className="flex w-full items-center bg-slate-900/80 border-b border-slate-800 overflow-x-auto no-scrollbar">
			{tabs.map((tab) => (
				<div
					key={tab.id}
					className={classNames(
						"group relative flex min-w-[120px] max-w-[200px] shrink-0 items-center justify-between gap-2 border-r border-slate-800 px-3 py-2 text-xs transition-colors select-none",
						activeTabId === tab.id
							? "bg-slate-800/80 text-white font-medium"
							: "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200",
					)}
				>
					<button
						type="button"
						onClick={() => onSelect(tab.id)}
						className="flex-1 truncate text-left bg-transparent border-0 p-0 text-inherit cursor-pointer focus:outline-none"
					>
						{tab.name}
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onClose(tab.id);
						}}
						aria-label={`Close tab ${tab.name}`}
						className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-slate-700 text-slate-400 hover:text-white transition-all ml-1"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
							className="h-3.5 w-3.5"
						>
							<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
						</svg>
					</button>

					{activeTabId === tab.id && (
						<div className="absolute bottom-0 left-0 h-0.5 w-full bg-fuchsia-500" />
					)}
				</div>
			))}
		</div>
	);
}
