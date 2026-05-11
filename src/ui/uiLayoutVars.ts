/**
 * Root-level CSS custom properties for shell layout. Applied once at app mount;
 * win1.css references these names with matching fallbacks.
 */
export const UI_LAYOUT_VARS: Readonly<Record<string, string>> = {
	"--ui-shell-body-padding": "12px",
	"--ui-shell-max-width-calc": "calc(100vw - 2 * var(--ui-shell-body-padding))",
	"--ui-gap-xs": "4px",
	"--ui-gap-md": "8px",
	"--ui-gap-lg": "12px",
	"--ui-palette-row-gap": "12px",
	"--ui-tool-select-max-width": "min(24ch, 100%)",
	"--ui-pattern-select-max-width": "min(18ch, 100%)",
	"--ui-line-cap-select-max-width": "min(11ch, 100%)",
	"--ui-cga-select-max-width": "min(20ch, 100%)",
	"--ui-size-input-width": "3rem",
	"--ui-zoom-input-width": "3rem",
	"--ui-swatch-side": "28px",
};

export function applyUiLayoutVars(root: HTMLElement = document.documentElement): void {
	for (const [key, value] of Object.entries(UI_LAYOUT_VARS)) {
		root.style.setProperty(key, value);
	}
}
