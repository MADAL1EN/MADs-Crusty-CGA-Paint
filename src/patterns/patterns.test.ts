import { describe, expect, it } from "vitest";
import { patternApplies } from "./patterns.js";

describe("patternApplies", () => {
	it("solid is always true", () => {
		expect(patternApplies("solid", 0, 0)).toBe(true);
		expect(patternApplies("solid", -3, 99)).toBe(true);
	});

	it("checker alternates on grid", () => {
		expect(patternApplies("checker", 0, 0)).toBe(true);
		expect(patternApplies("checker", 1, 0)).toBe(false);
		expect(patternApplies("checker", 1, 1)).toBe(true);
	});

	it("dither is deterministic for same coordinates", () => {
		const a: boolean = patternApplies("dither", 7, 3);
		const b: boolean = patternApplies("dither", 7, 3);
		expect(a).toBe(b);
	});

	it("diagBack uses x−y diagonals (period 3)", () => {
		expect(patternApplies("diagBack", 0, 0)).toBe(true);
		expect(patternApplies("diagBack", 1, 1)).toBe(true);
		expect(patternApplies("diagBack", 1, 0)).toBe(false);
		expect(patternApplies("diagBack", -2, 1)).toBe(true);
	});

	it("diagFwd uses x+y diagonals (period 3)", () => {
		expect(patternApplies("diagFwd", 0, 0)).toBe(true);
		expect(patternApplies("diagFwd", 1, 2)).toBe(true);
		expect(patternApplies("diagFwd", 1, 0)).toBe(false);
		expect(patternApplies("diagFwd", -1, 1)).toBe(true);
	});
});
