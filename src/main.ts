import { mountPaintApp } from "./app/mountPaintApp.js";

const root: HTMLElement | null = document.getElementById("app");
if (root !== null) {
	mountPaintApp(root);
}
