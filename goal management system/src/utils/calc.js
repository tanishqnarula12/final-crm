import {
  Shield, Plane, Car, Home, Heart, GraduationCap, Gift, Sparkles, Wallet, MoreHorizontal
} from 'lucide-react';

export const NOW = new Date();
export const CURRENT_YEAR = NOW.getFullYear();
export const CURRENT_MONTH = NOW.getMonth() + 1;
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const monthLabel = (m, y) => `${MONTH_NAMES[(m - 1 + 12) % 12]} ${y}`;
export const monthsBetween = (fromM, fromY, toM, toY) => (toY - fromY) * 12 + (toM - fromM);

// DOB bounds — a real person's date of birth can't be in the future, and
// realistically isn't before 1900. Used as both the <input type="date">
// min/max (blocks the date picker/spinner) and to re-validate on save (catches
// a value typed or pasted in directly, which the HTML attributes alone won't).
export const DOB_MIN = '1900-01-01';
export const dobMax = () => new Date().toISOString().slice(0, 10);
export const isValidDob = (iso) => !!iso && iso >= DOB_MIN && iso <= dobMax();

// Turn whatever a spreadsheet cell hands back into a real YYYY-MM-DD string
// (or '' if it can't). Excel date-formatted cells come through as a serial
// number (days since 1899-12-30) when the workbook isn't read with
// `cellDates: true`; plain-text cells come through as whatever the person
// typed — commonly DD-MM-YYYY or DD/MM/YYYY here, not ISO. isValidDob() does
// a plain string comparison, so anything not already ISO fails it silently —
// this normalizes first so a genuine date isn't rejected just for being
// formatted the way most people actually write dates.
export function parseFlexibleDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number') {
    // Excel serial date -> JS Date (epoch offset includes the classic 1900 leap-year bug).
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    let [, a, b, year] = m;
    // Day-first (DD-MM-YYYY / DD/MM/YYYY) is the convention here; if the
    // first part can't be a month (>12) that also confirms it's the day.
    let day = a, month = b;
    if (Number(a) > 12 && Number(b) <= 12) { day = a; month = b; }
    else if (Number(b) > 12 && Number(a) <= 12) { day = b; month = a; } // was actually MM-DD-YYYY
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return '';
}

export const GOAL_PRESETS = ['Emergency', 'Vacation', 'Dream Car', 'Dream Home', 'Marriage', 'Kids Education', 'Kids Marriage', 'Financial Freedom', 'Wealth Creation', 'Others'];

// Goals that are tied to a specific child and therefore capture the kid's name
export const KID_GOALS = ['Kids Education', 'Kids Marriage'];
export const needsKidName = (name) => KID_GOALS.includes(name);

// Format a full ISO timestamp as a readable date, e.g. "15 Jun 2026"
export const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
};

// Date the goal was created — falls back to the planning anchor month/year for legacy goals
export const goalCreatedLabel = (goal) =>
  fmtDate(goal.createdAt) || monthLabel(goal.createdMonth || CURRENT_MONTH, goal.createdYear || CURRENT_YEAR);

export const GOAL_EMOJIS = {
  'Emergency': '➕',
  'Vacation': '✈️',
  'Dream Car': '🚗',
  'Dream Home': '🏠',
  'Marriage': '💍',
  'Kids Education': '🎓',
  'Kids Marriage': '🎁',
  'Financial Freedom': '🪑',
  'Wealth Creation': '💼',
  'Others': '🎯',
};

const GOAL_ICONS = {
  'Emergency': Shield,
  'Vacation': Plane,
  'Dream Car': Car,
  'Dream Home': Home,
  'Marriage': Heart,
  'Kids Education': GraduationCap,
  'Kids Marriage': Gift,
  'Financial Freedom': Sparkles,
  'Wealth Creation': Wallet,
};

export const goalIcon = (name) => GOAL_ICONS[name] || MoreHorizontal;
export const goalEmoji = (name) => GOAL_EMOJIS[name] || '🎯';

export const fmtINR = (n) => {
  if (!isFinite(n) || n === null || n === undefined) return '₹0';
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

export const fmtFull = (n) => {
  if (!isFinite(n) || n === null) return '₹0';
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
};

export const fmtSip = (n) => {
  if (!isFinite(n) || n === null || n === undefined) return '₹0';
  return `₹${Math.round(Number(n)).toLocaleString('en-IN')}`;
};

export const achievementColor = (pct) => {
  if (pct >= 99.95) return 'bg-green-500';
  if (pct >= 60) return 'bg-yellow-500';
  if (pct >= 30) return 'bg-orange-500';
  return 'bg-red-500';
};

export const achievementBadge = (pct) => {
  if (pct >= 99.95) return 'bg-green-50 text-green-700 ring-1 ring-green-200/50 dark:bg-green-950/20 dark:text-green-400 dark:ring-green-900/30';
  if (pct >= 60) return 'bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200/50 dark:bg-yellow-950/20 dark:text-yellow-400 dark:ring-yellow-900/30';
  if (pct >= 30) return 'bg-orange-50 text-orange-700 ring-1 ring-orange-200/50 dark:bg-orange-950/20 dark:text-orange-400 dark:ring-orange-900/30';
  return 'bg-red-50 text-red-700 ring-1 ring-red-200/50 dark:bg-red-950/20 dark:text-red-400 dark:ring-red-900/30';
};

// Compare a goal before/after an edit and return a list of human-readable changes.
// Each change => { label, from, to }. Used to build the goal's edit history log.
export function buildGoalEdits(prev, next) {
  const edits = [];
  const numChanged = (a, b) => (Number(a) || 0) !== (Number(b) || 0);
  const dash = (v) => (v === undefined || v === null || v === '') ? '—' : v;
  const push = (label, from, to) => edits.push({ label, from, to });

  if ((prev.name || '') !== (next.name || '')) push('Goal name', dash(prev.name), dash(next.name));
  if (numChanged(prev.createdMonth, next.createdMonth) || numChanged(prev.createdYear, next.createdYear)) {
    push('Goal created date', monthLabel(prev.createdMonth || 1, prev.createdYear), monthLabel(next.createdMonth || 1, next.createdYear));
  }
  if ((prev.kidName || '') !== (next.kidName || '')) push("Kid's name", dash(prev.kidName), dash(next.kidName));
  if (numChanged(prev.amount, next.amount)) push('Goal cost (today)', fmtFull(prev.amount), fmtFull(next.amount));
  if (numChanged(prev.targetMonth, next.targetMonth) || numChanged(prev.targetYear, next.targetYear)) {
    push('Target date', monthLabel(prev.targetMonth || 1, prev.targetYear), monthLabel(next.targetMonth || 1, next.targetYear));
  }
  if (numChanged(prev.inflation, next.inflation)) push('Inflation rate', `${prev.inflation}%`, `${next.inflation}%`);
  if (numChanged(prev.expectedReturn, next.expectedReturn)) push('Expected return', `${prev.expectedReturn}%`, `${next.expectedReturn}%`);
  if (numChanged(prev.sipIncRate, next.sipIncRate)) push('SIP step-up', `${prev.sipIncRate}%`, `${next.sipIncRate}%`);
  if (numChanged(prev.currentInv, next.currentInv)) push('Current corpus', fmtFull(prev.currentInv), fmtFull(next.currentInv));
  if (numChanged(prev.currentSip, next.currentSip)) push('Current SIP', fmtFull(prev.currentSip), fmtFull(next.currentSip));
  const mappedTotal = (g) => (Array.isArray(g.mappedAssets) ? g.mappedAssets : []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  if (numChanged(mappedTotal(prev), mappedTotal(next))) push('Mapped assets total', fmtFull(mappedTotal(prev)), fmtFull(mappedTotal(next)));
  return edits;
}

export const nv = (v) => (v === undefined || v === null || Number.isNaN(v)) ? '' : v;

export const parseNum = (e, min) => {
  const raw = e.target.value;
  if (raw === '' || raw === '-') return undefined;
  const n = Number(raw);
  if (!isFinite(n)) return undefined;
  return min !== undefined ? Math.max(min, n) : n;
};

const AVATAR_PALETTE = [
  'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500',
  'bg-pink-500', 'bg-rose-500', 'bg-orange-500', 'bg-amber-500',
  'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500',
];

export const avatarColor = (name) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
};

export const initials = (name) => name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

// Starting corpus for the simulation = the manually-typed "Existing
// Accumulated Corpus" plus any client asset holdings mapped to this goal
// (Map Asset, see Modals.jsx). Mapped assets are stored on the goal
// separately (goal.mappedAssets) rather than folded into currentInv, so the
// per-asset breakdown survives for the "available elsewhere" checks in the
// goal form and for the Planning Assumptions display.
export function goalStartingCorpus(goal) {
  const base = Number(goal.currentInv) || 0;
  const mapped = Array.isArray(goal.mappedAssets)
    ? goal.mappedAssets.reduce((s, a) => s + (Number(a.amount) || 0), 0)
    : 0;
  return base + mapped;
}

// A goal's Create Log entries, in the current typed shape.
//
// Backward compatibility: before the typed ledger existed, this CRM stored the
// same information on `goal.actuals` as untyped `{ id, date, amount }` rows,
// which were always portfolio valuations. Those goals are still in the
// database and must keep rendering (and calculating) exactly as before, so
// when a goal has no `contributions` yet its legacy `actuals` are read as
// valuations. Nothing is rewritten on disk — the moment such a goal's log is
// edited, it is saved forward in the new shape (see GoalDetail's CreateLog).
export function goalContributions(goal) {
  const list = Array.isArray(goal?.contributions) ? goal.contributions : [];
  if (list.length > 0) return list;
  const legacy = Array.isArray(goal?.actuals) ? goal.actuals : [];
  return legacy.map(a => ({ ...a, type: 'valuation' }));
}

// Among a goal's logged "Create Log" entries, the single portfolio valuation
// that actually counts toward the calculation — the one with the latest date.
// Earlier valuations are superseded: they stay visible in the ledger for
// audit purposes, but are excluded from the simulation entirely (they are
// point-in-time snapshots of the same portfolio, not separate cash events, so
// they must never be summed together).
export function activeValuationId(contributions) {
  let latest = null;
  (Array.isArray(contributions) ? contributions : []).forEach(c => {
    if (c.type === 'sip') return;
    if (!Number(c.amount)) return;
    const d = new Date(c.date);
    if (isNaN(d.getTime())) return;
    if (!latest || d > new Date(latest.date)) latest = c;
  });
  return latest ? latest.id : null;
}

// The corpus figure to DISPLAY as "current" — the last real number on record,
// with no further assumption layered on top. If a valuation has been logged,
// that is exactly what was last actually measured, so it's shown as-is (not
// grown forward to today at the expected-return rate — that's a market
// assumption, not a fact, and showing it as "current" would make an estimate
// look like a confirmed balance). Falls back to the typed/mapped starting
// corpus when nothing has been logged yet.
//
// This is deliberately DIFFERENT from `todayCorpus` (see calcGoal): the
// Additional SIP / Lump-sum Required actions genuinely need to reason about
// where the corpus has likely grown to by now, so those keep using the
// return-compounded figure — only this display value stays a plain fact.
export function currentRecordedCorpus(goal) {
  const contributions = goalContributions(goal);
  const activeId = activeValuationId(contributions);
  if (activeId) {
    const v = contributions.find(c => c.id === activeId);
    if (v) return Number(v.amount) || 0;
  }
  return goalStartingCorpus(goal);
}

// Parse a goal's "Create Log" entries into simulation-ready shape: a
// date-sorted list of SIP deltas (signed; negative = a decrease to the running
// monthly SIP from that month forward), plus the original entries (each tagged
// with its absolute month) so callers can attribute a period's numbers back to
// the exact log entries that caused them.
// Two entry types:
//   - 'sip'       — permanently shifts the ongoing monthly SIP from that month.
//   - 'valuation' — a portfolio valuation recorded on a date; its amount is
//                   added to the corpus at that exact month and compounds
//                   from there onward (see simulate() below). Only the latest
//                   valuation (activeValuationId) is kept — superseded ones
//                   are dropped here so they never reach the simulation or
//                   row-attribution logic.
// Legacy 'lumpsum' entries (from the previous log model) are read as
// valuations so no historical data is silently dropped.
function contributionEvents(goal) {
  const contributions = goalContributions(goal);
  const activeId = activeValuationId(contributions);
  const sipDeltas = [];
  const entries = [];
  contributions.forEach(c => {
    const d = new Date(c.date);
    if (isNaN(d.getTime())) return;
    const amt = Number(c.amount) || 0;
    if (!amt) return;
    const type = c.type === 'sip' ? 'sip' : 'valuation';
    if (type === 'valuation' && c.id !== activeId) return; // superseded — excluded from calculation
    const absMonth = d.getFullYear() * 12 + d.getMonth();
    entries.push({ id: c.id, type, date: c.date, amount: amt, absMonth });
    if (type === 'sip') sipDeltas.push({ absMonth, delta: amt });
  });
  sipDeltas.sort((a, b) => a.absMonth - b.absMonth);
  entries.sort((a, b) => a.absMonth - b.absMonth);
  return { sipDeltas, entries };
}

// Single source of truth for the goal's growth simulation — used by both
// calcGoal (projected corpus / SIP search, row-building skipped for speed)
// and buildProjection (the year-by-year table, row-building on).
//
// Contributions begin the month AFTER the goal is created, so a goal created
// in May 2026 yields periods "Jun 2026 – May 2027", "Jun 2027 – May 2028", …
// (each label is an inclusive 12-month window).
//
// The monthly SIP is tracked as a single running value: it steps up by the
// annual step-up rate at every anniversary, and a logged SIP entry shifts it
// (up or down) from its month forward — crucially, the NEXT anniversary's
// step-up applies to that new, already-adjusted value, not just the original
// base. So a manual SIP increase keeps compounding at the normal step-up rate
// from then on, exactly like the rest of the SIP.
//
// A portfolio valuation is added to the corpus at the exact month its date
// falls in, so it starts compounding immediately — for whatever's left of
// that period, and every period after — exactly like the rest of the corpus.
// It's added before that month's growth is applied, so it earns a return for
// the very month it's logged in.
function simulate(goal, { sipOverride, buildRows = false } = {}) {
  const createdM = goal.createdMonth || CURRENT_MONTH;
  const createdY = goal.createdYear || CURRENT_YEAR;
  const tgtM = goal.targetMonth || 1;
  const tgtY = goal.targetYear || CURRENT_YEAR;
  const totalMonths = Math.max(0, monthsBetween(createdM, createdY, tgtM, tgtY));
  const startCorpus = goalStartingCorpus(goal);
  if (totalMonths === 0) return { rows: [], closingBal: startCorpus };

  const monthlyR = (Number(goal.expectedReturn) || 0) / 100 / 12;
  const incRate = (Number(goal.sipIncRate) || 0) / 100;
  const inflation = (Number(goal.inflation) || 0) / 100;
  const monthlyInfl = Math.pow(1 + inflation, 1 / 12) - 1;
  const amount = Number(goal.amount) || 0;
  const baseAbs = createdY * 12 + (createdM - 1); // the creation month itself
  const firstAbs = baseAbs + 1;                   // first contribution month
  const lastValidAbs = firstAbs + totalMonths - 1; // last simulated month
  const startSip = sipOverride !== undefined ? sipOverride : (Number(goal.currentSip) || 0);
  const { sipDeltas, entries } = contributionEvents(goal);

  const numPeriods = Math.ceil(totalMonths / 12);
  // Attribute every logged entry to a period — used for per-row UI
  // attribution (which row's info icon/underline references this entry).
  // Clamps anything dated before the first contribution month into period 0
  // and anything past the target into the final period, so no entry is ever
  // silently ignored.
  const entriesByPeriod = new Map();
  entries.forEach(e => {
    const rel = e.absMonth - firstAbs;
    const k = rel < 0 ? 0 : Math.min(Math.floor(rel / 12), numPeriods - 1);
    if (!entriesByPeriod.has(k)) entriesByPeriod.set(k, []);
    entriesByPeriod.get(k).push(e);
  });

  // Exact-month lookup for valuations (clamped the same way), so they can be
  // applied mid-loop and compound from their real date, not just at a period
  // boundary.
  const valuationByMonth = new Map();
  entries.forEach(e => {
    if (e.type !== 'valuation') return;
    const mAbs = Math.max(firstAbs, Math.min(e.absMonth, lastValidAbs));
    valuationByMonth.set(mAbs, (valuationByMonth.get(mAbs) || 0) + e.amount);
  });

  let bal = startCorpus;
  let invested = startCorpus;
  let sipPtr = 0;
  let currentSip = startSip; // running SIP: step-ups and manual deltas both compound into this
  const rows = buildRows ? [] : null;

  for (let k = 0; k < numPeriods; k++) {
    if (k > 0) currentSip = currentSip * (1 + incRate); // anniversary step-up on whatever the SIP currently is
    const periodStart = k * 12;
    const periodEnd = Math.min((k + 1) * 12, totalMonths);
    const monthsInRow = periodEnd - periodStart;
    const sAbs = firstAbs + periodStart;
    const eAbs = firstAbs + periodEnd; // exclusive

    const openingBal = bal;
    let rowContribution = 0;
    let rowValuation = 0;
    let firstSipInRow = null;
    let lastSipInRow = null;
    for (let i = 0; i < monthsInRow; i++) {
      const mAbs = sAbs + i;
      while (sipPtr < sipDeltas.length && sipDeltas[sipPtr].absMonth <= mAbs) {
        currentSip = Math.max(0, currentSip + sipDeltas[sipPtr].delta);
        sipPtr++;
      }
      const sip = currentSip;
      if (firstSipInRow === null) firstSipInRow = sip;
      lastSipInRow = sip;
      const val = valuationByMonth.get(mAbs) || 0;
      if (val) { bal += val; rowValuation += val; }
      bal = (bal + sip) * (1 + monthlyR);
      rowContribution += sip;
      invested += sip;
    }

    const rowEntries = entriesByPeriod.get(k) || [];
    const valuationInRow = rowValuation;
    // When a SIP change lands mid-period, report the post-change rate — that's
    // the figure the UI underlines as "changed", so it must show the new value.
    const sipChangedInRow = rowEntries.some(e => e.type === 'sip');
    const displaySip = sipChangedInRow ? lastSipInRow : firstSipInRow;

    if (buildRows) {
      const lastAbs = eAbs - 1; // inclusive last month of the window
      const startMonth = (sAbs % 12) + 1, startYr = Math.floor(sAbs / 12);
      const endMonth = (lastAbs % 12) + 1, endYr = Math.floor(lastAbs / 12);
      const targetValue = amount * Math.pow(1 + monthlyInfl, periodEnd);
      rows.push({
        periodIndex: k,
        startMonth, startYear: startYr,
        endMonth, endYear: endYr,
        startAbs: sAbs, endAbs: eAbs,
        label: `${monthLabel(startMonth, startYr)} – ${monthLabel(endMonth, endYr)}`,
        chartName: `${MONTH_NAMES[endMonth - 1]} '${String(endYr).slice(2)}`,
        monthsCovered: monthsInRow,
        isPartial: monthsInRow < 12,
        openingBal,
        monthlySip: displaySip ?? currentSip,
        yearContribution: rowContribution,
        // Growth stays purely return-driven — the valuation adjustment is
        // reported separately so closing = opening + contribution + growth + valuation.
        growth: bal - openingBal - rowContribution - valuationInRow,
        closingBal: bal,
        totalInvested: invested,
        targetValue,
        valuationInRow,
        contributionsInRow: rowEntries,
      });
    }
  }
  return { rows: rows || [], closingBal: bal };
}

// Snapshots a goal's corpus and effective ongoing monthly SIP "as of" a given
// absolute month — by re-running the exact same simulation engine with that
// month treated as the target, so a logged valuation or SIP change that has
// already happened by then is fully reflected, and anything dated after is
// correctly excluded (it hasn't happened yet). Reuses buildProjection (which
// itself reuses simulate) — no parallel logic to drift out of sync.
function corpusAsOf(goal, stopAbs) {
  const createdM = goal.createdMonth || CURRENT_MONTH;
  const createdY = goal.createdYear || CURRENT_YEAR;
  const baseAbs = createdY * 12 + (createdM - 1);
  if (stopAbs <= baseAbs) {
    return { corpus: goalStartingCorpus(goal), sip: Number(goal.currentSip) || 0 };
  }
  const stopYear = Math.floor(stopAbs / 12);
  const stopMonth = (stopAbs % 12) + 1;
  const rows = buildProjection({ ...goal, targetMonth: stopMonth, targetYear: stopYear });
  if (rows.length === 0) return { corpus: goalStartingCorpus(goal), sip: Number(goal.currentSip) || 0 };
  const last = rows[rows.length - 1];
  return { corpus: last.closingBal, sip: last.monthlySip };
}

export function calcGoal(goal) {
  const createdM = goal.createdMonth || CURRENT_MONTH;
  const createdY = goal.createdYear || CURRENT_YEAR;
  const tgtM = goal.targetMonth || 1;
  const tgtY = goal.targetYear || CURRENT_YEAR;
  const months = Math.max(0, monthsBetween(createdM, createdY, tgtM, tgtY));
  const years = months / 12;
  const amount = Number(goal.amount) || 0;
  const inflation = (Number(goal.inflation) || 0) / 100;
  const monthlyInfl = Math.pow(1 + inflation, 1 / 12) - 1;
  const futureValue = amount * Math.pow(1 + monthlyInfl, months);

  // Straight-line forecast: where the goal ends up if nothing further
  // changes beyond what's already configured/logged. Creation-anchored —
  // this is "what happens if I do nothing more", not an action item.
  const projectedCorpus = simulate(goal).closingBal;
  const shortfall = Math.max(0, futureValue - projectedCorpus);
  const achievementPct = futureValue > 0 ? Math.min(100, (projectedCorpus / futureValue) * 100) : 100;

  // Additional SIP / Lump-sum Required are ACTION items: "given where things
  // really stand today, what do I need to do from here forward?" — anchored
  // to today's real date, not retroactively to the goal's creation. Both
  // start from today's real corpus and real ongoing SIP (which already fully
  // reflect every past Create Log entry) and only need to close the
  // remaining gap over the remaining time to target.
  const monthlyR = (Number(goal.expectedReturn) || 0) / 100 / 12;
  const todayAbs = CURRENT_YEAR * 12 + (CURRENT_MONTH - 1);
  const targetAbs = tgtY * 12 + (tgtM - 1);
  const remainingMonths = Math.max(0, targetAbs - todayAbs);
  const { corpus: todayCorpus, sip: todayEffectiveSip } = corpusAsOf(goal, todayAbs);

  // additionalSip solves for a flat top-up, effective from today, on top of
  // whatever's already happening (today's real ongoing SIP, plus any
  // future-dated Create Log entries, which still apply as scheduled). Found
  // by injecting a synthetic "today-dated" SIP entry alongside the goal's
  // real logged contributions and searching its amount — reuses the exact
  // same simulate() engine as everywhere else, so there's no separate,
  // possibly-drifting formula for this.
  let additionalSip = 0;
  if (remainingMonths > 0 && futureValue > 0) {
    const todayDate = `${CURRENT_YEAR}-${String(CURRENT_MONTH).padStart(2, '0')}-01`;
    const withExtra = (extra) => ({
      ...goal,
      contributions: [...goalContributions(goal), { id: '__extraSip', type: 'sip', date: todayDate, amount: extra }],
    });
    const zeroExtraClosing = simulate(withExtra(0)).closingBal;
    if (futureValue > zeroExtraClosing) {
      let lo = 0;
      let hi = Math.max(futureValue, 1);
      while (simulate(withExtra(hi)).closingBal < futureValue) {
        hi *= 2;
        if (hi > 1e15) break;
      }
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (simulate(withExtra(mid)).closingBal < futureValue) lo = mid; else hi = mid;
      }
      additionalSip = (lo + hi) / 2;
    }
  }
  const sipRequired = todayEffectiveSip + additionalSip; // total ongoing SIP needed, effective today
  const sipOnTrack = additionalSip <= 0.5;

  // Lump-sum equivalent: a one-time top-up, invested today on top of today's
  // real corpus, that alone (with no further SIP) would hit the future value.
  const lumpSumRequired = remainingMonths > 0
    ? Math.max(0, futureValue / Math.pow(1 + monthlyR, remainingMonths) - todayCorpus)
    : Math.max(0, futureValue - todayCorpus);

  const startCorpus = goalStartingCorpus(goal);
  const hasContributions = goalContributions(goal).length > 0;
  const hasMappedAssets = Array.isArray(goal.mappedAssets) && goal.mappedAssets.length > 0;

  return { months, years, futureValue, projectedCorpus, shortfall, achievementPct, sipRequired, additionalSip, sipOnTrack, lumpSumRequired, startCorpus, todayCorpus, todayEffectiveSip, hasContributions, hasMappedAssets };
}

// Year-by-year projection where each row is a 12-month window anchored to the
// goal's CREATION month — e.g. a goal created 14 Jun 2025 always begins its
// table at "Jun 2025 – Jun 2026", then "Jun 2026 – Jun 2027", and so on, all
// the way to the target. The SIP steps up on each anniversary of creation.
// Logged Create Log contributions (lump sums / SIP changes) are applied at
// their exact months, so later rows reflect what actually happened — but the
// row grid itself never shifts. The final row may be partial if the target
// date isn't a whole number of years from creation.
export function buildProjection(goal, sipOverride) {
  return simulate(goal, { sipOverride, buildRows: true }).rows;
}

export function uid() { return 'id_' + Math.random().toString(36).slice(2, 9); }

export function buildAssumptionsBlock(client) {
  if (!client.goals || client.goals.length === 0) {
    return 'No goals set yet for this client. Add a goal to populate assumptions.';
  }
  const lines = [];
  const sections = [
    { label: 'Inflation rate', key: 'inflation' },
    { label: 'Expected return', key: 'expectedReturn' },
    { label: 'SIP step-up rate', key: 'sipIncRate' },
  ];
  sections.forEach((s) => {
    lines.push(`${s.label}:`);
    client.goals.forEach(g => {
      lines.push(`  • ${g.name}: ${g[s.key]}%`);
    });
    lines.push('');
  });

  // Which of the client's assets are mapped into which goal's corpus, so
  // it's visible at a glance where an asset's value is already committed.
  const goalsWithAssets = client.goals.filter(g => Array.isArray(g.mappedAssets) && g.mappedAssets.length > 0);
  lines.push('Mapped Assets:');
  if (goalsWithAssets.length === 0) {
    lines.push('  • No assets mapped to any goal yet.');
  } else {
    goalsWithAssets.forEach(g => {
      const parts = g.mappedAssets.map(a => `${a.label} (${fmtFull(a.amount)})`).join(', ');
      lines.push(`  • ${g.name}: ${parts}`);
    });
  }
  return lines.join('\n');
}

export function generateAssumptionsText(client) {
  return buildAssumptionsBlock(client);
}

export function refreshAssumptionsText(client, currentText) {
  const freshBlock = buildAssumptionsBlock(client);

  const lines = currentText.split('\n');
  const headerRegex = /^(Inflation rate|Expected return|SIP step-up rate|Mapped Assets):\s*$/;
  const bulletRegex = /^\s*•\s/;

  let blockStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRegex.test(lines[i]) && i + 1 < lines.length && bulletRegex.test(lines[i + 1])) {
      blockStart = i;
      break;
    }
  }

  if (blockStart === -1) {
    const trimmedExisting = currentText.replace(/^\s+/, '');
    return trimmedExisting.length > 0
      ? `${freshBlock}\n\n${trimmedExisting}`
      : freshBlock;
  }

  let blockEnd = blockStart;
  for (let i = blockStart + 1; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.trim() === '') {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && (headerRegex.test(lines[j]) || bulletRegex.test(lines[j]))) {
        continue;
      } else {
        break;
      }
    }
    if (headerRegex.test(ln) || bulletRegex.test(ln)) {
      blockEnd = i;
    } else {
      break;
    }
  }

  while (blockEnd > blockStart && lines[blockEnd].trim() === '') blockEnd--;

  const before = lines.slice(0, blockStart).join('\n');
  const after = lines.slice(blockEnd + 1).join('\n');

  const beforeJoin = before.length > 0 ? (before.endsWith('\n') ? before : before + '\n') : '';
  const afterTrimmed = after.replace(/^\n+/, '');
  const afterJoin = afterTrimmed.length > 0 ? '\n\n' + afterTrimmed : '';

  return `${beforeJoin}${freshBlock}${afterJoin}`;
}
