/**
 * DOM generic functions
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

import { uiSettings } from "./prototypes";
import { GameState, type GameStateConstructor } from "./gamestate";

//An element with the vendor prefixed style properties the game still sets (Firefox's Moz*)
export interface VendorCSSStyle extends CSSStyleDeclaration
{
	mozTransformOrigin?: string;
	MozTransform?: string;
	MozTransition?: string;
}
export type VendorStyled<T extends HTMLElement = HTMLElement> = T & { style: VendorCSSStyle };

//A glyph button (see toggleButton), hasSelectedGlyph is set by UIBuilder on the buttons that have one
export interface GlyphButton extends HTMLElement
{
	hasSelectedGlyph?: boolean;
}

//True if v is neither undefined nor null
export function defined<T>(v: T): v is NonNullable<T>
{
	return typeof v !== "undefined" && v !== null;
}

// Get the element with ID id
//The element type is the caller's: $<HTMLInputElement>("x").value, or inferred from the variable
//it is assigned to. Elements with custom properties take an interface extending HTMLElement
export function $<T extends HTMLElement = HTMLElement>(id: string): T
{
	return document.getElementById(id) as T;
}

//querySelector shortcut: $$(selector) searches the document, $$(parent, selector) the parent
export function $$<T extends Element = HTMLElement>(selector: string): T;
export function $$<T extends Element = HTMLElement>(parent: ParentNode | null, selector: string): T;
export function $$(parent: ParentNode | string | null, selector?: string): Element
{
	if (arguments.length == 1)
	{
		selector = parent as string;
		parent = document;
	}

	if (!parent)
		parent = document;

	return (parent as ParentNode).querySelector(selector);
}

//can be called with a id string or a element object directly
//return pointer to the newly created tag
export function addTag<K extends keyof HTMLElementTagNameMap>(parent: string | Node | null, tag: K): HTMLElementTagNameMap[K];
export function addTag(parent: string | Node | null, tag: string): HTMLElement;
export function addTag(parent: string | Node | null, tag: string): HTMLElement
{
	var e: Node;
	var t = document.createElement(tag);

	if (typeof(parent) === 'string') {	e = $(parent); }
	else {e = parent;}

	if (e !== null)
		e.appendChild(t);

	return t;
}

//inserta a tag before a child element if child is null is placed at the end of node list
export function insertTag<K extends keyof HTMLElementTagNameMap>(parent: string | Node, tag: K, child: string | Node | null): HTMLElementTagNameMap[K];
export function insertTag(parent: string | Node, tag: string, child: string | Node | null): HTMLElement;
export function insertTag(parent: string | Node, tag: string, child: string | Node | null): HTMLElement
{
	var e: Node, c: Node;
	var t = document.createElement(tag);

	if (typeof(parent) === 'string') { e = $(parent); }
	else { e = parent; }

	if (typeof(child) === 'string') { c = $(child); }
	else { c = child; }

	if (e !== null)
		e.insertBefore(t, c);

	return t;
}

//remove a DOM tag
export function delTag(tag: Node | null): void
{
	if (tag && tag.parentNode)
		tag.parentNode.removeChild(tag);
}

//remove all children of a tag
export function clearTag(tag: string | Node): void
{
	var t: Node;
	if (typeof(tag) === 'string') {	t = $(tag); }
	else {t = tag;}

	while (t && t.hasChildNodes())
		t.removeChild(t.lastChild);
}

//remove one style property of a tag, or the whole style attribute when no property is given
export function clearStyle(tag: string | HTMLElement, property?: string): void
{
	var t: HTMLElement;
	if (typeof(tag) === 'string') {	t = $(tag); }
	else {t = tag;}

	if (defined(property))
		t.style.removeProperty(property);
	else
		t.removeAttribute("style");
}

//append copies of the children of the template element with id templateId to parent
export function insertTemplate(templateId: string, parent: Node): void
{
	var template = $$("#" + templateId);

	for (var i = 0; i < template.children.length; i++)
		parent.appendChild(template.children[i].cloneNode(true));
}

//Returns tag position
export function getPosition(tag: string): DOMRect
{
	var r = {} as DOMRect; //always replaced below

	if (isVisible(tag))
	{
		r = $(tag).getBoundingClientRect();
	}
	else
	{
		makeVisible(tag);
		r = $(tag).getBoundingClientRect();
		makeHidden(tag);
	}

	return r;
}

//Returns the page coordinates of an element, relative to the body
export function getCoordinates(e: Element): { x: number; y: number }
{
	var r = e.getBoundingClientRect();
	var body = document.body.getBoundingClientRect();

	return { x: r.left - body.left + window.scrollX, y: r.top - body.top + window.scrollY };
}

//add an option to a select element
export function addSelectOption(e: string | Node, text: string, value: string | number, selected?: boolean): void
{
	if (selected === undefined || selected === null)
		selected = false;

	var o = addTag(e, "option");
	o.value = value as string; //numbers are converted by the DOM
	o.textContent = text;
	o.selected = selected;
}

//set current option of a select element by matching string
export function setSelectOption(e: HTMLSelectElement, str: string): boolean
{
	var o = e.options;
	for (var i = 0; i < o.length; i++)
	{
		o[i].selected = false; //deselect option
		if (str.trim() === o[i].text.trim())
		{
			o[i].selected = true;
			(e.onchange as () => void)(); //Call the onchange() function
			return true;
		}
	}
	return false;
}

//Taken from http://modernizr.github.com/Modernizr/touch.html
export function hasTouch(): boolean
{
	return "ontouchstart" in window;
}

//Running as a Chrome packaged app
export function isChromeApp(): any
{
	return window.chrome && chrome.app && chrome.app.runtime;
}

//Function to disable/enable right click
export function toggleRightClick( status: boolean ): void
{
	window.oncontextmenu = function() { return status; }
}

export function hasBrokenScroll(): boolean
{
	var ua = navigator.userAgent;
	//Stock android browser on froyo/gingerbread suffers from div overflow scroll issue
	if (ua.match(/android 2/i) && ua.match(/applewebkit/i))
		return true;
	//Chrome mobile on jelly bean has issue bubbling up the evens to the game div and doesn't scroll
	if (ua.match(/android 4/i) &&  ua.match(/chrome/i) && ua.match(/applewebkit/i))
		return true;
	return false;
}

//Android 4.x stock browser has issues clearing the canvas. Canvas retain a random drawing state from the first
//writes that come in a certain time after the canvas was created
export function hasBrokenClearRect(): boolean
{
	var ua = navigator.userAgent;
	if (ua.match(/android 4/i) && !ua.match(/chrome/i))
		return true;
	return false;
}

export function hoverin(e: HTMLImageElement | null): void
{
	if (!e || typeof e === "undefined")
		return;

	var path = e.src.substring(0, e.src.lastIndexOf('/') + 1);
	e.src = path + e.id + "-over.png";
}

export function hoverout(e: HTMLImageElement | null): void
{
	if (!e || typeof e === "undefined")
		return;

	var path = e.src.substring(0, e.src.lastIndexOf('/') + 1);
	e.src = path + e.id + ".png";
}

//Toggle a button made with a font glyph normal button is has lower case letter, selected is uppercase
export function toggleButton(e: GlyphButton | null, state: boolean): boolean
{
	if (!e)
		return false;

	var glyph = e.innerHTML;

	if (state)
	{
		e.setAttribute("selected", "on");
		if (e.hasSelectedGlyph)
			e.innerHTML = glyph.toUpperCase();
	}
	else
	{
		e.removeAttribute("selected");
		if (e.hasSelectedGlyph)
			e.innerHTML = glyph.toLowerCase();
	}

	return true;
}

export function toggleButtonWithImage(p: HTMLElement | null, state: boolean): void
{
	var e: HTMLImageElement;
	//Change the image from the button which *usually* is the firstChild
	if (p && typeof p.firstChild !== "undefined")
		e = p.firstChild as HTMLImageElement;
	else
		e = p as HTMLImageElement;

	if (state)
		hoverin(e);
	else
		hoverout(e);
}

//Toggles a checkbox with glyph, same as toggleButton() but without state
export function toggleCheckbox(e: HTMLElement | null): boolean
{
	if (!e)
		return false;

	var glyph = e.innerHTML;

	if (glyph === glyph.toUpperCase())
		e.innerHTML = glyph.toLowerCase();
	else
		e.innerHTML = glyph.toUpperCase();

	return true;
}

//Toggles a checkbox image(<name>-checked.png must exist)
export function toggleCheckboxWithImage(e: HTMLImageElement | null): void
{
	if (! e || !e.src) return;

	var path = e.src.substring(0, e.src.lastIndexOf('/') + 1);
	var hasChecked = e.src.lastIndexOf('-checked');
	var name: string;

	if (hasChecked > -1)
		name = e.src.substring(e.src.lastIndexOf('/') + 1, hasChecked);
	else
		name = e.src.substring(e.src.lastIndexOf('/') + 1, e.src.lastIndexOf('.')) + "-checked";

	e.src = path + name + ".png";
}

export function isVisible(tag: string): boolean
{
	var v = $(tag).style.display;

	if (v != "" && v != "none")
		return true;

	return false;
}

export function makeVisible(tag: string): void
{
	$(tag).style.display = "inline";
	$(tag).focus();
}

export function makeHidden(tag: string): void
{
	$(tag).style.display = "none";
	$('game').focus(); //focus back the game canvas
}

export function bounceText(x: number, y: number, text: string, positive: boolean): void
{
	var cdiv: VendorStyled = addTag('game', 'div');
	var ldiv = addTag(cdiv, 'div');

	cdiv.style.cssText = "position:absolute; top:"+ y + "px; left:" + x + "px; z-index:200;";

	if (+uiSettings.uiScale != 1)
	{
		var transform = "scale(" + uiSettings.uiScale + "," + uiSettings.uiScale + ")";
		cdiv.style.webkitTransformOrigin = "50% 50%";
		cdiv.style.mozTransformOrigin = "50% 50%";
		cdiv.style.transformOrigin = "50% 50%";

		cdiv.style.webkitTransform = transform;
		cdiv.style.MozTransform = transform;
		cdiv.style.transform = transform;
	}

	//CSS AnimationEvent callback to delete the created parent div
	ldiv.addEventListener("animationend", function() { delTag(this.parentNode); }, false); //mozilla
	ldiv.addEventListener("webkitAnimationEnd", function() { delTag(this.parentNode); }, false); //webkit

	if (positive)
		ldiv.className = "textBounceGreen";
	else
		ldiv.className = "textBounceRed";
	ldiv.innerHTML = text;
}

//Taken from seabreezecomputers.com/tips/scroll-div.htm
export function touchScroll(id: string): void
{
	var scrollStartPosY = 0;
	var scrollStartPosX = 0;

	$(id).addEventListener("touchstart", function(event)
		{
			scrollStartPosY = this.scrollTop + event.touches[0].pageY;
			scrollStartPosX = this.scrollLeft + event.touches[0].pageX;
			//event.preventDefault(); // Keep this remarked so you can click on buttons and links in the div
		}, false);

	$(id).addEventListener("touchmove", function(event)
		{
			// These if statements allow the full page to scroll (not just the div) if they are
			// at the top of the div scroll or the bottom of the div scroll
			// The -5 and +5 below are in case they are trying to scroll the page sideways
			// but their finger moves a few pixels down or up.  The event.preventDefault() function
			// will not be called in that case so that the whole page can scroll.
			if ((this.scrollTop < (this.scrollHeight - this.offsetHeight) &&
				(this.scrollTop + event.touches[0].pageY) < scrollStartPosY - 5) ||
				(this.scrollTop != 0 && (this.scrollTop + event.touches[0].pageY) > (scrollStartPosY + 5)))
					event.preventDefault();

			if ((this.scrollLeft < (this.scrollWidth-this.offsetWidth) &&
				(this.scrollLeft + event.touches[0].pageX) < scrollStartPosX-5) ||
				(this.scrollLeft != 0 && (this.scrollLeft + event.touches[0].pageX) > (scrollStartPosX + 5)))
					event.preventDefault();

			this.scrollTop = scrollStartPosY-event.touches[0].pageY;
			this.scrollLeft = scrollStartPosX-event.touches[0].pageX;
		}, false);
}

export function addStyleSheet(name: string): boolean
{
	var ss = document.createElement("link");
	ss.setAttribute("rel", "stylesheet");
	ss.setAttribute("type", "text/css");
	ss.setAttribute("href", "css/" + name);
	if (!ss || typeof ss === "undefined")
		return false;
	document.getElementsByTagName("head")[0].appendChild(ss);
	return true;
}

//Returns the style of the first css rule with this selector, looking into
//imported stylesheets too. undefined if there is none
export function getStyleSheet(selector: string): CSSStyleDeclaration | undefined
{
	for (var i = 0; i < document.styleSheets.length; i++)
	{
		var rules = document.styleSheets[i].cssRules as ArrayLike<AnyCSSRule>;
		for (var j = 0; j < rules.length; j++)
		{
			if (defined(rules[j].styleSheet)) //@import rule
			{
				for (var k = 0; k < rules[j].styleSheet.cssRules.length; k++)
				{
					var rule = rules[j].styleSheet.cssRules[k] as AnyCSSRule;
					if (rule.selectorText === selector)
						return rule.style;
				}
			}
			else
			{
				if (rules[j].selectorText === selector)
					return rules[j].style;
			}
		}
	}
}

//A css rule read as either an @import rule or a style rule
export type AnyCSSRule = CSSRule & Partial<Pick<CSSImportRule, "styleSheet">> & Partial<Pick<CSSStyleRule, "selectorText" | "style">>;

//The Wails desktop runtime, window.runtime when running in Wails
export interface WailsWindow extends Window
{
	runtime?: { EventsEmit(name: string): void; Quit(): void };
}

//Returns the function that closes the desktop app window (NW.js or Wails), null in a browser
export function getDesktopExitFunction(): (() => void) | null
{
	var exitFunction: (() => void) | null = null;

	try {
		nw.Window.get(); //unused, throws when not running in NW.js
		exitFunction = nw.Window.get().close;
	} catch (e) {}

	try {
		(window as WailsWindow).runtime.EventsEmit("check"); //throws when not running in Wails
		exitFunction = (window as WailsWindow).runtime.Quit;
	} catch (e) {}

	return exitFunction;
}

export function changeViewPort(): void
{
	var i: number, meta: HTMLMetaElement = null;
	var scale = 1.0;
	var maximumScale = 1.0;
	var deviceWidth = "width=device-width, "; //Device width viewport statement. For iPhone 5 FS it won't be applied
	var ratio = window.devicePixelRatio || 1;
	var metaTags = document.getElementsByTagName("meta");

	new (GameState as unknown as GameStateConstructor)(null).restoreSettings(); //To restore only settings

	for (i = 0; i < metaTags.length; i++)
			if (metaTags[i].name == "viewport")
				meta = metaTags[i];

	if (meta === null)
	{
		meta = addTag(document.getElementsByTagName('head')[0], "meta");
		meta.id = "viewport";
		meta.name = "viewport";
	}

	if (navigator.userAgent.match(/(iPhone|iPod)/i)) //Use retina automatically on iPhone/iPod
	{
		deviceWidth = ""; //Don't set device-width for iPhones to prevent letterboxing on iPhone5
		//Old iPhone non retina scale it down to 0.5
		if (ratio == 1.0)
			ratio = 2.0;
	}

	//For Android where 1.5 means hidpi
	if (ratio > 1 && ratio < 2)
		ratio = 2;

	if (uiSettings.useRetina)
	{
		scale = 1.0 / ratio;
		maximumScale = scale;
	}

	meta.content = deviceWidth + "initial-scale=" + scale +",maximum-scale=" + maximumScale + " , user-scalable=1";
}
changeViewPort(); //Set default viewport settings
