export interface Point {
	readonly x: number;
	readonly y: number;
}

function pointInPolygon(px: number, py: number, poly: ReadonlyArray<Point>): boolean {
	if (poly.length < 3) {
		return false;
	}
	let inside: boolean = false;
	for (let i: number = 0, j: number = poly.length - 1; i < poly.length; j = i, i += 1) {
		const pi: Point = poly[i] ?? { x: 0, y: 0 };
		const pj: Point = poly[j] ?? { x: 0, y: 0 };
		const intersect: boolean =
			pi.y > py !== pj.y > py &&
			px < ((pj.x - pi.x) * (py - pi.y)) / (pj.y - pi.y + 0.0000001) + pi.x;
		if (intersect) {
			inside = !inside;
		}
	}
	return inside;
}

export function boundingBoxOfPoints(poly: ReadonlyArray<Point>): { x: number; y: number; w: number; h: number } {
	let minX: number = Number.POSITIVE_INFINITY;
	let minY: number = Number.POSITIVE_INFINITY;
	let maxX: number = Number.NEGATIVE_INFINITY;
	let maxY: number = Number.NEGATIVE_INFINITY;
	for (const p of poly) {
		minX = Math.min(minX, p.x);
		minY = Math.min(minY, p.y);
		maxX = Math.max(maxX, p.x);
		maxY = Math.max(maxY, p.y);
	}
	if (!Number.isFinite(minX)) {
		return { x: 0, y: 0, w: 0, h: 0 };
	}
	return {
		x: Math.floor(minX),
		y: Math.floor(minY),
		w: Math.ceil(maxX - minX) + 1,
		h: Math.ceil(maxY - minY) + 1,
	};
}

export function rasterizePolygonMask(
	poly: ReadonlyArray<Point>,
): { x: number; y: number; w: number; h: number; mask: Uint8Array } {
	const bb = boundingBoxOfPoints(poly);
	const w: number = Math.max(0, bb.w);
	const h: number = Math.max(0, bb.h);
	const mask: Uint8Array = new Uint8Array(w * h);
	for (let yy: number = 0; yy < h; yy += 1) {
		for (let xx: number = 0; xx < w; xx += 1) {
			const gx: number = bb.x + xx + 0.5;
			const gy: number = bb.y + yy + 0.5;
			if (pointInPolygon(gx, gy, poly)) {
				mask[yy * w + xx] = 1;
			}
		}
	}
	return { x: bb.x, y: bb.y, w, h, mask };
}
