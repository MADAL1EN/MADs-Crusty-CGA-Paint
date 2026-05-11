import { el } from "./dom.js";

export interface CgaDropdownOption<T extends string> {
	readonly value: T;
	readonly label: string;
}

let sharedMeasureSpan: HTMLSpanElement | null = null;

function measureTextWidth(
	face: HTMLElement,
	text: string,
	fontSizeScale: number = 1,
	fontWeightOverride: string | null = null,
): number {
	if (sharedMeasureSpan === null) {
		sharedMeasureSpan = document.createElement("span");
		sharedMeasureSpan.style.position = "absolute";
		sharedMeasureSpan.style.left = "-9999px";
		sharedMeasureSpan.style.top = "0";
		sharedMeasureSpan.style.whiteSpace = "nowrap";
		sharedMeasureSpan.style.visibility = "hidden";
		sharedMeasureSpan.style.pointerEvents = "none";
		document.body.appendChild(sharedMeasureSpan);
	}
	const cs: CSSStyleDeclaration = getComputedStyle(face);
	const basePx: number = Number.parseFloat(cs.fontSize) || 18;
	sharedMeasureSpan.style.fontFamily = cs.fontFamily;
	sharedMeasureSpan.style.fontWeight = fontWeightOverride ?? cs.fontWeight;
	sharedMeasureSpan.style.fontStyle = cs.fontStyle;
	sharedMeasureSpan.style.fontVariant = cs.fontVariant;
	sharedMeasureSpan.style.letterSpacing = cs.letterSpacing;
	sharedMeasureSpan.style.fontSize = `${String(basePx * fontSizeScale)}px`;
	sharedMeasureSpan.textContent = text;
	return sharedMeasureSpan.offsetWidth;
}

function parseGapToPx(gapRaw: string, fontSizePx: number): number {
	const t: string = gapRaw.trim();
	if (t === "" || t === "normal") {
		return 0;
	}
	if (t.endsWith("px")) {
		return Number.parseFloat(t) || 0;
	}
	if (t.endsWith("em")) {
		return (Number.parseFloat(t) || 0) * fontSizePx;
	}
	if (t.endsWith("rem")) {
		const rootPx: number = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
		return (Number.parseFloat(t) || 0) * rootPx;
	}
	return 0;
}

function viewportListMarginPx(): number {
	const fs: number = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
	return Math.max(6, Math.round(fs * 0.45));
}

function horizontalPaddingAndBorder(face: HTMLElement): number {
	const cs: CSSStyleDeclaration = getComputedStyle(face);
	const pl: number = Number.parseFloat(cs.paddingLeft) || 0;
	const pr: number = Number.parseFloat(cs.paddingRight) || 0;
	const bl: number = Number.parseFloat(cs.borderLeftWidth) || 0;
	const br: number = Number.parseFloat(cs.borderRightWidth) || 0;
	return pl + pr + bl + br;
}

/**
 * Flat custom single-select; colours come from inherited `--cga-*` CSS variables on an ancestor.
 * Face and list widths follow measured label text; list height grows with content and only scrolls
 * when the open menu would exceed the viewport, with space reserved for the scrollbar.
 */
export class CgaDropdown<T extends string> {
	readonly root: HTMLDivElement;
	private readonly face: HTMLButtonElement;
	private readonly list: HTMLDivElement;
	private readonly options: ReadonlyArray<CgaDropdownOption<T>>;
	private readonly onPick: (value: T) => void;
	private open: boolean = false;
	private value: T;
	private readonly outsideClose: (ev: PointerEvent) => void;
	private readonly escapeClose: (ev: KeyboardEvent) => void;
	private readonly onWindowResize: () => void;

	public constructor(
		className: string,
		options: ReadonlyArray<CgaDropdownOption<T>>,
		initial: T,
		onPick: (value: T) => void,
	) {
		this.options = options;
		this.onPick = onPick;
		this.value = initial;
		this.root = el("div", `cga-dropdown ${className}`);
		this.face = el("button", "cga-dropdown__face", "");
		this.face.type = "button";
		this.face.setAttribute("aria-haspopup", "listbox");
		this.face.setAttribute("aria-expanded", "false");
		this.list = el("div", "cga-dropdown__list");
		this.list.setAttribute("role", "listbox");
		this.root.append(this.face, this.list);
		this.outsideClose = (ev: PointerEvent): void => {
			if (!this.open) {
				return;
			}
			const t: EventTarget | null = ev.target;
			if (t instanceof Node && this.root.contains(t)) {
				return;
			}
			this.setOpen(false);
		};
		document.addEventListener("pointerdown", this.outsideClose, true);
		this.escapeClose = (ev: KeyboardEvent): void => {
			if (ev.key === "Escape" && this.open) {
				this.setOpen(false);
			}
		};
		document.addEventListener("keydown", this.escapeClose, true);
		this.onWindowResize = (): void => {
			if (this.open) {
				this.layoutListGeometry();
			}
		};
		this.face.addEventListener("click", (): void => {
			this.setOpen(!this.open);
		});
		this.rebuildList();
	}

	public destroy(): void {
		document.removeEventListener("pointerdown", this.outsideClose, true);
		document.removeEventListener("keydown", this.escapeClose, true);
		window.removeEventListener("resize", this.onWindowResize);
	}

	public getValue(): T {
		return this.value;
	}

	public setValue(next: T): void {
		this.value = next;
		this.syncFace();
	}

	public setDisabled(disabled: boolean): void {
		this.face.disabled = disabled;
		if (disabled) {
			this.setOpen(false);
		}
	}

	private syncFace(): void {
		const lab: string | undefined = this.options.find((o: CgaDropdownOption<T>) => o.value === this.value)?.label;
		const text: string = lab ?? this.value;
		this.face.textContent = text;
		this.updateFaceMinWidth(text);
	}

	private updateFaceMinWidth(currentLabelText: string): void {
		const cs: CSSStyleDeclaration = getComputedStyle(this.face);
		const fontSizePx: number = Number.parseFloat(cs.fontSize) || 18;
		const gapPx: number = parseGapToPx(cs.columnGap, fontSizePx);
		let maxText: number = measureTextWidth(this.face, currentLabelText);
		for (const o of this.options) {
			maxText = Math.max(maxText, measureTextWidth(this.face, o.label));
		}
		const chevronW: number = measureTextWidth(this.face, "v", 0.72, "700");
		const inner: number = maxText + gapPx + chevronW;
		const total: number = Math.ceil(inner + horizontalPaddingAndBorder(this.face));
		this.face.style.minWidth = `${String(total)}px`;
	}

	private rebuildList(): void {
		this.list.replaceChildren();
		for (const opt of this.options) {
			const row: HTMLButtonElement = el("button", "cga-dropdown__option", opt.label);
			row.type = "button";
			row.dataset.value = opt.value;
			row.addEventListener("click", (): void => {
				this.value = opt.value;
				this.syncFace();
				this.setOpen(false);
				this.onPick(opt.value);
			});
			this.list.appendChild(row);
		}
		this.syncFace();
	}

	/**
	 * Sizes the list to measured content; only caps height when it would exceed the viewport
	 * and then enables scrolling with stable scrollbar gutter so text is not covered.
	 */
	private layoutListGeometry(): void {
		this.list.classList.remove("cga-dropdown__list--scroll");
		this.list.style.maxHeight = "";
		this.list.style.overflowY = "visible";

		this.list.style.display = "block";
		this.list.style.visibility = "hidden";
		this.list.style.minWidth = `${String(this.face.offsetWidth)}px`;

		const contentW: number = this.list.scrollWidth;
		const contentH: number = this.list.scrollHeight;
		const faceW: number = this.face.offsetWidth;
		const listW: number = Math.max(faceW, contentW);
		this.list.style.minWidth = `${String(listW)}px`;

		const rect: DOMRect = this.face.getBoundingClientRect();
		const margin: number = viewportListMarginPx();
		const availBelow: number = Math.max(1, window.innerHeight - rect.bottom - margin);

		if (contentH <= availBelow) {
			this.list.style.maxHeight = "";
			this.list.style.overflowY = "visible";
		} else {
			this.list.style.maxHeight = `${String(Math.floor(availBelow))}px`;
			this.list.style.overflowY = "auto";
			this.list.classList.add("cga-dropdown__list--scroll");
		}

		this.list.style.visibility = "visible";
	}

	private resetListLayoutStyles(): void {
		this.list.classList.remove("cga-dropdown__list--scroll");
		this.list.style.maxHeight = "";
		this.list.style.overflowY = "";
		this.list.style.minWidth = "";
		this.list.style.visibility = "";
	}

	private setOpen(next: boolean): void {
		this.open = next;
		if (next) {
			this.list.style.display = "block";
			this.layoutListGeometry();
			window.addEventListener("resize", this.onWindowResize);
		} else {
			window.removeEventListener("resize", this.onWindowResize);
			this.list.style.display = "none";
			this.resetListLayoutStyles();
		}
		this.root.classList.toggle("cga-dropdown--open", next);
		this.face.setAttribute("aria-expanded", next ? "true" : "false");
	}
}
