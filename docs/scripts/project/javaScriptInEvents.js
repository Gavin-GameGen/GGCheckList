// importsForEvents.js
import { api, setMockMode, setMockUserByRole } from "./data.js";
import { initListScroll, refreshListScroll, scrollListTo } from "./scroll.js";
import { openMentorDropdown, pickMentorFromTap, closeMentorDropdown, isMentorDropdownOpen } from "./mentors.js";
import { loadMentorBoard, clearMentorBoard, toggleCheckFromTap, submitFromTap, describeStudent, selectNameFromTap, pinFromTap, searchForMentor, initMentorScroll } from "./mentor.js";
import { initStudentSearch, destroyStudentSearch, refreshStudentSearch, closeStudentSearch, isStudentSearchOpen, isUnderStudentSearch } from "./studentsearch.js";
import { initDetailBox, stepDetailBox, selectStudentFromTap, tapDetailBox, tapDetailText, openDetailBox, closeDetailBox, refreshDetailBox, isUnderDetailBox, isDetailBoxOpen, getSelectedStudent } from "./detailbox.js";
import { orderAdminUsers, reorderAdminUsers, decorateAdminRows, resetAdminSearch } from "./adminsearch.js";


const scriptsInEvents = {

	async Corelogic_Event2(runtime, localVars)
	{
		try {
		  const items = await api.getChecklist();
		  // Use the JSON instance if one is placed in a layout, otherwise create one.
		  const json = runtime.objects.JSON.getFirstInstance()
		            ?? runtime.objects.JSON.createInstance(0, 0, 0);
		  json.setJsonDataCopy(items ?? []);
		  runtime.callFunction("OnChecklistLoaded");
		} catch (err) {
		  console.error("Loading checklist failed:", err);
		}
	},

	async Corelogic_Event6(runtime, localVars)
	{
		try {
		  const totals = await api.getTotals();
		  const totalText = runtime.objects.STextTotalEXP.getFirstInstance();
		  const tempText  = runtime.objects.STextTempEXP.getFirstInstance();
		  if (totalText) totalText.text = "Total EXP: " + (totals?.total_exp ?? 0);
		  if (tempText)  tempText.text  = "Today's EXP: +" + (totals?.pending_exp ?? 0);
		} catch (err) {
		  console.error("Loading totals failed:", err);
		}
	},

	async Corelogic_Event8(runtime, localVars)
	{
		const itemId = localVars.itemId;
		const done = localVars.done;
		try {
		  await api.setDone(itemId, done === 1);
		  runtime.callFunction("SaveFinished", itemId, 1);
		} catch (err) {
		  console.error("Save failed:", err);
		  runtime.callFunction("SaveFinished", itemId, 0);
		}
	},

	async Bootlogic_Event4(runtime, localVars)
	{
		try {
		  if (runtime.globalVars.Testing) {
		    setMockMode(true);
		    setMockUserByRole(runtime.globalVars.Role);
		  } else {
		    setMockMode(false);
		    await api.signIn();
		    const profile = await api.getProfile();
		    runtime.globalVars.Role = profile?.role ?? "pending";
		  }
		  runtime.callFunction("ApplyRole");
		} catch (err) {
		  console.error("Boot failed:", err);
		}
	},

	async Mentorlogic_Event2(runtime, localVars)
	{
		// The slide-out Details panel (detailbox.js). Tap a student's name to
		// select them, then tap the "<" tab on the right edge to slide it in.
		initDetailBox(runtime, {
		  box:   "MSpriteDetailBoxBG",
		  text:  "MTextDetail",
		  layer: "Popup",
		  names: "MTextStudentName",
		  idOf:  name => name.instVars.studentId,   // "" on the Student heading
		  describe: describeStudent
		});
		
		// The search bar (studentsearch.js). Type a name to get a drop-down of
		// matching students, each with a Pin button that adds them under your
		// own students. The Pin taps are handled by the events further down.
		initStudentSearch(runtime, {
		  bar:         "MSpriteSearchBarBG",
		  placeholder: "MTextSearchBarText",
		  layer:       "Popup",
		  background:  "MSearchDropdownBG",
		  rowText:     "MTextSearchResult",
		  button:      "MButtonPin",
		  buttonText:  "MTextPin",
		  search:      searchForMentor
		});
		
		// Scrollbar down the left edge (MScrollTrack / MScrollThumb) for when
		// there are more students than fit. Mouse wheel, drag the thumb, or
		// click the track. It only appears when there is something to scroll.
		initMentorScroll(runtime);
		
		// Draws the whole view: a heading per checklist item, a row for every
		// student assigned to this mentor, a checkbox under each column, and a
		// Submit button at the end of the row.
		await loadMentorBoard(runtime);
	},

	async Mentorlogic_Event4(runtime, localVars)
	{
		// The search box is a real HTML text box on the page, so it has to be
		// taken off again or it would sit over the next layout.
		destroyStudentSearch();
	},

	async Mentorlogic_Event6(runtime, localVars)
	{
		toggleCheckFromTap(runtime);
	},

	async Mentorlogic_Event8(runtime, localVars)
	{
		await submitFromTap(runtime, "MButtonSubmit");
	},

	async Mentorlogic_Event10(runtime, localVars)
	{
		await submitFromTap(runtime, "MTextSubmit");
	},

	async Mentorlogic_Event12(runtime, localVars)
	{
		await pinFromTap(runtime, "MButtonPin");
	},

	async Mentorlogic_Event14(runtime, localVars)
	{
		await pinFromTap(runtime, "MTextPin");
	},

	async Mentorlogic_Event16(runtime, localVars)
	{
		// Ignored while the name is hidden under the search drop-down.
		selectNameFromTap(runtime);
	},

	async Mentorlogic_Event18(runtime, localVars)
	{
		tapDetailBox(runtime.globalVars.MDetailTapX, runtime.globalVars.MDetailTapY);
	},

	async Mentorlogic_Event20(runtime, localVars)
	{
		// Slides the Details panel a frame's worth.
		stepDetailBox(runtime.dt);
	},

	async Mentorlogic_Event22(runtime, localVars)
	{
		tapDetailText(runtime);
	},

	async Adminlogic_Event2(runtime, localVars)
	{
		// The bar gets a real HTML text box laid over ASpriteSearchBarBG
		// (studentsearch.js). With onType there is no drop-down: it just reports
		// what is typed and the table is re-sorted.
		initStudentSearch(runtime, {
		  bar:         "ASpriteSearchBarBG",
		  placeholder: "ATextSearchBarText",
		  onType:      text => reorderAdminUsers(runtime, text)
		});
	},

	async Adminlogic_Event4(runtime, localVars)
	{
		// Take the text box off the page and forget the search.
		destroyStudentSearch();
		resetAdminSearch();
	},

	async Adminlogic_Event6(runtime, localVars)
	{
		// The slide-out Details panel (detailbox.js). Tap a student's name to
		// select them, then tap the "<" tab on the right edge to slide it in.
		initDetailBox(runtime, {
		  box:   "ASpriteDetailBoxBG",
		  text:  "ATextDetail",
		  layer: "Popup",
		  names: "UserRowText",
		  // Only the name cell of a student row can be selected.
		  idOf: cell => cell.instVars.col === "name" && cell.instVars.role === "student" ? cell.instVars.userId : "",
		  describe: id => {
		    const json  = runtime.objects.UsersJSON.getFirstInstance();
		    const users = json ? json.getJsonDataCopy() : [];
		    const user  = (Array.isArray(users) ? users : []).find(u => u.user_id === id);
		    if (!user) return { title: "Details", body: "" };
		    return {
		      title: user.display_name,
		      body: [
		        "Role:  [b]" + user.role + "[/b]",
		        "Mentor:  [b]" + (user.mentor_name || "Unassigned") + "[/b]",
		        "User ID:  " + user.user_id
		      ].join("\n")
		    };
		  },
		  // The panel covers the Details column, so put any open dropdown away.
		  onOpen: () => {
		    closeMentorDropdown(runtime);
		    runtime.callFunction("CloseRoleDropdown");
		  }
		});
	},

	async Adminlogic_Event8(runtime, localVars)
	{
		// The user list can be taller than the screen, so give it a scrollbar.
		// Mouse wheel, dragging the thumb, or clicking the track all scroll it.
		initListScroll(runtime, {
		  rows: "UserRowText",
		  track: "ScrollTrack",
		  thumb: "ScrollThumb",
		  top: 200,          // just under the column headings
		  bottom: 1040,      // bottom of the layout
		  wheelStep: 70,     // one row per wheel notch
		  onScroll: () => {
		    // A dropdown left open would float away from its row.
		    if (runtime.globalVars.DropdownUserId !== "") {
		      closeMentorDropdown(runtime);
		      runtime.callFunction("CloseRoleDropdown");
		    }
		  }
		});
	},

	async Adminlogic_Event11(runtime, localVars)
	{
		try {
		  const users = await api.listUsers();
		  // Sorted for whatever is in the search bar, so a reload keeps the order.
		  runtime.objects.UsersJSON.getFirstInstance().setJsonDataCopy(orderAdminUsers(users ?? []));
		  runtime.callFunction("OnUsersLoaded");
		} catch (err) {
		  console.error("Loading users failed:", err);
		  runtime.callFunction("ShowAdminStatus", "Couldn't load users: " + err.message);
		}
	},

	async Adminlogic_Event17(runtime, localVars)
	{
		// The rows were just rebuilt: re-measure the list and resize the
		// scrollbar. The scroll position is kept where the user left it.
		// Bold the matched letters and fade rows that don't match the search bar.
		// Does nothing while the bar is empty.
		decorateAdminRows(runtime);
		
		refreshListScroll();
		
		// Put the highlight back on the selected student's new name cell and
		// refresh the Details panel (e.g. their mentor just changed).
		refreshDetailBox();
	},

	async Adminlogic_Event22(runtime, localVars)
	{
		const userId = runtime.globalVars.DropdownUserId;
		const role = localVars.roleLocal;
		runtime.callFunction("CloseRoleDropdown");
		if (!role) return;   // Cancel
		
		runtime.globalVars.AdminBusy = true;
		try {
		  await api.setUserRole(userId, role);
		  runtime.callFunction("LoadUsers");   // redraw the list with the new role
		} catch (err) {
		  console.error("Role change failed:", err);
		  runtime.callFunction("ShowAdminStatus", "Couldn't change role: " + err.message);
		} finally {
		  runtime.globalVars.AdminBusy = false;
		}
	},

	async Adminlogic_Event24(runtime, localVars)
	{
		// detailbox.js ignores every cell except a student's name.
		selectStudentFromTap(runtime);
	},

	async Adminlogic_Event26(runtime, localVars)
	{
		tapDetailBox(runtime.globalVars.ADetailTapX, runtime.globalVars.ADetailTapY);
	},

	async Adminlogic_Event28(runtime, localVars)
	{
		// Slides the Details panel a frame's worth.
		stepDetailBox(runtime.dt);
	},

	async Adminlogic_Event30(runtime, localVars)
	{
		tapDetailText(runtime);
	},

	async Adminlogic_Event33(runtime, localVars)
	{
		// A Details cell hidden behind the open Details panel does nothing.
		const cell = runtime.objects.UserRowText.getFirstPickedInstance();
		if (isUnderDetailBox(cell)) {
		  runtime.globalVars.DropdownUserId = "";
		  return;
		}
		closeDetailBox();
		
		// The panel opens against the row it belongs to: just under it normally,
		// and just above it when the row sits near the bottom of the screen.
		// With dozens of mentors the list inside gets its own scrollbar.
		const row = runtime.objects.UserRowText.getFirstPickedInstance();
		if (row)
		  await openMentorDropdown(runtime, row.instVars.userId, row.x, row.y, row.height);
	},

	async Adminlogic_Event36(runtime, localVars)
	{
		// Sets that mentor as the student's one mentor, replacing whoever
		// was there, and closes the panel.
		await pickMentorFromTap(runtime);
	},

	async Adminlogic_Event38(runtime, localVars)
	{
		closeMentorDropdown(runtime);
	}
};

globalThis.C3.JavaScriptInEvents = scriptsInEvents;
