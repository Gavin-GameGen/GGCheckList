// data.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Event sheets only ever talk to `api`.
// Mock mode is switched on at runtime by the Testing sheet (via Boot -> setMockMode).
// Set FORCE_MOCK to true to always use mock data, even without the Testing sheet.
const FORCE_MOCK = false;
let useMock = FORCE_MOCK;

export function setMockMode(on) {
  useMock = FORCE_MOCK || !!on;
  console.log(useMock ? "[api] MOCK mode" : "[api] Supabase mode");
  // In mock mode, expose the api on the console, e.g.  await checkinApi.listUsers()
  if (useMock) globalThis.checkinApi = api;
  else delete globalThis.checkinApi;
}
export function isMockMode() { return useMock; }

// Mock only: sign in as the first mock user with this role.
export function setMockUserByRole(role) {
  const user = mock.users.find(u => u.role === role);
  if (!user) throw new Error(`[mock] no mock user with role "${role}"`);
  mock.meId = user.user_id;
  console.log(`[mock] signed in as ${user.display_name} (${user.role})`);
}

const SUPABASE_URL = "https://gjoxusnzlbjcpihduwnn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_CtIkh_CC-hG3dLwy3zLp5g_mEo2AF0W";

export const ROLES = ["pending", "student", "mentor", "admin"];

// ---------------------------------------------------------------- mock data
// Everything the mock backend pretends to know lives in this one table, so
// it can be edited without touching any of the code further down.
//
//   role       pending | student | mentor | admin
//   mentor     students only: the display_name of their one mentor, exactly
//              as it is spelled in this table, or "" for unassigned. A name
//              that is not a mentor here is left unassigned and said so in
//              the browser console.
//   total_exp  students only: EXP already banked in the permanent total.
//              Today's unconfirmed EXP is not in here; it comes from the
//              checklist below.
//
//
//    IF THERE IS A MISSPELLING FOR MENTOR ASSIGNEMENT IT GETS SKIPPED
/*
========================================================================================================================
======================================================================
 DO NOT PUSH ANY CHANGES MADE TO MOCK TABLE ADJUSTMENTS TO GITHUB REPO
======================================================================
========================================================================================================================
*/
const MOCK_USERS = [
  { user_id: "u01", display_name: "Test Admin",       role: "admin",   mentor: "",             total_exp:    0,   avatar_url: null },
  { user_id: "u02", display_name: "Test Mentor",      role: "mentor",  mentor: "",             total_exp:    0,   avatar_url: null },
  { user_id: "u03", display_name: "Test Student",     role: "student", mentor: "Test Mentor",  total_exp:  340,   avatar_url: null },
  { user_id: "u04", display_name: "Test Pending",     role: "pending", mentor: "",             total_exp:    0,   avatar_url: null },
    //======================= ABOVE ARE THE ROLES YOU WILL BE SIGNED IN AS WHEN YOU SELECT A ROLE ==================================
  { user_id: "u05", display_name: "Alex Admin",       role: "admin",   mentor: "",             total_exp:    0,   avatar_url: null },
  { user_id: "u06", display_name: "Morgan Reyes",     role: "mentor",  mentor: "",             total_exp:    0,   avatar_url: null },
  { user_id: "u07", display_name: "Riley Chen",       role: "mentor",  mentor: "",             total_exp:    0,   avatar_url: null },
  { user_id: "u08", display_name: "Sam Patel",        role: "student", mentor: "Test Mentor",  total_exp:  340,   avatar_url: null },
  { user_id: "u09", display_name: "Jordan Lee",       role: "student", mentor: "Test Mentor",  total_exp:  185,   avatar_url: null },
  { user_id: "u10", display_name: "Casey Brooks",     role: "student", mentor: "Riley Chen",   total_exp:  920,   avatar_url: null },
  { user_id: "u11", display_name: "Taylor Nguyen",    role: "student", mentor: "",             total_exp:   70,   avatar_url: null },
  { user_id: "u12", display_name: "Jamie Ortiz",      role: "student", mentor: "",             total_exp:    0,   avatar_url: null },
  { user_id: "u13", display_name: "Patrick Kowalski", role: "pending", mentor: "",             total_exp:    0,   avatar_url: null },
  { user_id: "u14", display_name: "Quinn Harper",     role: "pending", mentor: "",             total_exp:    0,   avatar_url: null },
  { user_id: "u15", display_name: "James Books",      role: "student", mentor: "Riley Chen",   total_exp:  455,   avatar_url: null },
  { user_id: "u16", display_name: "Tay Jons",         role: "student", mentor: "",             total_exp:  130,   avatar_url: null },
  { user_id: "u17", display_name: "Dane Witz",        role: "student", mentor: "",             total_exp: 1205,   avatar_url: null },
  { user_id: "u18", display_name: "Rodrick Johnson",  role: "student", mentor: "Test Mentor",  total_exp:  260,   avatar_url: null },
  { user_id: "u19", display_name: "Harper Holders",   role: "student", mentor: "",             total_exp:   45,   avatar_url: null },
  { user_id: "u20", display_name: "Brock Brooks",     role: "student", mentor: "",             total_exp:  610,   avatar_url: null },
  { user_id: "u21", display_name: "Richard Hinks",    role: "student", mentor: "Riley Chen",   total_exp:  775,   avatar_url: null },
  { user_id: "u22", display_name: "Walter Days",      role: "student", mentor: "",             total_exp:  310,   avatar_url: null },
  { user_id: "u23", display_name: "Pat Kowalski",     role: "student", mentor: "",             total_exp:   95,   avatar_url: null }
];

// Turns the `mentor` column above into mentor_assignments rows. Only read at
// startup and on reset(); after that the assignments below are what count,
// so reassigning someone in the admin view does not rewrite the table above.
function assignmentsFromUsers(users) {
  const mentorIdByName = new Map(
    users.filter(u => u.role === "mentor")
         .map(u => [u.display_name.trim().toLowerCase(), u.user_id])
  );

  const rows = [];
  for (const user of users) {
    const wanted = (user.mentor ?? "").trim();
    if (!wanted) continue;

    if (user.role !== "student") {
      console.warn(`[mock] ${user.display_name} has a mentor set but is not a student - ignored`);
      continue;
    }
    const mentorId = mentorIdByName.get(wanted.toLowerCase());
    if (!mentorId) {
      console.warn(`[mock] ${user.display_name}'s mentor "${wanted}" is not a mentor in MOCK_USERS - left unassigned`);
      continue;
    }
    rows.push({ mentor_id: mentorId, student_id: user.user_id });
  }
  return rows;
}

// ---------------------------------------------------------------- checklist
// One line per checkbox a student can tick. The mentor view turns this into
// its columns, left to right in the order written here: `label` is the
// column heading and `exp` is what ticking that box is worth. Adding a line
// here adds a column to the mentor view and an item to the student view;
// nothing else needs changing.
//
//   item_id  a number, unique in this table. It is what gets saved, so
//            keep it the same for an item once students have ticked it.
const MOCK_ITEMS = [
  { item_id: 1, label: "Check In",       exp: 10 },
  { item_id: 2, label: "Talk to Mentor", exp: 15 },
  { item_id: 3, label: "Show Your Work", exp: 20 },
  { item_id: 4, label: "Join an Event",  exp: 25 }
];

// Today's ticks, per student: a user_id from MOCK_USERS, followed by the
// item_ids that are already checked for them. A student left out of here
// starts the day with nothing ticked. An id that is not a student, or an
// item that is not in MOCK_ITEMS, is skipped and said so in the console.
const MOCK_CHECKED = {
  u03: [1, 2],        // Test Student    (Test Mentor)
  u08: [1, 2],        // Sam Patel       (Test Mentor)
  u09: [1],           // Jordan Lee      (Test Mentor)
  u18: [1, 3, 4],     // Rodrick Johnson (Test Mentor)
  u10: [1, 2, 3, 4],  // Casey Brooks    (Riley Chen)
  u12: [],            // James Books     (Riley Chen)
  u21: [2, 3],        // Richard Hinks   (Riley Chen)
  u11: [1]            // Taylor Nguyen   (unassigned)
};

// Turns MOCK_CHECKED into one set of ticked item_ids per student. Only read
// at startup and on reset(), so ticking a box in the app does not rewrite
// the table above.
function checksFromMock(users) {
  const itemIds = new Set(MOCK_ITEMS.map(i => i.item_id));
  const checks = new Map();

  for (const user of users)
    if (user.role === "student") checks.set(user.user_id, new Set());

  for (const [studentId, ids] of Object.entries(MOCK_CHECKED)) {
    const ticked = checks.get(studentId);
    if (!ticked) {
      console.warn(`[mock] MOCK_CHECKED has "${studentId}", who is not a student in MOCK_USERS - ignored`);
      continue;
    }
    for (const id of ids ?? []) {
      if (!itemIds.has(id)) {
        console.warn(`[mock] MOCK_CHECKED: ${studentId} has item ${id}, which is not in MOCK_ITEMS - ignored`);
        continue;
      }
      ticked.add(id);
    }
  }
  return checks;
}

const byRoleThenName = (a, b) =>
  ROLES.indexOf(b.role) - ROLES.indexOf(a.role) || a.display_name.localeCompare(b.display_name);

// ---------------------------------------------------------------- mock
const mock = {
  users: structuredClone(MOCK_USERS),
  assignments: assignmentsFromUsers(MOCK_USERS),
  meId: "u04",

  // The checklist columns, and who has ticked what today.
  items: structuredClone(MOCK_ITEMS),
  checks: checksFromMock(MOCK_USERS),

  // helpers: mimic the checks Supabase will do server-side
  _me() { return this.users.find(u => u.user_id === this.meId) ?? null; },
  _user(id) {
    const u = this.users.find(u => u.user_id === id);
    if (!u) throw new Error(`No user with id ${id}`);
    return u;
  },
  _requireRole(...roles) {
    const me = this._me();
    if (!me || !roles.includes(me.role)) throw new Error(`Not allowed: needs role ${roles.join(" or ")}`);
    return me;
  },
  // The item_ids a student has ticked today. Students who have never had
  // anything ticked get an empty set the first time they are asked for.
  _checksFor(studentId) {
    if (!this.checks.has(studentId)) this.checks.set(studentId, new Set());
    return this.checks.get(studentId);
  },
  // A student's one mentor, or null while they have none.
  _mentorFor(studentId) {
    const link = this.assignments.find(a => a.student_id === studentId);
    return link ? this._user(link.mentor_id) : null;
  },

  // auth / profile
  async signIn() { return this._me(); },
  async getProfile() {
    const me = this._me();
    return me ? { display_name: me.display_name, role: me.role, avatar_url: me.avatar_url } : null;
  },
  async signOut() {},

  // student checklist
  async getChecklist() {
    const ticked = this._checksFor(this.meId);
    return this.items.map(i => ({ ...i, done: ticked.has(i.item_id) }));
  },
  async setDone(itemId, done) {
    const ticked = this._checksFor(this.meId);
    if (done) ticked.add(Number(itemId));
    else      ticked.delete(Number(itemId));
  },
  async getTotals() {
    const ticked = this._checksFor(this.meId);
    const pending = this.items.filter(i => ticked.has(i.item_id)).reduce((s, i) => s + i.exp, 0);
    return { total_exp: this._me()?.total_exp ?? 0, pending_exp: pending };
  },

  // the checklist columns, without anybody's ticks: [{ item_id, label, exp }]
  async listChecklistItems() { return structuredClone(this.items); },
  subscribe(callback) { return () => {}; },

  // admin: users & roles
  async listUsers() {
    this._requireRole("admin");
    return this.users.slice().sort(byRoleThenName).map(u => ({
      user_id: u.user_id,
      display_name: u.display_name,
      role: u.role,
      mentor_name: u.role === "student"
        ? (this._mentorFor(u.user_id)?.display_name ?? "")
        : "",
      student_count: u.role === "mentor"
        ? this.assignments.filter(a => a.mentor_id === u.user_id).length
        : 0
    }));
  },

  async setUserRole(userId, role) {
    this._requireRole("admin");
    if (!ROLES.includes(role)) throw new Error(`Unknown role "${role}"`);
    const user = this._user(userId);
    if (user.role === role) return;
    if (user.role === "admin" && this.users.filter(u => u.role === "admin").length === 1) {
      throw new Error("Can't change the last admin's role");
    }
    if (user.role === "mentor")  this.assignments = this.assignments.filter(a => a.mentor_id !== userId);
    if (user.role === "student") this.assignments = this.assignments.filter(a => a.student_id !== userId);
    user.role = role;
  },

  // admin: assignments
  async listAssignments() {
    this._requireRole("admin");
    return this.assignments.map(a => ({
      mentor_id: a.mentor_id,
      mentor_name: this._user(a.mentor_id).display_name,
      student_id: a.student_id,
      student_name: this._user(a.student_id).display_name
    }));
  },

  async assignStudent(mentorId, studentId) {
    this._requireRole("admin");
    if (this._user(mentorId).role !== "mentor")   throw new Error("That user is not a mentor");
    if (this._user(studentId).role !== "student") throw new Error("That user is not a student");
    // One mentor per student, so this replaces whoever was there before.
    this.assignments = this.assignments.filter(a => a.student_id !== studentId);
    this.assignments.push({ mentor_id: mentorId, student_id: studentId });
  },

  async unassignStudent(mentorId, studentId) {
    this._requireRole("admin");
    this.assignments = this.assignments.filter(a => !(a.mentor_id === mentorId && a.student_id === studentId));
  },

  // mentor
  async getMyStudents() {
    const me = this._requireRole("mentor");
    return this.assignments
      .filter(a => a.mentor_id === me.user_id)
      .map(a => this._user(a.student_id))
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
      .map(u => ({ user_id: u.user_id, display_name: u.display_name }));
  },

  // Everything the mentor view draws, in one call:
  // [{ user_id, display_name, total_exp, items: [{ item_id, done }] }]
  // The items are in the same order as listChecklistItems(), so the nth
  // entry is always the nth column.
  async getMyStudentsChecklists() {
    const me = this._requireRole("mentor");
    return this.assignments
      .filter(a => a.mentor_id === me.user_id)
      .map(a => this._user(a.student_id))
      .sort((a, b) => a.display_name.localeCompare(b.display_name))
      .map(u => {
        const ticked = this._checksFor(u.user_id);
        return {
          user_id: u.user_id,
          display_name: u.display_name,
          total_exp: u.total_exp,
          items: this.items.map(i => ({ item_id: i.item_id, done: ticked.has(i.item_id) }))
        };
      });
  },

  // A mentor confirming one student's row: `doneItemIds` is the whole row
  // as it now stands, so anything left out of it counts as unticked.
  async setStudentChecklist(studentId, doneItemIds) {
    const me = this._requireRole("mentor");
    const mentor = this._mentorFor(studentId);
    if (!mentor || mentor.user_id !== me.user_id)
      throw new Error("That student is not one of yours");

    const known = new Set(this.items.map(i => i.item_id));
    const next = new Set();
    for (const raw of doneItemIds ?? []) {
      const id = Number(raw);
      if (known.has(id)) next.add(id);
      else console.warn(`[mock] setStudentChecklist: item ${raw} is not in MOCK_ITEMS - ignored`);
    }
    this.checks.set(studentId, next);
  },

  reset() {
    this.users = structuredClone(MOCK_USERS);
    this.assignments = assignmentsFromUsers(MOCK_USERS);
    this.items = structuredClone(MOCK_ITEMS);
    this.checks = checksFromMock(MOCK_USERS);
  }
};

// ---------------------------------------------------------------- supabase
// Created lazily so mock mode never touches Supabase.
let supabase = null;
function client() {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true }
    });
  }
  return supabase;
}

// Where Discord sends the user back to: this exact page, without query/hash.
const REDIRECT_URL = window.location.origin + window.location.pathname;

function check({ data, error }) {
  if (error) throw error;
  return data;
}

function notConnectedYet(name) {
  throw new Error(`[api] ${name} is not connected to Supabase yet (mock mode only)`);
}

const supabaseApi = {
  get client() { return client(); },
  async signIn() {
    const { data: { session } } = await client().auth.getSession();
    if (session) {
      if (window.location.search.includes("code=")) {
        window.history.replaceState(null, "", REDIRECT_URL);
      }
      return session.user;
    }
    check(await client().auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: REDIRECT_URL }
    }));
    return new Promise(() => {});
  },

  // -> { display_name, role, avatar_url }  role: pending | student | mentor | admin
  async getProfile() {
    const rows = check(await client().rpc("get_my_profile"));
    return rows[0] ?? null;
  },

  async signOut() {
    check(await client().auth.signOut());
  },

  // -> [{ item_id, label, exp, done }]  (today's list, date decided by server)
  async getChecklist() {
    return check(await client().rpc("get_my_checklist"));
  },

  async setDone(itemId, done) {
    check(await client().rpc("set_item_done", { p_item_id: itemId, p_done: done }));
  },

  // -> { total_exp, pending_exp }
  async getTotals() {
    const rows = check(await client().rpc("get_my_totals"));
    return rows[0];
  },

  // Live changes to entries this user is allowed to see (RLS applies).
  // Returns an unsubscribe function.
  subscribe(callback) {
    const channel = client()
      .channel("daily-entries")
      .on("postgres_changes",
          { event: "*", schema: "public", table: "daily_entries" },
          payload => callback(payload))
      .subscribe();
    return () => client().removeChannel(channel);
  }, 
  
  async listUsers()                          { notConnectedYet("listUsers"); },
  async setUserRole(userId, role)            { notConnectedYet("setUserRole"); },
  async listAssignments()                    { notConnectedYet("listAssignments"); },
  async assignStudent(mentorId, studentId)   { notConnectedYet("assignStudent"); },
  async unassignStudent(mentorId, studentId) { notConnectedYet("unassignStudent"); },
  async getMyStudents()                      { notConnectedYet("getMyStudents"); },
  async listChecklistItems()                 { notConnectedYet("listChecklistItems"); },
  async getMyStudentsChecklists()            { notConnectedYet("getMyStudentsChecklists"); },
  async setStudentChecklist(studentId, ids)  { notConnectedYet("setStudentChecklist"); }
};

// `api` forwards every call to whichever backend is active *right now*,
// so flipping mock mode at runtime takes effect immediately.
export const api = new Proxy({}, {
  get(_, prop) {
    const target = useMock ? mock : supabaseApi;
    const value = target[prop];
    return typeof value === "function" ? value.bind(target) : value;
  }
});
