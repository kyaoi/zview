import { ZOOM_MAX, ZOOM_MIN } from "./constants";

/**
 * Combine class names, filtering out falsy values
 */
export function classNames(...tokens: Array<string | false | null | undefined>): string {
	return tokens.filter(Boolean).join(" ");
}

/**
 * Clamp a scale value to valid zoom range
 */
export function clampScaleValue(value: number): number {
	return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

/**
 * Append cache busting query param to URL
 */
export function withCacheBust(url: string, token: number): string {
	if (token <= 0) return url;
	const joiner = url.includes("?") ? "&" : "?";
	return `${url}${joiner}cb=${token}-${Date.now()}`;
}
