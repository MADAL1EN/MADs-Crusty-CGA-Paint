/** IBM CGA / EGA RGBI palette (16 colors), index 0..15. */
export const EGA_RGB: readonly string[] = [
	"#000000",
	"#0000AA",
	"#00AA00",
	"#00AAAA",
	"#AA0000",
	"#AA00AA",
	"#AA5500",
	"#AAAAAA",
	"#555555",
	"#5555FF",
	"#55FF55",
	"#55FFFF",
	"#FF5555",
	"#FF55FF",
	"#FFFF55",
	"#FFFFFF",
] as const;

/** CGA 320x200 mode 4: indices 1..3 color triples for palette set 0 or 1. */
const MODE4_SET0: readonly [number, number, number] = [11, 13, 15]; // cyan, magenta, white (EGA indices)
const MODE4_SET1: readonly [number, number, number] = [12, 10, 14]; // red, green, yellow

export type CgaPaletteSet = 0 | 1;

export interface CgaDocumentPalette {
	readonly set: CgaPaletteSet;
}

export function clampEgaIndex(value: number): number {
	if (value < 0) {
		return 0;
	}
	if (value > 15) {
		return 15;
	}
	return value | 0;
}

export function clampPixelIndex(value: number): number {
	if (value < 0) {
		return 0;
	}
	if (value > 3) {
		return 3;
	}
	return value | 0;
}

export function getEgaIndexForPixel(
	pixelValue: number,
	palette: CgaDocumentPalette,
): number {
	const v: number = clampPixelIndex(pixelValue);
	if (v === 0) {
		/* CGA 320×200 mode 4: background is black (EGA 0), not a user-pickable 16-colour paper. */
		return 0;
	}
	const triple: readonly [number, number, number] =
		palette.set === 0 ? MODE4_SET0 : MODE4_SET1;
	return clampEgaIndex(triple[v - 1] ?? 15);
}

export function getHexForPixel(pixelValue: number, palette: CgaDocumentPalette): string {
	const ega: number = getEgaIndexForPixel(pixelValue, palette);
	return EGA_RGB[clampEgaIndex(ega)] ?? "#000000";
}

export function getRgbForPixel(
	pixelValue: number,
	palette: CgaDocumentPalette,
): { readonly r: number; readonly g: number; readonly b: number } {
	const hex: string = getHexForPixel(pixelValue, palette);
	const r: number = Number.parseInt(hex.slice(1, 3), 16);
	const g: number = Number.parseInt(hex.slice(3, 5), 16);
	const b: number = Number.parseInt(hex.slice(5, 7), 16);
	return { r, g, b };
}

/** Four display colors (RGB) for the current document palette, indices 0..3. */
export function getFrameRgbColors(palette: CgaDocumentPalette): ReadonlyArray<{
	readonly r: number;
	readonly g: number;
	readonly b: number;
}> {
	const out: Array<{ readonly r: number; readonly g: number; readonly b: number }> = [];
	for (let i: number = 0; i < 4; i += 1) {
		out.push(getRgbForPixel(i, palette));
	}
	return out;
}
