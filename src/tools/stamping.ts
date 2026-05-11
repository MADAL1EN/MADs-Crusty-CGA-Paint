import { CANVAS_HEIGHT, CANVAS_WIDTH, IndexedSurface } from "../canvas/indexedSurface.js";
import type { PatternId } from "../patterns/patterns.js";
import { effectivePattern, patternApplies } from "../patterns/patterns.js";

export type StampShape = "square" | "circle";

export function stampPencilSquare(
	surface: IndexedSurface,
	centerX: number,
	centerY: number,
	toolSize: number,
	colorIndex: number,
	pattern: PatternId,
	applyPattern: boolean = true,
): void {
	const s: number = Math.max(1, toolSize | 0);
	const pat: PatternId = applyPattern ? effectivePattern(pattern, s) : "solid";
	const ox: number = centerX - Math.floor((s - 1) / 2);
	const oy: number = centerY - Math.floor((s - 1) / 2);
	for (let dy: number = 0; dy < s; dy += 1) {
		for (let dx: number = 0; dx < s; dx += 1) {
			const x: number = ox + dx;
			const y: number = oy + dy;
			if (!patternApplies(pat, x, y)) {
				continue;
			}
			surface.setIndex(x, y, colorIndex);
		}
	}
}

export function stampBrushCircle(
	surface: IndexedSurface,
	centerX: number,
	centerY: number,
	toolSize: number,
	colorIndex: number,
	pattern: PatternId,
): void {
	const radius: number = Math.max(0, (toolSize | 0) - 1);
	const diameter: number = radius * 2 + 1;
	const pat: PatternId = effectivePattern(pattern, Math.max(1, diameter));
	const r2: number = radius * radius;
	for (let dy: number = -radius; dy <= radius; dy += 1) {
		for (let dx: number = -radius; dx <= radius; dx += 1) {
			if (dx * dx + dy * dy > r2) {
				continue;
			}
			const x: number = centerX + dx;
			const y: number = centerY + dy;
			if (!patternApplies(pat, x, y)) {
				continue;
			}
			surface.setIndex(x, y, colorIndex);
		}
	}
}

function collectAxisAlignedRectOutline(
	px: number,
	py: number,
	w: number,
	h: number,
): Array<{ x: number; y: number }> {
	const out: Array<{ x: number; y: number }> = [];
	if (w < 1 || h < 1) {
		return out;
	}
	const x0: number = px;
	const y0: number = py;
	const x1: number = px + w - 1;
	const y1: number = py + h - 1;
	for (let x: number = x0; x <= x1; x += 1) {
		out.push({ x, y: y0 });
	}
	if (y1 > y0) {
		for (let y: number = y0 + 1; y <= y1; y += 1) {
			out.push({ x: x1, y });
		}
	}
	if (y1 > y0 && x1 > x0) {
		for (let x: number = x1 - 1; x >= x0; x -= 1) {
			out.push({ x, y: y1 });
		}
	}
	if (x1 > x0 && y1 > y0 + 1) {
		for (let y: number = y1 - 1; y > y0; y -= 1) {
			out.push({ x: x0, y });
		}
	}
	return out;
}

/**
 * Perimeter of the square stamp used by {@link stampPencilSquare}, clipped to the framebuffer.
 */
export function collectSquareStampOutline(
	centerX: number,
	centerY: number,
	toolSize: number,
): Array<{ x: number; y: number }> {
	const s: number = Math.max(1, toolSize | 0);
	const ox: number = centerX - Math.floor((s - 1) / 2);
	const oy: number = centerY - Math.floor((s - 1) / 2);
	const raw: Array<{ x: number; y: number }> = collectAxisAlignedRectOutline(ox, oy, s, s);
	const clipped: Array<{ x: number; y: number }> = [];
	for (const p of raw) {
		if (p.x >= 0 && p.y >= 0 && p.x < CANVAS_WIDTH && p.y < CANVAS_HEIGHT) {
			clipped.push(p);
		}
	}
	return clipped;
}

function inBrushStampPixel(
	centerX: number,
	centerY: number,
	r2: number,
	pat: PatternId,
	px: number,
	py: number,
): boolean {
	if (px < 0 || py < 0 || px >= CANVAS_WIDTH || py >= CANVAS_HEIGHT) {
		return false;
	}
	const dx: number = px - centerX;
	const dy: number = py - centerY;
	if (dx * dx + dy * dy > r2) {
		return false;
	}
	return patternApplies(pat, px, py);
}

/**
 * Boundary of the pixel set {@link stampBrushCircle} would paint (disk ∩ pattern mask), clipped to the framebuffer.
 * Uses a local mask so 4-neighbour edges at the disk bounding box match geometry and canvas edges.
 */
export function collectBrushStampOutline(
	centerX: number,
	centerY: number,
	toolSize: number,
	pattern: PatternId,
): Array<{ x: number; y: number }> {
	const radius: number = Math.max(0, (toolSize | 0) - 1);
	const diameter: number = radius * 2 + 1;
	const pat: PatternId = effectivePattern(pattern, Math.max(1, diameter));
	const r2: number = radius * radius;
	const span: number = diameter;
	const mask: Uint8Array = new Uint8Array(span * span);
	for (let ly: number = 0; ly < span; ly += 1) {
		for (let lx: number = 0; lx < span; lx += 1) {
			const dx: number = lx - radius;
			const dy: number = ly - radius;
			if (dx * dx + dy * dy > r2) {
				continue;
			}
			const wx: number = centerX + dx;
			const wy: number = centerY + dy;
			if (inBrushStampPixel(centerX, centerY, r2, pat, wx, wy)) {
				mask[ly * span + lx] = 1;
			}
		}
	}
	const out: Array<{ x: number; y: number }> = [];
	const nbs: ReadonlyArray<readonly [number, number]> = [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1],
	];
	for (let ly: number = 0; ly < span; ly += 1) {
		for (let lx: number = 0; lx < span; lx += 1) {
			const idx: number = ly * span + lx;
			if (mask[idx] === 0) {
				continue;
			}
			let edge: boolean = false;
			for (const nb of nbs) {
				const nlx: number = lx + (nb[0] ?? 0);
				const nly: number = ly + (nb[1] ?? 0);
				if (nlx < 0 || nly < 0 || nlx >= span || nly >= span) {
					edge = true;
					break;
				}
				if (mask[nly * span + nlx] === 0) {
					edge = true;
					break;
				}
			}
			if (edge) {
				out.push({ x: centerX + lx - radius, y: centerY + ly - radius });
			}
		}
	}
	return out;
}

/**
 * Every framebuffer pixel {@link stampPencilSquare} would write at this centre (pattern + clip),
 * in the same order as the stamp loops.
 */
export function collectSquareStampFillPixels(
	centerX: number,
	centerY: number,
	toolSize: number,
	pattern: PatternId,
	applyPattern: boolean,
): Array<{ x: number; y: number }> {
	const s: number = Math.max(1, toolSize | 0);
	const pat: PatternId = applyPattern ? effectivePattern(pattern, s) : "solid";
	const ox: number = centerX - Math.floor((s - 1) / 2);
	const oy: number = centerY - Math.floor((s - 1) / 2);
	const out: Array<{ x: number; y: number }> = [];
	for (let dy: number = 0; dy < s; dy += 1) {
		for (let dx: number = 0; dx < s; dx += 1) {
			const x: number = ox + dx;
			const y: number = oy + dy;
			if (!patternApplies(pat, x, y)) {
				continue;
			}
			if (x >= 0 && y >= 0 && x < CANVAS_WIDTH && y < CANVAS_HEIGHT) {
				out.push({ x, y });
			}
		}
	}
	return out;
}

/**
 * Every framebuffer pixel {@link stampBrushCircle} would write at this centre (pattern + clip).
 */
export function collectBrushStampFillPixels(
	centerX: number,
	centerY: number,
	toolSize: number,
	pattern: PatternId,
): Array<{ x: number; y: number }> {
	const radius: number = Math.max(0, (toolSize | 0) - 1);
	const diameter: number = radius * 2 + 1;
	const pat: PatternId = effectivePattern(pattern, Math.max(1, diameter));
	const r2: number = radius * radius;
	const out: Array<{ x: number; y: number }> = [];
	for (let dy: number = -radius; dy <= radius; dy += 1) {
		for (let dx: number = -radius; dx <= radius; dx += 1) {
			if (dx * dx + dy * dy > r2) {
				continue;
			}
			const x: number = centerX + dx;
			const y: number = centerY + dy;
			if (!patternApplies(pat, x, y)) {
				continue;
			}
			if (x >= 0 && y >= 0 && x < CANVAS_WIDTH && y < CANVAS_HEIGHT) {
				out.push({ x, y });
			}
		}
	}
	return out;
}

export function collectLinePixels(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
	const out: Array<{ x: number; y: number }> = [];
	let x: number = x0;
	let y: number = y0;
	const dx: number = Math.abs(x1 - x0);
	const dy: number = Math.abs(y1 - y0);
	const sx: number = x0 < x1 ? 1 : -1;
	const sy: number = y0 < y1 ? 1 : -1;
	let err: number = dx - dy;
	for (;;) {
		out.push({ x, y });
		if (x === x1 && y === y1) {
			break;
		}
		const e2: number = 2 * err;
		if (e2 > -dy) {
			err -= dy;
			x += sx;
		}
		if (e2 < dx) {
			err += dx;
			y += sy;
		}
	}
	return out;
}

export function stampPolyline(
	surface: IndexedSurface,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	toolSize: number,
	colorIndex: number,
	pattern: PatternId,
	shape: StampShape,
	squareUsesPattern: boolean = true,
): void {
	const pts: Array<{ x: number; y: number }> = collectLinePixels(x0, y0, x1, y1);
	for (const p of pts) {
		if (shape === "circle") {
			stampBrushCircle(surface, p.x, p.y, toolSize, colorIndex, pattern);
		} else {
			stampPencilSquare(surface, p.x, p.y, toolSize, colorIndex, pattern, squareUsesPattern);
		}
	}
}

export function copyRect(
	surface: IndexedSurface,
	x: number,
	y: number,
	w: number,
	h: number,
): Uint8Array {
	const data: Uint8Array = new Uint8Array(w * h);
	let i: number = 0;
	for (let yy: number = 0; yy < h; yy += 1) {
		for (let xx: number = 0; xx < w; xx += 1) {
			data[i] = surface.getIndex(x + xx, y + yy);
			i += 1;
		}
	}
	return data;
}

export function pasteRect(
	surface: IndexedSurface,
	x: number,
	y: number,
	w: number,
	h: number,
	data: Uint8Array,
): void {
	let i: number = 0;
	for (let yy: number = 0; yy < h; yy += 1) {
		for (let xx: number = 0; xx < w; xx += 1) {
			const v: number = data[i] ?? 0;
			i += 1;
			const px: number = x + xx;
			const py: number = y + yy;
			if (px >= 0 && py >= 0 && px < CANVAS_WIDTH && py < CANVAS_HEIGHT) {
				surface.setIndex(px, py, v);
			}
		}
	}
}

export function clearRect(
	surface: IndexedSurface,
	x: number,
	y: number,
	w: number,
	h: number,
	bgIndex: number,
): void {
	for (let yy: number = 0; yy < h; yy += 1) {
		for (let xx: number = 0; xx < w; xx += 1) {
			surface.setIndex(x + xx, y + yy, bgIndex);
		}
	}
}
