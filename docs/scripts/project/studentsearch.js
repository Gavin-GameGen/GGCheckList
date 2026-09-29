// studentsearch.js
// The "Search for students here" bar and the drop-down of matching names
// under it. Written so the admin view can use it too: each page hands in its
// own object names and a `search` function, the same way detailbox.js works.
//
// How it behaves:
//   * Click the bar and type. After a short pause the drop-down opens under
//     the bar with the best matches first.
//   * Each line is a name, a small grey note after it, and optionally a
//     button at the end of the row (the page decides what the button says
//     and what it does - on the mentor view it is Pin / Unpin).
//   * Tapping anywhere outside the drop-down and the bar closes it; the text
//     stays, so clicking back into the bar opens it again. Escape clears it.
//
// Why there is a real HTML text box: the project has no Text Input object,
// and a Text object cannot be typed into. So this makes one <input> and
// keeps it sitting exactly on top of the search bar sprite, sized and
// scaled with the canvas. It is see-through, so the sprite in the layout is
// still what you see; move or resize the sprite in the editor and the box
// follows. The grey placeholder Text in the layout is shown while the box is
// empty and hidden once something is typed.
//
// Or, without a drop-down: pass `onType` instead of `search` and the bar
// just reports what is typed (after a very short pause, and straight away
// when it is cleared). The admin view uses this to reorder its table.
//
// Taps on the drop-down's own objects are handled by the page's events
// (e.g. "On tap MButtonPin"). Because Construct's "On tap object" fires for
// every object under the finger, anything drawn on the page underneath the
// drop-down should ignore taps while isUnderStudentSearch(inst) is true.

// ---------------------------------------------------------------- tuning
const DEBOUNCE_MS = 150;    // pause after typing before searching
const TYPE_DEBOUNCE_MS = 80; // same, for onType (no drop-down)
const MAX_RESULTS = 8;      // lines shown; the rest are counted in a footer
const WIDTH       = 620;    // drop-down width, border included
const PAD         = 8;      // space around the lines inside the drop-down
const ROW_H       = 50;     // one line
const GAP         = 6;      // between the bar and the drop-down
const TEXT_INSET  = 12;     // name's distance from the drop-down's left edge
const BUTTON_W    = 110;
const BUTTON_H    = 38;
const BUTTON_INSET = 12;    // button's distance from the drop-down's right edge
const NOTE_COLOR  = "#6b6b6b";

// ---------------------------------------------------------------- state
let ctx = null;
// {
//   runtime, opts, layout, bar, placeholder, input,
//   open, rect, created, token, timer, styleKey, onTick, onPointer
// }

// ---------------------------------------------------------------- setup

// Call once from "On start of layout".
//   bar          the search bar sprite the text box sits on
//   placeholder  the grey "Search for students here" Text on the bar
//   layer        layer the drop-down is drawn on (above the page)
//   background   Sprite stretched behind the drop-down
//   rowText      Text used for each name (and the footer line)
//   button       Sprite for the button at the end of a row
//   buttonText   Text drawn on top of the button
//   search       async (query) => [{ id, name, note, tag, button }]
//                  note    small grey text after the name ("" for none)
//                  button  { label, action } or null for no button
//                  tag     shown in the button's place when there is no
//                          button, e.g. "Yours"
//   maxResults   optional, defaults to 8
//
// Or, for a bar with no drop-down, only bar, placeholder and:
//   onType       (query) => void, called with the trimmed text as it is
//                typed, and with "" when the bar is cleared
export function initStudentSearch(runtime, opts) {
	destroyStudentSearch();

	if (typeof document === "undefined") {
		console.error("[search] needs the page's document - is the project set to run in a worker?");
		return;
	}

	const bar = first(runtime, opts.bar);
	if (!bar) {
		console.error(`[search] there is no ${opts.bar} on this layout`);
		return;
	}
	const placeholder = first(runtime, opts.placeholder);

	const input = document.createElement("input");
	input.type = "text";
	input.autocomplete = "off";
	input.spellcheck = false;
	input.className = "c3-student-search";
	input.setAttribute("aria-label", placeholder ? plain(placeholder.text) : "Search for students");
	Object.assign(input.style, {
		position: "fixed",
		zIndex: "10",
		margin: "0",
		padding: "0",
		border: "none",
		outline: "none",
		background: "transparent",
		boxShadow: "none",
		color: "#000",
		fontFamily: placeholder?.fontFace || "Arial",
		boxSizing: "border-box"
	});
	document.body.appendChild(input);

	ctx = {
		runtime, opts, bar, placeholder, input,
		layout: runtime.layout,
		open: false,
		rect: null,
		created: [],
		token: 0,
		timer: 0,
		styleKey: "",
		lastReported: "",
		onTick: () => tick(),
		onPointer: e => pointerDown(e)
	};

	input.addEventListener("input", onInput);
	input.addEventListener("keydown", onKey);
	input.addEventListener("focus", onFocus);
	runtime.addEventListener("tick", ctx.onTick);
	runtime.addEventListener("pointerdown", ctx.onPointer);

	placeText();
}

// Call from "On end of layout". Removes the text box from the page; without
// this it would stay on screen over the next layout.
export function destroyStudentSearch() {
	if (!ctx) return;
	const { runtime, input, placeholder } = ctx;

	clearTimeout(ctx.timer);
	runtime.removeEventListener("tick", ctx.onTick);
	runtime.removeEventListener("pointerdown", ctx.onPointer);
	input.removeEventListener("input", onInput);
	input.removeEventListener("keydown", onKey);
	input.removeEventListener("focus", onFocus);
	input.remove();

	clearDropdown();
	if (placeholder) try { placeholder.isVisible = true; } catch { /* already gone */ }
	ctx = null;
}

// ---------------------------------------------------------------- queries

export function isStudentSearchOpen() {
	return !!ctx && ctx.open;
}

// True for objects this file drew (the drop-down's lines and buttons).
export function isStudentSearchInstance(inst) {
	return !!ctx && ctx.created.includes(inst);
}

// True when `inst` sits behind the open drop-down. Tap handlers for things
// drawn on the page call this and ignore the tap, the same as
// isUnderDetailBox.
export function isUnderStudentSearch(inst) {
	if (!ctx || !ctx.open || !ctx.rect || !inst) return false;
	if (isStudentSearchInstance(inst)) return false;
	const b = inst.getBoundingBox();
	return inside(ctx.rect, (b.left + b.right) / 2, (b.top + b.bottom) / 2);
}

// ---------------------------------------------------------------- actions

// Runs the current search again, e.g. after pinning someone so the button
// flips from Pin to Unpin. Does nothing while the drop-down is closed.
export async function refreshStudentSearch() {
	if (!ctx || !ctx.open) return;
	await runSearch();
}

// Puts the drop-down away. The typed text stays unless `clear` is set.
export function closeStudentSearch({ clear = false } = {}) {
	if (!ctx) return;
	clearTimeout(ctx.timer);
	ctx.token++;                          // a search still on its way is dropped
	clearDropdown();
	if (clear) {
		ctx.input.value = "";
		showPlaceholder();
	}
}

// ---------------------------------------------------------------- input

function onInput() {
	showPlaceholder();
	clearTimeout(ctx.timer);
	if (ctx.opts.onType) {
		// Cleared: put things back straight away. Otherwise wait for a
		// short pause so fast typing does not redraw on every letter.
		const q = query();
		if (!q) report("");
		else ctx.timer = setTimeout(() => report(query()), TYPE_DEBOUNCE_MS);
		return;
	}
	if (!query()) {
		closeStudentSearch();
		return;
	}
	ctx.timer = setTimeout(runSearch, DEBOUNCE_MS);
}

function onKey(e) {
	if (e.key === "Escape") {
		const had = ctx.input.value !== "";
		closeStudentSearch({ clear: true });
		if (had && ctx.opts.onType) report("");
		ctx.input.blur();
	}
}

// onType mode: tell the page, once per change.
function report(q) {
	if (!ctx || q === ctx.lastReported) return;
	ctx.lastReported = q;
	try {
		ctx.opts.onType(q);
	} catch (err) {
		console.error("[search] onType failed:", err);
	}
}

// Clicking back into the bar brings the last results back.
function onFocus() {
	if (ctx && !ctx.opts.onType && !ctx.open && query()) runSearch();
}

function query() {
	return ctx.input.value.trim().replace(/\s+/g, " ");
}

async function runSearch() {
	if (!ctx) return;
	const q = query();
	const token = ++ctx.token;
	if (!q) {
		clearDropdown();
		return;
	}

	let results = [], error = "";
	try {
		results = (await ctx.opts.search(q)) ?? [];
	} catch (err) {
		console.error("[search] searching failed:", err);
		error = err?.message ?? String(err);
	}

	// Something newer was typed (or the drop-down was closed) meanwhile.
	if (!ctx || token !== ctx.token) return;
	draw(q, results, error);
}

// ---------------------------------------------------------------- drawing

function draw(q, results, error) {
	clearDropdown();

	const max = ctx.opts.maxResults ?? MAX_RESULTS;
	const shown = results.slice(0, max);

	let footer = "";
	if (error)                     footer = "Search failed: " + error;
	else if (results.length === 0) footer = `No students match "${q}"`;
	else if (results.length > max) footer = `+${results.length - max} more - keep typing to narrow it down`;

	const lines  = shown.length + (footer ? 1 : 0);
	const bar    = ctx.bar.getBoundingBox();
	const left   = bar.left;
	const top    = bar.bottom + GAP;
	const height = PAD * 2 + lines * ROW_H;

	const bg = make(ctx.opts.background, left, top);
	if (bg) {
		bg.width  = WIDTH;
		bg.height = height;
	}

	const textW   = WIDTH - TEXT_INSET - BUTTON_INSET - BUTTON_W - 16;
	const buttonX = left + WIDTH - BUTTON_INSET - BUTTON_W / 2;

	shown.forEach((result, i) => {
		const rowTop = top + PAD + i * ROW_H;
		const middle = rowTop + ROW_H / 2;

		const name = make(ctx.opts.rowText, left + TEXT_INSET, rowTop);
		if (name) {
			name.width  = textW;
			name.height = ROW_H;
			setVar(name, "studentId", result.id);
			name.text = rowLabel(result, q);
		}

		if (result.button) {
			// The button sprite has its origin in the middle.
			const button = make(ctx.opts.button, buttonX, middle);
			if (button) {
				button.width  = BUTTON_W;
				button.height = BUTTON_H;
				setVar(button, "studentId", result.id);
				setVar(button, "action", result.button.action);
			}
		}

		if (result.button || result.tag) {
			// Created after the button so it draws on top of it.
			const label = make(ctx.opts.buttonText, buttonX - BUTTON_W / 2, middle - BUTTON_H / 2);
			if (label) {
				label.width  = BUTTON_W;
				label.height = BUTTON_H;
				setVar(label, "studentId", result.id);
				setVar(label, "action", result.button ? result.button.action : "");
				label.text = result.button
					? result.button.label
					: `[i][color=${NOTE_COLOR}]${result.tag}[/color][/i]`;
			}
		}
	});

	if (footer) {
		const line = make(ctx.opts.rowText, left + TEXT_INSET, top + PAD + shown.length * ROW_H);
		if (line) {
			line.width  = WIDTH - TEXT_INSET * 2;
			line.height = ROW_H;
			setVar(line, "studentId", "");
			line.text = `[i][color=${NOTE_COLOR}]${footer}[/color][/i]`;
		}
	}

	ctx.rect = { left, top, right: left + WIDTH, bottom: top + height };
	ctx.open = true;
}

// "Casey [b]Bro[/b]oks  (Riley Chen)" - the part that matched is bold.
function rowLabel(result, q) {
	let name = result.name ?? "";
	const at = name.toLowerCase().indexOf(q.toLowerCase());
	if (at >= 0 && q)
		name = name.slice(0, at) + "[b]" + name.slice(at, at + q.length) + "[/b]" + name.slice(at + q.length);
	return result.note
		? `${name}   [size=15][color=${NOTE_COLOR}]${result.note}[/color][/size]`
		: name;
}

function clearDropdown() {
	if (!ctx) return;
	for (const inst of ctx.created) {
		try { inst.destroy(); } catch { /* the layout already took it */ }
	}
	ctx.created = [];
	ctx.open = false;
	ctx.rect = null;
}

// ---------------------------------------------------------------- per tick

function tick() {
	if (!ctx) return;
	// Left the layout without "On end of layout" calling destroy: tidy up
	// rather than leave a text box floating over the next page.
	if (ctx.runtime.layout !== ctx.layout) {
		destroyStudentSearch();
		return;
	}
	placeText();
}

// Keeps the <input> on top of the bar sprite. Cheap enough to run every
// tick, and it means window resizes and fullscreen just work.
function placeText() {
	const { bar, placeholder, input } = ctx;
	const layer = bar.layer;
	const b = bar.getBoundingBox();

	// Line the typed text up with where the placeholder starts.
	const textLeft = placeholder ? Math.max(b.left, placeholder.getBoundingBox().left) : b.left + 10;
	const [x1, y1] = layer.layerToCssPx(textLeft, b.top);
	const [x2, y2] = layer.layerToCssPx(b.right - 10, b.bottom);
	const scale = (x2 - x1) / Math.max(1, b.right - 10 - textLeft);
	const sizePt = (placeholder?.sizePt || 20) * scale;

	const key = [x1, y1, x2, y2, sizePt, bar.isVisible].map(n => Math.round(Number(n) * 10)).join();
	if (key === ctx.styleKey) return;
	ctx.styleKey = key;

	Object.assign(input.style, {
		left:   x1 + "px",
		top:    y1 + "px",
		width:  Math.max(0, x2 - x1) + "px",
		height: Math.max(0, y2 - y1) + "px",
		fontSize: sizePt + "pt",
		display: bar.isVisible ? "block" : "none"
	});
}

// ---------------------------------------------------------------- taps

// Any press on the canvas outside the drop-down and the bar closes it.
function pointerDown(e) {
	if (!ctx || !ctx.open) return;
	const layer = ctx.runtime.layout.getLayer(ctx.opts.layer) ?? ctx.bar.layer;
	const [x, y] = layer.cssPxToLayer(e.clientX, e.clientY);
	const b = ctx.bar.getBoundingBox();
	if (inside(ctx.rect, x, y) || inside(b, x, y)) return;
	closeStudentSearch();
	ctx.input.blur();
}

// ---------------------------------------------------------------- helpers

function showPlaceholder() {
	if (ctx.placeholder) ctx.placeholder.isVisible = ctx.input.value === "";
}

function make(name, x, y) {
	const type = ctx.runtime.objects[name];
	if (!type) {
		console.error(`[search] there is no object called ${name} in this project`);
		return null;
	}
	const inst = type.createInstance(ctx.opts.layer, x, y);
	ctx.created.push(inst);
	return inst;
}

function first(runtime, name) {
	const type = name ? runtime.objects[name] : null;
	return type ? type.getFirstInstance() : null;
}

function setVar(inst, name, value) {
	if (inst.instVars && name in inst.instVars) inst.instVars[name] = value;
}

function inside(r, x, y) {
	return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

// "[i]Search for students here[/i]" -> "Search for students here"
function plain(text) {
	return String(text ?? "").replace(/\[[^\]]*\]/g, "");
}
