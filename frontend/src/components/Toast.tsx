import { useEffect, useState } from "react";
import type { ToastType } from "../lib/types";

export interface ToastMessage {
	id: string;
	message: string;
	type: ToastType;
}

interface ToastProps {
	toasts: ToastMessage[];
	removeToast: (id: string) => void;
}

export function ToastContainer({ toasts, removeToast }: ToastProps) {
	return (
		<div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
			{toasts.map((toast) => (
				<ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
			))}
		</div>
	);
}

function ToastItem({ toast, onRemove }: { toast: ToastMessage; onRemove: () => void }) {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		// Trigger enter animation
		requestAnimationFrame(() => setVisible(true));

		const timer = setTimeout(() => {
			setVisible(false);
			// Wait for exit animation to finish before removing from DOM
			setTimeout(onRemove, 300);
		}, 3000);

		return () => clearTimeout(timer);
	}, [onRemove]);

	const bgColors: Record<ToastType, string> = {
		success: "bg-emerald-950/90 border-emerald-500/50 text-emerald-100",
		error: "bg-red-950/90 border-red-500/50 text-red-100",
		info: "bg-slate-800/90 border-slate-600/50 text-slate-100",
		warning: "bg-amber-950/90 border-amber-500/50 text-amber-100",
	};

	return (
		<div
			className={`
        relative overflow-hidden rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm transition-all duration-300 ease-out pointer-events-auto
        ${bgColors[toast.type]}
        ${visible ? "translate-y-0 opacity-100 scale-100" : "translate-y-2 opacity-0 scale-95"}
      `}
			role="alert"
		>
			<div className="flex items-center gap-3">
				<span className="text-sm font-medium">{toast.message}</span>
				<button
					type="button"
					onClick={() => {
						setVisible(false);
						setTimeout(onRemove, 300);
					}}
					className="ml-auto -mr-1 rounded-md p-1 opacity-60 hover:bg-white/10 hover:opacity-100 transition-colors"
					aria-label="Close notification"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						className="h-4 w-4"
					>
						<title>Close</title>
						<path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
					</svg>
				</button>
			</div>
		</div>
	);
}
