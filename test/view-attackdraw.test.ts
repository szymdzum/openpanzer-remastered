// @vitest-environment node
//The attack preview on the map's canvas (src/view/attackdraw.ts, #347) on a context that records what it is told: the
//grey badges with the pointed one's reason, the brass crosshair, both losses in their sides' colours and the glyph
import { expect, test } from "vitest";
import { drawPreview } from "../src/view/attackdraw";
import type { Viewport } from "../src/view/canvas";
import type { Glyph } from "../src/view/odds";
import { TOKENS } from "../src/view/tokens";

const MAP = TOKENS.map;

interface Op {
	op: string;
	args: unknown[];
	fillStyle: string;
	strokeStyle: string;
	lineWidth: number;
}

function recorder() {
	const ops: Op[] = [];
	const state = { fillStyle: "", strokeStyle: "", lineWidth: 1 };
	const ctx = new Proxy({} as Record<string | symbol, unknown>, {
		get(target, name) {
			if (name in state) return state[name as keyof typeof state];
			if (name in target) return target[name];
			return (...args: unknown[]) => {
				ops.push({ op: String(name), args, ...state });
				return name === "measureText" ? { width: 10 } : undefined;
			};
		},
		set(target, name, value) {
			if (name in state) (state as Record<string, unknown>)[name as string] = value;
			else target[name] = value;
			return true;
		},
	});
	return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

const vp: Viewport = { x: 10, y: 20, width: 600, height: 400, scale: 2, dpr: 2 };
const glance = (glyph: Glyph | null) => ({ at: { row: 4, col: 4 }, yours: { side: 0, loss: 6 }, theirs: { side: 1, loss: 0 }, glyph });

test("Stage 0: a grey badge on each hex the unit can't attack, the reason under the one pointed at", () => {
	const { ctx, ops } = recorder();
	const blocked = [{ at: { row: 3, col: 1 }, reason: "Can't attack aircraft" }, { at: { row: 5, col: 2 }, reason: "No ammo" }];
	drawPreview(ctx, vp, { blocked, blockedAt: blocked[0], glance: null });
	expect(ops.filter((o) => o.op === "fill" && o.fillStyle === MAP["map-paper-sunken"])).toHaveLength(2);
	expect(ops.filter((o) => o.op === "fillText").map((o) => o.args[0])).toEqual(["Can't attack aircraft"]);
});

test("Stage 1: the brass crosshair, your loss on your side's colour, theirs on theirs (0 for none), one glyph in its tone", () => {
	const { ctx, ops } = recorder();
	drawPreview(ctx, vp, { blocked: [], blockedAt: null, glance: glance("rugged") });
	expect(ops.some((o) => o.op === "stroke" && o.strokeStyle === MAP["hex-select"] && o.lineWidth === 2)).toBe(true);
	const texts = ops.filter((o) => o.op === "fillText").map((o) => o.args[0]);
	expect(texts).toEqual(["−6", "0"]);
	const chip = (t: string) => ops.slice(0, ops.findIndex((o) => o.op === "fillText" && o.args[0] === t)).reverse().find((o) => o.op === "fillRect")!;
	expect([chip("−6").fillStyle, chip("0").fillStyle]).toEqual([MAP["map-axis"], MAP["map-allied"]]);
	const square = (g: Glyph | null) => {
		const r = recorder();
		drawPreview(r.ctx, vp, { blocked: [], blockedAt: null, glance: glance(g) });
		return r.ops.filter((o) => o.op === "fillRect" && o.args[2] === 16).map((o) => o.fillStyle);
	};
	expect([square("rugged"), square("overrun"), square("no-return"), square("support"), square(null)])
		.toEqual([[MAP["map-critical"]], [MAP["map-ok"]], [MAP["map-ok"]], [MAP["map-low"]], []]);
});
