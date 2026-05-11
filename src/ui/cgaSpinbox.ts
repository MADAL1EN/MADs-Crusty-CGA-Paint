import { el } from "./dom.js";

/**
 * Flat numeric stepper with optional direct typing in the field.
 */
export class CgaSpinbox {
	readonly root: HTMLDivElement;
	private readonly minus: HTMLButtonElement;
	private readonly plus: HTMLButtonElement;
	readonly field: HTMLInputElement;
	private static nextFieldId: number = 0;
	private readonly minV: number;
	private readonly maxV: number;
	private readonly step: number;
	private onChange: (value: number) => void;

	public constructor(
		className: string,
		minV: number,
		maxV: number,
		step: number,
		initial: number,
		onChange: (value: number) => void,
	) {
		this.minV = minV;
		this.maxV = maxV;
		this.step = step;
		this.onChange = onChange;
		this.root = el("div", `cga-spinbox ${className}`);
		this.minus = el("button", "cga-spinbox__btn", "−");
		this.minus.type = "button";
		this.plus = el("button", "cga-spinbox__btn", "+");
		this.plus.type = "button";
		this.field = el("input", "cga-spinbox__field");
		this.field.type = "text";
		this.field.id = `cga-spin-field-${String(CgaSpinbox.nextFieldId)}`;
		CgaSpinbox.nextFieldId += 1;
		this.field.inputMode = "numeric";
		this.field.autocomplete = "off";
		this.field.spellcheck = false;
		this.setInternalValue(initial, false);
		this.minus.addEventListener("click", (): void => {
			this.setInternalValue(this.getInternalValue() - this.step, true);
		});
		this.plus.addEventListener("click", (): void => {
			this.setInternalValue(this.getInternalValue() + this.step, true);
		});
		this.field.addEventListener("change", (): void => {
			this.commitField();
		});
		this.field.addEventListener("keydown", (ev: KeyboardEvent): void => {
			if (ev.key === "Enter") {
				this.commitField();
			}
		});
		this.root.append(this.minus, this.field, this.plus);
	}

	public getValue(): number {
		return this.getInternalValue();
	}

	public setValue(n: number, notify: boolean): void {
		this.setInternalValue(n, notify);
	}

	public setDisabled(disabled: boolean): void {
		this.field.disabled = disabled;
		this.minus.disabled = disabled;
		this.plus.disabled = disabled;
	}

	private getInternalValue(): number {
		const parsed: number = Number.parseInt(this.field.value, 10);
		if (!Number.isFinite(parsed)) {
			return this.minV;
		}
		return this.clamp(parsed);
	}

	private clamp(n: number): number {
		return Math.max(this.minV, Math.min(this.maxV, n | 0));
	}

	private setInternalValue(n: number, notify: boolean): void {
		const v: number = this.clamp(n);
		this.field.value = String(v);
		if (notify) {
			this.onChange(v);
		}
	}

	private commitField(): void {
		const v: number = this.getInternalValue();
		this.field.value = String(v);
		this.onChange(v);
	}
}
