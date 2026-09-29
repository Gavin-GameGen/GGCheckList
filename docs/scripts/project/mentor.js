// mentor.js
// The mentor view: one row per student, a checkbox under every checklist
// column, and a Submit button at the end of the row.
//
// The columns are not drawn into the layout. They come from the checklist
// itself (api.listChecklistItems), so adding an item to MOCK_ITEMS in
// data.js adds a column here without touching the layout, and the same will
// hold once that call reads the real table instead.
//
// With more students than fit on screen the board scrolls (scroll.js,
// registered as "mentor" by initMentorScroll).
//
// Tapping a checkbox only changes what is on screen. Nothing is written
// until the mentor hits Submit on that row, which sends the whole row at
// once: every box that is ticked when the button is pressed is what the
// student ends up with.
//
// Pinned students. The search bar (studentsearch.js) lets a mentor find any
// student and pin them. The mentor's own students come first, then a line
// and a "Pinned students" heading, then the pinned ones with the same
// columns, a Submit button, and an Unpin button at the end. Pinned rows
// are ticked and submitted exactly like the mentor's own.
//
// The event sheet only ever calls the exports at the top, plus
// describeStudent, which fills the slide-out Details panel (detailbox.js),
// and searchForMentor, which feeds the search drop-down.

import { api } from "./data.js";
import { refreshDetailBox, isUnderDetailBox, selectStudentFromTap } from "./detailbox.js";
import { refreshStudentSearch, isUnderStudentSearch, isStudentSearchInstance } from "./studentsearch.js";
import { initScroller, refreshScroller } from "./scroll.js";

// ---------------------------------------------------------------- layout
// Everything about where the grid sits on screen is in this one block.
// Coordinates are layout coordinates on a 1920 x 1080 layout.
const LAYOUT = {
	layer: 0,               // the layer rows are created on

	headerY:      149,      // top of the column headings, level with "Student"
	firstRowY:    240,      // middle of the first student row
	rowHeight:     70,      // from the middle of one row to the next

	// The scrolling band: rows are only drawn between these two lines, and
	// the scrollbar (MScrollTrack / MScrollThumb, placed in the layout)
	// appears once there are more rows than fit.
	listTop:      200,      // just under the column headings
	listBottom:  1030,      // a row whose top is past this is hidden
	wheelStep:     70,      // one row per mouse-wheel notch

	nameX:        101,      // left edge of the student name
	nameWidth:    300,
	nameHeight:    30,

	firstColumnX: 460,      // middle of the first checkbox column
	columnWidth:  200,      // from the middle of one column to the next
	boxSize:       50,      // width and height of one MSpriteCheckBox

	submitX:     1412,      // middle of the Submit button
	submitWidth:  150,
	submitHeight:  50,
	submitGap:     20,      // clear space kept between the last column and it

	// The Unpin button on pinned rows, after the Submit column. Keep it left
	// of about 1800 or it ends up under the Details tab.
	pinX:        1580,
	pinWidth:     120,
	pinHeight:     50,

	// The break between your students and the pinned ones: a line, then the
	// "Pinned students" heading, then the first pinned row.
	dividerGap:      12,    // from the bottom of the last row to the line
	dividerHeight:    3,
	pinnedLabelGap:  10,    // from the line to the heading
	pinnedLabelHeight: 30,
	pinnedLabel: "[b]Pinned students[/b]",

	// How a view-only row's checkboxes are drawn (1 = same as your own).
	readOnlyOpacity: 0.55,

	// MSpriteCheckBox frames. Construct counts frames from zero, so the
	// first frame of the animation is 0 and the second one is 1.
	frameUnchecked: 0,
	frameChecked:   1
};

// What the Submit and Pin buttons say, depending on where the row is up to.
const LABELS = {
	idle:     "Submit",
	unsaved:  "Submit *",
	saving:   "Saving...",
	saved:    "Saved",
	failed:   "Retry",
	viewOnly: "[i]View only[/i]",

	pin:      "Pin",
	unpin:    "Unpin",
	pinning:  "...",
	pinFailed: "Retry"
};

// ---------------------------------------------------------------- state
// Instances this module has put on the layout, so a reload can take them
// off again without touching anything that was placed in the editor.
let created = [];

// student_id -> { studentId, boxes, button, label, dirty, saving, pinned,
//                 editable (Set of item_ids that can be ticked), readOnly }
let rows = new Map();

// What the last load returned, kept for the Details panel.
let lastItems = [];
let lastStudents = new Map();   // student_id -> student

// Worked out at draw time: with a lot of columns they are squeezed up so
// the row still ends before the Submit button.
let spacing = LAYOUT.columnWidth;

// The column headings: made here, but they stay put while the rows scroll.
let headings = new Set();

// Bumped on every load, so a slow load that finishes after a newer one
// has started does not draw a second copy of the board.
let loadToken = 0;

// Students with a pin or unpin on its way to the backend.
const pinBusy = new Set();

// ---------------------------------------------------------------- scrolling

// Call once from "On start of layout", before loadMentorBoard. Gives the
// board a scrollbar: mouse wheel, dragging the thumb, or clicking the track.
// Every row (name, checkboxes, Submit, Unpin) and the "Pinned students"
// divider move together; the headings, the search bar and its drop-down
// stay where they are. The bar only shows when there is something to scroll.
export function initMentorScroll(runtime, track = "MScrollTrack", thumb = "MScrollThumb") {
	initScroller(runtime, SCROLLER, {
		rows:      () => created.filter(inst => !headings.has(inst)),
		track,
		thumb,
		top:       LAYOUT.listTop,
		bottom:    LAYOUT.listBottom,
		wheelStep: LAYOUT.wheelStep
	});
}

const SCROLLER = "mentor";

// ---------------------------------------------------------------- load

// Draws the whole view. Safe to call again at any point: the old rows are
// destroyed first, so this doubles as a refresh. Boxes ticked but not yet
// submitted are carried over to the new rows.
export async function loadMentorBoard(runtime) {
	const token = ++loadToken;

	let items, mine, pinned;
	try {
		[items, mine, pinned] = await Promise.all([
			api.listChecklistItems(),
			api.getMyStudentsChecklists(),
			// Pinned students are extra: if they fail to load, the mentor
			// still gets their own students.
			api.getPinnedStudentsChecklists().catch(err => {
				console.error("Loading pinned students failed:", err);
				return [];
			})
		]);
	} catch (err) {
		if (token !== loadToken) return;
		console.error("Loading the mentor board failed:", err);
		clearMentorBoard();
		message(runtime, "Couldn't load your students: " + err.message);
		refreshScroller(SCROLLER);
		return;
	}
	if (token !== loadToken) return;     // a newer load has taken over

	const unsaved = captureUnsaved();
	clearMentorBoard();
	drawBoard(runtime, items ?? [], mine ?? [], pinned ?? []);
	restoreUnsaved(unsaved);

	// Measure the new rows and resize the scrollbar. The scroll position is
	// kept, so pinning someone doesn't jump the mentor back to the top.
	refreshScroller(SCROLLER);

	// The rows are new instances now: put the highlight back on the selected
	// student and refresh the Details panel if it is out.
	refreshDetailBox();
}

// Takes every instance this module created back off the layout. The
// headings and anything else placed in the editor are left alone.
export function clearMentorBoard() {
	for (const inst of created) {
		try { inst.destroy(); } catch { /* the layout already took it */ }
	}
	created = [];
	headings = new Set();
	rows = new Map();
	lastItems = [];
	lastStudents = new Map();
}

// ---------------------------------------------------------------- taps

// A checkbox was tapped: flip it on screen and mark the row unsaved. The
// change only reaches the backend when Submit is pressed.
export function toggleCheckFromTap(runtime) {
	const box = runtime.objects.MSpriteCheckBox.getFirstPickedInstance();
	if (!box) return;
	if (isCovered(box)) return;          // hidden behind the Details panel or search

	const row = rows.get(box.instVars.studentId);
	if (!row || row.saving) return;
	if (!row.editable.has(box.instVars.itemId)) return;   // a locked column on a pinned row

	setChecked(box, !isChecked(box));
	row.dirty = true;
	setLabel(row, LABELS.unsaved);
	refreshDetailBox();
}

// Submit was pressed. `from` names the object that was tapped, because the
// label sits on top of the button and either one can take the tap: pass
// "MButtonSubmit" from the button's event and "MTextSubmit" from the
// label's. Reading the wrong one would pick the wrong student's row.
export async function submitFromTap(runtime, from = "MButtonSubmit") {
	const type = runtime.objects[from];
	const inst = type ? type.getFirstPickedInstance() : null;
	if (!inst) return;
	if (isCovered(inst)) return;

	const row = rows.get(inst.instVars.studentId);
	if (!row || row.saving || row.readOnly) return;

	row.saving = true;
	setLabel(row, LABELS.saving);
	try {
		const done = [...row.boxes.values()].filter(isChecked).map(box => box.instVars.itemId);
		await api.setStudentChecklist(row.studentId, done);
		row.dirty = false;
		setLabel(row, LABELS.saved);
		refreshDetailBox();
	} catch (err) {
		console.error("Saving the checklist failed:", err);
		setLabel(row, LABELS.failed);
	} finally {
		row.saving = false;
	}
}

// A student's name was tapped: select them for the Details panel, unless the
// name is hidden under the open search drop-down.
export function selectNameFromTap(runtime) {
	const name = runtime.objects.MTextStudentName.getFirstPickedInstance();
	if (!name || !name.isVisible || isUnderStudentSearch(name)) return;
	selectStudentFromTap(runtime);
}

// Pin or Unpin was pressed, either in the search drop-down or at the end of
// a pinned row. Like Submit, the label sits on the button, so pass
// "MButtonPin" from the button's event and "MTextPin" from the label's.
// The button's `action` says which way to go, so the same event handles
// both. Afterwards the board is redrawn (unsaved ticks survive it) and the
// drop-down, if it is open, flips the button to match.
export async function pinFromTap(runtime, from = "MButtonPin") {
	const type = runtime.objects[from];
	const inst = type ? type.getFirstPickedInstance() : null;
	if (!inst || !inst.isVisible) return;

	// Board buttons can be covered by the drop-down or the Details panel;
	// the drop-down's own buttons are on top of everything.
	if (!isStudentSearchInstance(inst) && isCovered(inst)) return;

	const studentId = inst.instVars.studentId;
	const action = inst.instVars.action;
	if (!studentId || (action !== "pin" && action !== "unpin")) return;   // e.g. the "Yours" tag
	if (pinBusy.has(studentId)) return;  // the other half of the button, or a double tap

	pinBusy.add(studentId);
	setPinLabels(runtime, studentId, LABELS.pinning);
	try {
		if (action === "pin") await api.pinStudent(studentId);
		else                  await api.unpinStudent(studentId);
	} catch (err) {
		console.error(`${action === "pin" ? "Pinning" : "Unpinning"} failed:`, err);
		setPinLabels(runtime, studentId, LABELS.pinFailed);
		pinBusy.delete(studentId);
		return;
	}

	try {
		await Promise.all([loadMentorBoard(runtime), refreshStudentSearch()]);
	} finally {
		pinBusy.delete(studentId);
	}
}

// ---------------------------------------------------------------- search

// What the search drop-down shows for the mentor view. Handed to
// initStudentSearch as `search` from the event sheet.
export async function searchForMentor(query) {
	const students = (await api.searchStudents(query)) ?? [];
	return students.map(s => {
		if (s.is_mine)
			return { id: s.user_id, name: s.display_name, note: "", tag: "Yours", button: null };

		return {
			id: s.user_id,
			name: s.display_name,
			note: s.mentor_name ? s.mentor_name : "no mentor",
			tag: "",
			button: s.is_pinned
				? { label: LABELS.unpin, action: "unpin" }
				: { label: LABELS.pin,   action: "pin" }
		};
	});
}

// ---------------------------------------------------------------- details

// What the slide-out Details panel shows for one student. It reads the
// checkboxes as they are on screen, so ticks that have not been submitted
// yet show up too (and are flagged as unsaved).
export function describeStudent(studentId) {
	const student = lastStudents.get(studentId);
	if (!student) return { title: "Details", body: "" };

	const row = rows.get(studentId);
	let today = 0;
	const lines = lastItems.map(item => {
		const box = row ? row.boxes.get(item.item_id) : null;
		const done = box ? isChecked(box) : false;
		if (done) today += item.exp ?? 0;
		const mark = done ? "[color=#7ee08a][b]✓[/b][/color]" : "[color=#9a9a9a]○[/color]";
		return `   ${mark}   ${item.label}   [color=#bdbdbd](+${item.exp ?? 0} EXP)[/color]`;
	});

	const body = [];
	if (row && row.pinned) {
		body.push(
			`Mentor:  [b]${student.mentor_name || "none"}[/b]`,
			"[color=#bdbdbd]Pinned by you - tick and submit their checklist the same as your own students.[/color]",
			""
		);
	}
	body.push(
		`Total EXP:  [b]${student.total_exp ?? 0}[/b]`,
		`Today's EXP (not banked until 10am):  [b]${today}[/b]`,
		"",
		"[b]Today's checklist[/b]",
		...lines
	);
	if (row && row.dirty)
		body.push("", "[color=#ffcc66]Unsaved changes - press Submit on this student's row.[/color]");

	return { title: student.display_name, body: body.join("\n") };
}

// ---------------------------------------------------------------- drawing

function drawBoard(runtime, items, mine, pinned) {
	// A student who is both yours and pinned only shows once, up top.
	const mineIds = new Set(mine.map(s => s.user_id));
	pinned = pinned.filter(s => !mineIds.has(s.user_id));

	lastItems = items;
	lastStudents = new Map([...mine, ...pinned].map(s => [s.user_id, s]));

	if (mine.length === 0 && pinned.length === 0) {
		message(runtime, "No students are assigned to you yet. Search above to pin other students to your view.");
		return;
	}

	spacing = columnSpacing(items.length);
	drawHeadings(runtime, items);

	// Every row is drawn, however many there are; the ones below the
	// bottom of the screen are reached with the scrollbar.
	let y = LAYOUT.firstRowY;
	if (mine.length === 0) {
		message(runtime, "[i]No students are assigned to you yet.[/i]", y - LAYOUT.nameHeight / 2);
		y += LAYOUT.rowHeight;
	}
	for (const student of mine) {
		drawRow(runtime, items, student, y, false);
		y += LAYOUT.rowHeight;
	}

	if (pinned.length > 0) {
		// The line goes just under the last row, then the heading, then the
		// first pinned row.
		const lineY  = y - LAYOUT.rowHeight / 2 + LAYOUT.dividerGap;
		const labelY = lineY + LAYOUT.dividerHeight + LAYOUT.pinnedLabelGap;
		y = labelY + LAYOUT.pinnedLabelHeight + LAYOUT.rowHeight / 2;

		drawDivider(runtime, lineY, labelY);
		for (const student of pinned) {
				drawRow(runtime, items, student, y, true);
			y += LAYOUT.rowHeight;
		}
	}
}

// One heading per checklist item, centred over its column.
function drawHeadings(runtime, items) {
	items.forEach((item, column) => {
		const heading = create(runtime, "MTextCheckBox", columnX(column) - spacing / 2, LAYOUT.headerY);
		if (!heading) return;
		headings.add(heading);

		heading.width  = spacing;
		heading.height = LAYOUT.nameHeight;
		heading.instVars.itemId = item.item_id;
		heading.text = item.label;
	});
}

// The line between your students and the pinned ones, and its heading.
function drawDivider(runtime, lineY, labelY) {
	const right = LAYOUT.pinX + LAYOUT.pinWidth / 2;

	const line = create(runtime, "MSpriteDivider", LAYOUT.nameX, lineY);
	if (line) {
		line.width  = right - LAYOUT.nameX;
		line.height = LAYOUT.dividerHeight;
	}

	// Same object as the names so it picks up their font; the empty
	// studentId means tapping it selects nobody.
	const label = create(runtime, "MTextStudentName", LAYOUT.nameX, labelY);
	if (label) {
		label.width  = LAYOUT.nameWidth;
		label.height = LAYOUT.pinnedLabelHeight;
		label.instVars.studentId = "";
		label.text = LAYOUT.pinnedLabel;
	}
}

// One student: their name, a checkbox per column, and the Submit button.
// Pinned rows also get an Unpin button after Submit.
function drawRow(runtime, items, student, middle, pinned) {
	const editable = new Set(items.map(item => item.item_id));
	const readOnly = editable.size === 0;

	const name = create(runtime, "MTextStudentName", LAYOUT.nameX, middle - LAYOUT.nameHeight / 2);
	if (name) {
		name.width  = LAYOUT.nameWidth;
		name.height = LAYOUT.nameHeight;
		name.instVars.studentId = student.user_id;
		name.text = student.display_name;
	}

	// What this student has ticked, looked up by item so a column with no
	// entry for them simply comes out unchecked.
	const ticked = new Map((student.items ?? []).map(i => [i.item_id, !!i.done]));

	const boxes = new Map();
	items.forEach((item, column) => {
		// MSpriteCheckBox has its origin in the middle, so this is its centre.
		const box = create(runtime, "MSpriteCheckBox", columnX(column), middle);
		if (!box) return;

		box.width  = LAYOUT.boxSize;
		box.height = LAYOUT.boxSize;
		box.instVars.studentId = student.user_id;
		box.instVars.itemId    = item.item_id;
		if (!editable.has(item.item_id)) box.opacity = LAYOUT.readOnlyOpacity;
		setChecked(box, ticked.get(item.item_id) === true);
		boxes.set(item.item_id, box);
	});

	let button = null;
	if (!readOnly) {
		button = create(runtime, "MButtonSubmit", LAYOUT.submitX, middle);
		if (button) {
			button.width  = LAYOUT.submitWidth;
			button.height = LAYOUT.submitHeight;
			button.instVars.studentId = student.user_id;
		}
	}

	// Created after the button, so it draws on top of it. On a view-only
	// row there is no button and the label just says so.
	const label = create(runtime, "MTextSubmit",
		LAYOUT.submitX - LAYOUT.submitWidth / 2,
		middle - LAYOUT.submitHeight / 2);
	if (label) {
		label.width  = LAYOUT.submitWidth;
		label.height = LAYOUT.submitHeight;
		label.instVars.studentId = student.user_id;
		label.text = readOnly ? LABELS.viewOnly : LABELS.idle;
	}

	if (pinned) drawUnpin(runtime, student.user_id, middle);

	rows.set(student.user_id, {
		studentId: student.user_id,
		boxes,
		button,
		label,
		dirty: false,
		saving: false,
		pinned,
		editable,
		readOnly
	});
}

function drawUnpin(runtime, studentId, middle) {
	const button = create(runtime, "MButtonPin", LAYOUT.pinX, middle);
	if (button) {
		button.width  = LAYOUT.pinWidth;
		button.height = LAYOUT.pinHeight;
		button.instVars.studentId = studentId;
		button.instVars.action = "unpin";
	}
	const label = create(runtime, "MTextPin",
		LAYOUT.pinX - LAYOUT.pinWidth / 2,
		middle - LAYOUT.pinHeight / 2);
	if (label) {
		label.width  = LAYOUT.pinWidth;
		label.height = LAYOUT.pinHeight;
		label.instVars.studentId = studentId;
		label.instVars.action = "unpin";
		label.text = LABELS.unpin;
	}
}

// A line of text where the first row would go, for "no students" and for
// anything that went wrong. It is destroyed along with the rows.
function message(runtime, text, y = LAYOUT.firstRowY) {
	const line = create(runtime, "MTextStudentName", LAYOUT.nameX, y);
	if (!line) return;
	line.width  = 1200;
	line.height = LAYOUT.nameHeight * 2;
	line.instVars.studentId = "";
	line.text = text;
}

// ---------------------------------------------------------------- redraw

// Rows with ticks that have not been submitted yet: student_id -> the
// item_ids ticked on screen.
function captureUnsaved() {
	const unsaved = new Map();
	for (const row of rows.values()) {
		if (!row.dirty) continue;
		const done = [...row.boxes.values()].filter(isChecked).map(box => box.instVars.itemId);
		unsaved.set(row.studentId, new Set(done));
	}
	return unsaved;
}

function restoreUnsaved(unsaved) {
	for (const [studentId, done] of unsaved) {
		const row = rows.get(studentId);
		if (!row || row.readOnly) continue;
		for (const box of row.boxes.values())
			if (row.editable.has(box.instVars.itemId)) setChecked(box, done.has(box.instVars.itemId));
		row.dirty = true;
		setLabel(row, LABELS.unsaved);
	}
}

// ---------------------------------------------------------------- helpers

// Hidden behind the Details panel or the search drop-down. Construct's "On
// tap object" fires for every object under the finger, so the things
// underneath have to ignore the tap themselves.
// A row scrolled out of the band is hidden but still there, so it counts
// as covered too.
function isCovered(inst) {
	return !inst.isVisible || isUnderDetailBox(inst) || isUnderStudentSearch(inst);
}

function columnX(column) {
	return LAYOUT.firstColumnX + column * spacing;
}

// Columns keep their usual width until they would run into the Submit
// button, and are squeezed up from there so the row always fits.
function columnSpacing(count) {
	if (count <= 1) return LAYOUT.columnWidth;

	const lastColumnX = LAYOUT.submitX - LAYOUT.submitWidth / 2 - LAYOUT.submitGap - LAYOUT.boxSize / 2;
	const fits = (lastColumnX - LAYOUT.firstColumnX) / (count - 1);

	if (fits < LAYOUT.columnWidth)
		console.warn(`[mentor] ${count} columns: spacing squeezed to ${Math.round(fits)}px`);

	return Math.max(LAYOUT.boxSize + 6, Math.min(LAYOUT.columnWidth, fits));
}

function setChecked(box, on) {
	box.instVars.done = on ? 1 : 0;
	box.animationFrame = on ? LAYOUT.frameChecked : LAYOUT.frameUnchecked;
}

function isChecked(box) {
	return box.instVars.done === 1;
}

function setLabel(row, text) {
	// The row may have been redrawn while a save was on its way.
	if (row.label) try { row.label.text = text; } catch { /* destroyed */ }
}

// Every Pin/Unpin label for one student, in the drop-down and on the board.
function setPinLabels(runtime, studentId, text) {
	const type = runtime.objects.MTextPin;
	if (!type) return;
	for (const label of type.getAllInstances())
		if (label.instVars.studentId === studentId && label.instVars.action) label.text = text;
}

function create(runtime, name, x, y) {
	const type = runtime.objects[name];
	if (!type) {
		console.error(`[mentor] there is no object called ${name} in this project`);
		return null;
	}
	const inst = type.createInstance(LAYOUT.layer, x, y);
	created.push(inst);
	return inst;
}
