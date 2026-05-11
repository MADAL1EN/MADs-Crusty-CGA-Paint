import type { CgaDocumentPalette } from "../palette/cga.js";
import { clampPixelIndex, getRgbForPixel } from "../palette/cga.js";

export const CANVAS_WIDTH: number = 320;
export const CANVAS_HEIGHT: number = 200;

export class IndexedSurface {
	readonly width: number = CANVAS_WIDTH;
	readonly height: number = CANVAS_HEIGHT;
	private readonly pixels: Uint8Array;

	public constructor(copyFrom?: IndexedSurface) {
		const len: number = CANVAS_WIDTH * CANVAS_HEIGHT;
		if (copyFrom !== undefined) {
			this.pixels = new Uint8Array(copyFrom.pixels);
		} else {
			this.pixels = new Uint8Array(len);
		}
	}

	public clone(): IndexedSurface {
		return new IndexedSurface(this);
	}

	public copyFrom(other: IndexedSurface): void {
		this.pixels.set(other.pixels);
	}

	public getIndex(x: number, y: number): number {
		if (x < 0 || y < 0 || x >= CANVAS_WIDTH || y >= CANVAS_HEIGHT) {
			return 0;
		}
		return this.pixels[y * CANVAS_WIDTH + x] ?? 0;
	}

	public setIndex(x: number, y: number, index: number): void {
		if (x < 0 || y < 0 || x >= CANVAS_WIDTH || y >= CANVAS_HEIGHT) {
			return;
		}
		const i: number = clampPixelIndex(index);
		this.pixels[y * CANVAS_WIDTH + x] = i;
	}

	public fill(index: number): void {
		const v: number = clampPixelIndex(index);
		this.pixels.fill(v);
	}

	public blitToImageData(imageData: ImageData, palette: CgaDocumentPalette): void {
		const data: Uint8ClampedArray = imageData.data;
		let p: number = 0;
		for (let y: number = 0; y < CANVAS_HEIGHT; y += 1) {
			for (let x: number = 0; x < CANVAS_WIDTH; x += 1) {
				const idx: number = this.getIndex(x, y);
				const { r, g, b } = getRgbForPixel(idx, palette);
				data[p] = r;
				data[p + 1] = g;
				data[p + 2] = b;
				data[p + 3] = 255;
				p += 4;
			}
		}
	}
}
