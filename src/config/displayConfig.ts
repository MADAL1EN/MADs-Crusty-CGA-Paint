/** Integer scale: logical pixels map to this many physical screen pixels on each axis. */
export const DISPLAY_SCALE_MIN = 1;
export const DISPLAY_SCALE_MAX = 16;

/** Default physical pixel scale for the logical framebuffer. */
export const DEFAULT_DISPLAY_SCALE = 3;

export function clampDisplayScale(scale: number): number {
	const n: number = Math.round(scale);
	if (!Number.isFinite(n)) {
		return DEFAULT_DISPLAY_SCALE;
	}
	return Math.max(DISPLAY_SCALE_MIN, Math.min(DISPLAY_SCALE_MAX, n));
}
