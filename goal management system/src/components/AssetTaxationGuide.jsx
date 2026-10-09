// Others → Asset Taxation Guide: a read-only reference on how each investment
// product is taxed (FY 2025-26), laid out as cards, "held for → tax" rows and
// tables a fresher can take in at a glance. The content lives in
// utils/assetTaxation.js; nothing here can be edited, uploaded or saved.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, TrendingUp, Banknote, Coins, Layers, Scale, ScrollText, Gem, History, Receipt, Table2,
  Lightbulb, Info, Search, X, ArrowLeft, ArrowRight, ArrowDown, ChevronRight, CalendarClock, Clock,
  Landmark, Building2, SearchX,
} from 'lucide-react';
import { Card, PageTitle, inputCls, btnGhost } from './UI';
import { useBackLayer, LAYER } from '../utils/backNav';
import {
  TAX_SECTIONS, GRANDFATHERING, STAMP_VS_STT, REMEMBER_MAIN, TAX_GUIDE_FY, TAX_GUIDE_SOURCE,
  TAX_GUIDE_DISCLAIMER, TAX_NOT_FOUND, SLAB, searchTaxGuide,
} from '../utils/assetTaxation';

// LTCG / STCG / Slab Rate / Tax-Free / Special Rule each keep one colour
// throughout, so the eye learns them once.
const TONES = {
  ltcg: { chip: 'bg-blue-50 text-blue-700 ring-blue-200/70 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/50', text: 'text-blue-700 dark:text-blue-300', box: 'bg-blue-50/60 border-blue-200/70 dark:bg-blue-950/20 dark:border-blue-900/40' },
  stcg: { chip: 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50', text: 'text-amber-700 dark:text-amber-300', box: 'bg-amber-50/60 border-amber-200/70 dark:bg-amber-950/20 dark:border-amber-900/40' },
  slab: { chip: 'bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/50', text: 'text-rose-700 dark:text-rose-300', box: 'bg-rose-50/60 border-rose-200/70 dark:bg-rose-950/20 dark:border-rose-900/40' },
  free: { chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/50', text: 'text-emerald-700 dark:text-emerald-300', box: 'bg-emerald-50/60 border-emerald-200/70 dark:bg-emerald-950/20 dark:border-emerald-900/40' },
  special: { chip: 'bg-violet-50 text-violet-700 ring-violet-200/70 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/50', text: 'text-violet-700 dark:text-violet-300', box: 'bg-violet-50/60 border-violet-200/70 dark:bg-violet-950/20 dark:border-violet-900/40' },
};
const KEY = [['ltcg', 'LTCG'], ['stcg', 'STCG'], ['slab', 'Slab Rate'], ['free', 'Tax-Free'], ['special', 'Special Rule']];
const TAG_TONE = { LTCG: 'ltcg', STCG: 'stcg', 'All gains': 'slab', 'Tax-Free': 'free' };
const rateTone = (o) => (o.rate === SLAB ? 'slab' : TAG_TONE[o.tag] || 'ltcg');
const CASE_TONE = { gt65: 'ltcg', '35to65': 'stcg', lt35: 'slab' };

const ICONS = { equity: TrendingUp, debt: Banknote, gold: Coins, fof: Layers, hybrid: Scale, bonds: ScrollText, sgb: Gem, grandfathering: History, 'stamp-stt': Receipt, glance: Table2 };
const GRAD = {
  equity: 'from-blue-500 to-indigo-600', debt: 'from-sky-500 to-blue-600', gold: 'from-amber-400 to-orange-500',
  fof: 'from-violet-500 to-purple-600', hybrid: 'from-teal-500 to-emerald-600', bonds: 'from-slate-500 to-slate-700',
  sgb: 'from-yellow-500 to-amber-600', grandfathering: 'from-indigo-500 to-violet-600', 'stamp-stt': 'from-rose-500 to-pink-600',
  glance: 'from-blue-600 to-indigo-700',
};
const LEARN = [
  { id: 'grandfathering', title: 'Grandfathering', subtitle: 'How old profits are protected when tax rules change' },
  { id: 'stamp-stt', title: 'Stamp Duty vs STT', subtitle: 'What is charged when you buy, and when you sell' },
  { id: 'glance', title: 'Taxation at a Glance', subtitle: 'Compare every product’s LTCG / STCG side by side' },
];
const VIEWS = [
  ...TAX_SECTIONS.map((s) => ({ id: s.id, short: s.short, title: s.title, subtitle: s.subtitle })),
  { id: 'grandfathering', short: 'Grandfathering', title: 'What is Grandfathering?', subtitle: 'Old profits are protected when tax rules change' },
  { id: 'stamp-stt', short: 'Stamp Duty vs STT', title: 'Stamp Duty vs STT', subtitle: 'Charged on purchase vs charged on redemption / sale' },
  { id: 'glance', short: 'At a Glance', title: 'Taxation at a Glance', subtitle: 'Compare products quickly' },
];
const PRODUCTS = Object.fromEntries(TAX_SECTIONS.flatMap((s) => s.products.map((p) => [p.id, p])));
const QUICK_TRIES = ['Equity Mutual Fund', 'Debt Fund', 'Gold ETF', 'SGB', 'BAF', 'Arbitrage', 'STT', 'Grandfathering'];

// Every product (and each Multi Asset case) as one row of Taxation at a Glance.
const GLANCE = TAX_SECTIONS.map((s) => ({
  id: s.id,
  title: s.title,
  rows: s.products.flatMap((p) => (p.cases
    ? p.cases.map((c) => ({ key: `${p.id}-${c.id}`, productId: p.id, name: p.name, when: c.when, outcomes: c.outcomes, glance: c.glance }))
    : [{ key: p.id, productId: p.id, name: p.name, when: p.when, outcomes: p.outcomes, glance: p.glance }])),
}));
const split = (outcomes = []) => ({
  l: outcomes.find((o) => o.tag === 'LTCG'),
  s: outcomes.find((o) => o.tag === 'STCG'),
  only: outcomes.length === 1 ? outcomes[0] : null,
});
const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

function Badge({ tone, children }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ring-1 ${TONES[tone].chip}`}>
      {children}
    </span>
  );
}

function SectionIcon({ id, size = 18, className = 'w-10 h-10 rounded-xl' }) {
  const Icon = ICONS[id] || BookOpen;
  return (
    <span className={`${className} bg-gradient-to-br ${GRAD[id] || GRAD.glance} text-white flex items-center justify-center shadow-md shrink-0`}>
      <Icon size={size} />
    </span>
  );
}

function Label({ children, className = '' }) {
  return <p className={`text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ${className}`}>{children}</p>;
}

function Remember({ items, className = '' }) {
  if (!items?.length) return null;
  return (
    <div className={`rounded-2xl border border-amber-200/70 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/15 p-4 sm:p-5 ${className}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
        <Lightbulb size={13} /> Remember this
      </p>
      <dl className={`mt-3 grid grid-cols-1 ${items.length > 1 ? 'sm:grid-cols-2' : ''} gap-3`}>
        {items.map(([k, ...lines]) => (
          <div key={k}>
            <dt className="text-xs font-bold text-slate-800 dark:text-slate-100">{k}</dt>
            {lines.map((l) => <dd key={l} className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{l}</dd>)}
          </div>
        ))}
      </dl>
    </div>
  );
}

function Disclaimer() {
  return (
    <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500 border-t border-slate-200/70 dark:border-slate-800 pt-4">
      <Info size={13} className="shrink-0 mt-0.5" />
      <span>{TAX_GUIDE_DISCLAIMER} Source: “{TAX_GUIDE_SOURCE}”.</span>
    </p>
  );
}

// One outcome on a single line, for tight spots (Multi Asset cases, search results).
function OutcomeLine({ o }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
      <Badge tone={TAG_TONE[o.tag]}>{o.tag}</Badge>
      <span className={`font-bold ${TONES[rateTone(o)].text}`}>{o.rate}</span>
      <span className="text-slate-500 dark:text-slate-400">· {o.held}</span>
      {o.detail && <span className="text-slate-500 dark:text-slate-400">· {o.detail}</span>}
    </div>
  );
}

// "Held for → LTCG / STCG → rate" — the core visual of every product card.
function Timeline({ outcomes }) {
  return (
    <div className="mt-4 space-y-2">
      <Label>How it works</Label>
      {outcomes.map((o) => (
        <div key={o.tag} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 px-3 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 sm:w-52 shrink-0">
            <Clock size={12} className="shrink-0" /> Held for <b className="font-bold text-slate-800 dark:text-slate-100">{o.held}</b>
          </span>
          <ArrowRight size={14} className="hidden sm:block text-slate-300 dark:text-slate-600 shrink-0" />
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <Badge tone={TAG_TONE[o.tag]}>{o.tag}</Badge>
            <span className={`text-sm font-extrabold ${TONES[rateTone(o)].text}`}>{o.rate}</span>
            {o.detail && <span className="text-[11px] text-slate-500 dark:text-slate-400">{o.detail}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// All gains at the slab rate, or fully tax-free: one bold box says it all.
function SingleOutcome({ o }) {
  const tone = rateTone(o);
  return (
    <div className={`mt-4 rounded-xl border p-4 ${TONES[tone].box}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TAG_TONE[o.tag]}>{o.tag}</Badge>
        <span className={`text-base font-extrabold ${TONES[tone].text}`}>{o.rate}</span>
      </div>
      <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{o.held}</p>
    </div>
  );
}

// Multi Asset Allocation: equity exposure ↓ three branches.
function ExposureTree({ cases }) {
  return (
    <div className="mt-4">
      <div className="flex flex-col items-center">
        <span className="px-3 py-1.5 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold">Equity Exposure</span>
        <ArrowDown size={16} className="text-slate-300 dark:text-slate-600 my-1.5" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cases.map((c) => {
          const tone = CASE_TONE[c.id] || 'special';
          return (
            <div key={c.id} className={`rounded-2xl border p-4 ${TONES[tone].box}`}>
              <p className={`text-base font-extrabold ${TONES[tone].text}`}>{c.when}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-200">
                <ArrowRight size={12} className="shrink-0" /> {c.label}
              </p>
              <div className="mt-3 space-y-1.5">
                {c.outcomes.map((o) => <OutcomeLine key={o.tag} o={o} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Each fact appears once: "How it works" carries the holding periods and
// rates, and a heading above the card (the Debt dates, the SGB groups) is not
// repeated inside it.
function ProductCard({ p, focused, hideWhen = false, hideBadge = false, wide = false }) {
  const { l, only } = split(p.outcomes);
  return (
    <div id={`tax-${p.id}`} className={`scroll-mt-24 ${wide ? 'lg:col-span-2' : ''}`}>
      <Card className={`p-5 h-full ${focused ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">{p.name}</h4>
            {p.when && !hideWhen && (
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <CalendarClock size={12} /> {p.when}
              </p>
            )}
          </div>
          {p.badge && !hideBadge && <Badge tone="special">{p.badge}</Badge>}
        </div>
        {p.note && <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{p.note}</p>}
        {p.includes && (
          <div className="mt-3">
            <Label>Includes</Label>
            <ul className="mt-1 space-y-0.5">
              {p.includes.map((x) => <li key={x} className="text-xs text-slate-700 dark:text-slate-200">• {x}</li>)}
            </ul>
          </div>
        )}
        {p.cases && <ExposureTree cases={p.cases} />}
        {l && <Timeline outcomes={p.outcomes} />}
        {!l && only && <SingleOutcome o={only} />}
      </Card>
    </div>
  );
}

function GroupHead({ icon: Icon, tone, title, sub }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-2xl border px-4 py-3 ${TONES[tone].box}`}>
      <Icon size={18} className={`shrink-0 ${TONES[tone].text}`} />
      <div className="min-w-0">
        <p className={`text-base font-extrabold leading-tight ${TONES[tone].text}`}>{title}</p>
        <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{sub}</p>
      </div>
    </div>
  );
}

function SectionBody({ s, focus }) {
  if (s.layout === 'dates') {
    // Debt MF: the investment date decides everything, so it heads each side.
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {s.products.map((p, i) => (
          <div key={p.id} className="space-y-3">
            <div className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-white shadow-md bg-gradient-to-br ${i === 0 ? 'from-blue-600 to-indigo-600' : 'from-rose-500 to-pink-600'}`}>
              <CalendarClock size={22} className="shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Case {i + 1}</p>
                <p className="text-base sm:text-lg font-extrabold leading-tight">{p.when}</p>
              </div>
            </div>
            <ProductCard p={p} focused={focus === p.id} hideWhen />
          </div>
        ))}
      </div>
    );
  }
  if (s.layout === 'sgb') {
    // SGB: how it is exited decides the tax — RBI vs the stock exchange.
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <GroupHead icon={Landmark} tone="free" title="RBI Redemption" sub="At maturity, or premature redemption through RBI" />
          {s.products.filter((p) => p.group === 'rbi').map((p) => <ProductCard key={p.id} p={p} focused={focus === p.id} hideBadge />)}
        </div>
        <div className="space-y-3">
          <GroupHead icon={Building2} tone="ltcg" title="Stock Exchange Sale" sub="Sold on the stock exchange" />
          {s.products.filter((p) => p.group === 'exchange').map((p) => <ProductCard key={p.id} p={p} focused={focus === p.id} hideBadge />)}
        </div>
      </div>
    );
  }
  return (
    <div className={`grid grid-cols-1 ${s.products.length > 1 ? 'lg:grid-cols-2' : ''} gap-4`}>
      {s.products.map((p) => <ProductCard key={p.id} p={p} focused={focus === p.id} wide={!!p.cases} />)}
    </div>
  );
}

function Grandfathering() {
  const g = GRANDFATHERING;
  const ex = g.example;
  const before = ex.valueOnDate - ex.invested;
  const after = ex.saleValue - ex.valueOnDate;
  const total = ex.saleValue - ex.invested;
  const steps = [
    { when: ex.bought, what: `Bought ${ex.product}`, amount: ex.invested, sub: 'Investment' },
    { when: g.date, what: `Value on ${g.date}`, amount: ex.valueOnDate, sub: 'Old profit up to here is protected' },
    { when: 'Later', what: 'Sold', amount: ex.saleValue, sub: 'Sale value' },
  ];
  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <p className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white leading-snug">“{g.oneLiner}”</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3">
            <Label>Applies to</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{g.appliesTo.map((a) => <Badge key={a} tone="ltcg">{a}</Badge>)}</div>
          </div>
          <div className="rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3">
            <Label>Important date</Label>
            <p className={`mt-1 text-base font-extrabold ${TONES.ltcg.text}`}>{g.date}</p>
          </div>
          <div className="rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-3">
            <Label>Why</Label>
            <p className="mt-1 text-xs text-slate-700 dark:text-slate-200 leading-relaxed">{g.purpose}</p>
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Example</h4>
        <ol className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {steps.map((st, i) => (
            <li key={st.when} className="relative rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 p-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Step {i + 1} · {st.when}</span>
              <p className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-200">{st.what}</p>
              <p className="mt-1 text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">{inr(st.amount)}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{st.sub}</p>
            </li>
          ))}
        </ol>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className={`rounded-2xl border p-4 ${TONES.free.box}`}>
            <Label>Profit up to {g.date}</Label>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200 tabular-nums">{inr(ex.valueOnDate)} − {inr(ex.invested)} = <b className={`text-lg ${TONES.free.text}`}>{inr(before)}</b></p>
            <p className={`mt-1 text-xs font-bold ${TONES.free.text}`}>Protected by grandfathering</p>
          </div>
          <div className={`rounded-2xl border p-4 ${TONES.ltcg.box}`}>
            <Label>Profit after {g.date}</Label>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-200 tabular-nums">{inr(ex.saleValue)} − {inr(ex.valueOnDate)} = <b className={`text-lg ${TONES.ltcg.text}`}>{inr(after)}</b></p>
            <p className={`mt-1 text-xs font-bold ${TONES.ltcg.text}`}>Taxable as LTCG</p>
          </div>
        </div>
        <div className="mt-3 rounded-xl border-l-4 border-blue-500 bg-blue-50/70 dark:bg-blue-950/20 px-4 py-3 text-sm font-semibold text-blue-900 dark:text-blue-200">
          Only {inr(after)} is considered for the taxable LTCG calculation in this example, rather than the complete {inr(total)} gain.
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Grandfathering vs Indexation</h4>
        <div className="mt-3 space-y-2">
          {g.contrast.map(([what, rule], i) => (
            <div key={what} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/70 dark:border-slate-800 px-3 py-2.5">
              <span className="text-sm font-bold text-slate-900 dark:text-white">{what}</span>
              <ArrowRight size={14} className="text-slate-300 dark:text-slate-600" />
              <Badge tone={i === 0 ? 'ltcg' : 'special'}>{rule}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StampVsStt() {
  const cell = (lines, big) => (
    <>
      <p className={big ? 'text-lg font-extrabold text-slate-900 dark:text-white tabular-nums' : 'text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100'}>{lines[0]}</p>
      {lines.slice(1).map((x) => <p key={x} className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{x}</p>)}
    </>
  );
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <table className="w-full table-fixed text-left">
          <thead>
            <tr className="border-b border-slate-200/70 dark:border-slate-800">
              <th className="w-[28%] md:w-[20%] p-3 md:p-4"><span className="sr-only">Item</span></th>
              <th className="p-3 md:p-4 bg-blue-50/60 dark:bg-blue-950/20">
                <span className={`text-sm font-extrabold ${TONES.ltcg.text}`}>Stamp Duty</span>
              </th>
              <th className="p-3 md:p-4 bg-violet-50/60 dark:bg-violet-950/20">
                <span className={`block text-sm font-extrabold ${TONES.special.text}`}>STT</span>
                <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">Securities Transaction Tax</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {STAMP_VS_STT.rows.map(([label, a, b]) => (
              <tr key={label} className="border-b last:border-0 border-slate-100 dark:border-slate-800 align-top">
                <th scope="row" className="p-3 md:p-4 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</th>
                <td className="p-3 md:p-4">{cell(a, label === 'Rate')}</td>
                <td className="p-3 md:p-4">{cell(b, label === 'Rate')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Remember items={[['Stamp Duty', 'Charged on purchase (Lumpsum, SIP, STP, etc.) — 0.005% on the total investment amount.'], ['STT', 'Charged on redemption / sale / exit of Equity-Oriented Funds only — 0.001% on the total redemption / sale value.']]} />
    </div>
  );
}

function Glance({ onOpen }) {
  const rateCls = (o) => `font-bold ${TONES[rateTone(o)].text}`;
  return (
    <>
      {/* Desktop: one table. */}
      <Card className="hidden md:block overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-slate-950/40 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="px-4 py-3 w-[26%]">Asset / Product</th>
              <th className="px-4 py-3">LTCG holding period</th>
              <th className="px-4 py-3">LTCG tax</th>
              <th className="px-4 py-3">STCG tax</th>
              <th className="px-4 py-3 w-[28%]">Special rule</th>
            </tr>
          </thead>
          <tbody>
            {GLANCE.map((g) => (
              <Fragment key={g.id}>
                <tr className="border-t border-slate-200/70 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/20">
                  <td colSpan={5} className="px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">{g.title}</td>
                </tr>
                {g.rows.map((r) => {
                  const { l, s, only } = split(r.outcomes);
                  return (
                    <tr key={r.key} onClick={() => onOpen(g.id, r.productId)} className="border-t border-slate-100 dark:border-slate-800/70 align-top hover:bg-blue-50/40 dark:hover:bg-slate-800/40 cursor-pointer">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900 dark:text-white text-xs">{r.name}</p>
                        {r.when && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{r.when}</p>}
                      </td>
                      {l ? (
                        <>
                          <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">{l.held}</td>
                          <td className={`px-4 py-3 text-xs ${rateCls(l)}`}>{l.rate}</td>
                          <td className={`px-4 py-3 text-xs ${s ? rateCls(s) : 'text-slate-400'}`}>{s ? s.rate : '—'}</td>
                        </>
                      ) : (
                        <td colSpan={3} className="px-4 py-3 text-xs">
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <Badge tone={TAG_TONE[only.tag]}>{only.tag}</Badge>
                            <span className={rateCls(only)}>{only.rate}</span>
                            <span className="text-slate-500 dark:text-slate-400">· {only.held}</span>
                          </span>
                        </td>
                      )}
                      <td className={`px-4 py-3 text-[11px] leading-snug ${r.glance ? TONES.special.text : 'text-slate-400'}`}>{r.glance || '—'}</td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Phone: the same rows as cards. */}
      <div className="md:hidden space-y-5">
        {GLANCE.map((g) => (
          <div key={g.id}>
            <Label className="mb-2 px-1">{g.title}</Label>
            <div className="space-y-2">
              {g.rows.map((r) => {
                const { l, s, only } = split(r.outcomes);
                return (
                  <button key={r.key} type="button" onClick={() => onOpen(g.id, r.productId)} className="w-full text-left rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-3.5 cursor-pointer">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{r.name}</p>
                    {r.when && <p className="text-[11px] text-slate-500 dark:text-slate-400">{r.when}</p>}
                    {l ? (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div><Label>LTCG after</Label><p className="text-[11px] font-bold text-slate-800 dark:text-slate-100">{l.held}</p></div>
                        <div><Label>LTCG</Label><p className={`text-[11px] ${rateCls(l)}`}>{l.rate}</p></div>
                        <div><Label>STCG</Label><p className={`text-[11px] ${s ? rateCls(s) : 'text-slate-400'}`}>{s ? s.rate : '—'}</p></div>
                      </div>
                    ) : (
                      <div className="mt-2"><OutcomeLine o={only} /></div>
                    )}
                    {r.glance && <p className={`mt-2 text-[11px] leading-snug ${TONES.special.text}`}>{r.glance}</p>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Results({ results, query, onOpen, onTry }) {
  if (!results.length) {
    return (
      <Card className="p-8 sm:p-10 text-center border-dashed border-2 border-slate-200 dark:border-slate-800">
        <SearchX className="mx-auto text-slate-400 dark:text-slate-600 mb-3" size={32} />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{TAX_NOT_FOUND}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">Searched for “{query.trim()}”. Try one of these:</p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {QUICK_TRIES.map((t) => (
            <button key={t} type="button" onClick={() => onTry(t)} className="px-2.5 py-1 rounded-full text-[11px] font-bold border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">{t}</button>
          ))}
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      <Label className="px-1">{results.length} {results.length === 1 ? 'result' : 'results'}</Label>
      {results.map((e) => {
        const p = e.productId ? PRODUCTS[e.productId] : null;
        return (
          <button
            key={`${e.sectionId}-${e.productId || e.title}`}
            type="button"
            onClick={() => onOpen(e.sectionId, e.productId || null)}
            className="group w-full text-left flex items-start gap-3 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 shadow-sm hover:shadow-md hover:border-blue-300/60 dark:hover:border-blue-800/60 transition-all cursor-pointer"
          >
            <SectionIcon id={e.sectionId} size={16} className="w-9 h-9 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">{e.title}</p>
              {e.sub && <p className="text-[11px] text-slate-500 dark:text-slate-400">{e.sub}</p>}
              {p && (
                <div className="mt-2 space-y-1">
                  {p.cases
                    ? <p className={`text-[11px] font-bold ${TONES.special.text}`}>{p.note}</p>
                    : p.outcomes.map((o) => <OutcomeLine key={o.tag} o={o} />)}
                </div>
              )}
            </div>
            <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0">{e.section}</span>
            <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500 shrink-0 self-center" />
          </button>
        );
      })}
    </div>
  );
}

export default function AssetTaxationGuide() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState(null); // a section id, 'grandfathering', 'stamp-stt', 'glance' — or the main page
  const [focus, setFocus] = useState(null); // a product to scroll to and briefly highlight
  const topRef = useRef(null);
  const mounted = useRef(false);
  const results = useMemo(() => searchTaxGuide(query), [query]);

  // Phone / browser Back from a topic returns to the main page (search kept).
  useBackLayer(!!view, () => { setView(null); setFocus(null); }, LAYER.SCREEN);

  const open = (id, productId = null) => { setFocus(productId); setView(id); };

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const el = focus ? document.getElementById(`tax-${focus}`) : topRef.current;
    el?.scrollIntoView({ block: focus ? 'center' : 'start' });
    // Only on a change of page — clearing the highlight must not scroll.
  }, [view]);
  useEffect(() => {
    if (!focus) return undefined;
    const t = setTimeout(() => setFocus(null), 2200);
    return () => clearTimeout(t);
  }, [focus]);

  const current = VIEWS.find((v) => v.id === view);
  const section = TAX_SECTIONS.find((s) => s.id === view);

  return (
    <div ref={topRef} className="space-y-6 animate-fade-in scroll-mt-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <PageTitle icon={BookOpen} title="Asset Taxation Guide" subtitle="Simple guide to taxation of investment products" />
        <span className="self-start md:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/50 shrink-0">
          <CalendarClock size={12} /> Taxation Guide · {TAX_GUIDE_FY}
        </span>
      </div>

      {!current ? (
        <>
          <Card className="p-5 sm:p-6 bg-gradient-to-br from-blue-50/70 to-white dark:from-slate-900 dark:to-slate-950">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Understand taxation of investment products in simple terms.</p>
            <div className="relative mt-3">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search asset, fund or tax rule…"
                aria-label="Search taxation"
                className={inputCls + ' pl-10 pr-10'}
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mr-0.5">Try:</span>
              {QUICK_TRIES.map((t) => (
                <button key={t} type="button" onClick={() => setQuery(t)} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">{t}</button>
              ))}
            </div>
          </Card>

          {query.trim() ? (
            <Results results={results} query={query} onOpen={open} onTry={setQuery} />
          ) : (
            <>
              <div>
                <div className="flex flex-wrap items-end justify-between gap-2 mb-3 px-1">
                  <Label>Quick categories</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {KEY.map(([tone, label]) => <Badge key={tone} tone={tone}>{label}</Badge>)}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {TAX_SECTIONS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => open(s.id)}
                      className="group text-left p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 shadow-lg shadow-slate-100/40 dark:shadow-none hover:shadow-xl hover:-translate-y-0.5 hover:border-blue-300/60 dark:hover:border-blue-800/60 transition-all cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        <SectionIcon id={s.id} />
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">{s.title}</h3>
                          <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{s.subtitle}</p>
                        </div>
                        <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500 shrink-0 mt-0.5" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-3 px-1">Learn</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {LEARN.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => open(t.id)}
                      className="group text-left p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-slate-900/80 shadow-lg shadow-slate-100/40 dark:shadow-none hover:shadow-xl hover:-translate-y-0.5 hover:border-blue-300/60 dark:hover:border-blue-800/60 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <SectionIcon id={t.id} />
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">{t.title}</h3>
                          <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">{t.subtitle}</p>
                        </div>
                        <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500 shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <Remember items={REMEMBER_MAIN} />
            </>
          )}
        </>
      ) : (
        <>
          <div className="space-y-3">
            <button type="button" onClick={() => { setView(null); setFocus(null); }} className={btnGhost + ' -ml-2'}>
              <ArrowLeft size={14} /> All topics
            </button>
            {/* Jump straight to another topic. */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => open(v.id)}
                  aria-current={v.id === view ? 'page' : undefined}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                    v.id === view
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {v.short}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <SectionIcon id={current.id} size={20} className="w-11 h-11 rounded-2xl" />
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{current.title}</h3>
              {current.subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{current.subtitle}</p>}
            </div>
          </div>

          {section?.firstCheck && (
            <div className="rounded-xl border-l-4 border-blue-500 bg-blue-50/70 dark:bg-blue-950/20 px-4 py-3 text-sm font-semibold text-blue-900 dark:text-blue-200">
              {section.firstCheck}
            </div>
          )}

          {section && <SectionBody s={section} focus={focus} />}
          {section?.remember && <Remember items={section.remember} />}
          {view === 'grandfathering' && <Grandfathering />}
          {view === 'stamp-stt' && <StampVsStt />}
          {view === 'glance' && <Glance onOpen={open} />}
        </>
      )}

      <Disclaimer />
    </div>
  );
}
