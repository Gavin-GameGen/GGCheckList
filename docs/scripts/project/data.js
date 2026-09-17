// data.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Event sheets only ever talk to `api`. Flip USE_MOCK to true to test without Supabase.
const USE_MOCK = false;


const SUPABASE_URL = "https://gjoxusnzlbjcpihduwnn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_CtIkh_CC-hG3dLwy3zLp5g_mEo2AF0W";

// ---------------------------------------------------------------- mock
const mock = {
  items: [
    { item_id: 1, label: "Check In",       exp: 10, done: false },
    { item_id: 2, label: "Talk to Mentor", exp: 15, done: false },
    { item_id: 3, label: "Show Your Work", exp: 20, done: false },
    { item_id: 4, label: "Join an Event",  exp: 25, done: false }
  ],
  async signIn() {},
  async getProfile() { return { display_name: "Mock Student", role: "student", avatar_url: null }; },
  async signOut() {},
  async getChecklist() { return structuredClone(this.items); },
  async setDone(itemId, done) {
    const it = this.items.find(i => i.item_id === itemId);
    if (it) it.done = done;
  },
  async getTotals() {
    const pending = this.items.filter(i => i.done).reduce((s, i) => s + i.exp, 0);
    return { total_exp: 0, pending_exp: pending };
  },
  subscribe(callback) { return () => {}; }  // no live updates in mock mode
};

// ---------------------------------------------------------------- supabase
const supabase = USE_MOCK ? null : createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true }
});

// Where Discord sends the user back to: this exact page, without query/hash.
const REDIRECT_URL = window.location.origin + window.location.pathname;

function check({ data, error }) {
  if (error) throw error;
  return data;
}

const supabaseApi = {
  client: supabase,
  async signIn() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      if (window.location.search.includes("code=")) {
        window.history.replaceState(null, "", REDIRECT_URL);
      }
      return session.user;
    }
    check(await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: REDIRECT_URL }
    }));
    return new Promise(() => {});
  },

  // -> { display_name, role, avatar_url }  role: pending | student | mentor | admin
  async getProfile() {
    const rows = check(await supabase.rpc("get_my_profile"));
    return rows[0] ?? null;
  },

  async signOut() {
    check(await supabase.auth.signOut());
  },

  // -> [{ item_id, label, exp, done }]  (today's list, date decided by server)
  async getChecklist() {
    return check(await supabase.rpc("get_my_checklist"));
  },

  async setDone(itemId, done) {
    check(await supabase.rpc("set_item_done", { p_item_id: itemId, p_done: done }));
  },

  // -> { total_exp, pending_exp }
  async getTotals() {
    const rows = check(await supabase.rpc("get_my_totals"));
    return rows[0];
  },

  // Live changes to entries this user is allowed to see (RLS applies).
  // Returns an unsubscribe function.
  subscribe(callback) {
    const channel = supabase
      .channel("daily-entries")
      .on("postgres_changes",
          { event: "*", schema: "public", table: "daily_entries" },
          payload => callback(payload))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }
};

export const api = USE_MOCK ? mock : supabaseApi;
