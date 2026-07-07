import { TrendingUp, Home, CreditCard } from 'lucide-react';
import { fmtFull } from './calc';

// ---------------------------------------------------------------------------
// Asset-allocation taxonomy
// ---------------------------------------------------------------------------
// Drives both the input form and the client profile. Three top-level sections,
// each with one or more groups, each group with a fixed list of line items.
// A free-form "custom" bucket per section lets advisors add anything extra.
// Values are stored per section keyed by the item label (labels are unique
// within a section), e.g. allocation.values.financial['Equity Mutual Funds'].

export const ASSET_SCHEMA = [
  {
    id: 'financial',
    title: 'Financial Assets',
    kind: 'asset',
    icon: TrendingUp,
    accent: 'indigo',
    groups: [
      {
        id: 'equity',
        title: 'Equity Assets',
        items: [
          { label: 'Stocks / Shares' },
          { label: 'Equity Mutual Funds' },
          { label: 'Equity ETFs' },
          { label: 'NPS' },
        ],
      },
      {
        id: 'debt',
        title: 'Debt Assets',
        items: [
          { label: 'Savings Account' },
          { label: 'Fixed Deposits (FDs)' },
          { label: 'Recurring Deposits (RDs)' },
          { label: 'Debt Mutual Funds' },
          { label: 'Bonds & Debentures' },
          { label: 'Public Provident Fund (PPF)' },
          { label: "Employees' Provident Fund (EPF)" },
          { label: 'Government Securities (G-Secs)' },
          { label: 'National Savings Certificate (NSC)' },
          { label: 'Treasury Bills (T-Bills)' },
          { label: 'Cash & Bank Balance' },
          { label: 'Traditional Insurance Policies (Investment Component)' },
          { label: 'Debt ETFs' },
        ],
      },
      {
        id: 'commodity',
        title: 'Commodity Assets',
        items: [
          { label: 'Sovereign Gold Bonds (SGBs)' },
          { label: 'Gold ETFs' },
          { label: "Silver ETF's" },
          { label: 'Gold Mutual Funds' },
        ],
      },
    ],
  },
  {
    id: 'physical',
    title: 'Physical Assets',
    kind: 'asset',
    icon: Home,
    accent: 'amber',
    groups: [
      {
        id: 'realEstate',
        title: 'Real Estate',
        items: [
          { label: 'Residential Real Estate', hint: 'House, apartment, residential plots' },
          { label: 'Commercial Real Estate', hint: 'Shops, offices, warehouses' },
          { label: 'Agricultural Land', hint: 'Farmland and plantations' },
        ],
      },
      {
        id: 'preciousMetals',
        title: 'Precious Metals',
        items: [
          { label: 'Gold Jewellery', hint: 'Gold ornaments and jewellery' },
          { label: 'Physical Gold', hint: 'Coins, bars, biscuits' },
          { label: 'Silver & Precious Metals', hint: 'Silver coins, bars, platinum, etc.' },
        ],
      },
    ],
  },
  {
    id: 'liabilities',
    title: 'Loans & Liabilities',
    kind: 'liability',
    icon: CreditCard,
    accent: 'rose',
    groups: [
      {
        id: 'secured',
        title: 'Secured Loans',
        items: [
          { label: 'Home Loan' },
          { label: 'Loan Against Property (LAP)' },
          { label: 'Vehicle Loan' },
          { label: 'Gold Loan' },
          { label: 'Loan Against Securities' },
        ],
      },
      {
        id: 'unsecured',
        title: 'Unsecured Loans',
        items: [
          { label: 'Personal Loan' },
          { label: 'Education Loan' },
          { label: 'Business Loan' },
        ],
      },
      {
        id: 'other',
        title: 'Other Liabilities',
        items: [
          { label: 'Short-Term Liabilities' },
          { label: 'Credit Card Dues' },
          { label: 'Other Payables' },
        ],
      },
    ],
  },
];

export const SECTION_IDS = ASSET_SCHEMA.map(s => s.id);

// Map of sectionId -> schema for quick lookups
const SECTION_BY_ID = Object.fromEntries(ASSET_SCHEMA.map(s => [s.id, s]));
export const getSection = (id) => SECTION_BY_ID[id];

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------
export const SECTION_COLORS = {
  financial: '#6366f1', // indigo
  physical: '#f59e0b',  // amber
  liabilities: '#ef4444', // rose
};

export const FIN_GROUP_COLORS = {
  equity: '#10b981',    // emerald
  debt: '#0ea5e9',      // sky
  commodity: '#f59e0b', // amber
};

// Colours for asset-class group rows in the composition cards (keyed by group id)
export const GROUP_COLORS = {
  equity: '#10b981',        // emerald
  debt: '#0ea5e9',          // sky
  commodity: '#f59e0b',     // amber
  realEstate: '#f97316',    // orange
  preciousMetals: '#eab308',// gold
  secured: '#e11d48',       // rose-600
  unsecured: '#f43f5e',     // rose-500
  other: '#fb7185',         // rose-400
  loans: '#ef4444',         // rose (legacy single liability group)
};
export const CUSTOM_COLOR = '#94a3b8'; // slate — used for custom buckets

// Palette for per-item slices / bars within a holdings card
export const ITEM_PALETTE = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#3b82f6', '#a855f7', '#22c55e',
  '#eab308', '#06b6d4', '#f43f5e',
];

// ---------------------------------------------------------------------------
// Shape normalisation
// ---------------------------------------------------------------------------
export function emptyAllocation() {
  return {
    values: { financial: {}, physical: {}, liabilities: {} },
    custom: { financial: [], physical: [], liabilities: [] },
    remark: '',
    peRatio: '',
    history: [],
    updatedAt: null,
  };
}

// Coerce whatever is stored (possibly partial / legacy) into a complete shape
export function normalizeAllocation(a) {
  const base = emptyAllocation();
  if (!a || typeof a !== 'object') return base;
  SECTION_IDS.forEach(sid => {
    const v = a.values && a.values[sid];
    if (v && typeof v === 'object') {
      Object.entries(v).forEach(([k, amt]) => {
        const n = Number(amt);
        if (isFinite(n) && n > 0) base.values[sid][k] = n;
      });
    }
    const c = a.custom && Array.isArray(a.custom[sid]) ? a.custom[sid] : [];
    base.custom[sid] = c
      .map(x => ({ id: x.id || ('id_' + Math.random().toString(36).slice(2, 9)), label: String(x.label || '').trim(), amount: Number(x.amount) || 0, group: String(x.group || '') }))
      .filter(x => x.label && x.amount > 0);
  });
  base.remark = typeof a.remark === 'string' ? a.remark : '';
  base.peRatio = (typeof a.peRatio === 'string' || typeof a.peRatio === 'number') ? String(a.peRatio || '').trim() : '';
  base.history = Array.isArray(a.history) ? a.history : [];
  base.updatedAt = a.updatedAt || null;
  return base;
}

// ---------------------------------------------------------------------------
// Totals & derived figures
// ---------------------------------------------------------------------------
const sumObj = (obj) => Object.values(obj || {}).reduce((s, v) => s + (Number(v) || 0), 0);
const sumCustom = (arr) => (arr || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);

export function sectionTotal(alloc, sectionId) {
  const a = normalizeAllocation(alloc);
  return sumObj(a.values[sectionId]) + sumCustom(a.custom[sectionId]);
}

export function groupTotal(alloc, sectionId, groupId) {
  const a = normalizeAllocation(alloc);
  const section = getSection(sectionId);
  const group = section?.groups.find(g => g.id === groupId);
  if (!group) return 0;
  const standard = group.items.reduce((s, it) => s + (Number(a.values[sectionId][it.label]) || 0), 0);
  const custom = (a.custom[sectionId] || []).filter(x => x.group === groupId).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return standard + custom;
}

export function allocationTotals(alloc) {
  const a = normalizeAllocation(alloc);
  const financial = sectionTotal(a, 'financial');
  const physical = sectionTotal(a, 'physical');
  const liabilities = sectionTotal(a, 'liabilities');
  const totalAssets = financial + physical;
  const netWorth = totalAssets - liabilities;
  return {
    financial,
    physical,
    liabilities,
    totalAssets,
    netWorth,
    equity: groupTotal(a, 'financial', 'equity'),
    debt: groupTotal(a, 'financial', 'debt'),
    commodity: groupTotal(a, 'financial', 'commodity'),
  };
}

// Filled line items for a section (standard items with amount + custom rows),
// sorted high → low. Used to render holdings tables / bars.
export function filledItems(alloc, sectionId) {
  const a = normalizeAllocation(alloc);
  const items = [];
  const section = getSection(sectionId);
  section.groups.forEach(g => {
    g.items.forEach(it => {
      const amt = Number(a.values[sectionId][it.label]) || 0;
      if (amt > 0) items.push({ label: it.label, amount: amt, group: g.title, groupId: g.id, color: GROUP_COLORS[g.id] || CUSTOM_COLOR, isCustom: false });
    });
  });
  a.custom[sectionId].forEach(x => {
    if (x.amount > 0) items.push({ label: x.label, amount: x.amount, group: 'Custom', groupId: '__custom', color: CUSTOM_COLOR, isCustom: true });
  });
  return items.sort((x, y) => y.amount - x.amount);
}

// Filled items for one group (standard only) — for the financial sub-breakdowns
export function filledGroupItems(alloc, sectionId, groupId) {
  const a = normalizeAllocation(alloc);
  const section = getSection(sectionId);
  const group = section?.groups.find(g => g.id === groupId);
  if (!group) return [];
  const color = GROUP_COLORS[groupId] || CUSTOM_COLOR;
  return group.items
    .map(it => ({ label: it.label, amount: Number(a.values[sectionId][it.label]) || 0, color }))
    .filter(x => x.amount > 0)
    .sort((x, y) => y.amount - x.amount);
}

// Per-group columns for the allocation breakdown: each group with its filled
// entries (standard items + that group's custom rows), group total and colour.
// Custom rows that don't belong to any known group fall into a trailing
// "Custom Holdings" column so nothing the advisor entered is ever lost.
export function sectionGroupColumns(alloc, sectionId) {
  const a = normalizeAllocation(alloc);
  const section = getSection(sectionId);
  if (!section) return [];
  const groupIds = new Set(section.groups.map(g => g.id));
  const customFor = (gid) => (a.custom[sectionId] || [])
    .filter(x => x.group === gid && x.amount > 0)
    .map(x => ({ label: x.label, amount: x.amount, color: GROUP_COLORS[gid] || CUSTOM_COLOR, isCustom: true }));

  const cols = section.groups.map(g => {
    const items = [...filledGroupItems(a, sectionId, g.id), ...customFor(g.id)].sort((x, y) => y.amount - x.amount);
    return { id: g.id, title: g.title, color: GROUP_COLORS[g.id] || CUSTOM_COLOR, items, total: items.reduce((s, it) => s + it.amount, 0) };
  });

  const ungrouped = (a.custom[sectionId] || []).filter(x => x.amount > 0 && !groupIds.has(x.group)).sort((x, y) => y.amount - x.amount);
  if (ungrouped.length > 0) {
    cols.push({
      id: '__custom',
      title: 'Custom Holdings',
      color: CUSTOM_COLOR,
      items: ungrouped.map(x => ({ label: x.label, amount: x.amount, color: CUSTOM_COLOR, isCustom: true })),
      total: ungrouped.reduce((s, x) => s + x.amount, 0),
    });
  }
  return cols;
}

// Group-level composition for a section (e.g. Equity / Debt / Commodity for
// financial; Secured / Unsecured / Other for liabilities). Each group's amount
// includes both standard items and that group's custom rows. Any ungrouped
// custom rows roll into a combined "Custom Holdings" bucket. Zero rows dropped,
// sorted high → low; amounts always sum to the section total.
export function groupComposition(alloc, sectionId) {
  const a = normalizeAllocation(alloc);
  const section = getSection(sectionId);
  if (!section) return [];
  const groupIds = new Set(section.groups.map(g => g.id));
  const rows = section.groups
    .map(g => {
      const standard = g.items.reduce((s, it) => s + (Number(a.values[sectionId][it.label]) || 0), 0);
      const custom = (a.custom[sectionId] || []).filter(x => x.group === g.id).reduce((s, x) => s + (Number(x.amount) || 0), 0);
      return { id: g.id, label: g.title, amount: standard + custom, color: GROUP_COLORS[g.id] || CUSTOM_COLOR };
    })
    .filter(r => r.amount > 0);
  const ungrouped = (a.custom[sectionId] || []).filter(x => !groupIds.has(x.group)).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  if (ungrouped > 0) rows.push({ id: '__custom', label: 'Custom Holdings', amount: ungrouped, color: CUSTOM_COLOR });
  return rows.sort((x, y) => y.amount - x.amount);
}

// Does this client have any allocation data worth showing?
export function hasAllocation(client) {
  if (!client) return false;
  const a = normalizeAllocation(client.assetAllocation);
  const anyValue = SECTION_IDS.some(sid => sumObj(a.values[sid]) > 0 || a.custom[sid].length > 0);
  return anyValue || (a.remark || '').trim().length > 0;
}

// ---------------------------------------------------------------------------
// Edit-history diffing (mirrors buildGoalEdits in calc.js)
// ---------------------------------------------------------------------------
// Flatten an allocation into a single label -> amount map (standard + custom)
function flattenAllocation(alloc) {
  const a = normalizeAllocation(alloc);
  const flat = {};
  SECTION_IDS.forEach(sid => {
    Object.entries(a.values[sid]).forEach(([label, amt]) => {
      flat[label] = (flat[label] || 0) + (Number(amt) || 0);
    });
    a.custom[sid].forEach(x => {
      flat[x.label] = (flat[x.label] || 0) + (Number(x.amount) || 0);
    });
  });
  return flat;
}

export function buildAllocationEdits(prev, next) {
  const edits = [];
  const p = flattenAllocation(prev);
  const n = flattenAllocation(next);
  const keys = Array.from(new Set([...Object.keys(p), ...Object.keys(n)])).sort();
  keys.forEach(k => {
    const a = Number(p[k]) || 0;
    const b = Number(n[k]) || 0;
    if (a !== b) edits.push({ label: k, from: a ? fmtFull(a) : '—', to: b ? fmtFull(b) : '—' });
  });
  const pr = (prev && prev.remark) || '';
  const nr = (next && next.remark) || '';
  if (pr !== nr) edits.push({ label: 'Remark', from: pr || '—', to: nr || '—' });
  const pe1 = (prev && String(prev.peRatio || '').trim()) || '';
  const pe2 = (next && String(next.peRatio || '').trim()) || '';
  if (pe1 !== pe2) edits.push({ label: 'P/E Ratio', from: pe1 ? `${pe1}x` : '—', to: pe2 ? `${pe2}x` : '—' });
  return edits;
}

// Percentage of a part against a whole, formatted (e.g. "37.0%")
export function fmtPct(part, whole) {
  if (!whole || whole <= 0) return '0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}
