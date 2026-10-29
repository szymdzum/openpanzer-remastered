// @vitest-environment node
//The attack cursor on the map's canvas (src/view/map/attackdraw.ts, #441) on a context that records what it is told: the
//brass crosshair and both losses in their sides' colours, as the old cursor showed them; a retreat's trail
import { expect, test } from "vitest";
import { drawPreview } from "../src/view/map/attackdraw";
import type { Viewport } from "../src/view/map/canvas";
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
const glance = { at: { row: 4, col: 4 }, yours: { side: 0, loss: 6 }, theirs: { side: 1, loss: 0 } };

test("Over a target: the brass crosshair, your loss on your side's colour, theirs on theirs (0 for none), nothing else (#441)", () => {
	const { ctx, ops } = recorder();
	drawPreview(ctx, vp, { glance, trail: null });
	expect(ops.some((o) => o.op === "stroke" && o.strokeStyle === MAP["hex-select"] && o.lineWidth === 2)).toBe(true);
	const texts = ops.filter((o) => o.op === "fillText").map((o) => o.args[0]);
	expect(texts).toEqual(["−6", "0"]);
	const chip = (t: string) => ops.slice(0, ops.findIndex((o) => o.op === "fillText" && o.args[0] === t)).reverse().find((o) => o.op === "fillRect")!;
	expect([chip("−6").fillStyle, chip("0").fillStyle]).toEqual([MAP["map-axis"], MAP["map-allied"]]);
	expect(ops.filter((o) => o.op === "fillRect")).toHaveLength(2);
});

test("A retreat just shown: a dashed light line from where the defender stood, over the dark under-stroke (CombatResults)", () => {
	const { ctx, ops } = recorder();
	drawPreview(ctx, vp, { glance: null, trail: { from: { row: 4, col: 4 }, to: { row: 3, col: 4 } } });
	expect(ops.filter((o) => o.op === "stroke").map((o) => [o.strokeStyle, o.lineWidth])).toEqual([[MAP["hex-shadow"], 4], [MAP["map-paper-raised"], 2]]);
});
