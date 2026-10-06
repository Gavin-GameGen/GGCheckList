// adminsearch.js
// Typing in the admin view's search bar reorders the user table: the names
// that match best move to the top, as you type. Nobody is hidden - users
// whose name does not match stay underneath, in their usual order, drawn
// faded so the split is easy to see. Clearing the bar puts the table back
// the way it loaded.
//
// Best match first means (see namematch.js):
//   name starts with it  >  a later word starts with it  >  it is anywhere
//   in the name  >  every typed word starts a word ("pat ko")
// and alphabetical within each of those.
//
// How it fits the existing events:
//   LoadUsers        passes the list through orderAdminUsers() before it
//                    goes into AJsonUsers, so a reload keeps the current order
//   OnUsersLoaded    calls decorateAdminRows() after building the rows, to
//                    bold the matched letters and fade the non-matches
//   the search bar   (studentsearch.js, onType) calls reorderAdminUsers()

import { matchRank, normalizeQuery, boldMatch } from "./namematch.js";
import { closeMentorDropdown } from "./mentors.js";
import { scrollListTo } from "./scroll.js";

// How faded a row whose name does not match is drawn (1 = not at all).
const NO_MATCH_OPACITY = 0.45;

let query = "";        // normalized search text, "" when the bar is empty
let loaded = [];       // the list exactly as api.listUsers() returned it

// ---------------------------------------------------------------- order

// Called by LoadUsers with a fresh list. Remembers it in its original order
// and returns it sorted for whatever is in the search bar right now.
export function orderAdminUsers(users) {
	loaded = Array.isArray(users) ? users.slice() : [];
	return sorted();
}

// The search bar changed. Re-sorts the list already loaded (no new fetch),
// rebuilds the rows and scrolls back to the top so the best matches show.
export function reorderAdminUsers(runtime, text) {
	const next = normalizeQuery(text);
	if (next === query) return;
	query = next;

	// Rows are about to move, so a role or mentor dropdown would be left
	// pointing at the wrong row.
	if (runtime.globalVars.DropdownUserId !== "") {
		closeMentorDropdown(runtime, { reload: false });
		runtime.callFunction("CloseRoleDropdown");
	}

	const json = runtime.objects.AJsonUsers.getFirstInstance();
	if (!json) return;
	json.setJsonDataCopy(sorted());
	runtime.callFunction("OnUsersLoaded");
	scrollListTo(0);
}

// Leaving the admin view forgets the search, so it starts empty next time.
export function resetAdminSearch() {
	query = "";
	loaded = [];
}

function sorted() {
	if (!query) return loaded.slice();

	// Stable: users with the same rank keep their loaded order, and the
	// non-matches (rank Infinity) stay in the usual role-then-name order.
	return loaded
		.map((user, index) => ({ user, index, rank: rankOf(user) }))
		.sort((a, b) =>
			a.rank - b.rank ||
			(a.rank === Infinity ? 0 : a.user.display_name.localeCompare(b.user.display_name)) ||
			a.index - b.index)
		.map(entry => entry.user);
}

function rankOf(user) {
	const rank = matchRank(user.display_name, query);
	return rank < 0 ? Infinity : rank;
}

// ---------------------------------------------------------------- rows

// Called at the end of OnUsersLoaded, once the rows exist: bolds the
// matched letters in each name, fades the rows that do not match, and adds
// the match count to the status line.
export function decorateAdminRows(runtime) {
	const type = runtime.objects.ATextUserRow;
	if (!type) return;

	const byId = new Map(loaded.map(user => [user.user_id, user]));
	let matches = 0;

	for (const cell of type.getAllInstances()) {
		const user = byId.get(cell.instVars.userId);
		if (!user) continue;                       // the template off-screen

		const hit = !query || matchRank(user.display_name, query) >= 0;
		cell.opacity = hit ? 1 : NO_MATCH_OPACITY;

		if (query && hit && cell.instVars.col === "name") {
			cell.text = boldMatch(user.display_name, query);
			matches++;
		}
	}

	if (query) {
		const status = runtime.objects.ATextStatus?.getFirstInstance();
		if (status)
			status.text = `${loaded.length} users  ·  ${matches} matching "${query}"`;
	}
}
