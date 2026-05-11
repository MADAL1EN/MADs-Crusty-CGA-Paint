import type { CgaDocumentPalette } from "../palette/cga.js";
import { getRgbForPixel } from "../palette/cga.js";

export interface Rgb {
	readonly r: number;
	readonly g: number;
	readonly b: number;
}

function rgbCss(c: Rgb): string {
	return `rgb(${String(c.r)}, ${String(c.g)}, ${String(c.b)})`;
}

function luminance(c: Rgb): number {
	return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
	const u: number = 1 - t;
	return {
		r: Math.round(a.r * u + b.r * t),
		g: Math.round(a.g * u + b.g * t),
		b: Math.round(a.b * u + b.b * t),
	};
}

function lighten(c: Rgb, amount: number): Rgb {
	return mixRgb(c, { r: 255, g: 255, b: 255 }, amount);
}

/**
 * Maps the four logical framebuffer colours (indices 0–3) to UI chrome roles so the
 * whole shell tracks {@link CgaDocumentPalette} (CGA palette set).
 */
export function applyCgaShellTheme(shell: HTMLElement, workbench: HTMLElement, palette: CgaDocumentPalette): void {
	const c0: Rgb = getRgbForPixel(0, palette);
	const c1: Rgb = getRgbForPixel(1, palette);
	const c2: Rgb = getRgbForPixel(2, palette);
	const c3: Rgb = getRgbForPixel(3, palette);
	const ranked: Array<{ readonly c: Rgb; readonly l: number }> = [
		{ c: c0, l: luminance(c0) },
		{ c: c1, l: luminance(c1) },
		{ c: c2, l: luminance(c2) },
		{ c: c3, l: luminance(c3) },
	].sort((a, b) => b.l - a.l);
	const light: Rgb = ranked[0]?.c ?? c3;
	const dark: Rgb = ranked[3]?.c ?? c0;
	const midHi: Rgb = ranked[1]?.c ?? c1;
	const midLo: Rgb = ranked[2]?.c ?? c2;
	// Structural lines use only frame palette picks (no blend toward #000/#fff — that reads as grey).
	const borderRgb: Rgb = dark;
	const inputBorderRgb: Rgb = midLo;
	const panelBg: Rgb = light;
	const panelFg: Rgb = luminance(light) > luminance(dark) + 40 ? dark : lighten(dark, 0.15);
	const titleBg: Rgb = midHi;
	const titleFg: Rgb = luminance(titleBg) > 140 ? dark : c3;
	const accentBg: Rgb = midLo;
	const accentFg: Rgb = luminance(accentBg) > 130 ? dark : light;
	const inputBg: Rgb = c0;
	const inputFg: Rgb = luminance(inputBg) > 130 ? dark : light;
	const workbenchBg: Rgb = mixRgb(panelBg, dark, 0.14);

	const setVar = (el: HTMLElement, name: string, value: string): void => {
		el.style.setProperty(name, value);
	};

	setVar(shell, "--cga-panel-bg", rgbCss(panelBg));
	setVar(shell, "--cga-panel-fg", rgbCss(panelFg));
	setVar(shell, "--cga-border", rgbCss(borderRgb));
	setVar(shell, "--cga-title-bg", rgbCss(titleBg));
	setVar(shell, "--cga-title-fg", rgbCss(titleFg));
	setVar(shell, "--cga-menu-bg", rgbCss(panelBg));
	setVar(shell, "--cga-menu-fg", rgbCss(panelFg));
	setVar(shell, "--cga-menu-hover-bg", rgbCss(accentBg));
	setVar(shell, "--cga-menu-hover-fg", rgbCss(accentFg));
	setVar(shell, "--cga-button-bg", rgbCss(midLo));
	setVar(shell, "--cga-button-fg", rgbCss(luminance(midLo) > 120 ? dark : light));
	setVar(shell, "--cga-button-hover-bg", rgbCss(midHi));
	setVar(shell, "--cga-button-hover-fg", rgbCss(titleFg));
	setVar(shell, "--cga-input-bg", rgbCss(inputBg));
	setVar(shell, "--cga-input-fg", rgbCss(inputFg));
	setVar(shell, "--cga-input-border", rgbCss(inputBorderRgb));
	setVar(shell, "--cga-dropdown-hover-bg", rgbCss(accentBg));
	setVar(shell, "--cga-dropdown-hover-fg", rgbCss(accentFg));
	// Drop shadow uses darkest frame colour so it always tracks the CGA document palette.
	setVar(shell, "--cga-shadow", rgbCss(dark));

	const rootFs: number = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 18;
	const strokePx: number = Math.max(2, Math.min(5, Math.round(rootFs / 6)));
	const stroke: string = `${String(strokePx)}px`;
	setVar(shell, "--cga-stroke", stroke);
	setVar(workbench, "--cga-stroke", stroke);

	setVar(workbench, "--cga-workbench-bg", rgbCss(workbenchBg));
	setVar(document.documentElement, "--cga-workbench-bg", rgbCss(workbenchBg));
	setVar(document.documentElement, "--cga-panel-bg", rgbCss(panelBg));
}
