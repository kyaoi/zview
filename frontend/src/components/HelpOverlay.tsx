import { useEffect, useState } from "react";
import { getKeyBinding, validateKeyConflicts, type KeyConflict } from "../lib/config";
import { type KeyCategory, categoryLabels, getActionsByCategory } from "../lib/keyActions";
import "../styles/HelpOverlay.css";

interface HelpOverlayProps {
	onClose: () => void;
	visible: boolean;
}

// Render keyboard key display element
const KeyDisplay = ({ keys }: { keys: string[] }) => {
	return (
		<span className="key-display">
			{keys.map((k, i) => (
				<span key={k}>
					{i > 0 && <span className="key-separator"> / </span>}
					<code>{k}</code>
				</span>
			))}
		</span>
	);
};

export const HelpOverlay: React.FC<HelpOverlayProps> = ({ onClose, visible }) => {
	const [warnings, setWarnings] = useState<KeyConflict[]>([]);

	// Run conflict validation on mount (or when visible changes)
	// Theoretically config doesn't change at runtime, but good to check.
	// We assume window.ZVIEW_CONFIG is populated.
	useEffect(() => {
		if (visible) {
			setWarnings(validateKeyConflicts());
		}
	}, [visible]);

	const actionsByCategory = getActionsByCategory();
	const categoryOrder: KeyCategory[] = ["navigation", "zoom", "panes", "misc"];

	if (!visible) return null;

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: backdrop close is supplementary to button
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop acts as a large close button
		<div className="help-overlay-backdrop" onClick={onClose}>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: stop propagation is not interactive */}
			<div
				className="help-overlay"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="help-overlay-title"
			>
				<header>
					<h2 id="help-overlay-title">Keyboard Shortcuts</h2>
					<button type="button" className="close-button" onClick={onClose}>
						×
					</button>
				</header>
				<div className="help-content" id="help-overlay-content">
					{warnings.length > 0 && (
						<div className="help-warnings">
							{warnings.map((c, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: stable list
								<div key={i} className="warning-item">
									⚠️ {c.message}
								</div>
							))}
						</div>
					)}
					{categoryOrder.map((category) => {
						const actions = actionsByCategory[category];
						if (!actions || actions.length === 0) return null;

						return (
							<section key={category} className="help-section">
								<h3>{categoryLabels[category]}</h3>
								<ul>
									{actions.map((action) => {
										const keys = getKeyBinding(action.id);
										return (
											<li key={action.id}>
												<KeyDisplay keys={keys} />
												<span className="description">— {action.description}</span>
											</li>
										);
									})}
								</ul>
							</section>
						);
					})}
					<section className="help-section help-footer">
						<p>
							Keybindings can be customized in <code>~/.config/zview/config.toml</code>
						</p>
					</section>
				</div>
			</div>
		</div>
	);
};
