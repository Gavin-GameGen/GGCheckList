// mentors.js
// The "assign a mentor" dropdown on the admin user list.
//
// Tapping a student's Details cell opens a panel listing every mentor, with
// the student's current one ticked. A student has exactly one mentor at a
// time, so picking a name replaces whoever was there and closes the panel,
// the same way the role dropdown works. The line above the mentors clears
// the assignment, and the Cancel bar at the top backs out.
//
// Two things the role dropdown does not have to deal with:
//   * there can be dozens of mentors, so the list inside the panel has its
//     own scrollbar (wheel, thumb drag, or clicking the track),
//   * a student near the bottom of the screen would have the panel run off
//     the edge, so it opens upwards instead when there is more room above.

import { api } from "./data.js";
import { initScroller, refreshScroller, destroyScroller } from "./scroll.js";

const SCROLLER   = "mentors";

const OPTION_H   = 50;                       // height of one mentor line
const OPTION_GAP = 5;                        // gap between lines
const ROW_H      = OPTION_H + OPTION_GAP;    // one whole row, 55
const HEADER_H   = 50;                       // the Cancel bar at the top
const PAD        = 8;                        // panel border around its contents
const WIDTH      = 460;                      // panel width, excluding the border
const BAR_W      = 16;                       // the scrollbar down the right edge
const MAX_ROWS   = 8;                        // most lines shown without scrolling
const EDGE       = 16;                       // keep this far from the screen edge
const GAP        = 6;                        // between the row and the panel

let panel = null;   // { runtime, studentId, current, dirty, busy }

export function isMentorDropdownOpen() {
	return panel !== null;
}

// ---------------------------------------------------------------- open

export async function openMentorDropdown(runtime, studentId, x, rowY, rowH) {
	closeMentorDropdown(runtime, { reload: false });

	// Closing cleared the slot, so claim it again straight away: loading the
	// mentors takes a moment, and a second tap must not open a second panel.
	runtime.globalVars.DropdownUserId = studentId;

	let mentors, current;
	try {
		mentors = mentorsFromList(runtime);
		current = await assignedMentorId(studentId);
	} catch (err) {
		console.error("Loading mentors failed:", err);
		runtime.globalVars.DropdownUserId = "";
		runtime.callFunction("ShowAdminStatus", "Couldn't load mentors: " + err.message);
		return;
	}

	panel = { runtime, studentId, current, dirty: false, busy: false };

	// Clearing the mentor is a choice like any other, so it gets a line too.
	const lines = [{ action: "clear", id: "", name: "— No mentor —" }];
	for (const m of mentors)
		lines.push({ action: "assign", id: m.user_id, name: m.display_name });
	if (mentors.length === 0)
		lines.push({ action: "", id: "", name: "No mentors yet — set someone's role to mentor first" });

	// --- where it goes, and how much of it fits -------------------------
	const screenW = runtime.layout.width;
	const screenH = runtime.layout.height;

	const count  = lines.length;
	const below  = rowY + rowH + GAP;                    // panel top if it opens downwards
	const above  = rowY - GAP;                           // panel bottom if it opens upwards
	const roomBelow = screenH - EDGE - below;
	const roomAbove = above - EDGE;

	let rows = Math.min(MAX_ROWS, count);
	let height = panelHeight(rows);

	// Downwards by preference; upwards when the panel would hang off the
	// bottom but does fit above. If neither side fits, take the roomier one
	// and show fewer mentors, leaving the rest to the scrollbar.
	let openUp;
	if (height <= roomBelow)      openUp = false;
	else if (height <= roomAbove) openUp = true;
	else                          openUp = roomAbove > roomBelow;

	const room = openUp ? roomAbove : roomBelow;
	if (height > room) {
		rows = Math.max(1, Math.floor((room - HEADER_H - PAD * 2) / ROW_H));
		height = panelHeight(rows);
	}

	const left = clamp(x, EDGE, Math.max(EDGE, screenW - EDGE - WIDTH));
	const top  = clamp(openUp ? above - height : below, EDGE, Math.max(EDGE, screenH - EDGE - height));

	// --- build it -------------------------------------------------------
	const bg = runtime.objects.DropdownBG.createInstance("Popup", left - PAD, top);
	bg.width  = WIDTH + PAD * 2;
	bg.height = height;

	const header = runtime.objects.MentorDone.createInstance("Popup", left, top + PAD);
	header.width  = WIDTH;
	header.height = HEADER_H;
	header.text   = "[b]× Cancel[/b]   ·   a student has one mentor at a time";

	const listTop = top + PAD + HEADER_H;

	lines.forEach((line, i) => {
		const option = runtime.objects.MentorOption.createInstance("Popup", left, listTop + i * ROW_H);
		option.width  = WIDTH - BAR_W - 6;
		option.height = OPTION_H;
		option.instVars.action     = line.action;
		option.instVars.mentorId   = line.id;
		option.instVars.mentorName = line.name;
		option.text = line.action === "" ? line.name
		                                 : label(line.name, line.id === current);
	});

	// The panel's own scrollbar, down its right-hand edge.
	const listHeight = rows * ROW_H;
	place(runtime.objects.MentorTrack, left + WIDTH - BAR_W, listTop, BAR_W, listHeight);
	place(runtime.objects.MentorThumb, left + WIDTH - BAR_W, listTop, BAR_W, listHeight);

	initScroller(runtime, SCROLLER, {
		rows:    "MentorOption",
		track:   "MentorTrack",
		thumb:   "MentorThumb",
		top:     listTop,
		bottom:  listTop + listHeight,
		wheelStep: ROW_H,        // one mentor per wheel notch
		snap:      ROW_H,        // never leave half a name showing
		padding:   OPTION_GAP,
		minThumb:  36,
		modal:     true          // the user list behind stays where it is
	});
}

// ---------------------------------------------------------------- tap

// Called from the event sheet when a line in the panel is tapped.
export async function pickMentorFromTap(runtime) {
	if (!panel || panel.busy) return;

	const option = runtime.objects.MentorOption.getFirstPickedInstance();
	if (!option || !option.isVisible) return;          // a line scrolled out of the panel

	const action = option.instVars.action;
	if (!action) return;                               // the "no mentors yet" line

	const mentorId  = option.instVars.mentorId;
	const studentId = panel.studentId;
	const current   = panel.current;

	// Picking what is already set, or clearing when nothing is set: nothing
	// to write, just put the panel away.
	if (action === "assign" ? mentorId === current : !current) {
		closeMentorDropdown(runtime);
		return;
	}

	panel.busy = true;
	runtime.globalVars.AdminBusy = true;
	try {
		// assignStudent replaces the old mentor by itself, but clearing the
		// link first keeps the two paths the same and works either way.
		if (current) await api.unassignStudent(current, studentId);
		if (action === "assign") await api.assignStudent(mentorId, studentId);

		panel.current = action === "assign" ? mentorId : "";
		panel.dirty = true;
		closeMentorDropdown(runtime);                  // one mentor, so one pick is the end of it
	} catch (err) {
		console.error("Mentor assignment failed:", err);
		runtime.callFunction("ShowAdminStatus", "Couldn't set the mentor: " + err.message);
	} finally {
		runtime.globalVars.AdminBusy = false;
		if (panel) panel.busy = false;
	}
}

// ---------------------------------------------------------------- close

export function closeMentorDropdown(runtime, { reload = true } = {}) {
	destroyScroller(SCROLLER);

	for (const name of ["MentorOption", "MentorDone", "DropdownBG"])
		destroyAll(runtime, name);

	hide(runtime.objects.MentorTrack);
	hide(runtime.objects.MentorThumb);

	const wasDirty = panel ? panel.dirty : false;
	panel = null;
	runtime.globalVars.DropdownUserId = "";

	// Redraw the user list so the Details column shows the new mentor.
	if (reload && wasDirty) runtime.callFunction("LoadUsers");
}

// ---------------------------------------------------------------- helpers

function panelHeight(rows) {
	return HEADER_H + rows * ROW_H + PAD * 2;
}

function mentorsFromList(runtime) {
	const json  = runtime.objects.UsersJSON.getFirstInstance();
	const users = json ? json.getJsonDataCopy() : [];
	return (Array.isArray(users) ? users : [])
		.filter(u => u.role === "mentor")
		.sort((a, b) => a.display_name.localeCompare(b.display_name));
}

// The student's one mentor, or "" while they have none.
async function assignedMentorId(studentId) {
	const rows = await api.listAssignments();
	const link = (rows ?? []).find(a => a.student_id === studentId);
	return link ? link.mentor_id : "";
}

// "● Morgan Reyes" for the one that is set, "○ Morgan Reyes" for the rest.
function label(name, isCurrent) {
	return (isCurrent ? "[b]●[/b]  " : "○  ") + name;
}

function place(type, x, y, width, height) {
	const inst = type ? type.getFirstInstance() : null;
	if (!inst) return;
	inst.x = x;
	inst.y = y;
	inst.width = width;
	inst.height = height;
	inst.isVisible = true;
}

function hide(type) {
	const inst = type ? type.getFirstInstance() : null;
	if (inst) inst.isVisible = false;
}

function destroyAll(runtime, name) {
	const type = runtime.objects[name];
	if (!type) return;
	for (const inst of type.getAllInstances()) inst.destroy();
}

function clamp(value, low, high) {
	return Math.min(Math.max(value, low), high);
}
