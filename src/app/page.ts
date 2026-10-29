/**
 * DOM generic functions: the page's viewport and the Chrome app check
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2012 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle, names and comments
 * carried over from the openpanzer 2.9 source where the code matches.
 */

import { uiSettings } from "./settings";

//The element type is the caller's: $<HTMLInputElement>("x").value, or inferred from the variable
//it is assigned to
function $<T extends HTMLElement = HTMLElement>(id: string): T {
	return document.getElementById(id) as T;
}

//The parent is an id or an element
function addTag<K extends keyof HTMLElementTagNameMap>(parent: string | Node | null, tag: K): HTMLElementTagNameMap[K];
function addTag(parent: string | Node | null, tag: string): HTMLElement;
function addTag(parent: string | Node | null, tag: string): HTMLElement {
	var e: Node;
	var t = document.createElement(tag);

	if (typeof(parent) === 'string') {	e = $(parent); }
	else {e = parent;}

	if (e !== null)
		e.appendChild(t);

	return t;
}

export function isChromeApp(): any {
	return window.chrome && chrome.app && chrome.app.runtime;
}

export function changeViewPort(): void {
	var i: number, meta: HTMLMetaElement = null;
	var scale = 1.0;
	var maximumScale = 1.0;
	var deviceWidth = "width=device-width, "; //Device width viewport statement. For iPhone 5 FS it won't be applied
	var ratio = window.devicePixelRatio || 1;
	var metaTags = document.getElementsByTagName("meta");

	for (i = 0; i < metaTags.length; i++)
			if (metaTags[i].name == "viewport")
				meta = metaTags[i];

	if (meta === null) {
		meta = addTag(document.getElementsByTagName('head')[0], "meta");
		meta.id = "viewport";
		meta.name = "viewport";
	}

	if (navigator.userAgent.match(/(iPhone|iPod)/i)) { //Use retina automatically on iPhone/iPod
		deviceWidth = ""; //Don't set device-width for iPhones to prevent letterboxing on iPhone5
		//Old iPhone non retina scale it down to 0.5
		if (ratio == 1.0)
			ratio = 2.0;
	}

	//For Android where 1.5 means hidpi
	if (ratio > 1 && ratio < 2)
		ratio = 2;

	if (uiSettings.useRetina) {
		scale = 1.0 / ratio;
		maximumScale = scale;
	}

	meta.content = deviceWidth + "initial-scale=" + scale +",maximum-scale=" + maximumScale + " , user-scalable=1";
}
