import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../canvas/indexedSurface.js";

/**
 * Maps a pointer event to logical framebuffer coordinates (0 … width-1, 0 … height-1).
 * Uses the element's laid-out size from {@link DOMRect} so CSS subpixel sizing cannot
 * desync from the pointer fraction; results are always integer cell indices.
 */
export function logicalPointerPosition(
	ev: PointerEvent,
	canvas: HTMLCanvasElement,
): { readonly x: number; readonly y: number } {
	const r: DOMRect = canvas.getBoundingClientRect();
	const rw: number = Math.max(Number.EPSILON, r.width);
	const rh: number = Math.max(Number.EPSILON, r.height);
	const fx: number = ((ev.clientX - r.left) / rw) * CANVAS_WIDTH;
	const fy: number = ((ev.clientY - r.top) / rh) * CANVAS_HEIGHT;
	let x: number = Math.floor(fx);
	let y: number = Math.floor(fy);
	if (x < 0) {
		x = 0;
	} else if (x >= CANVAS_WIDTH) {
		x = CANVAS_WIDTH - 1;
	}
	if (y < 0) {
		y = 0;
	} else if (y >= CANVAS_HEIGHT) {
		y = CANVAS_HEIGHT - 1;
	}
	return { x, y };
}
