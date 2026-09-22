// mentor.js
// The mentor view: one row per student, a checkbox under every checklist
// column, and a Submit button at the end of the row.
//
// The columns are not drawn into the layout. They come from the checklist
// itself (api.listChecklistItems), so adding an item to MOCK_ITEMS in
// data.js adds a column here without touching the layout, and the same will
// hold once that call reads the real table instead.
//
// Tapping a checkbox only changes what is on screen. Nothing is written
// until the mentor hits Submit on that row, which sends the whole row at
// once: every box that is ticked when the button is pressed is what the
// student ends up with.
//
// The event sheet only ever calls the four exports at the top.

import { api } from "./data.js";

// ---------------------------------------------------------------- layout
// Everything about where the grid sits on screen is in this one block.
// Coordinates are layout coordinates on a 1920 x 1080 layout.
const LAYOUT = {
	layer: 0,               // the layer rows are created on

	headerY:      149,      // top of the column headings, level with "Student"
	firstRowY:    240,      // middle of the first student row
	rowHeight:     70,      // from the middle of one row to the next
	maxRows:       11,      // rows that fit on screen; see the note in drawBoard

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

	// MSpriteCheckBox frames. Construct counts frames from zero, so the
	// first frame of the animation is 0 and the second one is 1.
	frameUnchecked: 0,
	frameChecked:   1
};

// What the Submit button says, depending on where the row is up to.
const LABELS = {
	idle:    "Submit",
	unsaved: "Submit *",
	saving:  "Saving...",
	saved:   "Saved",
	failed:  "Retry"
};

// ---------------------------------------------------------------- state
// Instances this module has put on the layout, so a reload can take them
// off again without touching anything that was placed in the editor.
let created = [];

// student_id -> { studentId, boxes, button, label, dirty, saving }
let rows = new Map();

// Worked out at draw time: with a lot of columns they are squeezed up so
// the row still ends before the Submit button.
let spacing = LAYOUT.columnWidth;

// ---------------------------------------------------------------- load

// Draws the whole view. Safe to call again at any point: the old rows are
// destroyed first, so this doubles as a refresh.
export async function loadMentorBoard(runtime) {
	clearMentorBoard();

	let items, students;
	try {
		[items, students] = await Promise.all([
			api.listChecklistItems(),
			api.getMyStudentsChecklists()
		]);
	} catch (err) {
		console.error("Loading the mentor board failed:", err);
		message(runtime, "Couldn't load your students: " + err.message);
		return;
	}

	drawBoard(runtime, items ?? [], students ?? []);
}

// Takes every instance this module created back off the layout. The
// headings and anything else placed in the editor are left alone.
export function clearMentorBoard() {
	for (const inst of created) {
		try { inst.destroy(); } catch { /* the layout already took it */ }
	}
	created = [];
	rows = new Map();
}

// ---------------------------------------------------------------- taps

// A checkbox was tapped: flip it on screen and mark the row unsaved. The
// change only reaches the backend when Submit is pressed.
export function toggleCheckFromTap(runtime) {
	const box = runtime.objects.MSpriteCheckBox.getFirstPickedInstance();
	if (!box) return;

	const row = rows.get(box.instVars.studentId);
	if (!row || row.saving) return;      // mid-save, so leave the row alone

	setChecked(box, !isChecked(box));
	row.dirty = true;
	setLabel(row, LABELS.unsaved);
}

// Submit was pressed. `from` names the object that was tapped, because the
// label sits on top of the button and either one can take the tap: pass
// "MButtonSubmit" from the button's event and "MTextSubmit" from the
// label's. Reading the wrong one would pick the wrong student's row.
export async function submitFromTap(runtime, from = "MButtonSubmit") {
	const type = runtime.objects[from];
	const inst = type ? type.getFirstPickedInstance() : null;
	if (!inst) return;

	const row = rows.get(inst.instVars.studentId);
	if (!row || row.saving) return;

	row.saving = true;
	setLabel(row, LABELS.saving);
	try {
		const done = [...row.boxes.values()].filter(isChecked).map(box => box.instVars.itemId);
		await api.setStudentChecklist(row.studentId, done);
		row.dirty = false;
		setLabel(row, LABELS.saved);
	} catch (err) {
		console.error("Saving the checklist failed:", err);
		setLabel(row, LABELS.failed);
	} finally {
		row.saving = false;
	}
}

// ---------------------------------------------------------------- drawing

function drawBoard(runtime, items, students) {
	if (students.length === 0) {
		message(runtime, "No students are assigned to you yet.");
		return;
	}

	spacing = columnSpacing(items.length);
	drawHeadings(runtime, items);

	// More students than fit are left off for now rather than drawn over
	// the bottom of the screen. Giving the list a scrollbar is the next
	// step; scroll.js already does that for the admin user list.
	const shown = students.slice(0, LAYOUT.maxRows);
	shown.forEach((student, index) => drawRow(runtime, items, student, index));

	if (students.length > shown.length)
		console.warn(`[mentor] ${students.length} students assigned, showing the first ${shown.length}`);
}

// One heading per checklist item, centred over its column.
function drawHeadings(runtime, items) {
	items.forEach((item, column) => {
		const heading = create(runtime, "MTextCheckBox", columnX(column) - spacing / 2, LAYOUT.headerY);
		if (!heading) return;

		heading.width  = spacing;
		heading.height = LAYOUT.nameHeight;
		heading.instVars.itemId = item.item_id;
		heading.text = item.label;
	});
}

// One student: their name, a checkbox per column, and the Submit button.
function drawRow(runtime, items, student, index) {
	const middle = LAYOUT.firstRowY + index * LAYOUT.rowHeight;

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
		setChecked(box, ticked.get(item.item_id) === true);
		boxes.set(item.item_id, box);
	});

	const button = create(runtime, "MButtonSubmit", LAYOUT.submitX, middle);
	if (button) {
		button.width  = LAYOUT.submitWidth;
		button.height = LAYOUT.submitHeight;
		button.instVars.studentId = student.user_id;
	}

	// Created after the button, so it draws on top of it.
	const label = create(runtime, "MTextSubmit",
		LAYOUT.submitX - LAYOUT.submitWidth / 2,
		middle - LAYOUT.submitHeight / 2);
	if (label) {
		label.width  = LAYOUT.submitWidth;
		label.height = LAYOUT.submitHeight;
		label.instVars.studentId = student.user_id;
		label.text = LABELS.idle;
	}

	rows.set(student.user_id, {
		studentId: student.user_id,
		boxes,
		button,
		label,
		dirty: false,
		saving: false
	});
}

// A line of text where the first row would go, for "no students" and for
// anything that went wrong. It is destroyed along with the rows.
function message(runtime, text) {
	const line = create(runtime, "MTextStudentName", LAYOUT.nameX, LAYOUT.firstRowY);
	if (!line) return;
	line.width  = 1200;
	line.height = LAYOUT.nameHeight * 2;
	line.text = text;
}

// ---------------------------------------------------------------- helpers

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
	if (row.label) row.label.text = text;
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
