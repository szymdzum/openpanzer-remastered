/**
 * Small helpers the engine and the UI share, no DOM
 *
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 */

//True if v is neither undefined nor null
export function defined<T>(v: T): v is NonNullable<T> {
	return typeof v !== "undefined" && v !== null;
}
