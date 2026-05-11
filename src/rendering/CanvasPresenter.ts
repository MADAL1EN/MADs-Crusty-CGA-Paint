import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../canvas/indexedSurface.js";
import { clampDisplayScale, DEFAULT_DISPLAY_SCALE } from "../config/displayConfig.js";
import { getRgbForPixel } from "../palette/cga.js";
import type { PaintEngine } from "../paint/PaintEngine.js";
import type { ToolId } from "../paint/toolIds.js";
import type { Point } from "../tools/selectionMask.js";
import {
	collectBrushStampFillPixels,
	collectLinePixels,
	collectSquareStampFillPixels,
} from "../tools/stamping.js";

/**
 * Pushes the logical framebuffer to a scaled display canvas. Selection outlines
 * and the idle pencil / brush / eraser dab preview are drawn in logical (320 by 200) space on
 * the scratch buffer before the single nearest-neighbor upscale so every on-screen pixel stays
 * square and uniform.
 */
export class CanvasPresenter {
	private scale: number = DEFAULT_DISPLAY_SCALE;
	private devicePixelRatio: number = 1;
	private readonly imageData: ImageData;
	private readonly scratchCanvas: HTMLCanvasElement;
	private readonly scratchCtx: CanvasRenderingContext2D;
	private readonly displayCtx: CanvasRenderingContext2D;

	public constructor(private readonly displayCanvas: HTMLCanvasElement) {
		this.scratchCanvas = document.createElement("canvas");
		this.scratchCanvas.width = CANVAS_WIDTH;
		this.scratchCanvas.height = CANVAS_HEIGHT;
		const sctx: CanvasRenderingContext2D | null = this.scratchCanvas.getContext("2d", {
			alpha: false,
			willReadFrequently: true,
		});
		if (sctx === null) {
			throw new Error("2D context unavailable for scratch buffer");
		}
		this.scratchCtx = sctx;
		this.scratchCtx.imageSmoothingEnabled = false;
		this.imageData = this.scratchCtx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);
		const dctx: CanvasRenderingContext2D | null = displayCanvas.getContext("2d", {
			alpha: false,
		});
		if (dctx === null) {
			throw new Error("2D context unavailable for display canvas");
		}
		this.displayCtx = dctx;
		this.displayCtx.imageSmoothingEnabled = false;
		this.applyScale(this.scale);
	}

	public setScale(scale: number): void {
		this.applyScale(scale);
	}

	public getScale(): number {
		return this.scale;
	}

	public sync(engine: PaintEngine): void {
		const dpr: number = CanvasPresenter.getDevicePixelRatio();
		if (Math.abs(dpr - this.devicePixelRatio) > 0.0001) {
			this.applyScale(this.scale);
		}
		engine.composeFrame(this.imageData);
		this.scratchCtx.putImageData(this.imageData, 0, 0);
		this.drawSelectionOverlayOnScratch(engine);
		this.displayCtx.imageSmoothingEnabled = false;
		this.displayCtx.clearRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
		this.displayCtx.drawImage(
			this.scratchCanvas,
			0,
			0,
			CANVAS_WIDTH,
			CANVAS_HEIGHT,
			0,
			0,
			this.displayCanvas.width,
			this.displayCanvas.height,
		);
	}

	private static getDevicePixelRatio(): number {
		const dpr: number = window.devicePixelRatio;
		if (!Number.isFinite(dpr) || dpr <= 0) {
			return 1;
		}
		return dpr;
	}

	private applyScale(scale: number): void {
		this.scale = clampDisplayScale(scale);
		this.devicePixelRatio = CanvasPresenter.getDevicePixelRatio();
		const deviceScale: number = this.scale;
		const dw: number = CANVAS_WIDTH * deviceScale;
		const dh: number = CANVAS_HEIGHT * deviceScale;
		const cssW: number = dw / this.devicePixelRatio;
		const cssH: number = dh / this.devicePixelRatio;
		this.displayCanvas.width = dw;
		this.displayCanvas.height = dh;
		this.displayCanvas.style.width = `${cssW}px`;
		this.displayCanvas.style.height = `${cssH}px`;
		this.displayCanvas.style.aspectRatio = `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`;
		this.displayCanvas.style.boxSizing = "border-box";
		this.displayCanvas.style.imageRendering = "pixelated";
	}

	private drawSelectionOverlayOnScratch(engine: PaintEngine): void {
		const lasso = engine.getLassoOverlay();
		if (lasso.points.length > 0) {
			this.drawLassoTraceOnScratch(lasso.points, lasso.hover);
		}

		const dragRect = engine.getRectMarquee();
		if (dragRect !== null) {
			const rx: number = Math.min(dragRect.x0, dragRect.x1);
			const ry: number = Math.min(dragRect.y0, dragRect.y1);
			let rw: number = Math.abs(dragRect.x1 - dragRect.x0);
			let rh: number = Math.abs(dragRect.y1 - dragRect.y0);
			if (rw < 1) {
				rw = 1;
			}
			if (rh < 1) {
				rh = 1;
			}
			this.drawDashedRectOutlineOnScratch(rx, ry, rw, rh);
		}

		const floating = engine.getFloatingMarquee();
		if (floating !== null) {
			if (floating.outlineRel !== null && floating.outlineRel.length >= 3) {
				this.drawDashedPolygonOutlineOnScratch(floating.x, floating.y, floating.outlineRel);
			} else {
				this.drawDashedRectOutlineOnScratch(floating.x, floating.y, floating.w, floating.h);
			}
		}

		this.drawPaintToolHoverPreviewOnScratch(engine);
	}

	/** Idle pencil / brush / eraser: show the same pixels and palette colours a single dab would write. */
	private drawPaintToolHoverPreviewOnScratch(engine: PaintEngine): void {
		const hover = engine.getPaintToolHover();
		if (hover === null) {
			return;
		}
		const tool: ToolId = engine.tool;
		let pixels: ReadonlyArray<{ readonly x: number; readonly y: number }>;
		let colorIndex: number;
		if (tool === "pencil") {
			pixels = collectSquareStampFillPixels(hover.x, hover.y, engine.toolSize, engine.pattern, false);
			colorIndex = engine.fgIndex;
		} else if (tool === "brush") {
			pixels = collectBrushStampFillPixels(hover.x, hover.y, engine.toolSize, engine.pattern);
			colorIndex = engine.fgIndex;
		} else if (tool === "eraser") {
			pixels = collectSquareStampFillPixels(hover.x, hover.y, engine.toolSize, engine.pattern, false);
			colorIndex = engine.bgIndex;
		} else {
			return;
		}
		if (pixels.length === 0) {
			return;
		}
		const rgb = getRgbForPixel(colorIndex, engine.docPalette);
		this.scratchCtx.fillStyle = `rgb(${String(rgb.r)}, ${String(rgb.g)}, ${String(rgb.b)})`;
		for (const p of pixels) {
			this.scratchCtx.fillRect(p.x, p.y, 1, 1);
		}
	}

	private readBaseRgb(x: number, y: number): { readonly r: number; readonly g: number; readonly b: number } {
		if (x < 0 || y < 0 || x >= CANVAS_WIDTH || y >= CANVAS_HEIGHT) {
			return { r: 0, g: 0, b: 0 };
		}
		const d: Uint8ClampedArray = this.imageData.data;
		const o: number = (y * CANVAS_WIDTH + x) * 4;
		return { r: d[o] ?? 0, g: d[o + 1] ?? 0, b: d[o + 2] ?? 0 };
	}

	/**
	 * Checker-phase dash on the pixel grid: each outline cell picks tone from (x+y) so the trace
	 * stays visible around curves (index-only alternation looked like missing arcs).
	 */
	private drawAlternatingInvertedOutlineOnScratch(orderedPixels: ReadonlyArray<{ x: number; y: number }>): void {
		for (const p of orderedPixels) {
			const { r, g, b } = this.readBaseRgb(p.x, p.y);
			const invR: number = 255 - r;
			const invG: number = 255 - g;
			const invB: number = 255 - b;
			const useInverse: boolean = ((p.x + p.y) & 1) === 0;
			if (useInverse) {
				this.scratchCtx.fillStyle = `rgb(${String(invR)}, ${String(invG)}, ${String(invB)})`;
			} else {
				const lum: number = 0.299 * invR + 0.587 * invG + 0.114 * invB;
				const hi: number = lum > 127.5 ? 0 : 255;
				this.scratchCtx.fillStyle = `rgb(${String(hi)}, ${String(hi)}, ${String(hi)})`;
			}
			this.scratchCtx.fillRect(p.x, p.y, 1, 1);
		}
	}

	private static dedupeConsecutivePixels(
		pts: ReadonlyArray<{ x: number; y: number }>,
	): Array<{ x: number; y: number }> {
		const out: Array<{ x: number; y: number }> = [];
		for (const p of pts) {
			const last: { x: number; y: number } | undefined = out[out.length - 1];
			if (last !== undefined && last.x === p.x && last.y === p.y) {
				continue;
			}
			out.push(p);
		}
		return out;
	}

	private static collectRectPerimeter(
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

	private drawDashedRectOutlineOnScratch(px: number, py: number, w: number, h: number): void {
		const peri: Array<{ x: number; y: number }> = CanvasPresenter.collectRectPerimeter(px, py, w, h);
		this.drawAlternatingInvertedOutlineOnScratch(peri);
	}

	private drawDashedPolygonOutlineOnScratch(floatX: number, floatY: number, outlineRel: readonly Point[]): void {
		const chain: Array<{ x: number; y: number }> = [];
		for (let i: number = 0; i < outlineRel.length; i += 1) {
			const a: Point | undefined = outlineRel[i];
			const b: Point | undefined = outlineRel[(i + 1) % outlineRel.length];
			if (a === undefined || b === undefined) {
				continue;
			}
			const ax: number = floatX + a.x;
			const ay: number = floatY + a.y;
			const bx: number = floatX + b.x;
			const by: number = floatY + b.y;
			chain.push(...collectLinePixels(ax, ay, bx, by));
		}
		this.drawAlternatingInvertedOutlineOnScratch(CanvasPresenter.dedupeConsecutivePixels(chain));
	}

	private drawLassoTraceOnScratch(points: readonly Point[], hover: Point | null): void {
		const flat: Array<{ x: number; y: number }> = [];
		for (let i: number = 1; i < points.length; i += 1) {
			const a: Point | undefined = points[i - 1];
			const b: Point | undefined = points[i];
			if (a === undefined || b === undefined) {
				continue;
			}
			const seg: Array<{ x: number; y: number }> = collectLinePixels(a.x, a.y, b.x, b.y);
			for (const p of seg) {
				const last: { x: number; y: number } | undefined = flat[flat.length - 1];
				if (last !== undefined && last.x === p.x && last.y === p.y) {
					continue;
				}
				flat.push(p);
			}
		}
		if (hover !== null && points.length > 0) {
			const last: Point | undefined = points[points.length - 1];
			if (last !== undefined) {
				const seg: Array<{ x: number; y: number }> = collectLinePixels(last.x, last.y, hover.x, hover.y);
				for (const p of seg) {
					const prev: { x: number; y: number } | undefined = flat[flat.length - 1];
					if (prev !== undefined && prev.x === p.x && prev.y === p.y) {
						continue;
					}
					flat.push(p);
				}
			}
		}
		this.drawAlternatingInvertedOutlineOnScratch(flat);
	}
}
