import { useMemo, useState } from "react";

const toolbarActions = [
	{ key: "openMain", label: "Open (Main)", hint: "Pick a PDF for MAIN" },
	{ key: "openSub", label: "Open (Sub)", hint: "Add an optional SUB" },
	{ key: "swap", label: "Swap", hint: "Switch left/right" },
	{ key: "reloadMain", label: "Reload (Main)", hint: "Refresh MAIN" },
	{ key: "help", label: "Help", hint: "Overlay" },
] as const;

type ActionKey = (typeof toolbarActions)[number]["key"];

type PaneProps = {
	paneRole: "MAIN" | "SUB";
	status: string;
	focused: boolean;
	onFocus: () => void;
};

function classNames(...tokens: Array<string | false | null | undefined>) {
	return tokens.filter(Boolean).join(" ");
}

function Pane({ paneRole, status, focused, onFocus }: PaneProps) {
	return (
		<section
			className={classNames(
				"group relative flex flex-col gap-3 rounded-2xl border border-slate-700/70 bg-slate-900/70 px-4 py-4 shadow-glow transition",
				focused
					? "ring-2 ring-accent/70 border-accent/70 -translate-y-0.5"
					: "hover:border-slate-500/70 hover:-translate-y-0.5",
			)}
		>
			<header className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span
						className={classNames(
							"inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide",
							paneRole === "MAIN"
								? "border-brand/50 bg-brand/15 text-brand"
								: "border-accent/60 bg-accent/15 text-accent",
						)}
					>
						{paneRole}
					</span>
					<span className="text-sm font-semibold text-slate-300">{status}</span>
				</div>
				<div className="flex items-center gap-2 text-xs text-slate-400">
					<span>{focused ? "focused" : "ready"}</span>
					{!focused ? (
						<button
							type="button"
							className="rounded-full border border-brand/60 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand hover:border-brand hover:bg-brand/20"
							onClick={onFocus}
						>
							Focus
						</button>
					) : null}
				</div>
			</header>

			<div className="rounded-xl border border-slate-700/50 bg-slate-900/60 px-4 py-4">
				<div className="flex max-w-xl flex-col gap-2">
					<p className="text-xs uppercase tracking-[0.2em] text-slate-400">
						{paneRole === "MAIN" ? "Primary" : "Secondary"} pane
					</p>
					<h2 className="text-xl font-semibold text-slate-50">
						{paneRole === "MAIN" ? "MAIN viewer placeholder" : "SUB viewer placeholder"}
					</h2>
					<p className="text-sm leading-6 text-slate-300">
						PDF rendering arrives in the next task. This shell keeps the layout lean: role badge,
						status, and a focus ring placeholder.
					</p>
					{paneRole === "SUB" ? (
						<p className="text-sm leading-6 text-slate-300">
							SUB stays static until you replace it.
						</p>
					) : (
						<p className="text-sm leading-6 text-slate-300">
							Reload and watch states will live here.
						</p>
					)}
					<div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
						{[1, 2, 3, 4].map((cell) => (
							<div
								key={cell}
								className="h-16 rounded-xl border border-slate-700/60 bg-gradient-to-br from-brand/20 to-accent/20"
							/>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
	return (
		<div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/70 px-4">
			<div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/90 p-5 shadow-2xl">
				<header className="mb-3">
					<p className="text-xs uppercase tracking-[0.2em] text-slate-400">Guide</p>
					<h3 className="text-lg font-semibold text-slate-50">Skeleton UI</h3>
				</header>
				<ul className="mb-4 list-disc space-y-2 pl-5 text-sm text-slate-200">
					<li>Toolbar hooks up to pickers and reloads in later tasks.</li>
					<li>MAIN badge stays visible; SUB appears after you add it.</li>
					<li>Focus ring shows which pane will react to keybindings.</li>
				</ul>
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

export default function App() {
	const [hasSub, setHasSub] = useState(false);
	const [focusedPane, setFocusedPane] = useState<"main" | "sub">("main");
	const [paneOrder, setPaneOrder] = useState<"main-first" | "sub-first">("main-first");
	const [status, setStatus] = useState("Ready to open MAIN");
	const [showHelp, setShowHelp] = useState(false);

	const announce = (message: string) => setStatus(message);

	const handleAction = (key: ActionKey) => {
		switch (key) {
			case "openMain":
				announce("MAIN: open dialog (stub)");
				setFocusedPane("main");
				break;
			case "openSub":
				setHasSub(true);
				setFocusedPane("sub");
				announce("SUB slot is ready (static)");
				break;
			case "swap":
				if (!hasSub) {
					announce("Add a SUB pane before swapping");
					return;
				}
				setPaneOrder((prev) => (prev === "main-first" ? "sub-first" : "main-first"));
				announce("Swapped pane order");
				break;
			case "reloadMain":
				announce("MAIN reload requested (placeholder)");
				setFocusedPane("main");
				break;
			case "help":
				setShowHelp((open) => !open);
				break;
			default:
				announce("Action pending wiring");
		}
	};

	const paneSequence = useMemo(() => {
		const mainPane = (
			<Pane
				key="main"
				paneRole="MAIN"
				status="manual"
				focused={focusedPane === "main"}
				onFocus={() => setFocusedPane("main")}
			/>
		);

		const subPane = hasSub ? (
			<Pane
				key="sub"
				paneRole="SUB"
				status="static"
				focused={focusedPane === "sub"}
				onFocus={() => setFocusedPane("sub")}
			/>
		) : null;

		if (!subPane) return [mainPane];
		return paneOrder === "main-first" ? [mainPane, subPane] : [subPane, mainPane];
	}, [focusedPane, hasSub, paneOrder]);

	return (
		<div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pb-6 pt-4">
			<header className="sticky top-0 z-10 grid grid-cols-1 gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/90 px-4 py-3 shadow-glow backdrop-blur md:grid-cols-[240px_1fr_220px]">
				<div className="flex items-center gap-3">
					<div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand to-accent text-base font-bold uppercase text-slate-950">
						zv
					</div>
					<div className="flex flex-col leading-tight">
						<span className="text-base font-semibold tracking-wide text-slate-50">zview</span>
						<span className="text-sm text-slate-300">fast, read-only PDF viewer</span>
					</div>
				</div>

				<nav
					className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5"
					aria-label="Primary actions"
				>
					{toolbarActions.map(({ key, label, hint }) => (
						<button
							key={key}
							type="button"
							onClick={() => handleAction(key)}
							className="glass flex flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-100 transition hover:-translate-y-0.5 hover:border-brand/70 hover:text-slate-50"
						>
							<span>{label}</span>
							<small className="text-xs font-normal text-slate-300">{hint}</small>
						</button>
					))}
				</nav>

				<div className="flex items-center justify-end">
					<div className="glass max-w-full truncate rounded-xl px-3 py-2 text-sm text-slate-200">
						{status}
					</div>
				</div>
			</header>

			<main
				className={classNames(
					"grid gap-3",
					hasSub ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1",
					paneOrder === "sub-first" && hasSub ? "md:[&>section:nth-child(1)]:order-2" : "",
				)}
			>
				{paneSequence}

				{!hasSub && (
					<div className="flex flex-col justify-between rounded-2xl border border-dashed border-slate-700/60 bg-slate-900/60 px-4 py-4">
						<div className="flex items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<span className="inline-flex items-center gap-2 rounded-full border border-accent/60 bg-accent/10 px-3 py-1 text-xs font-semibold tracking-wide text-accent">
									SUB
								</span>
								<span className="text-sm font-semibold text-slate-300">static</span>
							</div>
							<span className="text-xs text-slate-400">hidden until opened</span>
						</div>
						<div className="mt-4 flex items-center justify-between rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
							<span>Open Sub to reveal the second pane.</span>
							<button
								type="button"
								className="rounded-lg border border-accent/60 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent hover:border-accent hover:bg-accent/25"
								onClick={() => handleAction("openSub")}
							>
								Open Sub
							</button>
						</div>
					</div>
				)}
			</main>

			{showHelp ? <HelpOverlay onClose={() => setShowHelp(false)} /> : null}
		</div>
	);
}
