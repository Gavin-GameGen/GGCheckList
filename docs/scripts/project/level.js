// level.js
// Levels from total EXP, and the student view's progress bar.
//
// ---------------------------------------------------------------- levels
// Linear: every level takes the same amount of EXP.
//
// Sized so a student who ticks every checklist item, 5 days a week, levels up
// once a week:
//
//   a full day today  = 10 + 15 + 20 + 25 = 70 EXP   (MOCK_ITEMS in data.js)
//   one level         = 70 x 5 days       = 350 EXP
//
//   total needed:  L2: 350   L3: 700   L4: 1050   L5: 1400 ...
//
// If the checklist items or their EXP change, update FULL_DAY_EXP to match
// (the sum of every item's exp) so a level still takes one full week.
export const FULL_DAY_EXP   = 70;
export const DAYS_PER_LEVEL = 5;
export const EXP_PER_LEVEL  = FULL_DAY_EXP * DAYS_PER_LEVEL;   // 350

// -> { level, levelStart, nextLevelAt, intoLevel, neededThisLevel, fraction }
//   level            the level this total EXP puts you on (starts at 1)
//   levelStart       total EXP where this level began
//   nextLevelAt      total EXP where the next level begins
//   intoLevel        EXP earned since this level began
//   neededThisLevel  EXP this level takes in all (always EXP_PER_LEVEL)
//   fraction         0..1, how far through this level
export function levelInfo(totalExp) {
  const total = Math.max(0, Math.floor(Number(totalExp) || 0));
  const perLevel = Math.max(1, EXP_PER_LEVEL);

  const levelsDone = Math.floor(total / perLevel);
  const levelStart = levelsDone * perLevel;
  const intoLevel  = total - levelStart;

  return {
    level: levelsDone + 1,
    levelStart,
    nextLevelAt: levelStart + perLevel,
    intoLevel,
    neededThisLevel: perLevel,
    fraction: intoLevel / perLevel
  };
}

// ---------------------------------------------------------------- the bar
// SSpriteProgBar is stretched from the left edge of SSpriteProgBarBG to show
// how far the student is through their current level. STextProgBarNum shows
// their total EXP over the total EXP the next level starts at, e.g. "340 / 350 EXP".
// STextLevel, near the top of the student view, shows the level, e.g. "Level 1".
//
// The bar fills over the background exactly, whatever origin the sprites
// have, so move or resize SSpriteProgBarBG in the editor and the bar follows.

const BAR_TEXT   = info => `${info.total} / ${info.nextLevelAt} EXP`;
const LEVEL_TEXT = info => `Level ${info.level}`;

// Where the fill's origin sits across its width (0 = left, 0.5 = middle),
// read once per instance before we start changing its width.
const originFraction = new WeakMap();

export function updateProgressBar(runtime, totalExp) {
  const info = { ...levelInfo(totalExp), total: Math.max(0, Math.floor(Number(totalExp) || 0)) };

  const bar  = runtime.objects.SSpriteProgBar?.getFirstInstance();
  const bg   = runtime.objects.SSpriteProgBarBG?.getFirstInstance();
  const text = runtime.objects.STextProgBarNum?.getFirstInstance();
  const levelText = runtime.objects.STextLevel?.getFirstInstance();

  if (bar) {
    if (!originFraction.has(bar)) {
      const bb = bar.getBoundingBox();
      originFraction.set(bar, bb.width > 0 ? (bar.x - bb.left) / bb.width : 0.5);
    }
    // The track to fill: the background if it is there, otherwise the bar's own spot.
    const track = (bg ?? bar).getBoundingBox();
    const width = track.width * info.fraction;

    bar.width = width;
    bar.x = track.left + width * originFraction.get(bar);
    bar.isVisible = width >= 1;
  }

  if (text) text.text = BAR_TEXT(info);
  if (levelText) levelText.text = LEVEL_TEXT(info);

  return info;
}
