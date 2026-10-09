// Others → Calculator: the maths behind every calculator, as pure functions.
// Money in rupees, rates in % a year; results are unrounded (the screen
// rounds them).
//
// Conventions — the same ones the SIP / Lumpsum calculators always used:
// - SIP-style instalments go in at the start of each month and grow at the
//   annual rate ÷ 12 a month.
// - A lumpsum grows once a year at the annual rate.

const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const perMonth = (ratePct) => num(ratePct) / 100 / 12;
// Month-by-month calculators stop at 100 years, so a typo can't hang the page.
export const MAX_YEARS = 100;
const monthsIn = (years) => Math.max(0, Math.min(Math.round(num(years) * 12), MAX_YEARS * 12));

// ---- SIP / Lumpsum (unchanged from the original calculator) ---------------

export function sip({ amount, ratePct, years }) {
  const p = num(amount);
  const i = perMonth(ratePct);
  const months = num(years) * 12;
  const invested = p * months;
  const value = i === 0 ? invested : p * ((Math.pow(1 + i, months) - 1) / i) * (1 + i);
  return { invested, value, gains: Math.max(0, value - invested) };
}

export function lumpsum({ amount, ratePct, years }) {
  const p = num(amount);
  const value = p * Math.pow(1 + num(ratePct) / 100, num(years));
  return { invested: p, value, gains: Math.max(0, value - p) };
}

// ---- Step-Up SIP ----------------------------------------------------------
// The monthly SIP rises by stepUpPct at the start of every new year.
export function stepUpSip({ amount, stepUpPct, ratePct, years }) {
  const i = perMonth(ratePct);
  const months = monthsIn(years);
  const step = 1 + num(stepUpPct) / 100;
  let value = 0, invested = 0, instalment = num(amount);
  const rows = [];
  for (let m = 1; m <= months; m++) {
    if (m > 1 && (m - 1) % 12 === 0) instalment *= step;
    value = (value + instalment) * (1 + i);
    invested += instalment;
    if (m % 12 === 0 || m === months) rows.push({ year: Math.ceil(m / 12), monthly: instalment, invested, value });
  }
  return { invested, value, gains: value - invested, lastMonthly: months ? instalment : 0, rows };
}

// ---- SIP vs Lumpsum -------------------------------------------------------
// The same total: all of it invested today, or spread as equal monthly SIPs
// over the period.
export function sipVsLumpsum({ total, ratePct, years }) {
  const months = monthsIn(years);
  const monthly = months ? num(total) / months : 0;
  const s = sip({ amount: monthly, ratePct, years: months / 12 });
  const l = lumpsum({ amount: total, ratePct, years: months / 12 });
  return { monthly, months, sip: s, lumpsum: l, difference: l.value - s.value };
}

// ---- CAGR -----------------------------------------------------------------
export function cagr({ initial, final, years }) {
  const a = num(initial), b = num(final), t = num(years);
  if (!(a > 0) || !(b >= 0) || !(t > 0)) return null;
  return { cagrPct: (Math.pow(b / a, 1 / t) - 1) * 100, absolutePct: (b / a - 1) * 100, gain: b - a };
}

// ---- XIRR -----------------------------------------------------------------
// flows: [{ date: 'yyyy-mm-dd', amount }] — money put in is negative, money
// taken out (and today's value) positive. Actual days ÷ 365, like Excel's
// XIRR. Returns null when it can't be worked out.
export function xirr(flows) {
  const fs = (flows || [])
    .map((f) => ({ t: Date.parse(`${f.date}T00:00:00Z`), a: num(f.amount) }))
    .filter((f) => Number.isFinite(f.t) && f.a !== 0);
  if (fs.length < 2 || !fs.some((f) => f.a < 0) || !fs.some((f) => f.a > 0)) return null;
  const t0 = Math.min(...fs.map((f) => f.t));
  const ys = fs.map((f) => ({ y: (f.t - t0) / (365 * 86400000), a: f.a }));
  const npv = (r) => ys.reduce((s, f) => s + f.a / Math.pow(1 + r, f.y), 0);
  const dnpv = (r) => ys.reduce((s, f) => s - (f.y * f.a) / Math.pow(1 + r, f.y + 1), 0);
  const invested = -fs.filter((f) => f.a < 0).reduce((s, f) => s + f.a, 0);
  const received = fs.filter((f) => f.a > 0).reduce((s, f) => s + f.a, 0);
  const done = (r) => ({ ratePct: r * 100, invested, received, gain: received - invested });

  // Newton's method from 10 %, then bisection if it wanders off.
  let r = 0.1;
  for (let k = 0; k < 100; k++) {
    const v = npv(r), d = dnpv(r);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break;
    const next = r - v / d;
    if (!Number.isFinite(next) || next <= -0.999999) break;
    if (Math.abs(next - r) < 1e-12) return done(next);
    r = next;
  }
  let lo = -0.999999, hi = 1;
  while (npv(lo) * npv(hi) > 0 && hi < 1e6) hi *= 2;
  if (!(npv(lo) * npv(hi) <= 0)) return null;
  for (let k = 0; k < 300; k++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return done((lo + hi) / 2);
}

// ---- SWP ------------------------------------------------------------------
// Each month the corpus grows at the annual rate ÷ 12, then the withdrawal is
// paid out — until the period ends or the money runs out.
export function swp({ corpus, withdrawal, ratePct, years }) {
  const i = perMonth(ratePct);
  const months = monthsIn(years);
  const w = num(withdrawal);
  let balance = num(corpus), total = 0, yearOut = 0, ranOutAt = null;
  const rows = [];
  for (let m = 1; m <= months; m++) {
    balance *= 1 + i;
    const out = Math.min(w, balance);
    balance -= out;
    total += out;
    yearOut += out;
    if (ranOutAt === null && w > 0 && balance < 0.005) ranOutAt = m; // the month the corpus reaches zero
    if (m % 12 === 0 || m === months || ranOutAt !== null) {
      rows.push({ year: Math.ceil(m / 12), withdrawn: yearOut, totalWithdrawn: total, balance });
      yearOut = 0;
    }
    if (ranOutAt !== null) break; // nothing more to pay out
  }
  return { totalWithdrawn: total, finalValue: balance, gains: total + balance - num(corpus), ranOutAt, rows };
}

// ---- STP ------------------------------------------------------------------
// The amount sits in the source fund and moves to the target fund in equal
// instalments. At the start of each period one instalment moves across, then
// both funds grow for the period (annual rate ÷ periods a year). Whatever the
// source fund earned meanwhile is still in it at the end.
export const STP_FREQUENCIES = [
  { id: 'Daily', perYear: 365, unit: 'day' },
  { id: 'Weekly', perYear: 52, unit: 'week' },
  { id: 'Monthly', perYear: 12, unit: 'month' },
  { id: 'Yearly', perYear: 1, unit: 'year' },
];
export function stp({ amount, installments, frequency, sourceRatePct, targetRatePct }) {
  const f = STP_FREQUENCIES.find((x) => x.id === frequency) || STP_FREQUENCIES[2];
  const n = Math.max(0, Math.min(Math.floor(num(installments)), 10000));
  const total = num(amount);
  const each = n ? total / n : 0;
  const i1 = num(sourceRatePct) / 100 / f.perYear;
  const i2 = num(targetRatePct) / 100 / f.perYear;
  let source = total, target = 0, moved = 0;
  const rows = [];
  for (let k = 1; k <= n; k++) {
    const x = Math.min(each, source);
    source -= x;
    target += x;
    moved += x;
    source *= 1 + i1;
    target *= 1 + i2;
    const yearEnd = Math.floor(k / f.perYear) !== Math.floor((k - 1) / f.perYear);
    if (yearEnd || k === n) rows.push({ year: Math.ceil(k / f.perYear), transferred: moved, source, target, total: source + target });
  }
  return { each, periods: n, unit: f.unit, transferred: moved, source, target, value: source + target, gains: source + target - total, rows };
}

// ---- Inflation-adjusted returns --------------------------------------------
export function inflationAdjusted({ amount, ratePct, inflationPct, years }) {
  const p = num(amount), r = num(ratePct) / 100, inf = num(inflationPct) / 100, t = num(years);
  const nominal = p * Math.pow(1 + r, t);
  const real = nominal / Math.pow(1 + inf, t);
  return {
    nominal,
    real,
    realRatePct: ((1 + r) / (1 + inf) - 1) * 100,
    todaysAmountLater: p * Math.pow(1 + inf, t), // what today's amount will cost then
    lostToInflation: nominal - real,
  };
}

// ---- Compound interest -------------------------------------------------------
export const COMPOUNDING = [
  { id: 'Yearly', perYear: 1 },
  { id: 'Half-yearly', perYear: 2 },
  { id: 'Quarterly', perYear: 4 },
  { id: 'Monthly', perYear: 12 },
  { id: 'Daily', perYear: 365 },
];
export function compoundInterest({ principal, ratePct, years, compounding }) {
  const n = (COMPOUNDING.find((c) => c.id === compounding) || COMPOUNDING[0]).perYear;
  const p = num(principal), r = num(ratePct) / 100, t = Math.max(0, Math.min(num(years), MAX_YEARS));
  const at = (y) => p * Math.pow(1 + r / n, n * y);
  const rows = [];
  for (let y = 1; y <= Math.ceil(t); y++) {
    const yy = Math.min(y, t);
    rows.push({ year: y, value: at(yy), interest: at(yy) - p });
  }
  const value = at(t);
  return { value, interest: value - p, effectivePct: (Math.pow(1 + r / n, n) - 1) * 100, rows };
}

// ---- Loan EMI -----------------------------------------------------------------
export function loanEmi({ loan, ratePct, years }) {
  const p = num(loan), i = perMonth(ratePct);
  const n = monthsIn(years);
  if (!(p > 0) || !(n > 0)) return null;
  const emi = i === 0 ? p / n : (p * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
  let balance = p, yPrin = 0, yInt = 0;
  const rows = [];
  for (let m = 1; m <= n; m++) {
    const interest = balance * i;
    const principal = Math.min(emi - interest, balance);
    balance -= principal;
    yPrin += principal;
    yInt += interest;
    if (m % 12 === 0 || m === n) {
      rows.push({ year: Math.ceil(m / 12), principal: yPrin, interest: yInt, balance: Math.max(0, balance) });
      yPrin = 0;
      yInt = 0;
    }
  }
  return { emi, months: n, totalInterest: emi * n - p, totalPayment: emi * n, rows };
}
