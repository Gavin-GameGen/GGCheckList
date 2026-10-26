// boot.js
// Gets a signed-in user from the Main layout to their own view as fast as
// possible.
//
// Before: Main stayed on screen until Supabase answered get_my_profile (a
// full network round-trip), and only then jumped to the right layout.
//
// Now: the role from the last visit is saved in this browser, per user. On
// a return visit we jump to that layout straight away, then check the real
// role in the background. If it changed (e.g. an admin approved a pending
// user, or changed someone's role) we save the new one and move them to the
// right layout. First-ever visits work the same as before.
//
// The cached role only decides which screen opens first. What a user can
// actually read or change is still enforced by Supabase, so a stale or
// edited cache can't give anyone extra access.

import { api } from "./data.js";

const LAYOUTS = {
	pending: "PendingLayout",
	student: "StudentLayout",
	mentor:  "MentorLayout",
	admin:   "AdminLayout"
};
const KEY = "checkin.role.";     // + Supabase user id

export async function bootSignedIn(runtime) {
	// Sends the user off to Discord (and never resolves) if not signed in.
	const user = await api.signIn();
	const key = KEY + (user?.id ?? "");

	const cached = readRole(key);
	if (cached) go(runtime, cached);           // instant, no network wait

	const profile = await api.getProfile();
	const role = LAYOUTS[profile?.role] ? profile.role : "pending";
	saveRole(key, role);
	if (role !== cached) go(runtime, role);    // first visit, or role changed
}

function go(runtime, role) {
	runtime.globalVars.Role = role;
	runtime.goToLayout(LAYOUTS[role]);
}

function readRole(key) {
	try {
		const role = localStorage.getItem(key);
		return LAYOUTS[role] ? role : null;
	} catch { return null; }
}

function saveRole(key, role) {
	try { localStorage.setItem(key, role); } catch {}
}
