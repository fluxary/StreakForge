/* ─────────────────────────────────────────────────────────────────────────
   STREAKFORGE — script.js  v2
   Gamified fitness tracker with Training Program, real streak logic,
   fixed workout counting, profile customization, and smarter insights.
   Mobile-optimized
   ───────────────────────────────────────────────────────────────────────── */

'use strict';

/* ── CONSTANTS ──────────────────────────────────────────────────────────── */

const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps'];
const MUSCLE_META = {
  chest:     { label: 'Chest',     icon: '', color: '#e05252', frontBack: 'front' },
  back:      { label: 'Back',      icon: '', color: '#5299e0', frontBack: 'back'  },
  shoulders: { label: 'Shoulders', icon: '', color: '#52c5e0', frontBack: 'both'  },
  biceps:    { label: 'Biceps',    icon: '', color: '#e0a452', frontBack: 'front' },
  triceps:   { label: 'Triceps',   icon: '', color: '#a052e0', frontBack: 'back'  },
};

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const RANKS = ['unranked','bronze','silver','gold','diamond','obsidian'];
const RANK_LABELS = {
  unranked: 'Unranked', bronze: 'Bronze', silver: 'Silver',
  gold: 'Gold', diamond: 'Diamond', obsidian: 'Obsidian',
};
const RANK_ICONS = {
  unranked: '○', bronze: '🥉', silver: '🥈', gold: '🥇', diamond: '💎', obsidian: '⚡',
};
const RANK_COLORS = {
  unranked: 'var(--rank-unranked)', bronze: 'var(--rank-bronze)', silver: 'var(--rank-silver)',
  gold: 'var(--rank-gold)', diamond: 'var(--rank-diamond)', obsidian: 'var(--rank-obsidian)',
};

const TITLES = [
  [1,'Recruit'], [5,'Beginner'], [10,'Apprentice'], [15,'Dedicated'],
  [20,'Warrior'], [25,'Elite'], [30,'Titan'], [35,'Legend'], [40,'Mythic'], [50,'Forge God'],
];

const EXERCISE_SUGGESTIONS = {
  chest:     ['Chest Press', 'Chest Fly', 'Incline Bench', 'Push-Up', 'Cable Crossover', 'Chest Dip'],
  back:      ['Lat Pulldown', 'Seated Cable Row','Deadlift', 'Pull-Up', 'Bent-Over Row', 'T-Bar Row'],
  shoulders: ['Lateral Raise', 'Shoulder Press', 'Front Raise', 'Arnold Press', 'Face Pull', 'Shrug'],
  biceps:    ['Biceps Curl', 'Hammer Curl', 'Reverse Curl', 'Incline Curl', 'Cable Curl'],
  triceps:   ['Tricep Pushdown', 'Skull Crusher', 'Close-Grip Bench', 'Dips', 'Overhead Extension'],
};

/* ── DEFAULT SAVE STATE ──────────────────────────────────────────────────── */

function createDefaultSave() {
  const muscles = {};
  MUSCLES.forEach(m => {
    muscles[m] = {
      xp: 0, volume: 0, workoutCount: 0,
      streak: 0, lastWorkoutDate: null, longestStreak: 0,
      rank: 'unranked',
      exercises: {}, // exerciseName -> { bestWeight, totalVolume, lastDate, count }
      history: [],   // last 50 workout entries
    };
  });

  // Default program: Mon/Tue/Thu/Fri workout, Wed/Sat/Sun rest
  const defaultProgram = {};
  DAY_NAMES.forEach((name, i) => {
    const isRest = [0, 3, 6].includes(i); // Sun, Wed, Sat
    defaultProgram[name] = {
      type: isRest ? 'rest' : 'workout',
      workoutName: isRest ? '' : (i === 1 ? 'Push Day' : i === 2 ? 'Pull Day' : i === 4 ? 'Legs Day' : 'Upper Day'),
      exercises: isRest ? [] : [],
      notes: '',
    };
  });

  // Clear exercise lists in default program
  Object.values(defaultProgram).forEach(d => { d.exercises = []; d.workoutName = d.type === 'rest' ? '' : d.workoutName; });

  return {
    profile: {
      displayName: 'Forger',
      username: '',
      level: 1,
      xp: 0,
      totalXP: 0,
      streak: 0,
      longestStreak: 0,
      totalWorkouts: 0,   // unique workout days
      totalVolume: 0,
      lastWorkoutDate: null,
      createdAt: new Date().toISOString(),
    },
    program: defaultProgram,  // weekly schedule keyed by day name
    muscles,
    workouts: [],             // full exercise log
    achievements: {},         // id -> { unlockedAt }
    settings: { theme: 'dark' },
  };
}

/* ── SAVE / LOAD ─────────────────────────────────────────────────────────── */

let state = null;

function loadState() {
  try {
    const raw = localStorage.getItem('streakforge_v1');
    if (raw) {
      state = JSON.parse(raw);
      // Migrate: ensure new fields exist
      if (!state.profile.displayName) state.profile.displayName = state.profile.name || 'Forger';
      if (!state.profile.username) state.profile.username = '';
      if (!state.program) state.program = createDefaultSave().program;
      if (state.profile.totalWorkouts === undefined) state.profile.totalWorkouts = getUniqueDates(state.workouts).length;
      MUSCLES.forEach(m => {
        if (!state.muscles[m].exercises) state.muscles[m].exercises = {};
        if (!state.muscles[m].longestStreak) state.muscles[m].longestStreak = 0;
      });
      // Recalculate streak with new logic on load
      recalculateStreakFromHistory();
    } else {
      state = createDefaultSave();
    }
  } catch(e) {
    state = createDefaultSave();
  }
}

function saveState() {
  try {
    localStorage.setItem('streakforge_v1', JSON.stringify(state));
  } catch(e) {
    console.error('Save failed', e);
  }
}

/* ── DATE HELPERS ────────────────────────────────────────────────────────── */

function toDateStr(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function daysBetween(a, b) {
  const d1 = new Date(a + 'T00:00:00');
  const d2 = new Date(b + 'T00:00:00');
  return Math.round((d2 - d1) / 86400000);
}

function getDayName(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_NAMES[d.getDay()];
}

function getTodayDayName() {
  return DAY_NAMES[new Date().getDay()];
}

function getDayProgramEntry(dayName) {
  return state.program[dayName] || null;
}

function getUniqueDates(workouts) {
  const set = new Set();
  (workouts || []).forEach(w => { if (w.date) set.add(w.date); });
  return Array.from(set).sort();
}

function getWorkoutDatesSet() {
  return new Set(getUniqueDates(state.workouts));
}

function isProgramConfigured() {
  return Object.values(state.program).some(d => d.type === 'workout' && d.workoutName);
}

function computeCurrentStreak() {
  const today = toDateStr(new Date());
  const workoutDates = getWorkoutDatesSet();

  if (!isProgramConfigured()) {
    return computeFallbackStreak(today, workoutDates);
  }

  let streak = 0;
  const cursor = new Date(today + 'T00:00:00');

  for (let i = 0; i < 365; i++) {
    const dateStr = toDateStr(cursor);
    const dayName = DAY_NAMES[cursor.getDay()];
    const plan = state.program[dayName];

    if (!plan) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    if (plan.type === 'rest') {
      streak++;
    } else {
      if (workoutDates.has(dateStr)) {
        streak++;
      } else {
        if (dateStr === today) {
          cursor.setDate(cursor.getDate() - 1);
          continue;
        }
        break;
      }
    }
    
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function computeLongestStreak() {
  const workoutDates = getWorkoutDatesSet();
  if (!isProgramConfigured()) {
    return computeFallbackLongestStreak(workoutDates);
  }

  // Walk through all dates from first workout to today
  const allDates = getUniqueDates(state.workouts);
  if (allDates.length === 0) return 0;

  const start = new Date(allDates[0] + 'T00:00:00');
  const today = new Date(toDateStr(new Date()) + 'T00:00:00');

  let longest = 0;
  let current = 0;
  const cursor = new Date(start);

  while (cursor <= today) {
    const dateStr = toDateStr(cursor);
    const dayName = DAY_NAMES[cursor.getDay()];
    const plan = state.program[dayName];

    const isSuccess = plan
      ? (plan.type === 'rest' || workoutDates.has(dateStr))
      : workoutDates.has(dateStr);

    if (isSuccess) {
      current++;
      if (current > longest) longest = current;
    } else if (dateStr < toDateStr(new Date())) {
      // Only break on past days
      current = 0;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return longest;
}

function computeFallbackStreak(today, workoutDates) {
  let streak = 0;
  const cursor = new Date(today + 'T00:00:00');
  for (let i = 0; i < 365; i++) {
    const dateStr = toDateStr(cursor);
    if (workoutDates.has(dateStr)) {
      streak++;
    } else if (dateStr === today) {
      // don't penalize today yet
    } else {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function computeFallbackLongestStreak(workoutDates) {
  const dates = Array.from(workoutDates).sort();
  let longest = 0, current = 0;
  for (let i = 0; i < dates.length; i++) {
    if (i === 0 || daysBetween(dates[i-1], dates[i]) === 1) {
      current++;
    } else {
      current = 1;
    }
    if (current > longest) longest = current;
  }
  return longest;
}

/** Re-compute streak metrics fresh from workout history and program. */
function recalculateStreakFromHistory() {
  state.profile.streak = computeCurrentStreak();
  state.profile.longestStreak = computeLongestStreak();
  // Recalculate unique workout days (fix totalWorkouts count)
  state.profile.totalWorkouts = getUniqueDates(state.workouts).length;
  // Also fix muscle workoutCount (it was per-exercise before, now per unique day)
  MUSCLES.forEach(m => {
    const dates = new Set();
    state.workouts.filter(w => w.muscleKey === m).forEach(w => { if (w.date) dates.add(w.date); });
    state.muscles[m].workoutCount = dates.size;
  });
}

/* ── LEVEL / XP MATH ─────────────────────────────────────────────────────── */

function xpForLevel(level) {
  return Math.floor(100 * Math.pow(level, 1.25));
}

function getTitle(level) {
  let title = 'Recruit';
  for (const [lvl, t] of TITLES) {
    if (level >= lvl) title = t;
  }
  return title;
}

function computeXPGain(sets, reps, weight) {
  const volume = sets * reps * weight;
  return Math.floor(25 + (volume / 20));
}

/* ── RANK COMPUTATION ────────────────────────────────────────────────────── */

function computeRank(muscleData) {
  const { streak, volume, exercises, workoutCount } = muscleData;
  const exerciseCount = Object.keys(exercises || {}).length;
  const hasPR = Object.values(exercises || {}).some(e => e.count > 1);

  if (streak >= 20 && exerciseCount >= 5 && hasPR) return 'obsidian';
  if (streak >= 12 && volume >= 5000) return 'diamond';
  if (streak >= 8 && exerciseCount >= 2) return 'gold';
  if (streak >= 4) return 'silver';
  if (workoutCount >= 1) return 'bronze';
  return 'unranked';
}

/* ── PER-MUSCLE STREAK ───────────────────────────────────────────────────── */

function updateMuscleStreak(muscleKey, dateStr) {
  const muscle = state.muscles[muscleKey];
  const last = muscle.lastWorkoutDate;

  if (!last) {
    muscle.streak = 1;
  } else {
    const diff = daysBetween(last, dateStr);
    if (diff === 0) {
      // same day, no change
    } else if (diff === 1) {
      muscle.streak += 1;
    } else {
      muscle.streak = 1;
    }
  }

  if (muscle.streak > muscle.longestStreak) muscle.longestStreak = muscle.streak;
  muscle.lastWorkoutDate = dateStr;
}

/* ── LOG WORKOUT ─────────────────────────────────────────────────────────── */

function logWorkout(muscleKey, exercise, sets, reps, weight, duration, notes, dateStr) {
  const volume = sets * reps * weight;
  let xpGain = computeXPGain(sets, reps, weight);
  let isPR = false;

  // Update muscle exercise tracking
  const muscle = state.muscles[muscleKey];
  if (!muscle.exercises[exercise]) {
    muscle.exercises[exercise] = { bestWeight: 0, totalVolume: 0, lastDate: null, count: 0 };
  }
  const ex = muscle.exercises[exercise];
  ex.count += 1;
  ex.totalVolume += volume;
  ex.lastDate = dateStr;

  if (weight > ex.bestWeight) {
    if (ex.count > 1) { isPR = true; xpGain += 50; }
    ex.bestWeight = weight;
  }

  // Update muscle stats
  muscle.xp += xpGain;
  muscle.volume += volume;
  // Workout count = unique dates for this muscle
  const muscleDates = new Set(state.workouts.filter(w => w.muscleKey === muscleKey).map(w => w.date));
  muscleDates.add(dateStr);
  muscle.workoutCount = muscleDates.size;

  updateMuscleStreak(muscleKey, dateStr);
  muscle.rank = computeRank(muscle);

  // Muscle history
  muscle.history.unshift({ exercise, sets, reps, weight, volume, xpGain, isPR, date: dateStr, notes, duration });
  if (muscle.history.length > 50) muscle.history.pop();

  // Global profile
  state.profile.xp += xpGain;
  state.profile.totalXP += xpGain;
  state.profile.totalVolume += volume;

  // Check if this date is new (unique day)
  const existingDates = getWorkoutDatesSet();
  const isNewDay = !existingDates.has(dateStr);

  // Full workout record
  const workout = {
    id: Date.now() + Math.random(),
    muscleKey, exercise, sets, reps, weight, volume, duration, notes,
    xpGain, isPR, date: dateStr,
    timestamp: new Date().toISOString(),
  };
  state.workouts.unshift(workout);

  // Update unique workout day count
  if (isNewDay) {
    state.profile.totalWorkouts = getUniqueDates(state.workouts).length;
  }
  state.profile.lastWorkoutDate = dateStr;

  // Recompute streaks using real program logic
  state.profile.streak = computeCurrentStreak();
  state.profile.longestStreak = Math.max(state.profile.longestStreak, computeLongestStreak());

  // Level up check
  let leveled = false;
  let newLevel = state.profile.level;
  while (state.profile.xp >= xpForLevel(state.profile.level)) {
    state.profile.xp -= xpForLevel(state.profile.level);
    state.profile.level += 1;
    leveled = true;
    newLevel = state.profile.level;
  }

  saveState();
  checkAchievements();

  return { xpGain, isPR, leveled, newLevel, volume };
}

/* ── PROGRAM ADHERENCE ───────────────────────────────────────────────────── */

/**
 * Compute adherence for the last N days.
 * Returns { completed, total, pct }
 * - total: planned workout days in range (rest days count as "auto-completed")
 * - completed: days where user followed the plan
 */
function computeProgramAdherence(daysBack = 30) {
  if (!isProgramConfigured()) return null;

  const today = toDateStr(new Date());
  const workoutDates = getWorkoutDatesSet();
  let total = 0, completed = 0;

  const cursor = new Date(today + 'T00:00:00');
  // Don't count today (still in progress)
  cursor.setDate(cursor.getDate() - 1);

  for (let i = 0; i < daysBack; i++) {
    const dateStr = toDateStr(cursor);
    const dayName = DAY_NAMES[cursor.getDay()];
    const plan = state.program[dayName];

    if (plan) {
      total++;
      if (plan.type === 'rest' || workoutDates.has(dateStr)) {
        completed++;
      }
    }
    cursor.setDate(cursor.getDate() - 1);
  }

  if (total === 0) return null;
  return { completed, total, pct: Math.round((completed / total) * 100) };
}

/**
 * Compute this week's adherence (Mon–Sun or Sun–Sat depending on locale).
 * Returns { days: [{ dateStr, dayName, plan, completed, isToday }], completedCount, totalCount }
 */
function computeWeekAdherence() {
  const today = new Date();
  const todayStr = toDateStr(today);
  const workoutDates = getWorkoutDatesSet();

  // Build this week: Sunday to Saturday
  const weekDays = [];
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());

  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const dateStr = toDateStr(d);
    const dayName = DAY_NAMES[d.getDay()];
    const plan = state.program[dayName] || { type: 'workout' };
    const isToday = dateStr === todayStr;
    const isPast = dateStr < todayStr;
    const hasWorkout = workoutDates.has(dateStr);
    let completed = null;

    if (isPast) {
      completed = plan.type === 'rest' || hasWorkout;
    } else if (isToday) {
      completed = plan.type === 'rest' || hasWorkout;
    }

    weekDays.push({ dateStr, dayName, plan, completed, isToday, isPast, hasWorkout });
  }

  const past = weekDays.filter(d => d.isPast || d.isToday);
  const completedCount = past.filter(d => d.completed).length;
  const totalCount = past.length;

  return { days: weekDays, completedCount, totalCount };
}

/** Find the next upcoming workout day (not today) */
function getNextWorkoutDay() {
  if (!isProgramConfigured()) return null;

  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dayName = DAY_NAMES[d.getDay()];
    const plan = state.program[dayName];
    if (plan && plan.type === 'workout') {
      return { dayName, plan, daysAway: i };
    }
  }
  return null;
}

/* ── ACHIEVEMENTS ────────────────────────────────────────────────────────── */

const ACHIEVEMENTS_DEFS = [
  { id: 'first_workout',    icon: '🏋️', name: 'First Rep',         desc: 'Log your first workout',          check: s => s.profile.totalWorkouts >= 1 },
  { id: 'workouts_5',       icon: '🔥', name: 'Getting Warmed Up',  desc: 'Complete 5 workout days',          check: s => s.profile.totalWorkouts >= 5 },
  { id: 'workouts_10',      icon: '⚡', name: 'Consistent',         desc: 'Complete 10 workout days',         check: s => s.profile.totalWorkouts >= 10 },
  { id: 'workouts_30',      icon: '💪', name: 'Iron Will',          desc: 'Complete 30 workout days',         check: s => s.profile.totalWorkouts >= 30 },
  { id: 'workouts_50',      icon: '🦾', name: 'Half Century',       desc: 'Complete 50 workout days',         check: s => s.profile.totalWorkouts >= 50 },
  { id: 'level_5',          icon: '⭐', name: 'Rising Star',        desc: 'Reach level 5',                   check: s => s.profile.level >= 5 },
  { id: 'level_10',         icon: '🌟', name: 'Apprentice Forger',  desc: 'Reach level 10',                  check: s => s.profile.level >= 10 },
  { id: 'level_20',         icon: '💫', name: 'Warrior Forged',     desc: 'Reach level 20',                  check: s => s.profile.level >= 20 },
  { id: 'level_30',         icon: '🏆', name: 'Titan Rising',       desc: 'Reach level 30',                  check: s => s.profile.level >= 30 },
  { id: 'volume_1000',      icon: '📦', name: '1K Volume',          desc: 'Lift 1,000 kg total',             check: s => s.profile.totalVolume >= 1000 },
  { id: 'volume_5000',      icon: '📦', name: '5K Volume',          desc: 'Lift 5,000 kg total',             check: s => s.profile.totalVolume >= 5000 },
  { id: 'volume_25000',     icon: '🚀', name: '25K Crusher',        desc: 'Lift 25,000 kg total',            check: s => s.profile.totalVolume >= 25000 },
  { id: 'streak_3',         icon: '🔥', name: 'On Fire',            desc: 'Maintain a 3-day streak',         check: s => s.profile.longestStreak >= 3 },
  { id: 'streak_7',         icon: '🌈', name: 'Week Warrior',       desc: 'Maintain a 7-day streak',         check: s => s.profile.longestStreak >= 7 },
  { id: 'streak_14',        icon: '🌕', name: 'Two Week Titan',     desc: 'Maintain a 14-day streak',        check: s => s.profile.longestStreak >= 14 },
  { id: 'first_pr',         icon: '🏅', name: 'Personal Best',      desc: 'Set your first PR',               check: s => s.workouts.some(w => w.isPR) },
  { id: 'first_bronze',     icon: '🥉', name: 'Bronze Forge',       desc: 'Rank a muscle to Bronze',         check: s => MUSCLES.some(m => s.muscles[m].rank !== 'unranked') },
  { id: 'first_gold',       icon: '🥇', name: 'Gold Forger',        desc: 'Rank a muscle to Gold',           check: s => MUSCLES.some(m => ['gold','diamond','obsidian'].includes(s.muscles[m].rank)) },
  { id: 'first_diamond',    icon: '💎', name: 'Diamond Forger',     desc: 'Rank a muscle to Diamond',        check: s => MUSCLES.some(m => ['diamond','obsidian'].includes(s.muscles[m].rank)) },
  { id: 'first_obsidian',   icon: '⚡', name: 'Obsidian Legend',    desc: 'Rank a muscle to Obsidian',       check: s => MUSCLES.some(m => s.muscles[m].rank === 'obsidian') },
  { id: 'all_muscles',      icon: '🗺️', name: 'Full Body',          desc: 'Log a workout for all muscles',   check: s => MUSCLES.every(m => s.muscles[m].workoutCount >= 1) },
  { id: 'five_exercises',   icon: '📚', name: 'Exercise Library',   desc: 'Use 5 different exercises',       check: s => { const ex = new Set(s.workouts.map(w => w.exercise)); return ex.size >= 5; } },
  { id: 'program_setup',    icon: '📋', name: 'Planner',            desc: 'Set up a training program',       check: s => isProgramConfigured() },
  { id: 'adherence_90',     icon: '🎯', name: 'Program Perfectionist', desc: '90%+ program adherence (30 days)', check: s => { const a = computeProgramAdherence(30); return a && a.pct >= 90; } },
];

let pendingAchToasts = [];

function checkAchievements() {
  ACHIEVEMENTS_DEFS.forEach(def => {
    if (state.achievements[def.id]) return;
    if (def.check(state)) {
      state.achievements[def.id] = { unlockedAt: new Date().toISOString() };
      pendingAchToasts.push(def);
    }
  });
}

function showNextToast() {
  if (pendingAchToasts.length === 0) return;
  const def = pendingAchToasts.shift();
  const toast = document.getElementById('achToast');
  document.getElementById('achToastIcon').textContent = def.icon;
  document.getElementById('achToastName').textContent = def.name;
  toast.classList.add('visible');
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(showNextToast, 500);
  }, 3000);
}

/* ── SVG BODY MAP ────────────────────────────────────────────────────────── */

function buildBodySVG(side) {
  const front = `
<svg viewBox="0 0 100 240" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="50" cy="14" rx="12" ry="13" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="45" y="26" width="10" height="8" rx="2" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="28" y="54" width="44" height="56" rx="6" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <path class="muscle-area" data-muscle="chest" d="M32,58 L48,58 L48,82 Q40,86 32,82 Z" title="Chest"/>
  <path class="muscle-area" data-muscle="chest" d="M52,58 L68,58 L68,82 Q60,86 52,82 Z" title="Chest"/>
  <ellipse class="muscle-area" data-muscle="shoulders" cx="23" cy="63" rx="10" ry="12" title="Shoulders"/>
  <ellipse class="muscle-area" data-muscle="shoulders" cx="77" cy="63" rx="10" ry="12" title="Shoulders"/>
  <rect class="muscle-area" data-muscle="biceps" x="13" y="76" width="11" height="28" rx="5" title="Biceps"/>
  <rect class="muscle-area" data-muscle="biceps" x="76" y="76" width="11" height="28" rx="5" title="Biceps"/>
  <rect x="11" y="105" width="9" height="26" rx="4" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="80" y="105" width="9" height="26" rx="4" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="35" y="84" width="30" height="26" rx="4" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="0.8" opacity="0.7"/>
  <rect x="30" y="110" width="40" height="14" rx="4" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="30" y="125" width="17" height="52" rx="7" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="53" y="125" width="17" height="52" rx="7" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="31" y="178" width="14" height="36" rx="6" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="55" y="178" width="14" height="36" rx="6" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
</svg>`;

  const back = `
<svg viewBox="0 0 100 240" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="50" cy="14" rx="12" ry="13" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="45" y="26" width="10" height="8" rx="2" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="28" y="54" width="44" height="56" rx="6" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <path class="muscle-area" data-muscle="back" d="M30,58 L70,58 L68,105 L32,105 Z" title="Back"/>
  <ellipse class="muscle-area" data-muscle="shoulders" cx="23" cy="63" rx="10" ry="12" title="Shoulders"/>
  <ellipse class="muscle-area" data-muscle="shoulders" cx="77" cy="63" rx="10" ry="12" title="Shoulders"/>
  <rect class="muscle-area" data-muscle="triceps" x="13" y="76" width="11" height="28" rx="5" title="Triceps"/>
  <rect class="muscle-area" data-muscle="triceps" x="76" y="76" width="11" height="28" rx="5" title="Triceps"/>
  <rect x="11" y="105" width="9" height="26" rx="4" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="80" y="105" width="9" height="26" rx="4" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="30" y="110" width="40" height="15" rx="4" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="30" y="126" width="17" height="52" rx="7" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="53" y="126" width="17" height="52" rx="7" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="31" y="179" width="14" height="36" rx="6" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
  <rect x="55" y="179" width="14" height="36" rx="6" fill="var(--bg-card-2)" stroke="var(--border-2)" stroke-width="1"/>
</svg>`;

  return side === 'front' ? front : back;
}

function applyMuscleColors() {
  document.querySelectorAll('.muscle-area').forEach(el => {
    const key = el.dataset.muscle;
    if (!key || !state) return;
    const rank = state.muscles[key]?.rank || 'unranked';
    el.classList.remove(...RANKS.map(r => 'muscle-' + r));
    el.classList.add('muscle-' + rank);
  });
}

function initBodyMap() {
  const container = document.getElementById('bodyContainer');
  if (!container) return;
  container.innerHTML = buildBodySVG(currentBodySide);
  applyMuscleColors();
  container.querySelectorAll('.muscle-area').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.muscle;
      if (key) openMuscleDetail(key);
    });
    const key = el.dataset.muscle;
    if (key) el.setAttribute('title', MUSCLE_META[key]?.label || key);
  });
}

let currentBodySide = 'front';

/* ── NAVIGATION ──────────────────────────────────────────────────────────── */

let activePage = 'dashboard';
let charts = {};

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  const navEl = document.querySelector(`[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  activePage = page;

  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');

  // Scroll to top when navigating on mobile
  if (window.innerWidth <= 900) {
    document.querySelector('.main-content').scrollTop = 0;
    window.scrollTo(0, 0);
  }

  if (page === 'stats') renderCharts();
  if (page === 'leaderboard') renderLeaderboard();
  if (page === 'achievements') renderAchievements();
  if (page === 'muscles') renderMuscleCards();
  if (page === 'history') renderFullHistory();
  if (page === 'program') renderProgramPage();
  if (page === 'dashboard') {
    renderHeatmap();
    renderRecentWorkouts();
    renderInsights();
    renderDashboardProgram();
  }
}

/* ── UI UPDATE: SIDEBAR ──────────────────────────────────────────────────── */

function updateSidebar() {
  if (!state) return;
  const { level, xp, displayName, username } = state.profile;
  const needed = xpForLevel(level);
  const pct = Math.min(100, (xp / needed) * 100);
  const title = getTitle(level);
  const name = displayName || 'Forger';

  document.getElementById('sidebarPlayerLevel').textContent = level;
  document.getElementById('sidebarPlayerTitle').textContent = username ? `@${username}` : title;
  document.getElementById('sidebarPlayerName').textContent = name;
  document.getElementById('sidebarXpBar').style.width = pct + '%';
  document.getElementById('sidebarXpLabel').textContent = `${xp} / ${needed} XP`;
  document.getElementById('mobileLevelBadge').textContent = `Lv${level}`;

  // Avatar initials
  const initials = name.slice(0, 2).toUpperCase();
  document.getElementById('avatarEl').textContent = initials;
}

/* ── UI UPDATE: DASHBOARD ────────────────────────────────────────────────── */

function updateDashboard() {
  if (!state) return;
  const p = state.profile;
  const streak = computeCurrentStreak();

  document.getElementById('statStreak').textContent = streak;
  document.getElementById('statTotalWorkouts').textContent = getUniqueDates(state.workouts).length;
  document.getElementById('statTotalVolume').textContent = formatVolume(p.totalVolume);
  
  // Program Adherence (all-time)
  const adherence = computeProgramAdherence(999);
  document.getElementById('statAdherenceDash').textContent = adherence ? `${adherence.pct}%` : '—';

  const name = p.displayName || 'Forger';
  const h = new Date().getHours();
  let greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  document.getElementById('dashGreeting').textContent = `${greet}, ${name}`;
}

function renderDashboardProgram() {
  renderTodayPlan();
  renderWeeklyOverview();
}

function renderTodayPlan() {
  const todayName = getTodayDayName();
  const plan = state.program[todayName];
  const badge = document.getElementById('todayDayBadge');
  const content = document.getElementById('todayProgramContent');
  if (!badge || !content) return;

  badge.textContent = todayName;

  if (!plan || (!plan.workoutName && plan.type !== 'rest')) {
    content.innerHTML = `<p class="empty-state" style="padding:16px 0">No program for today. <a href="#" onclick="navigateTo('program');return false;" style="color:var(--cyan)">Set one up →</a></p>`;
    return;
  }

  if (plan.type === 'rest') {
    const workoutDates = getWorkoutDatesSet();
    const todayStr = toDateStr(new Date());
    const didWorkoutAnyway = workoutDates.has(todayStr);
    const next = getNextWorkoutDay();

    content.innerHTML = `<div class="today-plan-rest">
      <div class="rest-icon">🛌</div>
      <div class="rest-label">Rest Day${didWorkoutAnyway ? ' — Active Recovery' : ''}</div>
      <div class="rest-sub">Recovery is part of the program. Your streak is safe.</div>
      ${next ? `<div class="next-workout-hint">Next: ${next.dayName} — ${next.plan.workoutName || 'Workout'} (${next.daysAway === 1 ? 'tomorrow' : `in ${next.daysAway} days`})</div>` : ''}
    </div>`;
    return;
  }

  // Workout day
  const exercises = plan.exercises || [];
  const workoutDates = getWorkoutDatesSet();
  const todayDone = workoutDates.has(toDateStr(new Date()));

  const exercisesHtml = exercises.length > 0
    ? `<div class="today-exercises-list">${exercises.map((ex, i) =>
        `<div class="today-exercise-item">
          <span class="today-exercise-num">${i + 1}.</span>
          <span>${esc(ex)}</span>
        </div>`
      ).join('')}</div>`
    : `<p style="color:var(--text-3);font-size:13px;font-family:var(--font-mono)">No exercises planned. Add some in Program.</p>`;

  content.innerHTML = `<div class="today-plan-workout">
    <div class="today-workout-name">${esc(plan.workoutName)}</div>
    ${exercisesHtml}
    ${plan.notes ? `<div class="today-workout-notes">${esc(plan.notes)}</div>` : ''}
    ${todayDone
      ? `<div class="next-workout-hint" style="background:rgba(74,222,128,0.1);border-color:rgba(74,222,128,0.3);color:var(--green)">✓ Workout logged today</div>`
      : `<div class="next-workout-hint">Log today's workout to keep your streak alive.</div>`}
  </div>`;
}

function renderWeeklyOverview() {
  const mini = document.getElementById('weeklyScheduleMini');
  const badge = document.getElementById('weekAdherenceBadge');
  if (!mini || !badge) return;

  if (!isProgramConfigured()) {
    mini.innerHTML = `<p class="empty-state" style="padding:16px 0">No program set. <a href="#" onclick="navigateTo('program');return false;" style="color:var(--cyan)">Create one →</a></p>`;
    badge.textContent = '—';
    return;
  }

  const week = computeWeekAdherence();
  const pct = week.totalCount > 0
    ? Math.round((week.completedCount / week.totalCount) * 100)
    : 100;

  badge.textContent = `${pct}% this week`;

  mini.innerHTML = week.days.map(d => {
    const isRest = d.plan.type === 'rest';
    let statusIcon = '○';
    let rowClass = '';

    if (d.isToday) rowClass = 'is-today';

    if (d.isPast || d.isToday) {
      if (d.completed === true) {
        statusIcon = isRest ? '💤' : '✅';
        if (!d.isToday) rowClass += ' completed';
      } else if (d.completed === false && d.isPast) {
        statusIcon = '❌';
        rowClass += ' missed';
      } else {
        statusIcon = isRest ? '💤' : '⏳';
      }
    } else {
      statusIcon = isRest ? '💤' : '📋';
    }

    const label = isRest ? 'Rest' : (d.plan.workoutName || 'Workout');

    return `<div class="week-day-row ${rowClass}">
      <span class="week-day-name">${DAY_SHORT[DAY_NAMES.indexOf(d.dayName)]}</span>
      <span class="week-day-label">${esc(label)}</span>
      <span class="week-day-status">${statusIcon}</span>
    </div>`;
  }).join('');
}

/* ── PROGRAM PAGE ────────────────────────────────────────────────────────── */

let selectedDay = null;

function renderProgramPage() {
  renderDaysList();
  if (selectedDay) {
    renderDayEditor(selectedDay);
  } else {
    // Default: select today
    const todayName = getTodayDayName();
    selectDay(todayName);
  }
}

function renderDaysList() {
  const list = document.getElementById('daysList');
  if (!list) return;

  const todayName = getTodayDayName();

  list.innerHTML = DAY_NAMES.map(dayName => {
    const plan = state.program[dayName] || { type: 'workout', workoutName: '', exercises: [], notes: '' };
    const isToday = dayName === todayName;
    const isSelected = dayName === selectedDay;
    const isRest = plan.type === 'rest';
    const hasName = plan.workoutName && plan.workoutName.trim();
    const exerciseCount = (plan.exercises || []).length;

    let badgeClass = 'empty';
    let badgeText = 'Not set';
    if (isRest) { badgeClass = 'rest'; badgeText = 'Rest'; }
    else if (hasName) { badgeClass = 'workout'; badgeText = 'Workout'; }

    return `<div class="day-pill ${isSelected ? 'selected' : ''} ${isToday ? 'is-today' : ''}"
                  onclick="selectDay('${dayName}')">
      <span class="day-pill-name">${dayName.slice(0, 3)}</span>
      <div class="day-pill-info">
        <div class="day-pill-workout">${isRest ? 'Rest Day' : (hasName ? esc(plan.workoutName) : 'Not configured')}</div>
        ${!isRest && exerciseCount > 0 ? `<div class="day-pill-exercise-count">${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}</div>` : ''}
      </div>
      <span class="day-pill-badge ${badgeClass}">${badgeText}</span>
    </div>`;
  }).join('');
}

function selectDay(dayName) {
  selectedDay = dayName;
  renderDaysList();
  renderDayEditor(dayName);
}

function renderDayEditor(dayName) {
  const plan = state.program[dayName] || { type: 'workout', workoutName: '', exercises: [], notes: '' };
  if (!state.program[dayName]) {
    state.program[dayName] = { type: 'workout', workoutName: '', exercises: [], notes: '' };
  }

  const title = document.getElementById('dayEditorTitle');
  const toggle = document.getElementById('dayTypeToggle');
  const content = document.getElementById('dayEditorContent');
  const typeWorkoutBtn = document.getElementById('typeWorkoutBtn');
  const typeRestBtn = document.getElementById('typeRestBtn');

  if (!title || !toggle || !content) return;

  title.textContent = dayName;
  toggle.style.display = 'flex';

  // Sync type buttons
  typeWorkoutBtn.classList.toggle('active', plan.type !== 'rest');
  typeRestBtn.classList.toggle('active', plan.type === 'rest');

  if (plan.type === 'rest') {
    content.innerHTML = `<div class="day-editor-rest">
      <div class="rest-icon">🛌</div>
      <div class="rest-text">Rest Day</div>
      <div class="rest-sub">This day is a planned off-day. No workout is required.<br>Your streak will not break on this day.</div>
    </div>`;
    return;
  }

  // Workout day editor
  const exercises = plan.exercises || [];

  content.innerHTML = `
    <div class="day-editor-workout">
      <div class="form-group" style="margin-bottom:20px">
        <label class="form-label">Workout Name</label>
        <input type="text" class="form-input" id="editorWorkoutName"
               placeholder="e.g. Push Day, Legs, Upper Body"
               value="${esc(plan.workoutName || '')}"
               oninput="saveDayField('workoutName', this.value)" />
      </div>

      <div class="exercises-header">
        <span class="exercises-header-label">Exercises</span>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-3)">${exercises.length} exercise${exercises.length !== 1 ? 's' : ''}</span>
      </div>

      <div class="exercises-list-editor" id="exercisesListEditor">
        ${exercises.map((ex, i) => buildExerciseRowHTML(ex, i)).join('')}
      </div>

      <div class="add-exercise-row">
        <input type="text" class="form-input add-exercise-input" id="newExerciseInput"
               placeholder="Add exercise (e.g. Bench Press)" 
               onkeydown="if(event.key==='Enter')addExercise()" />
        <button class="btn-ghost" onclick="addExercise()">+ Add</button>
      </div>

      <div class="day-notes-section">
        <label class="form-label">Notes</label>
        <textarea class="form-input form-textarea" id="editorDayNotes"
                  placeholder="Program notes, cues, or reminders..."
                  oninput="saveDayField('notes', this.value)"
                  style="min-height:60px;margin-bottom:0">${esc(plan.notes || '')}</textarea>
      </div>
    </div>`;

  initExerciseDrag();
}

function buildExerciseRowHTML(exercise, index) {
  return `<div class="exercise-row-editor" data-index="${index}">
    <span class="exercise-drag-handle" title="Drag to reorder">⋮⋮</span>
    <input type="text" value="${esc(exercise)}"
           placeholder="Exercise name"
           onchange="updateExercise(${index}, this.value)"
           onblur="updateExercise(${index}, this.value)" />
    <button class="btn-icon danger" onclick="removeExercise(${index})" title="Remove">✕</button>
  </div>`;
}

function saveDayField(field, value) {
  if (!selectedDay) return;
  if (!state.program[selectedDay]) state.program[selectedDay] = { type: 'workout', workoutName: '', exercises: [], notes: '' };
  state.program[selectedDay][field] = value;
  saveState();
  renderDaysList();
  checkAchievements();
}

function addExercise() {
  const input = document.getElementById('newExerciseInput');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;

  if (!state.program[selectedDay]) state.program[selectedDay] = { type: 'workout', workoutName: '', exercises: [], notes: '' };
  if (!state.program[selectedDay].exercises) state.program[selectedDay].exercises = [];
  state.program[selectedDay].exercises.push(val);

  input.value = '';
  saveState();
  renderDayEditor(selectedDay);
  renderDaysList();
  checkAchievements();
}

function removeExercise(index) {
  if (!selectedDay) return;
  state.program[selectedDay].exercises.splice(index, 1);
  saveState();
  renderDayEditor(selectedDay);
  renderDaysList();
}

function updateExercise(index, value) {
  if (!selectedDay) return;
  state.program[selectedDay].exercises[index] = value;
  saveState();
}

function setDayType(type) {
  if (!selectedDay) return;
  if (!state.program[selectedDay]) state.program[selectedDay] = { type: 'workout', workoutName: '', exercises: [], notes: '' };
  state.program[selectedDay].type = type;
  if (type === 'rest') {
    state.program[selectedDay].workoutName = '';
  }
  saveState();
  renderDayEditor(selectedDay);
  renderDaysList();
  checkAchievements();
  // Recalculate streak since off-days changed
  state.profile.streak = computeCurrentStreak();
  state.profile.longestStreak = Math.max(state.profile.longestStreak, computeLongestStreak());
  saveState();
  updateDashboard();
}

function clearProgram() {
  DAY_NAMES.forEach(day => {
    state.program[day] = { type: 'workout', workoutName: '', exercises: [], notes: '' };
  });
  saveState();
  selectedDay = null;
  renderProgramPage();
}

/* ── DRAG AND DROP FOR EXERCISES ─────────────────────────────────────────── */

function initExerciseDrag() {
  const list = document.getElementById('exercisesListEditor');
  if (!list) return;

  let dragging = null;

  list.querySelectorAll('.exercise-row-editor').forEach(row => {
    row.draggable = true;

    row.addEventListener('dragstart', (e) => {
      dragging = row;
      row.style.opacity = '0.5';
      e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragend', () => {
      row.style.opacity = '';
      dragging = null;
      // Sync order to state
      const newOrder = [];
      list.querySelectorAll('.exercise-row-editor input').forEach(inp => newOrder.push(inp.value));
      state.program[selectedDay].exercises = newOrder;
      saveState();
    });

    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dragging && row !== dragging) {
        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) {
          list.insertBefore(dragging, row);
        } else {
          list.insertBefore(dragging, row.nextSibling);
        }
      }
    });
  });
}

/* ── STATISTICS PAGE ─────────────────────────────────────────────────────── */

function updateStatsPage() {
  const adherence = computeProgramAdherence(30);
  const adherenceEl = document.getElementById('statAdherence');
  if (adherenceEl) {
    adherenceEl.textContent = adherence ? `${adherence.pct}%` : '—';
  }
  const uniqueDaysEl = document.getElementById('statUniqueDays');
  if (uniqueDaysEl) uniqueDaysEl.textContent = getUniqueDates(state.workouts).length;
  const bestStreakEl = document.getElementById('statBestStreakStats');
  if (bestStreakEl) bestStreakEl.textContent = state.profile.longestStreak;
}

/* ── FORMAT HELPERS ──────────────────────────────────────────────────────── */

function formatVolume(v) {
  if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
  return v.toString();
}

function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ── HEATMAP ─────────────────────────────────────────────────────────────── */

function renderHeatmap() {
  const wrap = document.getElementById('heatmapWrap');
  if (!wrap) return;

  const today = new Date();
  const weeksBack = 26;
  const totalDays = weeksBack * 7;

  const counts = {};
  state.workouts.forEach(w => {
    const d = w.date || w.timestamp?.split('T')[0];
    if (d) counts[d] = (counts[d] || 0) + 1;
  });

  // Also track rest days from program
  const restDates = new Set();
  const startD = new Date(today);
  startD.setDate(today.getDate() - totalDays);
  const csr = new Date(startD);
  while (csr <= today) {
    const dateStr = toDateStr(csr);
    const dayName = DAY_NAMES[csr.getDay()];
    const plan = state.program[dayName];
    if (plan && plan.type === 'rest') restDates.add(dateStr);
    csr.setDate(csr.getDate() + 1);
  }

  const maxCount = Math.max(1, ...Object.values(counts));

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - totalDays + 1);
  const startDay = startDate.getDay();
  startDate.setDate(startDate.getDate() - startDay);

  const weeks = [];
  let week = [];
  const cur = new Date(startDate);

  while (cur <= today) {
    const dateStr = toDateStr(cur);
    const count = counts[dateStr] || 0;
    const isRest = restDates.has(dateStr) && count === 0;
    const opacity = count === 0 ? 0 : 0.15 + 0.85 * (count / maxCount);
    week.push({ dateStr, count, opacity, inFuture: cur > today, isRest });
    if (week.length === 7) { weeks.push(week); week = []; }
    cur.setDate(cur.getDate() + 1);
  }
  if (week.length > 0) {
    while (week.length < 7) week.push({ dateStr: '', count: 0, opacity: 0, inFuture: true, isRest: false });
    weeks.push(week);
  }

  let html = '<div class="heatmap-grid">';
  weeks.forEach(w => {
    html += '<div class="heatmap-week">';
    w.forEach(cell => {
      if (cell.inFuture || !cell.dateStr) {
        html += '<div class="hm-empty" title=""></div>';
      } else if (cell.isRest) {
        html += `<div class="hm-rest" title="${cell.dateStr}: Rest day"></div>`;
      } else if (cell.count === 0) {
        html += `<div class="hm-empty" title="${cell.dateStr}: No activity"></div>`;
      } else {
        html += `<div class="hm-cell" style="opacity:${cell.opacity.toFixed(2)}" title="${cell.dateStr}: ${cell.count} workout(s)"></div>`;
      }
    });
    html += '</div>';
  });
  html += '</div>';

  wrap.innerHTML = html;
}

/* ── RECENT WORKOUTS ─────────────────────────────────────────────────────── */

function renderRecentWorkouts() {
  const list = document.getElementById('recentWorkoutsList');
  if (!list) return;

  // Group by date and show sessions, not individual exercises
  const sessions = groupWorkoutsIntoSessions(state.workouts.slice(0, 20));
  const recent = sessions.slice(0, 6);

  if (recent.length === 0) {
    list.innerHTML = '<p class="empty-state">No workouts yet. Start forging!</p>';
    return;
  }

  list.innerHTML = recent.map(session => {
    const muscles = [...new Set(session.exercises.map(e => e.muscleKey))];
    const color = MUSCLE_META[muscles[0]]?.color || '#00f5d4';
    const hasPR = session.exercises.some(e => e.isPR);
    const prBadge = hasPR ? ' <span style="color:var(--gold);font-size:11px;">🏅 PR</span>' : '';
    const muscleLabels = muscles.map(m => MUSCLE_META[m]?.label).filter(Boolean).join(', ');
    const totalXP = session.exercises.reduce((s, e) => s + e.xpGain, 0);
    const exerciseNames = session.exercises.map(e => e.exercise).join(', ');

    return `<div class="workout-item">
      <div class="workout-muscle-dot" style="background:${color};box-shadow:0 0 6px ${color}40"></div>
      <div class="workout-info">
        <div class="workout-exercise">${esc(session.sessionName || muscleLabels)}${prBadge}</div>
        <div class="workout-meta">${esc(exerciseNames.length > 60 ? exerciseNames.slice(0, 57) + '…' : exerciseNames)}</div>
      </div>
      <div class="workout-xp">+${totalXP} XP</div>
      <div class="workout-date">${formatDate(session.date)}</div>
    </div>`;
  }).join('');
}

/**
 * Group individual exercise entries into workout sessions by date.
 * One session = one calendar day.
 */
function groupWorkoutsIntoSessions(workouts) {
  const byDate = {};
  workouts.forEach(w => {
    if (!byDate[w.date]) byDate[w.date] = [];
    byDate[w.date].push(w);
  });

  return Object.entries(byDate)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, exercises]) => {
      // Try to find the program name for this day
      const dayName = getDayName(date);
      const plan = state.program[dayName];
      const sessionName = plan && plan.workoutName ? plan.workoutName : null;
      return { date, exercises, sessionName };
    });
}

/* ── IMPROVED INSIGHTS ENGINE ────────────────────────────────────────────── */

function renderInsights() {
  const list = document.getElementById('insightsList');
  if (!list) return;
  const insights = generateInsights();
  if (insights.length === 0) {
    list.innerHTML = '<div class="insight-item"><span class="insight-icon">💡</span><p>Log your first workout to generate insights.</p></div>';
    return;
  }
  list.innerHTML = insights.map(i =>
    `<div class="insight-item"><span class="insight-icon">${i.icon}</span><p>${esc(i.text)}</p></div>`
  ).join('');
}

function generateInsights() {
  const insights = [];
  const p = state.profile;
  const muscles = state.muscles;
  const today = toDateStr(new Date());

  // --- Program-aware insights ---
  if (isProgramConfigured()) {
    const todayName = getTodayDayName();
    const todayPlan = state.program[todayName];
    const workoutDates = getWorkoutDatesSet();

    // Tomorrow's workout
    const next = getNextWorkoutDay();
    if (next && next.plan.workoutName) {
      const label = next.daysAway === 1 ? 'Tomorrow' : `In ${next.daysAway} days`;
      insights.push({ icon: '📅', text: `${label} is ${next.plan.workoutName}${next.plan.exercises?.length ? ` — ${next.plan.exercises.length} exercise${next.plan.exercises.length !== 1 ? 's' : ''} planned.` : '.'}` });
    }

    // Program adherence this month
    const adherence = computeProgramAdherence(30);
    if (adherence && adherence.total >= 7) {
      insights.push({ icon: '🎯', text: `You completed ${adherence.pct}% of your program in the last 30 days (${adherence.completed}/${adherence.total} days).` });
    }

    // Consecutive scheduled days without missing
    if (p.streak > 0) {
      const isOnRestDay = todayPlan && todayPlan.type === 'rest';
      if (p.streak >= 7 && isOnRestDay) {
        insights.push({ icon: '🌟', text: `You haven't missed a scheduled workout in ${p.streak} days. Rest day today — enjoy it.` });
      } else if (p.streak >= 3) {
        insights.push({ icon: '🔥', text: `${p.streak}-day streak. Every planned day completed, rest days included.` });
      }
    }

    // Today's push
    if (todayPlan && todayPlan.type === 'workout' && !workoutDates.has(today)) {
      insights.push({ icon: '⏰', text: `Today is ${todayPlan.workoutName || 'Workout Day'}. Log a session to keep your streak alive.` });
    }

    // Program exercise counts
    const workoutDays = Object.entries(state.program)
      .filter(([, d]) => d.type === 'workout' && d.workoutName)
      .sort((a, b) => (b[1].exercises?.length || 0) - (a[1].exercises?.length || 0));
    if (workoutDays.length > 0) {
      const [biggestDayName, biggestDay] = workoutDays[0];
      if ((biggestDay.exercises?.length || 0) > 0) {
        insights.push({ icon: '📋', text: `Your ${biggestDay.workoutName} contains ${biggestDay.exercises.length} exercise${biggestDay.exercises.length !== 1 ? 's' : ''}.` });
      }
    }
  }

  // --- Volume insights ---
  if (p.totalWorkouts === 0) return insights;

  const sorted = MUSCLES.slice().sort((a, b) => muscles[b].volume - muscles[a].volume);
  const strongest = sorted[0];
  if (muscles[strongest].volume > 0) {
    insights.push({ icon: '💪', text: `${MUSCLE_META[strongest].label} receives the highest weekly volume with ${muscles[strongest].volume.toLocaleString()}kg total.` });
  }

  // Untrained muscles
  const untrained = MUSCLES.filter(m => muscles[m].workoutCount === 0);
  if (untrained.length > 0) {
    insights.push({ icon: '⚠️', text: `You haven't trained ${untrained.map(m => MUSCLE_META[m].label).join(', ')} yet.` });
  }

  // Neglected muscles (trained but not recently)
  MUSCLES.forEach(m => {
    const last = muscles[m].lastWorkoutDate;
    if (last && muscles[m].workoutCount > 0) {
      const diff = daysBetween(last, today);
      if (diff >= 10) {
        insights.push({ icon: '📉', text: `${MUSCLE_META[m].label} hasn't been trained in ${diff} days. Consider adding it to your next session.` });
      }
    }
  });

  // Total volume milestone
  if (p.totalVolume >= 5000) {
    insights.push({ icon: '🚀', text: `Over ${formatVolume(p.totalVolume)}kg total volume lifted. You're forging a legend.` });
  } else if (p.totalVolume >= 1000) {
    insights.push({ icon: '📦', text: `${formatVolume(p.totalVolume)}kg total volume lifted. 5,000kg is within reach.` });
  }

  return insights.slice(0, 7);
}

/* ── MUSCLE CARDS ────────────────────────────────────────────────────────── */

function renderMuscleCards() {
  const grid = document.getElementById('muscleCardsGrid');
  if (!grid) return;
  grid.innerHTML = MUSCLES.map(key => {
    const m = state.muscles[key];
    const meta = MUSCLE_META[key];
    const rank = m.rank;
    const rankColor = RANK_COLORS[rank];
    const barPct = getRankProgressPct(key);

    return `<div class="muscle-card rank-${rank}" onclick="openMuscleDetail('${key}')">
      <div class="muscle-card-top">
        <div class="muscle-card-name">${meta.label}</div>
        <div class="rank-pill ${rank}">${RANK_LABELS[rank]}</div>
      </div>
      <div class="muscle-card-stats">
        <div class="mc-stat"><div class="mc-stat-val" style="color:${meta.color}">${m.xp.toLocaleString()}</div><div class="mc-stat-lbl">XP</div></div>
        <div class="mc-stat"><div class="mc-stat-val">${formatVolume(m.volume)}</div><div class="mc-stat-lbl">Volume</div></div>
        <div class="mc-stat"><div class="mc-stat-val">${m.streak}</div><div class="mc-stat-lbl">Streak</div></div>
        <div class="mc-stat"><div class="mc-stat-val">${m.workoutCount}</div><div class="mc-stat-lbl">Workouts</div></div>
      </div>
      <div class="muscle-card-bar">
        <div class="muscle-card-bar-fill" style="width:${barPct}%;background:${rankColor}"></div>
      </div>
    </div>`;
  }).join('');
}

function getRankProgressPct(muscleKey) {
  const m = state.muscles[muscleKey];
  const rank = m.rank;
  const idx = RANKS.indexOf(rank);
  if (idx >= RANKS.length - 1) return 100;

  switch(rank) {
    case 'unranked': return Math.min(100, m.workoutCount * 100);
    case 'bronze':   return Math.min(100, (m.streak / 4) * 100);
    case 'silver':   return Math.min(100, (m.streak / 8) * 50 + (Object.keys(m.exercises).length / 2) * 50);
    case 'gold':     return Math.min(100, (m.streak / 12) * 50 + (m.volume / 5000) * 50);
    case 'diamond':  return Math.min(100, (m.streak / 20) * 40 + (Object.keys(m.exercises).length / 5) * 30 + (m.streak > 1 ? 30 : 0));
    default: return 0;
  }
}

/* ── MUSCLE DETAIL PANEL ─────────────────────────────────────────────────── */

function openMuscleDetail(muscleKey) {
  const m = state.muscles[muscleKey];
  const meta = MUSCLE_META[muscleKey];
  const rank = m.rank;

  document.getElementById('detailIcon').textContent = meta.icon;
  document.getElementById('detailName').textContent = meta.label;
  document.getElementById('detailRankBadge').textContent = `${RANK_ICONS[rank]} ${RANK_LABELS[rank]}`;
  document.getElementById('detailRankBadge').style.color = RANK_COLORS[rank];
  document.getElementById('detailXP').textContent = m.xp.toLocaleString();
  document.getElementById('detailVolume').textContent = m.volume.toLocaleString();
  document.getElementById('detailStreak').textContent = m.streak;
  document.getElementById('detailWorkouts').textContent = m.workoutCount;

  const steps = document.getElementById('detailRankSteps');
  const rankIdx = RANKS.indexOf(rank);
  steps.innerHTML = RANKS.map((r, i) => {
    const achieved = i <= rankIdx;
    const current = i === rankIdx;
    const color = RANK_COLORS[r];
    return `<div class="rank-step ${achieved ? 'achieved' : ''} ${current ? 'current' : ''}"
                 style="color:${color};border-color:${color}40">
      <div class="rs-icon">${RANK_ICONS[r]}</div>
      <div class="rs-name">${RANK_LABELS[r]}</div>
    </div>`;
  }).join('');

  const prs = document.getElementById('detailPRList');
  const exEntries = Object.entries(m.exercises);
  if (exEntries.length === 0) {
    prs.innerHTML = '<p class="empty-state" style="font-size:12px;padding:12px 0">No exercises logged yet.</p>';
  } else {
    prs.innerHTML = exEntries
      .sort((a, b) => b[1].bestWeight - a[1].bestWeight)
      .map(([ex, data]) =>
        `<div class="pr-item">
          <span class="pr-exercise">${esc(ex)}</span>
          <span class="pr-weight">${data.bestWeight}kg · ${data.count}× · Vol: ${data.totalVolume.toLocaleString()}kg</span>
        </div>`
      ).join('');
  }

  const hist = document.getElementById('detailHistoryList');
  if (m.history.length === 0) {
    hist.innerHTML = '<p class="empty-state" style="font-size:12px;padding:12px 0">No workout history yet.</p>';
  } else {
    hist.innerHTML = m.history.slice(0, 10).map(h =>
      `<div class="history-item">
        <span>${esc(h.exercise)} ${h.sets}×${h.reps}@${h.weight}kg</span>
        <span style="color:var(--text-3)">${formatDate(h.date)}</span>
      </div>`
    ).join('');
  }

  document.getElementById('muscleDetailOverlay').classList.add('visible');
}

/* ── LEADERBOARD ─────────────────────────────────────────────────────────── */

function renderLeaderboard() {
  const tbody = document.getElementById('leaderboardBody');
  if (!tbody) return;
  const sorted = MUSCLES.slice().sort((a, b) => state.muscles[b].volume - state.muscles[a].volume);
  const posClasses = ['first','second','third'];

  tbody.innerHTML = sorted.map((key, i) => {
    const m = state.muscles[key];
    const posClass = posClasses[i] || '';
    const meta = MUSCLE_META[key];
    return `<tr>
      <td><span class="lb-pos ${posClass}">${i+1}</span></td>
      <td><span class="lb-muscle">${meta.icon} ${meta.label}</span></td>
      <td><span class="rank-pill ${m.rank}">${RANK_LABELS[m.rank]}</span></td>
      <td><span class="lb-xp">${m.xp.toLocaleString()} XP</span></td>
      <td><span class="lb-volume">${m.volume.toLocaleString()} kg</span></td>
      <td><span class="lb-streak">🔥${m.streak}</span></td>
      <td>${m.workoutCount}</td>
    </tr>`;
  }).join('');
}

/* ── ACHIEVEMENTS ────────────────────────────────────────────────────────── */

function renderAchievements() {
  const grid = document.getElementById('achievementsGrid');
  if (!grid) return;
  const unlocked = Object.keys(state.achievements).length;
  const total = ACHIEVEMENTS_DEFS.length;
  document.getElementById('achSubtitle').textContent = `${unlocked} / ${total} unlocked`;

  grid.innerHTML = ACHIEVEMENTS_DEFS.map(def => {
    const ach = state.achievements[def.id];
    const locked = !ach;
    return `<div class="ach-card ${locked ? 'locked' : 'unlocked'}">
      <span class="ach-icon">${def.icon}</span>
      <div class="ach-name">${def.name}</div>
      <div class="ach-desc">${def.desc}</div>
      ${ach ? `<span class="ach-unlocked-date">✓ ${formatDate(ach.unlockedAt?.split('T')[0])}</span>` : ''}
    </div>`;
  }).join('');
}

/* ── CHARTS ──────────────────────────────────────────────────────────────── */

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#8a9bb5', font: { family: 'JetBrains Mono', size: 11 } } },
  },
  scales: {
    x: { ticks: { color: '#4e5e74', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
    y: { ticks: { color: '#4e5e74', font: { family: 'JetBrains Mono', size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
  },
};

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); charts[key] = null; }
}

function renderCharts() {
  updateStatsPage();
  renderVolumeChart();
  renderMuscleChart();
  renderWeeklyChart();
  renderMonthlyChart();
}

function renderVolumeChart() {
  destroyChart('volume');
  const canvas = document.getElementById('chartVolume');
  if (!canvas) return;

  // Group by session (date), not individual exercise
  const sessions = groupWorkoutsIntoSessions(state.workouts);
  const grouped = {};
  sessions.forEach(s => { grouped[s.date] = s.exercises.reduce((sum, e) => sum + (e.volume || 0), 0); });

  const labels = Object.keys(grouped).sort().slice(-14);
  const data = labels.map(d => grouped[d]);

  charts['volume'] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels.map(d => formatDate(d)),
      datasets: [{
        label: 'Volume (kg)',
        data,
        borderColor: '#00f5d4',
        backgroundColor: 'rgba(0,245,212,0.08)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#00f5d4',
        pointRadius: 4,
      }],
    },
    options: { ...CHART_DEFAULTS },
  });
}

function renderMuscleChart() {
  destroyChart('muscle');
  const canvas = document.getElementById('chartMuscle');
  if (!canvas) return;

  const labels = MUSCLES.map(m => MUSCLE_META[m].label);
  const data = MUSCLES.map(m => state.muscles[m].workoutCount);
  const colors = MUSCLES.map(m => MUSCLE_META[m].color);

  charts['muscle'] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.map(c => c + 'cc'), borderColor: colors, borderWidth: 2 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#8a9bb5', font: { family: 'JetBrains Mono', size: 10 }, boxWidth: 12 } },
      },
    },
  });
}

function renderWeeklyChart() {
  destroyChart('weekly');
  const canvas = document.getElementById('chartWeekly');
  if (!canvas) return;

  const weeks = 12;
  const weekData = {};
  const today = new Date();

  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    const wk = getWeekLabel(d);
    weekData[wk] = weekData[wk] || 0;
  }

  // Count unique workout days per week (not exercise entries)
  const sessionDates = new Set(state.workouts.map(w => w.date));
  sessionDates.forEach(dateStr => {
    const d = new Date(dateStr + 'T00:00:00');
    const wk = getWeekLabel(d);
    if (weekData[wk] !== undefined) weekData[wk]++;
  });

  const labels = Object.keys(weekData);
  const data = labels.map(l => weekData[l]);

  charts['weekly'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Workout Days',
        data,
        backgroundColor: 'rgba(0,245,212,0.5)',
        borderColor: '#00f5d4',
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: { ...CHART_DEFAULTS },
  });
}

function getWeekLabel(d) {
  const year = d.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return `W${week}`;
}

function renderMonthlyChart() {
  destroyChart('monthly');
  const canvas = document.getElementById('chartMonthly');
  if (!canvas) return;

  const months = 6;
  const monthData = {};
  const today = new Date();
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
    monthData[key] = 0;
  }

  state.workouts.forEach(w => {
    if (!w.date) return;
    const d = new Date(w.date + 'T00:00:00');
    const key = `${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
    if (monthData[key] !== undefined) monthData[key] += (w.volume || 0);
  });

  const labels = Object.keys(monthData);
  const data = labels.map(l => monthData[l]);

  charts['monthly'] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Volume (kg)',
        data,
        backgroundColor: labels.map((_, i) => `rgba(0,245,212,${0.3 + i * 0.12})`),
        borderColor: '#00f5d4',
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: { ...CHART_DEFAULTS },
  });
}

/* ── FULL HISTORY ────────────────────────────────────────────────────────── */

function renderFullHistory() {
  const list = document.getElementById('fullHistoryList');
  if (!list) return;
  const filterMuscle = document.getElementById('filterMuscle')?.value || '';
  const filterSearch = document.getElementById('filterSearch')?.value?.toLowerCase() || '';

  let filtered = state.workouts.filter(w => {
    if (filterMuscle && w.muscleKey !== filterMuscle) return false;
    if (filterSearch && !w.exercise.toLowerCase().includes(filterSearch)) return false;
    return true;
  });

  document.getElementById('historySubtitle').textContent = `${getUniqueDates(filtered).length} sessions · ${filtered.length} exercises`;

  if (filtered.length === 0) {
    list.innerHTML = '<p class="empty-state">No workouts match your filter.</p>';
    return;
  }

  list.innerHTML = filtered.map(w => {
    const color = MUSCLE_META[w.muscleKey]?.color || '#00f5d4';
    const prBadge = w.isPR ? ' <span style="color:var(--gold);font-size:11px;">🏅 PR</span>' : '';
    const notes = w.notes ? `<div style="color:var(--text-3);font-size:11px;margin-top:3px;">${esc(w.notes)}</div>` : '';
    return `<div class="workout-item">
      <div class="workout-muscle-dot" style="background:${color};box-shadow:0 0 6px ${color}40"></div>
      <div class="workout-info">
        <div class="workout-exercise">${esc(w.exercise)}${prBadge}</div>
        <div class="workout-meta">${MUSCLE_META[w.muscleKey]?.label} · ${w.sets}×${w.reps} @ ${w.weight}kg · Vol: ${w.volume.toLocaleString()}kg${w.duration ? ` · ${w.duration}min` : ''}</div>
        ${notes}
      </div>
      <div class="workout-xp">+${w.xpGain} XP</div>
      <div class="workout-date">${formatDate(w.date)}</div>
    </div>`;
  }).join('');
}

/* ── XP PREVIEW ──────────────────────────────────────────────────────────── */

function updateXPPreview() {
  const sets = parseInt(document.getElementById('formSets').value) || 0;
  const reps = parseInt(document.getElementById('formReps').value) || 0;
  const weight = parseFloat(document.getElementById('formWeight').value) || 0;
  const muscleKey = document.getElementById('formMuscle').value;
  const exercise = document.getElementById('formExercise').value.trim();

  const volume = sets * reps * weight;
  const volBonus = Math.floor(volume / 20);
  const baseXP = 25;
  let total = baseXP + volBonus;

  let isPR = false;
  if (muscleKey && exercise && weight > 0) {
    const existing = state.muscles[muscleKey]?.exercises?.[exercise];
    if (existing && existing.count > 0 && weight > existing.bestWeight) {
      isPR = true; total += 50;
    }
  }

  document.getElementById('xpPreview').textContent = `+${total} XP`;
  document.getElementById('prevVolBonus').textContent = `+${volBonus}`;
  document.getElementById('prevPRRow').style.display = isPR ? 'flex' : 'none';
}

function updateExerciseSuggestions() {
  const key = document.getElementById('formMuscle').value;
  const wrap = document.getElementById('exerciseSuggestions');
  if (!key) {
    wrap.innerHTML = '<p class="hint-text">Select muscle to see exercises</p>';
    return;
  }
  const suggestions = EXERCISE_SUGGESTIONS[key] || [];

  // Also suggest exercises from the program if the day matches
  const todayPlan = state.program[getTodayDayName()];
  const programExercises = todayPlan && todayPlan.type === 'workout' ? (todayPlan.exercises || []) : [];

  const all = [...new Set([...programExercises, ...suggestions])].slice(0, 8);

  wrap.innerHTML = `<div class="suggestion-list">${
    all.map(s =>
      `<div class="suggestion-item" onclick="document.getElementById('formExercise').value='${s.replace(/'/g,"\\'")}';updateXPPreview()">${s}</div>`
    ).join('')
  }</div>`;
}

/* ── WORKOUT FORM ────────────────────────────────────────────────────────── */

function initWorkoutForm() {
  const today = toDateStr(new Date());
  document.getElementById('formDate').value = today;

  document.getElementById('formMuscle').addEventListener('change', () => {
    updateXPPreview();
    updateExerciseSuggestions();
  });

  ['formSets','formReps','formWeight','formExercise'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateXPPreview);
  });

  document.getElementById('logWorkoutBtn').addEventListener('click', handleLogWorkout);
}

function handleLogWorkout() {
  const muscleKey = document.getElementById('formMuscle').value;
  const exercise  = document.getElementById('formExercise').value.trim();
  const sets      = parseInt(document.getElementById('formSets').value);
  const reps      = parseInt(document.getElementById('formReps').value);
  const weight    = parseFloat(document.getElementById('formWeight').value);
  const duration  = parseInt(document.getElementById('formDuration').value) || 0;
  const notes     = document.getElementById('formNotes').value.trim();
  const date      = document.getElementById('formDate').value || toDateStr(new Date());
  const errEl     = document.getElementById('formError');

  if (!muscleKey) return showError('Please select a muscle group.');
  if (!exercise)  return showError('Please enter an exercise name.');
  if (!sets || sets < 1) return showError('Sets must be at least 1.');
  if (!reps || reps < 1) return showError('Reps must be at least 1.');
  if (weight < 0)  return showError('Weight cannot be negative.');
  if (errEl) errEl.style.display = 'none';

  const result = logWorkout(muscleKey, exercise, sets, reps, weight, duration, notes, date);

  showXPPopup(`+${result.xpGain} XP`);

  if (result.leveled) {
    setTimeout(() => {
      document.getElementById('levelupNumber').textContent = result.newLevel;
      document.getElementById('levelupTitle').textContent = getTitle(result.newLevel);
      document.getElementById('levelupOverlay').classList.add('visible');
    }, 600);
  }

  updateSidebar();
  updateDashboard();
  initBodyMap();
  renderRecentWorkouts();
  renderInsights();
  renderHeatmap();
  renderDashboardProgram();

  setTimeout(showNextToast, 1000);

  document.getElementById('formSets').value = '';
  document.getElementById('formReps').value = '';
  document.getElementById('formWeight').value = '';
  document.getElementById('formDuration').value = '';
  document.getElementById('formNotes').value = '';
  document.getElementById('formDate').value = toDateStr(new Date());
  updateXPPreview();

  const btn = document.getElementById('logWorkoutBtn');
  btn.textContent = '✓ Workout Logged!';
  btn.style.background = 'linear-gradient(135deg, #00b89d, #00f5d4)';
  setTimeout(() => {
    btn.innerHTML = '<span>⚡</span> Forge Workout';
    btn.style.background = '';
  }, 2000);
}

function showError(msg) {
  const el = document.getElementById('formError');
  el.textContent = msg;
  el.style.display = 'block';
}

function showXPPopup(text) {
  const el = document.getElementById('xpPopup');
  el.textContent = text;
  el.classList.remove('animate');
  void el.offsetWidth;
  el.classList.add('animate');
}

/* ── PROFILE MODAL ───────────────────────────────────────────────────────── */

function openProfileModal() {
  document.getElementById('profileDisplayName').value = state.profile.displayName || 'Forger';
  document.getElementById('profileUsername').value = state.profile.username || '';
  document.getElementById('profileOverlay').classList.add('visible');
}

function saveProfile() {
  const displayName = document.getElementById('profileDisplayName').value.trim() || 'Forger';
  const username = document.getElementById('profileUsername').value.trim().replace(/\s/g, '');
  state.profile.displayName = displayName;
  state.profile.username = username;
  saveState();
  document.getElementById('profileOverlay').classList.remove('visible');
  updateSidebar();
  updateDashboard();
}

/* ── EXPORT / IMPORT / RESET ────────────────────────────────────────────── */

function exportSave() {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `streakforge_save_${toDateStr(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importSave(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported.profile || !imported.muscles) throw new Error('Invalid save file');
      // Migrate imported data
      if (!imported.profile.displayName) imported.profile.displayName = imported.profile.name || 'Forger';
      if (!imported.profile.username) imported.profile.username = '';
      if (!imported.program) imported.program = createDefaultSave().program;
      state = imported;
      recalculateStreakFromHistory();
      saveState();
      fullRefresh();
    } catch(err) {
      alert('Invalid save file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function resetAll() {
  state = createDefaultSave();
  saveState();
  selectedDay = null;
  fullRefresh();
  document.getElementById('confirmOverlay').classList.remove('visible');
}

/* ── FULL REFRESH ────────────────────────────────────────────────────────── */

function fullRefresh() {
  updateSidebar();
  updateDashboard();
  initBodyMap();
  renderRecentWorkouts();
  renderInsights();
  renderHeatmap();
  renderDashboardProgram();
  if (activePage === 'stats') renderCharts();
  if (activePage === 'leaderboard') renderLeaderboard();
  if (activePage === 'achievements') renderAchievements();
  if (activePage === 'muscles') renderMuscleCards();
  if (activePage === 'history') renderFullHistory();
  if (activePage === 'program') renderProgramPage();
}

/* ── HELPERS ─────────────────────────────────────────────────────────────── */

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

/* ── EVENT BINDINGS ──────────────────────────────────────────────────────── */

function bindEvents() {
  // Nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(el.dataset.page);
    });
  });

  // Body map toggle
  document.querySelectorAll('.toggle-btn[data-side]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn[data-side]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentBodySide = btn.dataset.side;
      initBodyMap();
    });
  });

  // Muscle detail close
  document.getElementById('muscleDetailClose').addEventListener('click', () => {
    document.getElementById('muscleDetailOverlay').classList.remove('visible');
  });
  document.getElementById('muscleDetailOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('muscleDetailOverlay')) {
      document.getElementById('muscleDetailOverlay').classList.remove('visible');
    }
  });

  // Export/Import/Reset
  document.getElementById('exportBtn').addEventListener('click', exportSave);
  document.getElementById('importInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importSave(file);
    e.target.value = '';
  });
  document.getElementById('resetBtn').addEventListener('click', () => {
    document.getElementById('confirmOverlay').classList.add('visible');
  });
  document.getElementById('confirmCancel').addEventListener('click', () => {
    document.getElementById('confirmOverlay').classList.remove('visible');
  });
  document.getElementById('confirmReset').addEventListener('click', resetAll);

  // Mobile hamburger
  document.getElementById('hamburgerBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('visible');
  });
  document.getElementById('sidebarOverlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('visible');
  });

  // Close sidebar when clicking nav items on mobile
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 900) {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('visible');
      }
    });
  });

  // History filters
  document.getElementById('filterMuscle')?.addEventListener('change', renderFullHistory);
  document.getElementById('filterSearch')?.addEventListener('input', renderFullHistory);

  // Profile
  document.getElementById('playerCard').addEventListener('click', openProfileModal);
  document.getElementById('profileCancel').addEventListener('click', () => {
    document.getElementById('profileOverlay').classList.remove('visible');
  });
  document.getElementById('profileSave').addEventListener('click', saveProfile);
  document.getElementById('profileOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('profileOverlay')) {
      document.getElementById('profileOverlay').classList.remove('visible');
    }
  });

  // Program: day type toggle
  document.getElementById('typeWorkoutBtn')?.addEventListener('click', () => setDayType('workout'));
  document.getElementById('typeRestBtn')?.addEventListener('click', () => setDayType('rest'));

  // Program: clear all
  document.getElementById('clearProgramBtn')?.addEventListener('click', () => {
    if (confirm('Clear all program days?')) clearProgram();
  });
}

/* ── INIT ────────────────────────────────────────────────────────────────── */

function init() {
  loadState();
  bindEvents();
  initWorkoutForm();
  updateSidebar();
  updateDashboard();
  initBodyMap();
  renderHeatmap();
  renderRecentWorkouts();
  renderInsights();
  renderDashboardProgram();
  navigateTo('dashboard');
  checkAchievements();
  saveState();
}

document.addEventListener('DOMContentLoaded', init);