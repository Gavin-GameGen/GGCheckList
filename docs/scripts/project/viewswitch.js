// viewswitch.js
// The "switch view" button in the top-left corner of the admin and mentor
// views. Admins can do everything a mentor can, so they get a button on the
// admin view that takes them to the mentor view (their own assigned and
// pinned students), and a button on the mentor view that takes them back.
//
// The button is SwitchViewButton (sprite) with SwitchViewText (label) on
// top, placed in both layouts. Only admins ever see it: on the mentor view
// it stays hidden for mentors, and taps on a hidden button are ignored.
//
// The mentor view only saves a row when its Submit button is pressed, so
// leaving with ticks that were not submitted would lose them. In that case
// the first tap warns on the button and a second tap within a few seconds
// leaves anyway.

import { unsavedRowCount } from "./mentor.js";

// ================================================================ tweak me
const VIEWS = {
	AdminLayout:  { to: "MentorLayout", label: "Switch to Mentor View" },
	MentorLayout: { to: "AdminLayout",  label: "Switch to Admin View" }
};
const BUTTON = "SwitchViewButton";
const TEXT   = "SwitchViewText";
const CONFIRM_SECONDS = 4;       // how long the "tap again" warning stays up
// ========================================================================

let armedUntil = 0;              // time until which a second tap leaves anyway
let lastTap = -Infinity;         // the label sits on the button: one tap, two events
let leaving = false;

// Call from "On start of layout" on the admin and mentor layouts.
export function initViewSwitch(runtime) {
	armedUntil = 0;
	leaving = false;

	const view = VIEWS[runtime.layout.name];
	const show = !!view && isAdmin(runtime);
	for (const inst of instances(runtime)) inst.isVisible = show;
	setLabel(runtime, view ? view.label : "");
}

// Call from "On tap SwitchViewButton" and "On tap SwitchViewText".
export function switchViewFromTap(runtime) {
	const now = performance.now();
	if (now - lastTap < 300) return;     // the same tap, reaching the second event
	lastTap = now;

	if (leaving) return;
	const view = VIEWS[runtime.layout.name];
	if (!view || !isAdmin(runtime)) return;
	const button = runtime.objects[BUTTON]?.getFirstInstance();
	if (!button || !button.isVisible) return;

	// The admin view is busy writing a role or mentor change: let it finish.
	if (runtime.globalVars.AdminBusy) return;

	if (runtime.layout.name === "MentorLayout" && now > armedUntil) {
		const unsaved = unsavedRowCount();
		if (unsaved > 0) {
			armedUntil = now + CONFIRM_SECONDS * 1000;
			setLabel(runtime, `[b]${unsaved} unsaved row${unsaved === 1 ? "" : "s"}[/b] - tap again to leave`);
			setTimeout(() => {
				if (!leaving && performance.now() >= armedUntil) setLabel(runtime, view.label);
			}, CONFIRM_SECONDS * 1000 + 50);
			return;
		}
	}

	leaving = true;
	runtime.goToLayout(view.to);
}

// ---------------------------------------------------------------- helpers

// Role is the signed-in user's real role (set by Boot), not the view they
// are looking at, so it stays "admin" while an admin is on the mentor view.
function isAdmin(runtime) {
	return runtime.globalVars.Role === "admin";
}

function instances(runtime) {
	const out = [];
	for (const name of [BUTTON, TEXT]) {
		const type = runtime.objects[name];
		if (type) out.push(...type.getAllInstances());
	}
	return out;
}

function setLabel(runtime, text) {
	const label = runtime.objects[TEXT]?.getFirstInstance();
	if (label) label.text = text;
}
