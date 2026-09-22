// scroll.js
// Vertical scrolling for lists that are taller than the space they sit in.
//
// A list stays ordinary Construct instances. This module remembers where
// each row was created, slides them all up and down as a group, hides the
// ones that fall outside the visible band, and keeps a track + thumb sprite
// in sync with the position. It works with the mouse wheel, by dragging the
// thumb, and by clicking anywhere on the track.
//
// More than one list can be scrollable at a time. Each one is registered
// under its own id, e.g. "main" for the admin user list and "mentors" for
// the mentor picker. A scroller marked `modal: true` (a popup) takes every
// wheel notch and thumb drag for itself, so the list behind it stays put
// while the popup is open.
//
// The admin user list only needs two calls:
//   initListScroll(runtime, { ... })   once, on start of layout
//   refreshListScroll()                every time the list is rebuilt

const DEFAULTS = {
	rows: "UserRowText",      // object type the list rows are made of
	track: "ScrollTrack",     // sprite: the bar itself
	thumb: "ScrollThumb",     // sprite: the handle that slides along it
	top: 200,                 // top of the visible band, in layout coordinates
	bottom: 1040,             // bottom of the visible band
	wheelStep: 70,            // how far one wheel notch moves the list (one row)
	minThumb: 48,             // the thumb never gets shorter than this
	padding: 20,              // breathing room below the last row
	snap: 0,                  // if set, the offset lands on multiples of this
	modal: false,             // a popup: it swallows wheel and drag input
	onScroll: null            // optional callback, runs whenever the list moves
};

// Both sprites are expected to use a top-left origin, which is what the
// hit tests and the thumb maths below assume.

const scrollers = new Map();  // id -> the state of one scrollable list
let wired = false;            // input listeners are only added once
let dragging = null;          // id of the scroller whose thumb is being dragged

// ---------------------------------------------------------------- public

export function initScroller(runtime, id, options = {}) {
	scrollers.set(id, {
		id,
		runtime,
		cfg: { ...DEFAULTS, ...options },
		offset: 0,            // how far the list is scrolled down, in pixels
		contentHeight: 0,
		baseY: new Map(),     // instance uid -> the y it was created at
		grab: null            // distance from the top of the thumb while dragging
	});

	if (!wired) {
		wired = true;
		// Leaving the layout destroys the rows, so stop tracking them.
		runtime.addEventListener("beforelayoutstart", () => {
			scrollers.clear();
			dragging = null;
		});
		addEventListener("wheel", onWheel, { passive: false });
		addEventListener("pointerdown", onPointerDown);
		addEventListener("pointermove", onPointerMove);
		addEventListener("pointerup", onPointerUp);
		addEventListener("pointercancel", onPointerUp);
	}

	refreshScroller(id);
}

// Call this after the rows have been destroyed and recreated. The scroll
// position is kept where the user left it, as far as the new list allows.
export function refreshScroller(id) {
	const s = scrollers.get(id);
	if (!s) return;

	const { cfg } = s;
	const rows = instancesOf(s, cfg.rows);

	// Rows are created at their unscrolled positions, so that is the baseline.
	s.baseY = new Map(rows.map(inst => [inst.uid, inst.y]));

	let lowest = cfg.top;
	for (const inst of rows)
		lowest = Math.max(lowest, inst.y + inst.height);
	s.contentHeight = lowest + cfg.padding - cfg.top;

	apply(s);
}

// Scroll a list to an absolute offset in pixels.
export function scrollScrollerTo(id, offset) {
	const s = scrollers.get(id);
	if (!s) return;

	const previous = s.offset;
	s.offset = normalize(s, offset);
	if (s.offset === previous) return;

	apply(s);
	if (s.cfg.onScroll) s.cfg.onScroll(s.offset);
}

// Forget a list. Used when a popup closes; its instances are destroyed
// separately by whoever created them.
export function destroyScroller(id) {
	scrollers.delete(id);
	if (dragging === id) dragging = null;
}

export function hasScroller(id) {
	return scrollers.has(id);
}

// ------------------------------------------------- the admin user list
// Kept as-is so the existing event sheet calls carry on working.

export function initListScroll(runtime, options = {}) { initScroller(runtime, "main", options); }
export function refreshListScroll() { refreshScroller("main"); }
export function scrollListTo(offset) { scrollScrollerTo("main", offset); }

// ---------------------------------------------------------------- internals

// A popup, if one is open, gets the input. Otherwise the plain list does.
function activeScroller() {
	let fallback = null;
	for (const s of scrollers.values()) {
		if (s.cfg.modal) return s;
		if (!fallback) fallback = s;
	}
	return fallback;
}

function apply(s) {
	const { cfg } = s;
	const bandHeight = cfg.bottom - cfg.top;
	const max = maxOffset(s);
	s.offset = normalize(s, s.offset);

	for (const inst of instancesOf(s, cfg.rows)) {
		const base = s.baseY.get(inst.uid);
		if (base === undefined) continue;

		inst.y = base - s.offset;
		// A row is only drawn while its middle is inside the band, so rows
		// never creep up over the column headings.
		inst.isVisible = (inst.y + inst.height / 2 >= cfg.top) && (inst.y < cfg.bottom);
	}

	const track = firstInstance(s, cfg.track);
	const thumb = firstInstance(s, cfg.thumb);
	if (!track || !thumb) return;

	// The bar only appears when there is something to scroll to.
	const needed = max > 0;
	track.isVisible = needed;
	thumb.isVisible = needed;
	if (!needed) return;

	const height = Math.max(cfg.minThumb, track.height * (bandHeight / s.contentHeight));
	thumb.x = track.x;
	thumb.width = track.width;
	thumb.height = height;
	thumb.y = track.y + (track.height - height) * (s.offset / max);
}

function maxOffset(s) {
	return Math.max(0, s.contentHeight - (s.cfg.bottom - s.cfg.top));
}

// Clamp into range, and land on whole rows when the list asks for that.
function normalize(s, value) {
	const max = maxOffset(s);
	if (s.cfg.snap > 0) value = Math.round(value / s.cfg.snap) * s.cfg.snap;
	return clamp(value, 0, max);
}

function instancesOf(s, name) {
	const type = s.runtime.objects[name];
	return type ? type.getAllInstances() : [];
}

function firstInstance(s, name) {
	const type = s.runtime.objects[name];
	return type ? type.getFirstInstance() : null;
}

function clamp(value, low, high) {
	return Math.min(Math.max(value, low), high);
}

function onWheel(e) {
	const s = activeScroller();
	if (!s) return;

	if (maxOffset(s) > 0)
		scrollScrollerTo(s.id, s.offset + Math.sign(e.deltaY) * s.cfg.wheelStep);
	else if (!s.cfg.modal)
		return;   // nothing to scroll and nothing to shield: let the page have it

	e.preventDefault();
}

function onPointerDown(e) {
	const s = activeScroller();
	if (!s || maxOffset(s) <= 0) return;

	const track = firstInstance(s, s.cfg.track);
	const thumb = firstInstance(s, s.cfg.thumb);
	if (!track || !thumb) return;

	const point = toLayout(track.layer, e);

	if (hits(thumb, point)) {
		s.grab = point.y - thumb.y;           // keep the grabbed spot under the pointer
	} else if (hits(track, point)) {
		s.grab = thumb.height / 2;            // clicking the track jumps the thumb there
		dragging = s.id;
		dragTo(s, point.y);
	} else {
		return;
	}

	dragging = s.id;
	e.preventDefault();
}

function onPointerMove(e) {
	const s = dragging === null ? null : scrollers.get(dragging);
	if (!s || s.grab === null) return;

	const track = firstInstance(s, s.cfg.track);
	if (!track) return;

	dragTo(s, toLayout(track.layer, e).y);
	e.preventDefault();
}

function onPointerUp() {
	const s = dragging === null ? null : scrollers.get(dragging);
	if (s) s.grab = null;
	dragging = null;
}

function dragTo(s, pointerY) {
	const track = firstInstance(s, s.cfg.track);
	const thumb = firstInstance(s, s.cfg.thumb);
	if (!track || !thumb) return;

	const span = track.height - thumb.height;
	if (span <= 0) return;

	const position = clamp((pointerY - s.grab - track.y) / span, 0, 1);
	scrollScrollerTo(s.id, position * maxOffset(s));
}

function toLayout(layer, e) {
	const [x, y] = layer.cssPxToLayer(e.clientX, e.clientY);
	return { x, y };
}

// Top-left origin, so the instance covers x .. x + width and y .. y + height.
function hits(inst, point) {
	return point.x >= inst.x && point.x <= inst.x + inst.width &&
	       point.y >= inst.y && point.y <= inst.y + inst.height;
}
