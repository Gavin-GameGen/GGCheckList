// schedule.js
import { isMockMode } from "./data.js";
import { loadMentorBoard } from "./mentor.js";

// Keeps an open tab in step with the daily cycle, on Pacific time (the same
// clock Supabase uses, see app_tz()), whatever time zone the viewer is in.
//
//   10:01am   SOFT REFRESH. The commit job runs at 10:01, so a few seconds
//             later the open view fetches its data again without reloading
//             the page: the student view's EXP texts, progress bar and
//             checklist, and the level-up celebration if they went up a
//             level. The mentor view redraws its board.
//
//   midnight  HARD REFRESH. The page reloads (same as pressing F5), so the
//             checklist starts the new day empty and any update pushed to
//             GitHub Pages is picked up.
//
//   weekends  The student view is covered by SSpriteLockedBackground with
//             STextLockedInfo on top, no checklist is built, and level-ups
//             wait until Monday. Mentors and admins are not locked.
//
// A timer checks the clock every few seconds and also as soon as the tab is
// shown again. If the computer was asleep, or the tab was in the background
// when a time passed, it catches up the moment the tab is back: a new day
// reloads, a missed 10:01 soft-refreshes.
//
// Testing (Testing sheet / mock mode only), from the browser console:
//   checkinSchedule.softRefresh()   run the 10:01 refresh now
//   checkinSchedule.hardRefresh()   run the midnight reload now
//   checkinSchedule.lock(true)      show the weekend lock (false hides it,
//                                   null goes back to following the day)
//   checkinSchedule.now()           the Pacific date/time the page sees
//   checkinSchedule.day("Fri")      pretend it is Friday for day-only items
//                                   (null goes back to following the clock)

// ================================================================ tweak me
export const SCHEDULE = {
  timeZone:      "America/Los_Angeles",
  softRefreshAt: "10:01:30",  // HH:MM:SS. The commit job starts at 10:01:00, so
                              // this gives it a moment to finish first.
  hardRefreshAt: "00:00:30",  // HH:MM:SS on the new day. A little past midnight so
                              // a computer clock that runs slightly fast doesn't
                              // reload into yesterday's checklist.
  checkEverySeconds: 5,
};

export const WEEKEND_LOCK = {
  days: ["Sat", "Sun"],       // Pacific days the student view is locked
  force: null,                // null: follow the day. true / false: always / never locked
  layout: "StudentLayout",
  background: "SSpriteLockedBackground",
  text: "STextLockedInfo",
  textPadding: 40,            // gap between the text and the screen edges, px
};

// Checklist items that only show up on certain days (Pacific). Any item not
// listed here shows every day as usual. Applies to the student checklist and
// to the mentor board's columns.
//   item_id: [the days it shows]   days are "Mon" "Tue" "Wed" "Thu" "Fri"
export const DAY_ONLY_ITEMS = {
  items: {
    5: ["Mon"],               // the Friday-only item
  },
  forceDay: null,             // null: follow the clock. "Fri" etc.: pretend it is that day (testing)
};
// ========================================================================

// ---------------------------------------------------------------- Pacific clock

let clockFormat = null;
// -> { date: "2026-10-26", time: "10:01:30", weekday: "Mon" } in SCHEDULE.timeZone
export function pacificNow(when = new Date()) {
  clockFormat ??= new Intl.DateTimeFormat("en-US", {
    timeZone: SCHEDULE.timeZone, hourCycle: "h23", weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = {};
  for (const { type, value } of clockFormat.formatToParts(when)) p[type] = value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}:${p.second}`,
    weekday: p.weekday,
  };
}

// "2026-10-26 10:01:30": sorts in time order as plain text.
const stamp = c => `${c.date} ${c.time}`;

// ---------------------------------------------------------------- day-only items

// Today's day ("Mon".."Sun") as far as DAY_ONLY_ITEMS is concerned.
export function checklistDay() {
  return DAY_ONLY_ITEMS.forceDay ?? pacificNow().weekday;
}

// Drops the items that are not meant to show today (see DAY_ONLY_ITEMS).
// Works on both the student's [{ item_id, label, exp, done }] and the
// mentor's column list [{ item_id, label, exp }].
export function itemsForToday(items) {
  const today = checklistDay();
  return (items ?? []).filter(item => {
    const days = DAY_ONLY_ITEMS.items[item.item_id];
    return !days || days.includes(today);
  });
}

// ---------------------------------------------------------------- weekend lock

export function isWeekendLocked() {
  if (WEEKEND_LOCK.force !== null && WEEKEND_LOCK.force !== undefined) return !!WEEKEND_LOCK.force;
  return WEEKEND_LOCK.days.includes(pacificNow().weekday);
}

// Where the lock objects were placed in the editor, so unlocking (testing)
// can put them back.
const lockHome = new Map();

// Call on start of the student layout. Covers the whole screen with the lock
// background and text when locked; leaves them where they are parked otherwise.
export function applyWeekendLock(runtime, locked = isWeekendLocked()) {
  if (runtime.layout.name !== WEEKEND_LOCK.layout) return false;
  const bg   = runtime.objects[WEEKEND_LOCK.background]?.getFirstInstance();
  const text = runtime.objects[WEEKEND_LOCK.text]?.getFirstInstance();

  for (const inst of [bg, text].filter(Boolean)) {
    if (!lockHome.has(inst.uid))
      lockHome.set(inst.uid, { x: inst.x, y: inst.y, width: inst.width, height: inst.height });
  }

  if (!locked) {
    for (const inst of [bg, text].filter(Boolean)) Object.assign(inst, lockHome.get(inst.uid));
    return false;
  }

  const vp = visibleArea(runtime, bg ?? text);
  if (bg) {
    // Stretch it a little past every screen edge and centre it, whatever its origin.
    const ox = getOriginX(bg), oy = getOriginY(bg);
    bg.width  = vp.width  + 40;
    bg.height = vp.height + 40;
    bg.x = vp.left - 20 + ox * bg.width;
    bg.y = vp.top  - 20 + oy * bg.height;
    bg.moveToTop();
  }
  if (text) {
    // The text is centred both ways inside its box, so the box just fills the screen.
    const pad = WEEKEND_LOCK.textPadding;
    const ox = getOriginX(text), oy = getOriginY(text);
    text.width  = vp.width  - pad * 2;
    text.height = vp.height - pad * 2;
    text.x = vp.left + pad + ox * text.width;
    text.y = vp.top  + pad + oy * text.height;
    text.moveToTop();
  }
  return true;
}

// The part of the layout on screen, in layout coordinates.
function visibleArea(runtime, inst) {
  const vp = inst?.layer?.getViewport?.();
  if (vp && vp.width > 0 && vp.height > 0) return vp;
  return { left: 0, top: 0, width: runtime.viewportWidth, height: runtime.viewportHeight };
}
// Where the origin sits inside the box, 0..1 (0.5 for the sprite, 0 for the text).
function getOriginX(inst) {
  const box = inst.getBoundingBox();
  return box.width ? (inst.x - box.left) / box.width : 0;
}
function getOriginY(inst) {
  const box = inst.getBoundingBox();
  return box.height ? (inst.y - box.top) / box.height : 0;
}

// ---------------------------------------------------------------- refreshes

// Fetches the open view's data again, without reloading the page.
export function softRefresh(runtime) {
  const layout = runtime.layout.name;
  console.log(`[schedule] soft refresh (${layout}) at ${stamp(pacificNow())} Pacific`);

  if (layout === "StudentLayout") {
    // Leave the checkboxes alone if a tick is still being saved, so the
    // redraw can't undo it. The next refresh picks it up.
    const saving = runtime.objects.SSpriteButton?.getAllInstances()
                     .some(b => b.instVars.saving === 1);
    if (!saving) runtime.callFunction("LoadChecklist");
    runtime.callFunction("LoadTotals");
  } else if (layout === "MentorLayout") {
    loadMentorBoard(runtime);
  }
}

// Reloads the whole page, picking up a new day and any newly published version.
export function hardRefresh() {
  console.log(`[schedule] hard refresh at ${stamp(pacificNow())} Pacific`);
  window.location.reload();
}

// ---------------------------------------------------------------- the watcher

let installed = false;

// Call once, when the project starts (main.js). Runs for every layout.
export function installSchedule(runtime) {
  if (installed) return;
  installed = true;

  const loadedOn = pacificNow().date;   // the Pacific day this page was loaded
  let last = stamp(pacificNow());       // when the clock was last checked
  let reloading = false;

  const check = () => {
    if (reloading) return;
    const now = pacificNow();
    const nowStamp = stamp(now);

    // A new Pacific day since the page loaded, and past the reload time: reload.
    if (now.date > loadedOn && now.time >= SCHEDULE.hardRefreshAt) {
      reloading = true;
      hardRefresh();
      return;
    }

    // Passed today's 10:01 since the last check (including while asleep): refresh.
    const target = `${now.date} ${SCHEDULE.softRefreshAt}`;
    if (last < target && nowStamp >= target) softRefresh(runtime);

    last = nowStamp;
  };

  setInterval(check, Math.max(1, SCHEDULE.checkEverySeconds) * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("focus", check);
  window.addEventListener("pageshow", check);

  // Console helpers, mock mode only (they check when called, since mock mode
  // is switched on after this runs).
  const testOnly = fn => (...args) => {
    if (!isMockMode()) { console.warn("[schedule] test helpers only work in mock mode"); return; }
    return fn(...args);
  };
  globalThis.checkinSchedule = {
    now:         () => pacificNow(),
    softRefresh: testOnly(() => softRefresh(runtime)),
    hardRefresh: testOnly(() => hardRefresh()),
    lock: testOnly(on => {
      WEEKEND_LOCK.force = on;
      const locked = applyWeekendLock(runtime);
      if (runtime.layout.name === WEEKEND_LOCK.layout) {
        runtime.callFunction("LoadChecklist");
        runtime.callFunction("LoadTotals");
      }
      return locked;
    }),
    day: testOnly(d => {
      DAY_ONLY_ITEMS.forceDay = d ?? null;
      if (runtime.layout.name === "StudentLayout") runtime.callFunction("LoadChecklist");
      else if (runtime.layout.name === "MentorLayout") loadMentorBoard(runtime);
      return checklistDay();
    }),
  };
}
