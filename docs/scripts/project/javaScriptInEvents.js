// importsForEvents.js
import { api, setMockMode, setMockUserByRole } from "./data.js";
import { initListScroll, refreshListScroll, scrollListTo } from "./scroll.js";
import { openMentorDropdown, pickMentorFromTap, closeMentorDropdown, isMentorDropdownOpen } from "./mentors.js";
import { loadMentorBoard, clearMentorBoard, toggleCheckFromTap, submitFromTap } from "./mentor.js";


const scriptsInEvents = {

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

	async Mentorlogic_Event2(runtime, localVars)
	{
		// Draws the whole view: a heading per checklist item, a row for every
		// student assigned to this mentor, a checkbox under each column, and a
		// Submit button at the end of the row.
		await loadMentorBoard(runtime);
	},

	async Mentorlogic_Event4(runtime, localVars)
	{
		toggleCheckFromTap(runtime);
	},

	async Mentorlogic_Event6(runtime, localVars)
	{
		await submitFromTap(runtime, "MButtonSubmit");
	},

	async Mentorlogic_Event8(runtime, localVars)
	{
		await submitFromTap(runtime, "MTextSubmit");
	},

	async Adminlogic_Event2(runtime, localVars)
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

	async Adminlogic_Event5(runtime, localVars)
	{
		try {
		  const users = await api.listUsers();
		  runtime.objects.UsersJSON.getFirstInstance().setJsonDataCopy(users ?? []);
		  runtime.callFunction("OnUsersLoaded");
		} catch (err) {
		  console.error("Loading users failed:", err);
		  runtime.callFunction("ShowAdminStatus", "Couldn't load users: " + err.message);
		}
	},

	async Adminlogic_Event11(runtime, localVars)
	{
		// The rows were just rebuilt: re-measure the list and resize the
		// scrollbar. The scroll position is kept where the user left it.
		refreshListScroll();
	},

	async Adminlogic_Event16(runtime, localVars)
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

	async Adminlogic_Event19(runtime, localVars)
	{
		// The panel opens against the row it belongs to: just under it normally,
		// and just above it when the row sits near the bottom of the screen.
		// With dozens of mentors the list inside gets its own scrollbar.
		const row = runtime.objects.UserRowText.getFirstPickedInstance();
		if (row)
		  await openMentorDropdown(runtime, row.instVars.userId, row.x, row.y, row.height);
	},

	async Adminlogic_Event22(runtime, localVars)
	{
		// Sets that mentor as the student's one mentor, replacing whoever
		// was there, and closes the panel.
		await pickMentorFromTap(runtime);
	},

	async Adminlogic_Event24(runtime, localVars)
	{
		closeMentorDropdown(runtime);
	}
};

globalThis.C3.JavaScriptInEvents = scriptsInEvents;
