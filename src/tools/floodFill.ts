import { CANVAS_HEIGHT, CANVAS_WIDTH, IndexedSurface } from "../canvas/indexedSurface.js";
import { clampPixelIndex } from "../palette/cga.js";
import type { PatternId } from "../patterns/patterns.js";
import { patternApplies } from "../patterns/patterns.js";

/**
 * Flood-fill a contiguous region of {@code targetIndex} pixels. After the region is
 * collected, {@code replacementIndex} is written only where {@link patternApplies} is true
 * (so dither / checker fills stay inside the filled area).
 */
export function floodFill(
	surface: IndexedSurface,
	startX: number,
	startY: number,
	replacementIndex: number,
	pattern: PatternId,
): void {
	if (startX < 0 || startY < 0 || startX >= CANVAS_WIDTH || startY >= CANVAS_HEIGHT) {
		return;
	}
	const target: number = surface.getIndex(startX, startY);
	const repl: number = clampPixelIndex(replacementIndex);
	if (target === repl) {
		return;
	}
	const queue: Int32Array = new Int32Array(CANVAS_WIDTH * CANVAS_HEIGHT);
	const enqueued: Uint8Array = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
	const cells: Array<{ x: number; y: number }> = [];
	let head: number = 0;
	let tail: number = 0;
	function tryEnqueue(px: number, py: number): void {
		if (px < 0 || py < 0 || px >= CANVAS_WIDTH || py >= CANVAS_HEIGHT) {
			return;
		}
		if (surface.getIndex(px, py) !== target) {
			return;
		}
		const idx: number = py * CANVAS_WIDTH + px;
		if (enqueued[idx] !== 0) {
			return;
		}
		enqueued[idx] = 1;
		queue[tail] = (py << 16) | (px & 0xffff);
		tail += 1;
	}
	tryEnqueue(startX, startY);
	while (head < tail) {
		const packed: number = queue[head] ?? 0;
		head += 1;
		const u: number = packed >>> 0;
		const x: number = u & 0xffff;
		const y: number = (u >>> 16) & 0xffff;
		if (x >= CANVAS_WIDTH || y >= CANVAS_HEIGHT) {
			continue;
		}
		if (surface.getIndex(x, y) !== target) {
			continue;
		}
		cells.push({ x, y });
		tryEnqueue(x + 1, y);
		tryEnqueue(x - 1, y);
		tryEnqueue(x, y + 1);
		tryEnqueue(x, y - 1);
	}
	for (const c of cells) {
		if (patternApplies(pattern, c.x, c.y)) {
			surface.setIndex(c.x, c.y, repl);
		}
	}
}
