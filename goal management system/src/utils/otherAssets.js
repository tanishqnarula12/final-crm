// Servicing → Other Assets (1 Oct 2026): assets an applicant owns that the
// Mutual Fund / Insurance modules don't already capture.
//
// Group Leader → Applicant → Other Asset → Category → Sub-Type → Details.
// Each record is a Task row (relatedTo 'OTHER_ASSET'), like every Servicing
// register, so it rides the existing sync / RBAC / activity log / Recently
// deleted; utils/tasks.js keeps these rows out of every task list.
//
// The assets feed each client's Asset Allocation and goal Map Asset
// automatically (effectiveAllocation below): every asset shows there as its
// own line ("Public Provident Fund (PPF) · Kritika Khandelwal") in its real
// group, read-only, counted in the totals. Nothing is copied into the stored
// allocation — Other Assets stay the single source, so there is nothing to
// re-enter and nothing to drift apart.
import { ASSET_SCHEMA, normalizeAllocation } from './assets';
import { loadOtherAssets } from './tasks';

export const OTHER_ASSET = 'OTHER_ASSET';
export const isOtherAsset = (t) => t?.relatedTo === OTHER_ASSET;

export const ASSET_CATEGORIES = [
  { id: 'financial', label: 'Financial Asset' },
  { id: 'physical', label: 'Physical Asset' },
];
export const categoryLabel = (id) => ASSET_CATEGORIES.find((c) => c.id === id)?.label || '—';

// Asset Allocation's own line items, to place each sub-type in its group.
// Labels match theirs (apostrophes aside: "Silver ETFs" ↔ "Silver ETF's").
const norm = (s) => String(s || '').toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ').trim();
const schemaItem = (sectionId, label) => {
  const section = ASSET_SCHEMA.find((s) => s.id === sectionId);
  for (const g of section?.groups || []) {
    const it = g.items.find((i) => norm(i.label) === norm(label));
    if (it) return { group: g.id, groupTitle: g.title, hint: it.hint || '' };
  }
  return { group: '', groupTitle: '', hint: '' };
};

// The owner's list, in the owner's order. "Other Code Mutual Fund" (funds held
// under another distributor's code) has no Asset Allocation line of its own,
// so it shows there among the other holdings.
const FINANCIAL = [
  'Stocks / Shares', 'Other Code Mutual Fund', 'Equity ETFs', 'Debt ETFs', 'NPS', 'Savings Account',
  'Bonds & Debentures', 'Public Provident Fund (PPF)', "Employees' Provident Fund (EPF)",
  'Government Securities (G-Secs)', 'National Savings Certificate (NSC)', 'Treasury Bills (T-Bills)',
  'Cash & Bank Balance', 'Sovereign Gold Bonds (SGBs)', 'Gold ETFs', 'Silver ETFs',
];
const PHYSICAL = ASSET_SCHEMA.find((s) => s.id === 'physical').groups.flatMap((g) => g.items.map((i) => i.label));

export const SUB_TYPES = {
  financial: FINANCIAL.map((label) => ({ label, ...schemaItem('financial', label) })),
  physical: PHYSICAL.map((label) => ({ label, ...schemaItem('physical', label) })),
};
export const subTypesFor = (category) => SUB_TYPES[category] || [];
export const subTypeInfo = (category, label) => subTypesFor(category).find((s) => s.label === label) || null;

// A group leader's applicants: themself (Self) plus every named family member,
// each with its relation and PAN — the same list ClientApplicantFields offers.
export const applicantsOf = (client) => {
  if (!client) return [];
  const list = [{ name: client.name, relation: 'Self', pan: client.pan || '' }];
  (client.clientDetails?.familyDetails || []).forEach((m) => {
    if (m.name) list.push({ name: m.name, relation: m.relation || 'Member', pan: m.pan || '' });
  });
  return list;
};

// "Public Provident Fund (PPF)" → "PPF" for messages; other labels as they are.
export const assetShortName = (label) => {
  const m = String(label || '').match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : String(label || '');
};

// ONE APPLICANT = ONE ENTRY PER ASSET SUB-TYPE (Group Leader + Applicant +
// Sub-Type). `referenceNumber` (account / folio / demat id) is part of the
// key so several holdings of one type can be allowed later just by filling
// it in; it is always empty today. Mirrors assetKey in server routes/tasks.js.
export const assetDupKey = (r) => [
  r.groupLeaderId, String(r.applicant || '').trim().toLowerCase(), r.assetSubType, String(r.referenceNumber || '').trim().toLowerCase(),
].join('|');
export const findDuplicateAsset = (candidate, assets = loadOtherAssets()) =>
  assets.find((a) => a.id !== candidate.id && assetDupKey(a) === assetDupKey(candidate)) || null;

// Indian-rupee display, e.g. 800000 → "₹8,00,000".
export const fmtRupees = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' && v != null ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—';
};
// "2026-10-01" → "01-10-2026".
export const fmtDmy = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '—';
};

// ---------------------------------------------------------------------------
// Asset Mapping / Goal & Asset Tracking feed
// ---------------------------------------------------------------------------
let byClientFor = null; let byClient = new Map();
// Assets grouped by group-leader client id (recomputed only when the list changes).
export function otherAssetsByClient() {
  const list = loadOtherAssets();
  if (list !== byClientFor) {
    byClient = new Map();
    list.forEach((a) => {
      if (!a.groupLeaderId) return;
      if (!byClient.has(a.groupLeaderId)) byClient.set(a.groupLeaderId, []);
      byClient.get(a.groupLeaderId).push(a);
    });
    byClientFor = list;
  }
  return byClient;
}
export const otherAssetsForClient = (clientId) => (clientId && otherAssetsByClient().get(clientId)) || [];

// The client's allocation as the advisor entered it, plus one read-only line
// per Other Asset. For display, totals and goal mapping only — never save it.
export function withOtherAssets(allocation, assets) {
  const a = normalizeAllocation(allocation);
  (assets || []).forEach((x) => {
    const amount = Number(x.amount) || 0;
    if (amount <= 0 || !a.custom[x.assetCategory]) return;
    a.custom[x.assetCategory].push({
      id: `oa:${x.id}`,
      label: `${x.assetSubType} · ${x.applicant}`,
      amount,
      group: subTypeInfo(x.assetCategory, x.assetSubType)?.group || '',
      source: 'otherAssets',
      assetId: x.id,
    });
  });
  return a;
}
export const effectiveAllocation = (client) => {
  const assets = otherAssetsForClient(client?.id);
  return assets.length ? withOtherAssets(client?.assetAllocation, assets) : client?.assetAllocation;
};
// A copy of the client whose assetAllocation includes its Other Assets — for
// read-only screens (Asset Allocation, client list, documents, dashboard).
export const withEffectiveAllocation = (client) => {
  if (!client) return client;
  const alloc = effectiveAllocation(client);
  return alloc === client.assetAllocation ? client : { ...client, assetAllocation: alloc };
};
