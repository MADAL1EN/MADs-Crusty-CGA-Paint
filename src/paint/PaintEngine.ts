import type { CgaDocumentPalette, CgaPaletteSet } from "../palette/cga.js";
import { clampPixelIndex, getRgbForPixel } from "../palette/cga.js";
import { CANVAS_HEIGHT, CANVAS_WIDTH, IndexedSurface } from "../canvas/indexedSurface.js";
import type { PatternId } from "../patterns/patterns.js";
import { floodFill } from "../tools/floodFill.js";
import { clearRect, copyRect, stampBrushCircle, stampPencilSquare, stampPolyline } from "../tools/stamping.js";
import type { Point } from "../tools/selectionMask.js";
import { rasterizePolygonMask } from "../tools/selectionMask.js";
import { quantizeImageDataToSurface, surfaceToPngBlob } from "../io/imageIo.js";
import type { ToolId } from "./toolIds.js";
export type { ToolId } from "./toolIds.js";

interface FloatingSelection {
	readonly w: number;
	readonly h: number;
	readonly data: Uint8Array;
	readonly mask: Uint8Array | null;
	readonly outlineRel: readonly Point[] | null;
	readonly originX: number;
	readonly originY: number;
	floatX: number;
	floatY: number;
	grabDx: number;
	grabDy: number;
	dragging: boolean;
}

interface ClipboardBlock {
	readonly w: number;
	readonly h: number;
	readonly data: Uint8Array;
	readonly mask: Uint8Array | null;
	readonly outlineRel: readonly Point[] | null;
}

/** Describes the dashed rectangle marquee while dragging a rectangular selection. */
export interface RectMarqueeModel {
	readonly x0: number;
	readonly y0: number;
	readonly x1: number;
	readonly y1: number;
}

/** Bounding box of the floating selection in canvas space (moves with {@link FloatingSelection.floatX}). */
export interface FloatingMarqueeModel {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly outlineRel: readonly Point[] | null;
}

/** In-progress lasso path and rubber-band segment to the cursor. */
export interface LassoOverlayModel {
	readonly points: readonly Point[];
	readonly hover: Point | null;
}

/** Idle brush / pencil / eraser: logical centre of the single-dab preview the presenter draws. */
export interface PaintToolHoverModel {
	readonly x: number;
	readonly y: number;
	readonly shape: "square" | "circle";
}

export type PaintEngineListener = () => void;

/**
 * Core paint document and tool state. No DOM; callers subscribe via
 * {@link subscribe} and compose pixels with {@link composeFrame}.
 */
export class PaintEngine {
	public surface: IndexedSurface = new IndexedSurface();
	public docPalette: CgaDocumentPalette = { set: 0 };
	public fgIndex: number = 3;
	public bgIndex: number = 0;
	public tool: ToolId = "brush";
	public toolSize: number = 5;
	public pattern: PatternId = "solid";
	public lineShape: "square" | "circle" = "square";

	private readonly undoStack: IndexedSurface[] = [];
	private readonly redoStack: IndexedSurface[] = [];
	private readonly listeners: Set<PaintEngineListener> = new Set();
	private readonly previewSurface: IndexedSurface = new IndexedSurface();
	private lineSnap: IndexedSurface | null = null;
	private lineX0: number | null = null;
	private lineY0: number | null = null;
	private lineCurX: number | null = null;
	private lineCurY: number | null = null;
	private selectX0: number | null = null;
	private selectY0: number | null = null;
	private selectCurX: number | null = null;
	private selectCurY: number | null = null;
	private lassoPoints: Point[] = [];
	private lassoHoverX: number | null = null;
	private lassoHoverY: number | null = null;
	private floating: FloatingSelection | null = null;
	private selectionClipboard: ClipboardBlock | null = null;
	private paintDown: boolean = false;
	private lastPaintX: number = -1;
	private lastPaintY: number = -1;
	private hoverPaintX: number | null = null;
	private hoverPaintY: number | null = null;

	public constructor() {
		this.surface.fill(0);
	}

	public subscribe(listener: PaintEngineListener): () => void {
		this.listeners.add(listener);
		return (): void => {
			this.listeners.delete(listener);
		};
	}

	public setTool(tool: ToolId): void {
		this.lineSnap = null;
		this.lineX0 = null;
		this.lineY0 = null;
		this.lineCurX = null;
		this.lineCurY = null;
		this.selectX0 = null;
		this.selectY0 = null;
		this.selectCurX = null;
		this.selectCurY = null;
		this.paintDown = false;
		this.lassoPoints = [];
		this.lassoHoverX = null;
		this.lassoHoverY = null;
		this.hoverPaintX = null;
		this.hoverPaintY = null;
		this.tool = tool;
		if (tool === "pencil" || tool === "line") {
			this.toolSize = 1;
		} else if (tool === "brush") {
			this.toolSize = 5;
		}
		this.notify();
	}

	public setLineShape(shape: "square" | "circle"): void {
		this.lineShape = shape;
		this.notify();
	}

	public setToolSize(size: number): void {
		this.toolSize = Math.max(1, Math.min(32, size | 0));
		this.notify();
	}

	public setPattern(pattern: PatternId): void {
		this.pattern = pattern;
		this.notify();
	}

	public setPaletteSet(set: CgaPaletteSet): void {
		this.docPalette = { set };
		this.notify();
	}

	public setFgIndex(idx: number): void {
		this.fgIndex = clampPixelIndex(idx);
		this.notify();
	}

	public setBgIndex(idx: number): void {
		this.bgIndex = clampPixelIndex(idx);
		this.notify();
	}

	public newDocument(): void {
		this.pushUndo();
		this.surface.fill(0);
		this.clearFloating();
		this.notify();
	}

	public undo(): void {
		const prev: IndexedSurface | undefined = this.undoStack.pop();
		if (prev === undefined) {
			return;
		}
		this.redoStack.push(this.surface.clone());
		this.surface.copyFrom(prev);
		this.clearFloating();
		this.notify();
	}

	public redo(): void {
		const next: IndexedSurface | undefined = this.redoStack.pop();
		if (next === undefined) {
			return;
		}
		this.undoStack.push(this.surface.clone());
		this.surface.copyFrom(next);
		this.clearFloating();
		this.notify();
	}

	public async savePng(): Promise<void> {
		const blob: Blob = await surfaceToPngBlob(this.surface, this.docPalette);
		const url: string = URL.createObjectURL(blob);
		const a: HTMLAnchorElement = document.createElement("a");
		a.href = url;
		a.download = "crusty.png";
		a.click();
		URL.revokeObjectURL(url);
	}

	public openPngFile(file: File): void {
		const reader: FileReader = new FileReader();
		reader.onload = (): void => {
			const result: string | ArrayBuffer | null = reader.result;
			if (typeof result !== "string") {
				return;
			}
			const img: HTMLImageElement = new Image();
			img.onload = (): void => {
				const c: HTMLCanvasElement = document.createElement("canvas");
				c.width = CANVAS_WIDTH;
				c.height = CANVAS_HEIGHT;
				const ictx: CanvasRenderingContext2D | null = c.getContext("2d");
				if (ictx === null) {
					return;
				}
				ictx.drawImage(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
				const id: ImageData = ictx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
				this.pushUndo();
				this.surface = quantizeImageDataToSurface(id, this.docPalette);
				this.clearFloating();
				this.notify();
			};
			img.src = result;
		};
		reader.readAsDataURL(file);
	}

	public pointerDown(canvasX: number, canvasY: number, button: number): void {
		const x: number = Math.floor(canvasX);
		const y: number = Math.floor(canvasY);
		if (this.floating !== null && button === 0) {
			if (this.hitFloating(x, y)) {
				this.floating.dragging = true;
				this.floating.grabDx = x - this.floating.floatX;
				this.floating.grabDy = y - this.floating.floatY;
				this.notify();
				return;
			}
			this.commitFloating();
			return;
		}
		if (button === 2) {
			this.onRightDown(x, y);
			this.notify();
			return;
		}
		if (button !== 0) {
			return;
		}
		this.onLeftDown(x, y);
	}

	public pointerMove(canvasX: number, canvasY: number): void {
		const x: number = Math.floor(canvasX);
		const y: number = Math.floor(canvasY);
		if (this.floating !== null && this.floating.dragging) {
			this.hoverPaintX = null;
			this.hoverPaintY = null;
			this.floating.floatX = x - this.floating.grabDx;
			this.floating.floatY = y - this.floating.grabDy;
			this.notify();
			return;
		}
		if (this.tool === "line" && this.lineSnap !== null && this.lineX0 !== null && this.lineY0 !== null) {
			this.hoverPaintX = null;
			this.hoverPaintY = null;
			this.lineCurX = x;
			this.lineCurY = y;
			this.notify();
			return;
		}
		if (this.tool === "selectRect" && this.paintDown && this.selectX0 !== null && this.selectY0 !== null) {
			this.hoverPaintX = null;
			this.hoverPaintY = null;
			this.selectCurX = x;
			this.selectCurY = y;
			this.notify();
			return;
		}
		if (this.tool === "selectLasso" && this.lassoPoints.length > 0) {
			this.lassoHoverX = x;
			this.lassoHoverY = y;
			this.hoverPaintX = null;
			this.hoverPaintY = null;
			this.notify();
			return;
		}
		if (this.paintDown) {
			this.hoverPaintX = null;
			this.hoverPaintY = null;
			if (this.tool === "pencil") {
				this.strokePencil(x, y);
			} else if (this.tool === "brush") {
				this.strokeBrush(x, y);
			} else if (this.tool === "eraser") {
				this.strokeEraser(x, y);
			}
			this.notify();
			return;
		}
		if (
			(this.tool === "pencil" || this.tool === "brush" || this.tool === "eraser") &&
			this.lineSnap === null
		) {
			this.hoverPaintX = x;
			this.hoverPaintY = y;
		} else {
			this.hoverPaintX = null;
			this.hoverPaintY = null;
		}
		this.notify();
	}

	public pointerUp(canvasX: number, canvasY: number, button: number): void {
		const x: number = Math.floor(canvasX);
		const y: number = Math.floor(canvasY);
		if (this.floating !== null && button === 0) {
			this.floating.dragging = false;
		}
		if (this.tool === "line" && button === 0 && this.lineSnap !== null && this.lineX0 !== null && this.lineY0 !== null) {
			this.surface.copyFrom(this.lineSnap);
			stampPolyline(
				this.surface,
				this.lineX0,
				this.lineY0,
				x,
				y,
				this.toolSize,
				this.fgIndex,
				this.pattern,
				this.lineShape,
			);
			this.lineSnap = null;
			this.lineX0 = null;
			this.lineY0 = null;
			this.lineCurX = null;
			this.lineCurY = null;
		}
		if (this.tool === "selectRect" && this.paintDown && button === 0) {
			this.finishRectSelect(x, y);
			this.selectCurX = null;
			this.selectCurY = null;
		}
		this.paintDown = false;
		this.lastPaintX = -1;
		this.lastPaintY = -1;
		this.notify();
	}

	public copySelectionToBuffer(): boolean {
		if (this.floating === null) {
			return false;
		}
		const f: FloatingSelection = this.floating;
		const maskCopy: Uint8Array | null =
			f.mask === null ? null : new Uint8Array(f.mask);
		const outlineCopy: readonly Point[] | null =
			f.outlineRel === null ? null : f.outlineRel.map((p: Point) => ({ x: p.x, y: p.y }));
		this.selectionClipboard = {
			w: f.w,
			h: f.h,
			data: new Uint8Array(f.data),
			mask: maskCopy,
			outlineRel: outlineCopy,
		};
		this.notify();
		return true;
	}

	/** Pastes the internal buffer as a new floating selection centered on the canvas. No-op if empty. */
	public pasteSelectionFromBuffer(): void {
		const clip: ClipboardBlock | null = this.selectionClipboard;
		if (clip === null) {
			return;
		}
		if (this.floating !== null) {
			this.commitFloating();
		}
		const x: number = Math.max(0, Math.floor((CANVAS_WIDTH - clip.w) / 2));
		const y: number = Math.max(0, Math.floor((CANVAS_HEIGHT - clip.h) / 2));
		const maskPaste: Uint8Array | null =
			clip.mask === null ? null : new Uint8Array(clip.mask);
		const outlinePaste: readonly Point[] | null =
			clip.outlineRel === null ? null : clip.outlineRel.map((p: Point) => ({ x: p.x, y: p.y }));
		this.floating = {
			w: clip.w,
			h: clip.h,
			data: new Uint8Array(clip.data),
			mask: maskPaste,
			outlineRel: outlinePaste,
			originX: x,
			originY: y,
			floatX: x,
			floatY: y,
			grabDx: 0,
			grabDy: 0,
			dragging: false,
		};
		this.notify();
	}

	public cancelFloatingSelection(): void {
		if (this.floating === null) {
			return;
		}
		for (let yy: number = 0; yy < this.floating.h; yy += 1) {
			for (let xx: number = 0; xx < this.floating.w; xx += 1) {
				const m: number =
					this.floating.mask === null ? 1 : (this.floating.mask[yy * this.floating.w + xx] ?? 0);
				if (m === 0) {
					continue;
				}
				const gx: number = this.floating.originX + xx;
				const gy: number = this.floating.originY + yy;
				if (gx >= 0 && gy >= 0 && gx < CANVAS_WIDTH && gy < CANVAS_HEIGHT) {
					const v: number = this.floating.data[yy * this.floating.w + xx] ?? 0;
					this.surface.setIndex(gx, gy, v);
				}
			}
		}
		this.floating = null;
		this.notify();
	}

	public keyDown(key: string): void {
		if (key === "Enter") {
			this.commitFloating();
		}
		if (key === "Escape") {
			this.cancelFloatingSelection();
		}
	}

	/** Writes the composed RGBA frame (logical pixels) into `target` (320 by 200). */
	public composeFrame(target: ImageData): void {
		let drawSurface: IndexedSurface = this.surface;
		if (
			this.lineSnap !== null &&
			this.lineX0 !== null &&
			this.lineY0 !== null &&
			this.lineCurX !== null &&
			this.lineCurY !== null
		) {
			this.previewSurface.copyFrom(this.lineSnap);
			stampPolyline(
				this.previewSurface,
				this.lineX0,
				this.lineY0,
				this.lineCurX,
				this.lineCurY,
				this.toolSize,
				this.fgIndex,
				this.pattern,
				this.lineShape,
			);
			drawSurface = this.previewSurface;
		}
		drawSurface.blitToImageData(target, this.docPalette);
		if (this.floating !== null) {
			this.compositeFloatingOntoImageData(target);
		}
	}

	/** Rectangle marquee in logical canvas coordinates, or null if hidden. */
	public getRectMarquee(): RectMarqueeModel | null {
		const show: boolean =
			this.tool === "selectRect" &&
			this.paintDown &&
			this.selectX0 !== null &&
			this.selectY0 !== null &&
			this.selectCurX !== null &&
			this.selectCurY !== null;
		if (!show) {
			return null;
		}
		return {
			x0: this.selectX0!,
			y0: this.selectY0!,
			x1: this.selectCurX!,
			y1: this.selectCurY!,
		};
	}

	/** Dotted rectangle or lasso polygon around the active floating selection. */
	public getFloatingMarquee(): FloatingMarqueeModel | null {
		if (this.floating === null) {
			return null;
		}
		return {
			x: this.floating.floatX,
			y: this.floating.floatY,
			w: this.floating.w,
			h: this.floating.h,
			outlineRel: this.floating.outlineRel,
		};
	}

	/** True while a rectangular or lasso selection is active and not yet merged. */
	public hasFloatingSelection(): boolean {
		return this.floating !== null;
	}

	/** True after Copy; Paste can place this buffer as a new floating layer. */
	public hasInternalPasteBuffer(): boolean {
		return this.selectionClipboard !== null;
	}

	public getLassoOverlay(): LassoOverlayModel {
		const hover: Point | null =
			this.lassoHoverX !== null && this.lassoHoverY !== null
				? { x: this.lassoHoverX, y: this.lassoHoverY }
				: null;
		return { points: this.lassoPoints, hover };
	}

	/** Centre of the idle pencil / brush / eraser dab preview in logical canvas coordinates, or null. */
	public getPaintToolHover(): PaintToolHoverModel | null {
		if (this.hoverPaintX === null || this.hoverPaintY === null) {
			return null;
		}
		if (this.tool === "brush") {
			return { x: this.hoverPaintX, y: this.hoverPaintY, shape: "circle" };
		}
		if (this.tool === "pencil" || this.tool === "eraser") {
			return { x: this.hoverPaintX, y: this.hoverPaintY, shape: "square" };
		}
		return null;
	}

	public clearPaintToolHover(): void {
		this.hoverPaintX = null;
		this.hoverPaintY = null;
		this.notify();
	}

	public getStatusRgb(x: number, y: number): { x: number; y: number; idx: number; hex: string } {
		const ix: number = Math.floor(x);
		const iy: number = Math.floor(y);
		if (ix < 0 || iy < 0 || ix >= CANVAS_WIDTH || iy >= CANVAS_HEIGHT) {
			return { x: ix, y: iy, idx: -1, hex: "----" };
		}
		let idx: number = this.surface.getIndex(ix, iy);
		if (this.floating !== null) {
			const lx: number = ix - this.floating.floatX;
			const ly: number = iy - this.floating.floatY;
			if (lx >= 0 && ly >= 0 && lx < this.floating.w && ly < this.floating.h) {
				const m: number =
					this.floating.mask === null
						? 1
						: (this.floating.mask[ly * this.floating.w + lx] ?? 0);
				if (m !== 0) {
					idx = this.floating.data[ly * this.floating.w + lx] ?? idx;
				}
			}
		}
		const { r, g, b } = getRgbForPixel(idx, this.docPalette);
		const hex: string = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
		return { x: ix, y: iy, idx, hex };
	}

	private notify(): void {
		for (const fn of this.listeners) {
			fn();
		}
	}

	private compositeFloatingOntoImageData(target: ImageData): void {
		if (this.floating === null) {
			return;
		}
		const data: Uint8ClampedArray = target.data;
		for (let yy: number = 0; yy < this.floating.h; yy += 1) {
			for (let xx: number = 0; xx < this.floating.w; xx += 1) {
				const m: number =
					this.floating.mask === null ? 1 : (this.floating.mask[yy * this.floating.w + xx] ?? 0);
				if (m === 0) {
					continue;
				}
				const gx: number = this.floating.floatX + xx;
				const gy: number = this.floating.floatY + yy;
				if (gx < 0 || gy < 0 || gx >= CANVAS_WIDTH || gy >= CANVAS_HEIGHT) {
					continue;
				}
				const idx: number = this.floating.data[yy * this.floating.w + xx] ?? 0;
				const { r, g, b } = getRgbForPixel(idx, this.docPalette);
				const p: number = (gy * CANVAS_WIDTH + gx) * 4;
				data[p] = r;
				data[p + 1] = g;
				data[p + 2] = b;
				data[p + 3] = 255;
			}
		}
	}

	private hitFloating(x: number, y: number): boolean {
		if (this.floating === null) {
			return false;
		}
		for (let yy: number = 0; yy < this.floating.h; yy += 1) {
			for (let xx: number = 0; xx < this.floating.w; xx += 1) {
				const m: number =
					this.floating.mask === null ? 1 : (this.floating.mask[yy * this.floating.w + xx] ?? 0);
				if (m === 0) {
					continue;
				}
				const gx: number = this.floating.floatX + xx;
				const gy: number = this.floating.floatY + yy;
				if (gx === x && gy === y) {
					return true;
				}
			}
		}
		return false;
	}

	private commitFloating(): void {
		if (this.floating === null) {
			return;
		}
		for (let yy: number = 0; yy < this.floating.h; yy += 1) {
			for (let xx: number = 0; xx < this.floating.w; xx += 1) {
				const m: number =
					this.floating.mask === null ? 1 : (this.floating.mask[yy * this.floating.w + xx] ?? 0);
				if (m === 0) {
					continue;
				}
				const gx: number = this.floating.floatX + xx;
				const gy: number = this.floating.floatY + yy;
				if (gx >= 0 && gy >= 0 && gx < CANVAS_WIDTH && gy < CANVAS_HEIGHT) {
					const v: number = this.floating.data[yy * this.floating.w + xx] ?? 0;
					this.surface.setIndex(gx, gy, v);
				}
			}
		}
		this.floating = null;
		this.notify();
	}

	private clearFloating(): void {
		this.floating = null;
	}

	private pushUndo(): void {
		this.undoStack.push(this.surface.clone());
		this.redoStack.length = 0;
		if (this.undoStack.length > 48) {
			this.undoStack.shift();
		}
	}

	private onRightDown(x: number, y: number): void {
		if (this.tool === "picker") {
			this.setBgIndex(this.surface.getIndex(x, y));
			return;
		}
		if (this.tool === "selectLasso") {
			this.closeLassoIfReady();
		}
	}

	private onLeftDown(x: number, y: number): void {
		if (this.tool === "picker") {
			this.setFgIndex(this.surface.getIndex(x, y));
			return;
		}
		if (this.tool === "bucket") {
			this.pushUndo();
			floodFill(this.surface, x, y, this.fgIndex, this.pattern);
			this.notify();
			return;
		}
		if (this.tool === "line") {
			if (this.lineSnap === null) {
				this.pushUndo();
				this.lineSnap = this.surface.clone();
				this.lineX0 = x;
				this.lineY0 = y;
				this.lineCurX = x;
				this.lineCurY = y;
			}
			this.notify();
			return;
		}
		if (this.tool === "selectRect") {
			this.selectX0 = x;
			this.selectY0 = y;
			this.selectCurX = x;
			this.selectCurY = y;
			this.paintDown = true;
			this.notify();
			return;
		}
		if (this.tool === "selectLasso") {
			if (this.lassoPoints.length === 0) {
				this.lassoPoints = [{ x, y }];
				this.lassoHoverX = x;
				this.lassoHoverY = y;
				this.paintDown = true;
				this.notify();
				return;
			}
			const first: Point = this.lassoPoints[0] ?? { x: 0, y: 0 };
			const dx: number = x - first.x;
			const dy: number = y - first.y;
			if (this.lassoPoints.length >= 3 && dx * dx + dy * dy <= 16) {
				this.finishLassoSelect();
				return;
			}
			this.lassoPoints = [...this.lassoPoints, { x, y }];
			this.lassoHoverX = x;
			this.lassoHoverY = y;
			this.notify();
			return;
		}
		this.pushUndo();
		this.paintDown = true;
		this.lastPaintX = x;
		this.lastPaintY = y;
		if (this.tool === "pencil") {
			stampPencilSquare(this.surface, x, y, this.toolSize, this.fgIndex, this.pattern, false);
		} else if (this.tool === "brush") {
			stampBrushCircle(this.surface, x, y, this.toolSize, this.fgIndex, this.pattern);
		} else if (this.tool === "eraser") {
			stampPencilSquare(this.surface, x, y, this.toolSize, this.bgIndex, this.pattern, false);
		}
		this.notify();
	}

	private finishRectSelect(x1: number, y1: number): void {
		if (this.selectX0 === null || this.selectY0 === null) {
			return;
		}
		const x0: number = this.selectX0;
		const y0: number = this.selectY0;
		this.selectX0 = null;
		this.selectY0 = null;
		const rx: number = Math.min(x0, x1);
		const ry: number = Math.min(y0, y1);
		const rw: number = Math.abs(x1 - x0) + 1;
		const rh: number = Math.abs(y1 - y0) + 1;
		if (rw < 2 || rh < 2) {
			this.notify();
			return;
		}
		this.pushUndo();
		const data: Uint8Array = copyRect(this.surface, rx, ry, rw, rh);
		clearRect(this.surface, rx, ry, rw, rh, this.bgIndex);
		this.floating = {
			w: rw,
			h: rh,
			data,
			mask: null,
			outlineRel: null,
			originX: rx,
			originY: ry,
			floatX: rx,
			floatY: ry,
			grabDx: 0,
			grabDy: 0,
			dragging: false,
		};
		this.notify();
	}

	private closeLassoIfReady(): void {
		if (this.lassoPoints.length >= 3) {
			this.finishLassoSelect();
		}
	}

	private finishLassoSelect(): void {
		if (this.lassoPoints.length < 3) {
			return;
		}
		const poly: Point[] = [...this.lassoPoints];
		this.lassoPoints = [];
		this.lassoHoverX = null;
		this.lassoHoverY = null;
		const { x, y, w, h, mask } = rasterizePolygonMask(poly);
		if (w < 1 || h < 1) {
			this.notify();
			return;
		}
		this.pushUndo();
		const data: Uint8Array = new Uint8Array(w * h);
		for (let yy: number = 0; yy < h; yy += 1) {
			for (let xx: number = 0; xx < w; xx += 1) {
				const m: number = mask[yy * w + xx] ?? 0;
				if (m === 0) {
					data[yy * w + xx] = 0;
					continue;
				}
				const gx: number = x + xx;
				const gy: number = y + yy;
				data[yy * w + xx] = this.surface.getIndex(gx, gy);
				this.surface.setIndex(gx, gy, this.bgIndex);
			}
		}
		const outlineRel: Point[] = poly.map((p: Point) => ({ x: p.x - x, y: p.y - y }));
		this.floating = {
			w,
			h,
			data,
			mask,
			outlineRel,
			originX: x,
			originY: y,
			floatX: x,
			floatY: y,
			grabDx: 0,
			grabDy: 0,
			dragging: false,
		};
		this.notify();
	}

	private strokePencil(x: number, y: number): void {
		if (this.lastPaintX < 0) {
			this.lastPaintX = x;
			this.lastPaintY = y;
			stampPencilSquare(this.surface, x, y, this.toolSize, this.fgIndex, this.pattern, false);
			return;
		}
		stampPolyline(
			this.surface,
			this.lastPaintX,
			this.lastPaintY,
			x,
			y,
			this.toolSize,
			this.fgIndex,
			this.pattern,
			"square",
			false,
		);
		this.lastPaintX = x;
		this.lastPaintY = y;
	}

	private strokeBrush(x: number, y: number): void {
		if (this.lastPaintX < 0) {
			this.lastPaintX = x;
			this.lastPaintY = y;
			stampBrushCircle(this.surface, x, y, this.toolSize, this.fgIndex, this.pattern);
			return;
		}
		stampPolyline(
			this.surface,
			this.lastPaintX,
			this.lastPaintY,
			x,
			y,
			this.toolSize,
			this.fgIndex,
			this.pattern,
			"circle",
		);
		this.lastPaintX = x;
		this.lastPaintY = y;
	}

	private strokeEraser(x: number, y: number): void {
		if (this.lastPaintX < 0) {
			this.lastPaintX = x;
			this.lastPaintY = y;
			stampPencilSquare(this.surface, x, y, this.toolSize, this.bgIndex, this.pattern, false);
			return;
		}
		stampPolyline(
			this.surface,
			this.lastPaintX,
			this.lastPaintY,
			x,
			y,
			this.toolSize,
			this.bgIndex,
			this.pattern,
			"square",
			false,
		);
		this.lastPaintX = x;
		this.lastPaintY = y;
	}
}
