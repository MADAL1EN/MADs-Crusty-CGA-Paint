import "../style/win1.css";
import { PaintEngine } from "../paint/PaintEngine.js";
import type { ToolId } from "../paint/toolIds.js";
import { CanvasPresenter } from "../rendering/CanvasPresenter.js";
import { getFrameRgbColors } from "../palette/cga.js";
import type { PatternId } from "../patterns/patterns.js";
import { el } from "../ui/dom.js";
import { applyCgaShellTheme } from "../ui/cgaChrome.js";
import { CgaDropdown } from "../ui/cgaDropdown.js";
import { CgaSpinbox } from "../ui/cgaSpinbox.js";
import { logicalPointerPosition } from "../ui/pointerGeometry.js";
import { applyUiLayoutVars } from "../ui/uiLayoutVars.js";
import { clampDisplayScale, DEFAULT_DISPLAY_SCALE, DISPLAY_SCALE_MAX, DISPLAY_SCALE_MIN } from "../config/displayConfig.js";

export interface MountedPaintApp {
	readonly engine: PaintEngine;
	readonly dispose: () => void;
}

function refreshSwatches(engine: PaintEngine, swatches: HTMLButtonElement[]): void {
	const cols = getFrameRgbColors(engine.docPalette);
	for (let i: number = 0; i < 4; i += 1) {
		const s: HTMLButtonElement | undefined = swatches[i];
		if (s === undefined) {
			continue;
		}
		const rgb = cols[i];
		if (rgb === undefined) {
			continue;
		}
		s.style.backgroundColor = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
		s.removeAttribute("data-role");
		if (engine.fgIndex === i) {
			s.dataset.role = "fg";
		} else if (engine.bgIndex === i) {
			s.dataset.role = "bg";
		}
	}
}

function syncOptionRowVisibility(
	engine: PaintEngine,
	sizeCluster: HTMLElement,
	sizeSpin: CgaSpinbox,
	lineShapeLabel: HTMLElement,
	patternLabel: HTMLElement,
	patternDd: CgaDropdown<PatternId>,
): void {
	const t: ToolId = engine.tool;
	const showSize: boolean = t === "pencil" || t === "brush" || t === "eraser" || t === "line";
	sizeCluster.style.display = showSize ? "" : "none";
	sizeSpin.setDisabled(!showSize);

	lineShapeLabel.style.display = t === "line" ? "" : "none";

	let showPattern: boolean = false;
	if (t === "bucket") {
		showPattern = true;
	} else if ((t === "brush" || t === "line") && engine.toolSize > 1) {
		showPattern = true;
	}
	patternLabel.style.display = showPattern ? "" : "none";
	patternDd.setDisabled(!showPattern);
}

/**
 * Builds the Win 1.0-style shell, wires input with {@link AbortController}, and
 * connects {@link PaintEngine} to {@link CanvasPresenter}.
 */
export function mountPaintApp(root: HTMLElement): MountedPaintApp {
	applyUiLayoutVars();
	const abort: AbortController = new AbortController();
	const { signal } = abort;

	const shell: HTMLDivElement = el("div", "shell");
	const titleBar: HTMLDivElement = el("div", "title-bar", "MADs Crusty Paint");
	shell.appendChild(titleBar);

	const menuBar: HTMLDivElement = el("div", "menu-bar");
	const btnNew: HTMLButtonElement = el("button", "chrome-btn", "New");
	btnNew.type = "button";
	const btnOpen: HTMLButtonElement = el("button", "chrome-btn", "Open...");
	btnOpen.type = "button";
	const btnSave: HTMLButtonElement = el("button", "chrome-btn", "Save PNG");
	btnSave.type = "button";
	const btnUndo: HTMLButtonElement = el("button", "chrome-btn", "Undo");
	btnUndo.type = "button";
	const btnRedo: HTMLButtonElement = el("button", "chrome-btn", "Redo");
	btnRedo.type = "button";
	menuBar.append(btnNew, btnOpen, btnSave, btnUndo, btnRedo);
	shell.appendChild(menuBar);

	const fileInput: HTMLInputElement = document.createElement("input");
	fileInput.type = "file";
	fileInput.accept = "image/*";
	fileInput.style.display = "none";
	shell.appendChild(fileInput);

	const bodyRow: HTMLDivElement = el("div", "body-row");
	const toolDefs: Array<{ id: ToolId; label: string }> = [
		{ id: "pencil", label: "Pencil" },
		{ id: "brush", label: "Brush" },
		{ id: "line", label: "Line" },
		{ id: "bucket", label: "Paint bucket" },
		{ id: "eraser", label: "Eraser" },
		{ id: "picker", label: "Colour picker" },
		{ id: "selectLasso", label: "Select lasso" },
		{ id: "selectRect", label: "Select rect" },
	];

	const side: HTMLDivElement = el("div", "side-panel");

	const swatchRow: HTMLDivElement = el("div", "swatch-row");
	const swatches: HTMLButtonElement[] = [];
	for (let i: number = 0; i < 4; i += 1) {
		const s: HTMLButtonElement = el("button", "swatch", "");
		s.type = "button";
		s.title = `Framebuffer index ${i}. Left: FG. Right: BG.`;
		s.dataset.index = String(i);
		swatches.push(s);
		swatchRow.appendChild(s);
	}

	const paletteExtras: HTMLDivElement = el("div", "palette-extras");

	const paletteSwatchBar: HTMLDivElement = el("div", "palette-swatch-bar");
	paletteSwatchBar.append(swatchRow, paletteExtras);
	side.appendChild(paletteSwatchBar);

	const canvasWrap: HTMLDivElement = el("div", "canvas-wrap");
	const displayCanvas: HTMLCanvasElement = el("canvas", "");
	displayCanvas.id = "paint-canvas";
	canvasWrap.appendChild(displayCanvas);
	side.appendChild(canvasWrap);

	bodyRow.appendChild(side);
	shell.appendChild(bodyRow);

	const statusBar: HTMLDivElement = el("div", "status-bar", "Ready.");
	shell.appendChild(statusBar);
	root.appendChild(shell);

	const engine: PaintEngine = new PaintEngine();
	const presenter: CanvasPresenter = new CanvasPresenter(displayCanvas);

	const patternDefs: ReadonlyArray<{ readonly value: PatternId; readonly label: string }> = [
		{ value: "solid", label: "Solid" },
		{ value: "dither", label: "Dither" },
		{ value: "checker", label: "Checker" },
		{ value: "stripeH", label: "Stripe H" },
		{ value: "stripeV", label: "Stripe V" },
		{ value: "diagBack", label: "Diagonal \u005c" },
		{ value: "diagFwd", label: "Diagonal /" },
	];

	const toolDd: CgaDropdown<ToolId> = new CgaDropdown<ToolId>(
		"cga-dd tool-select",
		toolDefs.map((def) => ({ value: def.id, label: def.label })),
		engine.tool,
		(v: ToolId): void => {
			engine.setTool(v);
		},
	);

	const sizeSpin: CgaSpinbox = new CgaSpinbox(
		"cga-spin size-input",
		1,
		32,
		1,
		engine.toolSize,
		(v: number): void => {
			engine.setToolSize(v);
		},
	);

	const patternDd: CgaDropdown<PatternId> = new CgaDropdown<PatternId>(
		"cga-dd pattern-select",
		patternDefs,
		engine.pattern,
		(v: PatternId): void => {
			engine.setPattern(v);
		},
	);

	const lineDd: CgaDropdown<"square" | "circle"> = new CgaDropdown<"square" | "circle">(
		"cga-dd line-cap-select",
		[
			{ value: "square", label: "Square" },
			{ value: "circle", label: "Round" },
		],
		engine.lineShape,
		(v: "square" | "circle"): void => {
			engine.setLineShape(v);
		},
	);

	const zoomBlock: HTMLDivElement = el("div", "scale-control");
	const scaleReadout: HTMLSpanElement = el("span", "scale-readout");
	scaleReadout.id = "paint-scale-readout";
	let zoomSpin: CgaSpinbox;
	function rerenderChrome(): void {
		applyCgaShellTheme(shell, document.body, engine.docPalette);
		syncOptionRowVisibility(engine, sizeCluster, sizeSpin, lineShapeLabel, patternLabel, patternDd);
		const showCopy: boolean = engine.hasFloatingSelection();
		const showPaste: boolean = engine.hasInternalPasteBuffer();
		copySelBtn.hidden = !showCopy;
		pasteSelBtn.hidden = !showPaste;
		optionsActionsCluster.hidden = !showCopy && !showPaste;
		zoomSpin.setValue(presenter.getScale(), false);
		scaleReadout.textContent = `Scale ×${String(presenter.getScale())}`;
		sizeSpin.setValue(engine.toolSize, false);
		toolDd.setValue(engine.tool);
		patternDd.setValue(engine.pattern);
		lineDd.setValue(engine.lineShape);
		setDd.setValue(engine.docPalette.set === 1 ? "1" : "0");
		refreshSwatches(engine, swatches);
		presenter.sync(engine);
	}

	zoomSpin = new CgaSpinbox(
		"cga-spin zoom-spin",
		DISPLAY_SCALE_MIN,
		DISPLAY_SCALE_MAX,
		1,
		clampDisplayScale(DEFAULT_DISPLAY_SCALE),
		(v: number): void => {
			const next: number = clampDisplayScale(v);
			zoomSpin.setValue(next, false);
			presenter.setScale(next);
			rerenderChrome();
		},
	);
	zoomSpin.root.setAttribute("role", "group");
	zoomSpin.root.setAttribute("aria-labelledby", scaleReadout.id);
	zoomBlock.append(scaleReadout, " ", zoomSpin.root);

	const setLabel: HTMLLabelElement = el("label", "");
	setLabel.append("CGA set ");
	const setDd: CgaDropdown<"0" | "1"> = new CgaDropdown<"0" | "1">(
		"cga-dd cga-set-select",
		[
			{ value: "0", label: "Set 0 (CMY/W)" },
			{ value: "1", label: "Set 1 (RGY)" },
		],
		engine.docPalette.set === 1 ? "1" : "0",
		(v: "0" | "1"): void => {
			engine.setPaletteSet(v === "1" ? 1 : 0);
		},
	);
	setLabel.appendChild(setDd.root);

	paletteExtras.append(setLabel, zoomBlock);

	const copySelBtn: HTMLButtonElement = el("button", "chrome-btn", "Copy");
	copySelBtn.type = "button";
	copySelBtn.title = "Copy the floating selection to the internal buffer.";
	const pasteSelBtn: HTMLButtonElement = el("button", "chrome-btn", "Paste copy");
	pasteSelBtn.type = "button";
	pasteSelBtn.title =
		"Paste the buffer as a new floating layer. Press Enter to merge into the picture.";

	const toolLabel: HTMLLabelElement = el("label", "");
	toolLabel.append("Tool ", toolDd.root);
	const sizeCluster: HTMLDivElement = el("div", "options-labelled-control");
	const sizeLbl: HTMLLabelElement = el("label", "");
	sizeLbl.htmlFor = sizeSpin.field.id;
	sizeLbl.textContent = "Size";
	sizeCluster.append(sizeLbl, sizeSpin.root);
	const patternLabel: HTMLLabelElement = el("label", "");
	patternLabel.append("Pattern ", patternDd.root);
	const lineShapeLabel: HTMLLabelElement = el("label", "");
	lineShapeLabel.append("Line cap ", lineDd.root);

	const optionsRow: HTMLDivElement = el("div", "options-row");
	const optionsToolsCluster: HTMLDivElement = el("div", "options-cluster options-cluster--tools");
	const optionsActionsCluster: HTMLDivElement = el("div", "options-cluster options-cluster--actions");
	optionsToolsCluster.append(toolLabel, sizeCluster, patternLabel, lineShapeLabel);
	optionsActionsCluster.append(copySelBtn, pasteSelBtn);
	optionsRow.append(optionsToolsCluster, optionsActionsCluster);
	side.insertBefore(optionsRow, paletteSwatchBar);

	const unsubscribe: () => void = engine.subscribe(rerenderChrome);

	function statusFromEvent(ev: PointerEvent): void {
		const { x, y } = logicalPointerPosition(ev, displayCanvas);
		const st = engine.getStatusRgb(x, y);
		statusBar.textContent = `x ${st.x}  y ${st.y}  idx ${st.idx}  ${st.hex}`;
	}

	for (const s of swatches) {
		s.addEventListener(
			"pointerdown",
			(ev: PointerEvent): void => {
				const idx: number = Number.parseInt(s.dataset.index ?? "0", 10);
				if (ev.button === 2) {
					engine.setBgIndex(idx);
				} else {
					engine.setFgIndex(idx);
				}
			},
			{ signal },
		);
	}
	copySelBtn.addEventListener(
		"click",
		(): void => {
			engine.copySelectionToBuffer();
		},
		{ signal },
	);
	pasteSelBtn.addEventListener(
		"click",
		(): void => {
			engine.pasteSelectionFromBuffer();
		},
		{ signal },
	);

	btnNew.addEventListener(
		"click",
		(): void => {
			if (
				!window.confirm(
					"Start a new document? The current picture will be replaced. Save first if you need a copy.",
				)
			) {
				return;
			}
			engine.newDocument();
		},
		{ signal },
	);
	btnOpen.addEventListener("click", (): void => fileInput.click(), { signal });
	fileInput.addEventListener(
		"change",
		(): void => {
			const f: File | undefined = fileInput.files?.[0];
			if (f === undefined) {
				fileInput.value = "";
				return;
			}
			if (
				!window.confirm(
					"Open this file? The current picture will be replaced. Save first if you need a copy.",
				)
			) {
				fileInput.value = "";
				return;
			}
			engine.openPngFile(f);
			fileInput.value = "";
		},
		{ signal },
	);
	btnSave.addEventListener("click", (): void => void engine.savePng(), { signal });
	btnUndo.addEventListener("click", (): void => engine.undo(), { signal });
	btnRedo.addEventListener("click", (): void => engine.redo(), { signal });

	displayCanvas.addEventListener(
		"pointerdown",
		(ev: PointerEvent): void => {
			displayCanvas.setPointerCapture(ev.pointerId);
			const { x, y } = logicalPointerPosition(ev, displayCanvas);
			engine.pointerDown(x, y, ev.button);
			statusFromEvent(ev);
		},
		{ signal },
	);
	displayCanvas.addEventListener(
		"pointermove",
		(ev: PointerEvent): void => {
			const { x, y } = logicalPointerPosition(ev, displayCanvas);
			engine.pointerMove(x, y);
			statusFromEvent(ev);
		},
		{ signal },
	);
	displayCanvas.addEventListener(
		"pointerup",
		(ev: PointerEvent): void => {
			const { x, y } = logicalPointerPosition(ev, displayCanvas);
			engine.pointerUp(x, y, ev.button);
			try {
				displayCanvas.releasePointerCapture(ev.pointerId);
			} catch {
				/* ignore */
			}
			statusFromEvent(ev);
		},
		{ signal },
	);
	displayCanvas.addEventListener(
		"pointerleave",
		(ev: PointerEvent): void => {
			engine.clearPaintToolHover();
			statusFromEvent(ev);
		},
		{ signal },
	);
	displayCanvas.addEventListener("contextmenu", (ev: MouseEvent): void => ev.preventDefault(), {
		signal,
	});

	window.addEventListener(
		"keydown",
		(ev: KeyboardEvent): void => {
			if (ev.ctrlKey && ev.key.toLowerCase() === "z") {
				ev.preventDefault();
				engine.undo();
				return;
			}
			if (ev.ctrlKey && ev.key.toLowerCase() === "y") {
				ev.preventDefault();
				engine.redo();
				return;
			}
			engine.keyDown(ev.key);
		},
		{ signal },
	);

	rerenderChrome();

	return {
		engine,
		dispose: (): void => {
			unsubscribe();
			toolDd.destroy();
			patternDd.destroy();
			lineDd.destroy();
			setDd.destroy();
			abort.abort();
			root.removeChild(shell);
		},
	};
}
