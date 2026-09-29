// detailbox.js
// The slide-out Details panel shared by the mentor and admin views.
//
// How it behaves:
//   * Tap a student's name to select them. The name is highlighted and the
//     Details tab on the right edge lights up (it is dimmed while nobody is
//     selected).
//   * Tap the tab and the panel slides in from the right with that
//     student's details. Tapping the tab while nobody is selected just gives
//     it a little nudge and a "Select a student first" hint.
//   * Tap the tab again, or "✕ Close" in the panel, and it slides back out.
//   * Selecting a different student while the panel is open swaps what it
//     shows without closing it.
//
// The box sprite is placed in the editor just off the right edge of the
// layout, so only its "<" tab shows. Wherever it is placed there is where it
// slides back to; the open position is flush with the right edge.
//
// Each page hands in its own object names and a `describe` function that
// turns a student id into { title, body }, so this file knows nothing about
// checklists, roles or mentors.

// ---------------------------------------------------------------- tuning
const SLIDE_SECONDS = 0.35;   // time for a full slide in or out
const TAB_W   = 54;           // the "<" tab on the box image, from its left edge
const TAB_H   = 121;
const PANEL_L = 54;           // where the panel itself starts on the image
const PAD     = 30;           // space inside the panel
const CLOSE_W = 150;
const TITLE_H = 60;
const DIM     = 0.45;         // tab opacity while nobody is selected
const NUDGE_PX = 26;          // how far the tab jumps out when tapped too early
const NUDGE_SECONDS = 0.3;
const HINT_SECONDS  = 1.6;

// ---------------------------------------------------------------- state
let ctx = null;
// {
//   runtime, opts, box, closedX, openX,
//   progress (0 closed .. 1 open), target (0 or 1),
//   parts: { title, body, close, hint },
//   selected, nudge, hintTime
// }


// ---------------------------------------------------------------- setup

// Call once from "On start of layout".
//   box      name of the detail box sprite
//   text     name of the Text object used for the panel's contents
//   layer    layer the panel lives on (should be above everything else)
//   names    name of the Text object that shows student names
//   idOf     (nameInstance) => student id, or "" if that instance is not a
//            selectable student (headings, other roles, ...)
//   describe (studentId) => { title, body } for the panel
//   onOpen   optional, called as the panel starts opening
export function initDetailBox(runtime, opts) {
	teardownDetailBox();

	const boxType = runtime.objects[opts.box];
	const box = boxType ? boxType.getFirstInstance() : null;
	if (!box) {
		console.error(`[details] there is no ${opts.box} on this layout`);
		return;
	}

	const layer = opts.layer ?? box.layer.name;

	ctx = {
		runtime, opts, box, layer,
		closedX: box.x,
		openX: runtime.layout.width - box.width * (1 - originX(box)),
		progress: 0,
		target: 0,
		parts: {},
		selected: "",
		nudge: 0,
		hintTime: 0
	};

	box.moveToTop();
	ctx.parts.title = makeText(runtime, "title", layer);
	ctx.parts.close = makeText(runtime, "close", layer);
	ctx.parts.body  = makeText(runtime, "body", layer);
	ctx.parts.hint  = makeText(runtime, "hint", layer);

	if (ctx.parts.close) ctx.parts.close.text = "[b]✕ Close[/b]";
	if (ctx.parts.hint)  ctx.parts.hint.text  = "Select a student first";
	if (ctx.parts.title) ctx.parts.title.verticalAlign = "center";
	if (ctx.parts.close) {
		ctx.parts.close.horizontalAlign = "right";
		ctx.parts.close.verticalAlign = "center";
	}
	if (ctx.parts.hint) {
		ctx.parts.hint.horizontalAlign = "right";
		ctx.parts.hint.verticalAlign = "center";
	}

	place();
}

function teardownDetailBox() {
	ctx = null;
}

// Call from an "Every tick" event: moves the panel a frame's worth.
export function stepDetailBox(dt) {
	if (!ctx) return;
	step(dt);
}

// ---------------------------------------------------------------- taps

// On tap of a student name.
export function selectStudentFromTap(runtime) {
	if (!ctx) return;
	const type = runtime.objects[ctx.opts.names];
	const inst = type ? type.getFirstPickedInstance() : null;
	if (!inst || !inst.isVisible) return;          // scrolled out of the list

	const id = ctx.opts.idOf(inst);
	if (!id) return;

	ctx.selected = id;
	refreshDetailBox();
}

// On tap of the box sprite, with where the tap landed (Touch.X / Touch.Y on
// the panel's layer). Only the tab toggles the panel; a tap anywhere else on
// the open panel does nothing.
export function tapDetailBox(x, y) {
	if (!ctx) return;

	if (!onTab(x, y)) return;

	if (ctx.target === 1) {
		closeDetailBox();
		return;
	}
	if (!ctx.selected) {
		ctx.nudge = NUDGE_SECONDS;
		ctx.hintTime = HINT_SECONDS;
		return;
	}
	openDetailBox();
}

// On tap of one of the panel's Text parts: only "✕ Close" does anything.
export function tapDetailText(runtime) {
	if (!ctx) return;
	const type = runtime.objects[ctx.opts.text];
	const inst = type ? type.getFirstPickedInstance() : null;
	if (inst && inst.instVars.part === "close" && ctx.target === 1)
		closeDetailBox();
}

export function openDetailBox() {
	if (!ctx || !ctx.selected) return;
	if (ctx.target !== 1 && ctx.opts.onOpen) ctx.opts.onOpen();
	ctx.target = 1;
	ctx.hintTime = 0;
	fillPanel();
}

export function closeDetailBox() {
	if (!ctx) return;
	ctx.target = 0;
}

// ---------------------------------------------------------------- queries

export function getSelectedStudent() {
	return ctx ? ctx.selected : "";
}

export function isDetailBoxOpen() {
	return !!ctx && ctx.target === 1;
}

// True when `inst` sits behind the panel while it is out (or on its way
// out). Handlers for things drawn under the panel call this and ignore the
// tap, because Construct's "On tap object" fires for every object under the
// finger, not just the top one.
export function isUnderDetailBox(inst) {
	if (!ctx || ctx.progress === 0 || !inst) return false;
	const b = inst.getBoundingBox();
	const x = (b.left + b.right) / 2;
	const y = (b.top + b.bottom) / 2;
	const r = ctx.box.getBoundingBox();
	return x >= r.left + PANEL_L && x <= r.right && y >= r.top && y <= r.bottom;
}

// ---------------------------------------------------------------- refresh

// Call after the page redraws its rows or changes a student's data: puts
// the highlight back on the (new) name instance, rewrites the panel, and
// drops the selection if that student is no longer on the page.
export function refreshDetailBox() {
	if (!ctx) return;

	if (ctx.selected && !findName(ctx.selected)) {
		ctx.selected = "";
		ctx.target = 0;
	}

	highlightNames();
	fillPanel();
}

// ---------------------------------------------------------------- internals

function step(dt) {
	if (!ctx) return;

	// Slide towards the target. Progress is linear so the panel can turn
	// round mid-slide; the easing is applied on top of it in place().
	const move = dt / SLIDE_SECONDS;
	if (ctx.progress < ctx.target) ctx.progress = Math.min(ctx.target, ctx.progress + move);
	else if (ctx.progress > ctx.target) ctx.progress = Math.max(ctx.target, ctx.progress - move);

	if (ctx.nudge > 0) ctx.nudge = Math.max(0, ctx.nudge - dt);
	if (ctx.hintTime > 0) ctx.hintTime = Math.max(0, ctx.hintTime - dt);

	place();
}

function place() {
	const { box, parts } = ctx;

	const eased = easeInOutCubic(ctx.progress);
	let x = ctx.closedX + (ctx.openX - ctx.closedX) * eased;
	if (ctx.nudge > 0) x -= NUDGE_PX * Math.sin(Math.PI * (1 - ctx.nudge / NUDGE_SECONDS));
	box.x = x;

	box.opacity = ctx.selected || ctx.progress > 0 ? 1 : DIM;

	const r = box.getBoundingBox();
	const left  = r.left + PANEL_L + PAD;
	const width = r.right - PAD - left;
	const top   = r.top + PAD;

	// The contents only show while the panel is at least partly out.
	const shown = ctx.progress > 0;

	put(parts.title, left, top, width - CLOSE_W - 10, TITLE_H, shown);
	put(parts.close, r.right - PAD - CLOSE_W, top, CLOSE_W, TITLE_H, shown);
	put(parts.body,  left, top + TITLE_H + 20, width, r.bottom - PAD - (top + TITLE_H + 20), shown);

	// The hint sits just to the left of the tab.
	put(parts.hint, r.left - 360, r.top + (TAB_H - 50) / 2, 350, 50,
		ctx.hintTime > 0 && ctx.progress === 0);
	if (parts.hint) parts.hint.opacity = Math.min(1, ctx.hintTime / 0.4);
}

function fillPanel() {
	const { parts } = ctx;
	if (!ctx.selected) return;

	let info;
	try {
		info = ctx.opts.describe(ctx.selected) ?? {};
	} catch (err) {
		console.error("[details] describe failed:", err);
		info = { title: "Details", body: "Couldn't read this student's details." };
	}
	if (parts.title) parts.title.text = "[b][size=34]" + (info.title ?? "") + "[/size][/b]";
	if (parts.body)  parts.body.text  = info.body ?? "";
}

// The selected student's name gets a highlight; everyone else is put back
// to how the page drew them.
const plainText = new WeakMap();

function highlightNames() {
	const type = ctx.runtime.objects[ctx.opts.names];
	if (!type) return;

	for (const inst of type.getAllInstances()) {
		const id = ctx.opts.idOf(inst);
		if (!id) continue;

		const isSelected = id === ctx.selected;
		const wasSelected = plainText.has(inst);

		if (isSelected && !wasSelected) {
			plainText.set(inst, inst.text);
			inst.text = "[color=#ffffff][b]▸ " + inst.text + "[/b][/color]";
		} else if (!isSelected && wasSelected) {
			inst.text = plainText.get(inst);
			plainText.delete(inst);
		}
	}
}

function findName(id) {
	const type = ctx.runtime.objects[ctx.opts.names];
	if (!type) return null;
	return type.getAllInstances().find(inst => ctx.opts.idOf(inst) === id) ?? null;
}

// Did the tap land on the "<" tab at the box's top-left corner?
function onTab(x, y) {
	if (typeof x !== "number" || typeof y !== "number") return ctx.progress === 0;
	const r = ctx.box.getBoundingBox();
	return x >= r.left && x <= r.left + TAB_W && y >= r.top && y <= r.top + TAB_H;
}

function makeText(runtime, part, layer) {
	const type = runtime.objects[ctx.opts.text];
	if (!type) {
		console.error(`[details] there is no object called ${ctx.opts.text} in this project`);
		return null;
	}
	const inst = type.createInstance(layer, -1000, -1000);
	inst.instVars.part = part;
	inst.text = "";
	inst.isVisible = false;
	return inst;
}

function put(inst, x, y, w, h, visible) {
	if (!inst) return;
	inst.x = x;
	inst.y = y;
	inst.width = w;
	inst.height = h;
	inst.isVisible = visible;
}

function originX(inst) {
	// Sprite origin as a fraction of its width, worked out from where the
	// bounding box sits relative to the position.
	const r = inst.getBoundingBox();
	return r.width ? (inst.x - r.left) / r.width : 0.5;
}

function easeInOutCubic(t) {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
