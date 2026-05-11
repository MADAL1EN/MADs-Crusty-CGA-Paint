import { describe, expect, it } from "vitest";
import { IndexedSurface } from "../canvas/indexedSurface.js";
import { floodFill } from "./floodFill.js";

describe("floodFill", () => {
	it("fills a flat region", () => {
		const s: IndexedSurface = new IndexedSurface();
		s.fill(0);
		s.setIndex(5, 5, 1);
		s.setIndex(6, 5, 1);
		s.setIndex(5, 6, 1);
		floodFill(s, 5, 5, 2, "solid");
		expect(s.getIndex(5, 5)).toBe(2);
		expect(s.getIndex(6, 5)).toBe(2);
		expect(s.getIndex(5, 6)).toBe(2);
		expect(s.getIndex(0, 0)).toBe(0);
	});

	it("does nothing when replacement equals target", () => {
		const s: IndexedSurface = new IndexedSurface();
		s.fill(1);
		floodFill(s, 0, 0, 1, "solid");
		expect(s.getIndex(0, 0)).toBe(1);
	});

	it("fills the entire canvas when every pixel shares the flood colour", () => {
		const s: IndexedSurface = new IndexedSurface();
		s.fill(0);
		floodFill(s, 160, 100, 3, "solid");
		for (let y: number = 0; y < 200; y += 1) {
			for (let x: number = 0; x < 320; x += 1) {
				expect(s.getIndex(x, y)).toBe(3);
			}
		}
	});

	it("applies checker pattern inside the filled region", () => {
		const s: IndexedSurface = new IndexedSurface();
		s.fill(2);
		s.setIndex(0, 0, 0);
		s.setIndex(1, 0, 0);
		s.setIndex(0, 1, 0);
		s.setIndex(1, 1, 0);
		floodFill(s, 0, 0, 1, "checker");
		expect(s.getIndex(0, 0)).toBe(1);
		expect(s.getIndex(1, 1)).toBe(1);
		expect(s.getIndex(0, 1)).toBe(0);
		expect(s.getIndex(1, 0)).toBe(0);
		expect(s.getIndex(2, 0)).toBe(2);
	});
});
