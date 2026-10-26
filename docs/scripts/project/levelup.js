// levelup.js
import { api, isMockMode } from "./data.js";
import { levelInfo } from "./level.js";

// The student view's level-up celebration:
//   1. SSpriteLevelUp and STextLeveUp drop down from above the screen,
//      bounce into place, stay for HOLD_SECONDS, then slide back up.
//   2. SSpriteConfetti pieces rain down over the screen.
//
// When it plays for real: LoadTotals calls checkForLevelUp() every time the
// student's totals load. If their level is higher than the last level they
// were shown the celebration for, it plays. So a student who had the app
// closed at 10am, when EXP is committed, gets it the next time they open it.
// While the student view is open, watchForCommittedExp() reloads the totals
// every few minutes and whenever the app comes back to the foreground, so it
// also plays if they have the app open at 10am.
//
// Call playLevelUp(runtime) from events (it is imported in importForEvents.js).
// Tapping TestLevelUpButton on the Student layout plays it for testing.
// Tapping the banner calls dismissLevelUp(), which sends it back up early
// (any confetti already falling finishes falling).
//
// Place SSpriteLevelUp and STextLeveUp ABOVE the top of the layout in the
// editor, lined up the way you want them to look. They keep that arrangement
// as they drop, and go back to those spots when the effect ends.

// ================================================================ tweak me
export const LEVEL_UP_FX = {
  // ---- banner (sprite + text)
  restTop:       20,    // px from the top of the screen where the banner's top edge stops
  dropSeconds:   0.9,   // time to fall into place
  dropOvershoot: 1.6,   // bounce at the end of the drop: 0 = none, 1.7 = springy, 3 = very springy
  holdSeconds:   5,    // how long it stays on screen (tap the banner to dismiss early)
  riseSeconds:   0.6,   // time to slide back up and out

  // ---- confetti
  confettiSeconds:   5,     // how long new confetti keeps spawning
  confettiPerSecond: 70,    // spawn rate while it is raining
  confettiBurst:     60,    // extra pieces dropped all at once at the start
  fallSpeed:   [250, 520],  // px per second, random in [min, max]
  sway:        [30, 110],   // side-to-side drift amount in px
  swaySpeed:   [1.5, 4],    // side-to-side wobbles per second
  spinSpeed:   [-6, 6],     // radians per second
  flipSpeed:   [4, 12],     // how fast pieces "flip" (width squash), per second
  size:        [14, 28],    // piece width in px (height is half of this)
  colors: [                 // RGB, 0..1
    [1.00, 0.33, 0.33],  // red
    [1.00, 0.76, 0.20],  // gold
    [0.30, 0.85, 0.40],  // green
    [0.25, 0.60, 1.00],  // blue
    [0.80, 0.40, 1.00],  // purple
    [1.00, 0.55, 0.80],  // pink
  ],
  confettiInFront: true,    // true: confetti falls over the banner; false: behind it
};
// ========================================================================

const rand = ([min, max]) => min + Math.random() * (max - min);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Easing: overshoots then settles (gives the drop its bounce).
function easeOutBack(t, s) {
  const c = s + 1;
  return 1 + c * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
}
const easeInCubic = t => t * t * t;

// One effect at a time per runtime.
let fx = null;

// ---------------------------------------------------------------- public

// Starts (or restarts) the celebration. Safe to call while it is already playing:
// the banner restarts its hold timer and more confetti is added.
export function playLevelUp(runtime) {
  if (!fx) fx = startFx(runtime);
  else fx.restart();
}

// Sends the banner back up now (same slide-up as when the hold time runs out)
// and stops new confetti from spawning. Pieces already falling finish their fall.
export function dismissLevelUp() {
  fx?.dismiss();
}

// Ends it right away and puts the banner back where it was placed in the editor.
export function stopLevelUp() {
  fx?.stop();
}

export function isLevelUpPlaying() {
  return !!fx;
}

// ---------------------------------------------------------------- internals

function startFx(runtime) {
  const cfg = LEVEL_UP_FX;
  const sprite = runtime.objects.SSpriteLevelUp?.getFirstInstance();
  const text   = runtime.objects.STextLeveUp?.getFirstInstance();
  const confettiType = runtime.objects.SSpriteConfetti;

  // Where the banner sits in the editor (above the screen) and how far it falls.
  const parts = [sprite, text].filter(Boolean);
  const home = parts.map(inst => ({ inst, x: inst.x, y: inst.y }));
  let bannerTop = Infinity;
  for (const inst of parts) bannerTop = Math.min(bannerTop, inst.getBoundingBox().top);
  const dropBy = parts.length ? cfg.restTop - bannerTop : 0;

  // Put the banner over everything else on its layer (sprite, then text on top).
  for (const inst of parts) inst.moveToTop();

  let phase = "drop";     // drop -> hold -> rise -> done
  let phaseTime = 0;
  let rainLeft = cfg.confettiSeconds;
  let spawnCarry = 0;
  let currentOffset = 0;  // how far the banner has moved down right now
  let riseFrom = 1;       // fraction of dropBy the rise starts from (1 = fully down)
  const pieces = [];

  const state = {
    restart() {
      // Already down? Go straight back to holding with a fresh timer.
      if (phase === "hold") phaseTime = 0;
      else if (phase === "rise") { phase = "drop"; phaseTime = 0; }
      riseFrom = 1;
      rainLeft = cfg.confettiSeconds;
      burst();
    },
    dismiss() {
      if (phase === "drop" || phase === "hold") {
        // Rise from wherever the banner is right now, so a tap mid-drop doesn't jump.
        riseFrom = currentOffset / (dropBy || 1);
        phase = "rise";
        phaseTime = 0;
      }
      rainLeft = 0;
    },
    stop() { finish(); },
  };

  function setBannerOffset(offset) {
    currentOffset = offset;
    for (const h of home) {
      h.inst.x = h.x;
      h.inst.y = h.y + offset;
    }
  }

  function spawnPiece(startAboveScreen) {
    if (!confettiType) return;
    const layer = sprite?.layer?.name ?? 0;
    const w = rand(cfg.size);
    const x = Math.random() * runtime.layout.width;
    const y = startAboveScreen ? -20 - Math.random() * 300 : -20;
    const inst = confettiType.createInstance(layer, x, y);
    inst.width = w;
    inst.height = w / 2;
    inst.angle = Math.random() * Math.PI * 2;
    inst.colorRgb = pick(cfg.colors);
    if (cfg.confettiInFront) inst.moveToTop();
    else if (sprite) inst.moveAdjacentToInstance(sprite, false);
    pieces.push({
      inst, baseX: x, baseW: w, t: Math.random() * 10,
      fall: rand(cfg.fallSpeed),
      sway: rand(cfg.sway),
      swaySpeed: rand(cfg.swaySpeed),
      spin: rand(cfg.spinSpeed),
      flip: rand(cfg.flipSpeed),
    });
  }

  function burst() {
    for (let i = 0; i < cfg.confettiBurst; i++) spawnPiece(true);
  }

  function tick() {
    const dt = runtime.dt;

    // ---- banner
    phaseTime += dt;
    if (phase === "drop") {
      const t = Math.min(1, phaseTime / Math.max(0.01, cfg.dropSeconds));
      setBannerOffset(dropBy * easeOutBack(t, cfg.dropOvershoot));
      if (t >= 1) { phase = "hold"; phaseTime = 0; }
    } else if (phase === "hold") {
      setBannerOffset(dropBy);
      if (phaseTime >= cfg.holdSeconds) { phase = "rise"; phaseTime = 0; riseFrom = 1; }
    } else if (phase === "rise") {
      const t = Math.min(1, phaseTime / Math.max(0.01, cfg.riseSeconds));
      setBannerOffset(dropBy * riseFrom * (1 - easeInCubic(t)));
      if (t >= 1) phase = "done";
    }

    // ---- confetti: spawn
    if (rainLeft > 0) {
      rainLeft -= dt;
      spawnCarry += cfg.confettiPerSecond * dt;
      while (spawnCarry >= 1) { spawnPiece(false); spawnCarry -= 1; }
    }

    // ---- confetti: move, and remove pieces that fell off the bottom
    const bottom = runtime.layout.height + 40;
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      p.t += dt;
      p.inst.y += p.fall * dt;
      p.inst.x = p.baseX + Math.sin(p.t * p.swaySpeed) * p.sway;
      p.inst.angle += p.spin * dt;
      p.inst.width = p.baseW * Math.max(0.1, Math.abs(Math.cos(p.t * p.flip)));
      if (p.inst.y > bottom) {
        p.inst.destroy();
        pieces.splice(i, 1);
      }
    }

    if (phase === "done" && rainLeft <= 0 && pieces.length === 0) finish();
  }

  // Leaving the layout destroys the instances; just stop listening.
  function onLayoutEnd() {
    pieces.length = 0;
    finish(false);
  }

  function finish(restore = true) {
    runtime.removeEventListener("tick", tick);
    runtime.removeEventListener("beforeanylayoutend", onLayoutEnd);
    if (restore) {
      setBannerOffset(0);
      for (const p of pieces) p.inst.destroy();
    }
    pieces.length = 0;
    if (fx === state) fx = null;
  }

  runtime.addEventListener("tick", tick);
  runtime.addEventListener("beforeanylayoutend", onLayoutEnd);
  burst();
  return state;
}

// ================================================================ real level-ups

export const LEVEL_CHECK = {
  recheckSeconds: 300,  // while the student view is open, reload totals this often
};

// The last level this student has been shown the celebration for, kept in the
// browser (one value per user, mock users kept separate from real ones).
const seenKey = userId => `checkin:lastLevelSeen:${isMockMode() ? "mock:" : ""}${userId}`;

function readSeen(key) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? null : Number(v);
  } catch { return null; }
}
function writeSeen(key, level) {
  try { localStorage.setItem(key, String(level)); } catch {}
}

// Call with the student's committed total EXP (total_exp, not today's pending).
// Plays the celebration if they have gone up a level since they last saw it.
// Returns true if it played.
export async function checkForLevelUp(runtime, totalExp) {
  const level = levelInfo(totalExp).level;
  let userId = null;
  try { userId = await api.getMyUserId(); } catch {}
  if (!userId) return false;

  const key = seenKey(userId);
  const seen = readSeen(key);

  // First time on this browser: remember where they are, don't celebrate.
  if (seen === null || Number.isNaN(seen)) { writeSeen(key, level); return false; }

  if (level > seen) {
    writeSeen(key, level);
    playLevelUp(runtime);
    return true;
  }
  // EXP went down (e.g. a correction): follow it, so reaching the level again celebrates again.
  if (level < seen) writeSeen(key, level);
  return false;
}

// Keeps the student view's totals fresh so a 10am commit is noticed while the
// app is open: reloads every LEVEL_CHECK.recheckSeconds and whenever the app
// comes back to the foreground. Stops by itself when the layout ends.
export function watchForCommittedExp(runtime, everySeconds = LEVEL_CHECK.recheckSeconds) {
  const refresh = () => runtime.callFunction("LoadTotals");
  const timer = setInterval(refresh, Math.max(10, everySeconds) * 1000);
  const stop = () => {
    clearInterval(timer);
    runtime.removeEventListener("resume", refresh);
    runtime.removeEventListener("beforeanylayoutend", stop);
  };
  runtime.addEventListener("resume", refresh);
  runtime.addEventListener("beforeanylayoutend", stop);
  return stop;
}
