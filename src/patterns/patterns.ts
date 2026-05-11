export type PatternId =
	| "solid"
	| "dither"
	| "checker"
	| "stripeH"
	| "stripeV"
	| "diagBack"
	| "diagFwd";

/** Bayer 2×2 ordered dither (0..3 per cell). */
const BAYER2: readonly number[] = [0, 2, 3, 1];

const DIAG_PERIOD: number = 3;

function modPositive(value: number, modulus: number): number {
	const r: number = value % modulus;
	return r < 0 ? r + modulus : r;
}

/**
 * When true, a stamp at absolute canvas (x,y) should apply paint.
 * When false, the pixel is skipped so the pattern is fixed to the image grid.
 */
export function patternApplies(pattern: PatternId, x: number, y: number): boolean {
	switch (pattern) {
		case "solid":
			return true;
		case "checker":
			return ((x + y) & 1) === 0;
		case "stripeH":
			return (y & 1) === 0;
		case "stripeV":
			return (x & 1) === 0;
		case "dither": {
			const ix: number = x & 1;
			const iy: number = y & 1;
			const t: number = BAYER2[iy * 2 + ix] ?? 0;
			return t <= 1;
		}
		case "diagBack":
			return modPositive(x - y, DIAG_PERIOD) === 0;
		case "diagFwd":
			return modPositive(x + y, DIAG_PERIOD) === 0;
		default:
			return true;
	}
}

export function effectivePattern(pattern: PatternId, toolSize: number): PatternId {
	if (toolSize <= 1) {
		return "solid";
	}
	return pattern;
}
