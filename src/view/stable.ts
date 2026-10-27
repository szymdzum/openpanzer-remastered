//Derived views kept while their content is the same (review A6). Every step gives a new world, so a computed that builds
//an object from it gives a new object even when nothing it shows changed, and whatever reads it renders again: the unit
//card, its context menu, the turn reports. A stable computed hands back the object it gave before when the new one is the
//same data, and a signal that keeps its value tells no one.
import { computed, type ReadonlySignal } from "@preact/signals";

//Two values the same as data: the same primitives, arrays of the same data, plain objects with the same keys and the same
//data under them. Anything else (a function, a class's instance) only when it is the same object
export function sameData(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
	if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => sameData(v, b[i]));
	if (!plain(a) || !plain(b) || Array.isArray(b)) return false;
	const x = a as Record<string, unknown>, y = b as Record<string, unknown>, keys = Object.keys(x);
	return keys.length === Object.keys(y).length && keys.every((k) => Object.prototype.hasOwnProperty.call(y, k) && sameData(x[k], y[k]));
}

function plain(o: object): boolean {
	const p = Object.getPrototypeOf(o) as unknown;
	return p === Object.prototype || p === null;
}

//A computed of view data that keeps its last value while the new one is the same data
export function stableComputed<T>(fn: () => T): ReadonlySignal<T> {
	let last: { value: T } | null = null;
	return computed(() => {
		const value = fn();
		if (last !== null && sameData(value, last.value)) return last.value;
		last = { value };
		return value;
	});
}
