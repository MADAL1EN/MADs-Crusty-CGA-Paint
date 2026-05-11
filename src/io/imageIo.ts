import type { CgaDocumentPalette } from "../palette/cga.js";
import { clampPixelIndex, getRgbForPixel } from "../palette/cga.js";
import { CANVAS_HEIGHT, CANVAS_WIDTH, IndexedSurface } from "../canvas/indexedSurface.js";

function colorDistanceSq(
	a: { r: number; g: number; b: number },
	b: { r: number; g: number; b: number },
): number {
	const dr: number = a.r - b.r;
	const dg: number = a.g - b.g;
	const db: number = a.b - b.b;
	return dr * dr + dg * dg + db * db;
}

export function quantizeImageDataToSurface(
	imageData: ImageData,
	palette: CgaDocumentPalette,
): IndexedSurface {
	const surface: IndexedSurface = new IndexedSurface();
	const data: Uint8ClampedArray = imageData.data;
	const w: number = imageData.width;
	const h: number = imageData.height;
	const frameColors: ReadonlyArray<{ r: number; g: number; b: number }> = [];
	for (let i: number = 0; i < 4; i += 1) {
		frameColors.push(getRgbForPixel(i, palette));
	}
	for (let y: number = 0; y < CANVAS_HEIGHT; y += 1) {
		for (let x: number = 0; x < CANVAS_WIDTH; x += 1) {
			let sx: number = x;
			let sy: number = y;
			if (w !== CANVAS_WIDTH || h !== CANVAS_HEIGHT) {
				sx = Math.floor((x * w) / CANVAS_WIDTH);
				sy = Math.floor((y * h) / CANVAS_HEIGHT);
			}
			const p: number = (sy * w + sx) * 4;
			const r: number = data[p] ?? 0;
			const g: number = data[p + 1] ?? 0;
			const b: number = data[p + 2] ?? 0;
			let best: number = 0;
			let bestD: number = Number.POSITIVE_INFINITY;
			for (let idx: number = 0; idx < 4; idx += 1) {
				const c = frameColors[idx] ?? { r: 0, g: 0, b: 0 };
				const d: number = colorDistanceSq(c, { r, g, b });
				if (d < bestD) {
					bestD = d;
					best = idx;
				}
			}
			surface.setIndex(x, y, clampPixelIndex(best));
		}
	}
	return surface;
}

export function surfaceToPngBlob(surface: IndexedSurface, palette: CgaDocumentPalette): Promise<Blob> {
	const canvas: HTMLCanvasElement = document.createElement("canvas");
	canvas.width = CANVAS_WIDTH;
	canvas.height = CANVAS_HEIGHT;
	const ctx: CanvasRenderingContext2D | null = canvas.getContext("2d");
	if (ctx === null) {
		return Promise.reject(new Error("2D context unavailable"));
	}
	const imageData: ImageData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
	surface.blitToImageData(imageData, palette);
	ctx.putImageData(imageData, 0, 0);
	return new Promise<Blob>((resolve, reject): void => {
		canvas.toBlob((blob: Blob | null): void => {
			if (blob === null) {
				reject(new Error("toBlob failed"));
				return;
			}
			resolve(blob);
		}, "image/png");
	});
}
