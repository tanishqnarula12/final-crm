// Others → Asset Taxation Guide: everything the guide shows. A read-only
// reference for the team, built from the owner's "Taxation on Investment
// Products FY25-26" material as given on 7 Oct 2026. Only what that material
// says is here — no rate, holding period, rule or wording may be changed or
// added without the owner's word.
//
// Each product's `outcomes` read as "held for → tax": `tag` is LTCG / STCG /
// All gains / Tax-Free, `held` the holding period, `rate` the tax, `detail` a
// condition on it. An STCG `held` the material leaves unsaid is simply the
// other side of that product's LTCG period. `facts` are extra labelled lines
// (a category, a maturity), `note` a one-line explanation, `glance` the
// "Special rule" cell of Taxation at a Glance, `aliases` extra search words.

export const TAX_GUIDE_FY = 'FY 2025-26';
export const TAX_GUIDE_SOURCE = 'Taxation on Investment Products FY25-26';
export const TAX_GUIDE_DISCLAIMER = 'This section is intended for internal knowledge and reference purposes. Tax rules may change over time. Please verify the applicable tax provisions before providing final tax guidance to a client.';
export const TAX_NOT_FOUND = 'Taxation information for this asset is currently not available in the knowledge base.';

export const SLAB = 'Income Tax Slab Rate';
const LAKH = 'On gains exceeding ₹1.25 lakh';
const LAKH_YEAR = 'On gains exceeding ₹1.25 lakh per year';
const ANY_PERIOD = 'Regardless of holding period';

const ltcg = (held, rate, detail) => ({ tag: 'LTCG', held, rate, ...(detail ? { detail } : {}) });
const stcg = (held, rate) => ({ tag: 'STCG', held, rate });
const allSlab = () => ({ tag: 'All gains', held: ANY_PERIOD, rate: SLAB });
const taxFree = (held, rate) => ({ tag: 'Tax-Free', held, rate });

// Category cards on the main page, in order.
export const TAX_SECTIONS = [
  {
    id: 'equity', short: 'Equity', title: 'Equity', subtitle: 'Listed Shares & Equity Mutual Funds', icon: 'equity',
    remember: [['Equity MF', '> 12 Months → LTCG', '≤ 12 Months → STCG']],
    products: [{
      id: 'equity', name: 'Listed Shares & Equity Mutual Funds',
      aliases: ['equity mutual fund', 'equity mf', 'equity fund', 'equity shares', 'shares', 'listed shares'],
      outcomes: [stcg('12 months or less', '20%'), ltcg('More than 12 months', '12.5%', LAKH_YEAR)],
      glance: 'LTCG applies on gains exceeding ₹1.25 lakh per year. Grandfathering (31 January 2018) applies.',
    }],
  },
  {
    id: 'debt', short: 'Debt MF', title: 'Debt Mutual Funds', subtitle: 'Taxation depends on when the investment was made', icon: 'debt',
    firstCheck: 'First check: was the investment made before 1 April 2023, or on / after 1 April 2023?',
    remember: [['Debt MF', 'First check whether the investment was made before or on / after 1 April 2023.']],
    layout: 'dates',
    products: [
      {
        id: 'debt-before', name: 'Debt Mutual Funds', when: 'Investment before 1 April 2023',
        aliases: ['debt fund', 'debt mf', 'debt mutual fund'],
        outcomes: [stcg('24 months or less', SLAB), ltcg('More than 24 months', '12.5%')],
        glance: 'Only for investments made before 1 April 2023.',
      },
      {
        id: 'debt-after', name: 'Debt Mutual Funds', when: 'Investment on or after 1 April 2023',
        aliases: ['debt fund', 'debt mf', 'debt mutual fund'],
        outcomes: [allSlab()],
        note: 'All gains are taxed at the Income Tax Slab Rate. This applies regardless of the holding period.',
        glance: 'For investments made on or after 1 April 2023.',
      },
    ],
  },
  {
    id: 'gold', short: 'Gold', title: 'Gold Investments', subtitle: 'Physical / Digital Gold, Gold ETFs and Gold Mutual Funds', icon: 'gold',
    firstCheck: 'First identify: is it Physical / Digital Gold, a Gold ETF or a Gold Mutual Fund?',
    remember: [['Gold', 'First identify whether it is Physical Gold, Gold ETF or Gold Mutual Fund.']],
    products: [
      {
        id: 'gold-physical', name: 'Physical Gold / Digital Gold',
        aliases: ['physical gold', 'digital gold'],
        outcomes: [stcg('24 months or less', SLAB), ltcg('More than 24 months', '12.5% without indexation')],
      },
      {
        id: 'gold-etf', name: 'Gold ETFs',
        aliases: ['gold etf'],
        outcomes: [stcg('12 months or less', SLAB), ltcg('More than 12 months', '12.5%')],
      },
      {
        id: 'gold-mf', name: 'Gold Mutual Funds',
        aliases: ['gold mutual fund', 'gold mf', 'gold fund'],
        outcomes: [stcg('24 months or less', SLAB), ltcg('More than 24 months', '12.5%')],
      },
    ],
  },
  {
    id: 'fof', short: 'FoF', title: 'Fund of Funds (FoF)', subtitle: 'Domestic equity-oriented vs International / Debt-oriented', icon: 'fof',
    products: [
      {
        id: 'fof-equity', name: 'Domestic FoF – Equity Oriented', badge: 'Equity-Oriented',
        aliases: ['fof', 'fund of funds', 'domestic fof', 'equity fof'],
        outcomes: [stcg('12 months or less', '20%'), ltcg('More than 12 months', '12.5%', LAKH_YEAR)],
        glance: 'LTCG applies on gains exceeding ₹1.25 lakh per year.',
      },
      {
        id: 'fof-intl', name: 'International FoF / Debt-Oriented FoF',
        aliases: ['fof', 'fund of funds', 'international fof', 'debt fof'],
        outcomes: [stcg('24 months or less', SLAB), ltcg('More than 24 months', '12.5%')],
      },
    ],
  },
  {
    id: 'hybrid', short: 'Hybrid', title: 'Hybrid Funds', subtitle: 'Taxation differs according to fund structure / equity exposure', icon: 'hybrid',
    firstCheck: 'Taxation differs according to the fund’s structure / equity exposure — find the fund type below.',
    products: [
      {
        id: 'baf', name: 'Balanced Advantage Fund / Dynamic Asset Allocation', badge: 'Usually Equity-Oriented',
        aliases: ['baf', 'balanced advantage', 'dynamic asset allocation'],
        note: 'Most BAFs maintain more than 65% equity to qualify for equity taxation benefits.',
        outcomes: [stcg('12 months or less', '20%'), ltcg('More than 12 months', '12.5%', LAKH)],
        glance: 'Usually equity-oriented (most keep more than 65% equity). LTCG on gains exceeding ₹1.25 lakh.',
      },
      {
        id: 'multi-asset', name: 'Multi Asset Allocation Fund', badge: 'Depends on equity exposure',
        aliases: ['multi asset'],
        note: 'Taxation depends on equity exposure.',
        cases: [
          { id: 'gt65', when: 'Equity more than 65%', label: 'Taxed as Equity', outcomes: [stcg('12 months or less', '20%'), ltcg('More than 12 months', '12.5%')], glance: 'Equity more than 65% — taxed as Equity.' },
          { id: '35to65', when: 'Equity 35% to 65%', label: 'LTCG after 24 months / otherwise slab', outcomes: [stcg('24 months or less', SLAB), ltcg('More than 24 months', '12.5%')], glance: 'Equity 35% to 65%.' },
          { id: 'lt35', when: 'Equity less than 35%', label: 'Taxed like Debt', outcomes: [allSlab()], glance: 'Equity less than 35% — taxed like Debt.' },
        ],
      },
      {
        id: 'arbitrage', name: 'Arbitrage Fund', badge: 'Equity-Oriented',
        aliases: ['arbitrage'],
        outcomes: [stcg('12 months or less', '20%'), ltcg('More than 12 months', '12.5%', LAKH)],
        glance: 'Equity-oriented. LTCG on gains exceeding ₹1.25 lakh.',
      },
      {
        id: 'conservative-hybrid', name: 'Conservative Hybrid Fund', badge: 'Non-Equity / Specified Mutual Fund',
        aliases: ['conservative hybrid'],
        note: 'These typically hold 10%–25% equity. Holding period does not change the taxation treatment.',
        outcomes: [allSlab()],
        glance: 'Non-Equity / Specified Mutual Fund (typically 10%–25% equity).',
      },
      {
        id: 'aggressive-hybrid', name: 'Equity Hybrid / Aggressive Hybrid Fund', badge: 'Equity-Oriented',
        aliases: ['aggressive hybrid', 'equity hybrid'],
        note: 'These maintain approximately 65%–80% equity.',
        outcomes: [stcg('12 months or less', '20%'), ltcg('More than 12 months', '12.5%', LAKH)],
        glance: 'Equity-oriented (approx. 65%–80% equity). LTCG on gains exceeding ₹1.25 lakh.',
      },
    ],
  },
  {
    id: 'bonds', short: 'Bonds', title: 'Bonds & Debentures', subtitle: 'Listed vs Unlisted', icon: 'bonds',
    firstCheck: 'First check: is the bond / debenture listed or unlisted?',
    products: [
      {
        id: 'bonds-listed', name: 'Listed Bonds / Debentures – Taxable', badge: 'Listed',
        includes: ['Corporate Bonds', 'Government Securities (G-Secs) listed on exchanges'],
        aliases: ['bonds', 'debentures', 'listed bonds', 'corporate bonds', 'g-sec', 'gsec', 'government securities'],
        outcomes: [stcg('12 months or less', SLAB), ltcg('More than 12 months', '12.5% without indexation')],
        glance: 'Corporate Bonds and G-Secs listed on exchanges.',
      },
      {
        id: 'bonds-unlisted', name: 'Unlisted Bonds / Debentures', badge: 'Unlisted',
        aliases: ['bonds', 'debentures', 'unlisted bonds', 'section 50aa', '50aa'],
        note: 'Treated as “Specified Mutual Funds” under Section 50AA if sold / redeemed after 23 July 2024.',
        outcomes: [allSlab()],
        glance: '“Specified Mutual Funds” under Section 50AA if sold / redeemed after 23 July 2024.',
      },
    ],
  },
  {
    id: 'sgb', short: 'SGB', title: 'Sovereign Gold Bonds (SGB)', subtitle: 'Taxation depends on how the investment is exited', icon: 'sgb',
    firstCheck: 'First identify HOW it is being redeemed / sold: through RBI, or on the stock exchange?',
    remember: [['SGB', 'First identify HOW it is being redeemed / sold.']],
    layout: 'sgb',
    products: [
      {
        id: 'sgb-maturity', name: 'SGB – Redemption at Maturity', group: 'rbi', badge: 'RBI Redemption',
        aliases: ['sgb', 'sovereign gold bond', 'sgb maturity', 'tax free'],
        facts: [['Maturity', '8 Years']],
        outcomes: [taxFree('At maturity (8 years)', 'Fully Tax-Free for Individuals')],
        glance: 'Maturity: 8 years.',
      },
      {
        id: 'sgb-rbi', name: 'SGB – Premature Redemption through RBI', group: 'rbi', badge: 'RBI Redemption',
        aliases: ['sgb', 'sovereign gold bond', 'sgb premature', 'rbi', 'tax free'],
        facts: [['After', '5 Years']],
        outcomes: [taxFree('After 5 years', 'Fully Tax-Free')],
        glance: 'Premature redemption through RBI, after 5 years.',
      },
      {
        id: 'sgb-exchange', name: 'SGB – Sale on Stock Exchange', group: 'exchange', badge: 'Stock Exchange Sale',
        aliases: ['sgb', 'sovereign gold bond', 'sgb sale', 'stock exchange'],
        outcomes: [stcg('12 months or less', SLAB), ltcg('More than 12 months', '12.5%')],
        glance: 'Sold on the stock exchange (not redeemed through RBI).',
      },
    ],
  },
];

// Learn: Grandfathering
export const GRANDFATHERING = {
  oneLiner: 'Grandfathering means old profits are protected when tax rules change.',
  appliesTo: ['Equity Shares', 'Equity Mutual Funds'],
  date: '31 January 2018',
  purpose: 'Its purpose was to protect profits accumulated before the taxation rule changed.',
  example: {
    bought: '2016', product: 'Equity Mutual Fund',
    invested: 100000, valueOnDate: 180000, saleValue: 250000,
  },
  contrast: [
    ['Equity', 'Grandfathering'],
    ['Debt / Gold / Property', 'Earlier associated with Indexation, not Grandfathering'],
  ],
};

// Learn: Stamp Duty vs STT — rows of [label, stamp duty, STT]; a list is an array.
export const STAMP_VS_STT = {
  rows: [
    ['When charged', ['On Purchase', 'e.g. Lumpsum, SIP, STP, etc.'], ['On Redemption / Sale / Exit']],
    ['Applicable on', ['All Mutual Funds', 'Equity, Debt, Hybrid'], ['Equity-Oriented Funds only']],
    ['Rate', ['0.005%'], ['0.001%']],
    ['Exemption', ['No Stamp Duty on Redemption'], ['No STT on Debt or Liquid Funds']],
    ['Calculated on', ['Total investment amount'], ['Total redemption / sale value']],
  ],
};

export const REMEMBER_MAIN = TAX_SECTIONS.flatMap((s) => s.remember || []);

// ---------------------------------------------------------------------------
// Search — only over what the guide holds; nothing is ever made up.
// ---------------------------------------------------------------------------
const words = (s) => String(s || '').toLowerCase()
  .replace(/[‘’“”]/g, '')
  .split(/[^a-z0-9%.]+/)
  .map((w) => w.replace(/^\.+|\.+$/g, ''))
  .filter(Boolean)
  .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
const norm = (s) => words(s).join(' ');
const outcomeText = (o) => [o.tag, o.held, o.rate, o.detail].join(' ');

// Every searchable entry: the products, the two Learn topics and the glance table.
const ENTRIES = [
  ...TAX_SECTIONS.flatMap((s) => s.products.map((p) => ({
    type: 'product', sectionId: s.id, productId: p.id, title: p.name, sub: p.when || '', section: s.title,
    strong: [p.name, ...(p.aliases || [])],
    near: [p.name, p.when, s.title, s.short, ...(p.aliases || [])],
    all: [p.name, p.when, s.title, s.short, s.subtitle, p.badge, p.note, ...(p.aliases || []), ...(p.includes || []),
      ...(p.facts || []).flat(), ...(p.outcomes || []).map(outcomeText),
      ...(p.cases || []).flatMap((c) => [c.when, c.label, ...c.outcomes.map(outcomeText)])],
  }))),
  {
    type: 'learn', sectionId: 'grandfathering', title: 'What is Grandfathering?', section: 'Learn',
    strong: ['grandfathering', 'grandfather'],
    near: ['grandfathering', '31 January 2018', 'old profits protected'],
    all: ['grandfathering', GRANDFATHERING.oneLiner, GRANDFATHERING.date, ...GRANDFATHERING.appliesTo, 'indexation'],
  },
  {
    type: 'learn', sectionId: 'stamp-stt', title: 'Stamp Duty', sub: 'Charged on purchase · 0.005%', section: 'Learn',
    strong: ['stamp duty', 'stamp'],
    near: ['stamp duty', 'purchase', 'lumpsum', 'sip', 'stp'],
    all: ['stamp duty', ...STAMP_VS_STT.rows.flatMap((r) => [r[0], ...r[1]])],
  },
  {
    type: 'learn', sectionId: 'stamp-stt', title: 'Securities Transaction Tax (STT)', sub: 'Charged on redemption / sale / exit · 0.001%', section: 'Learn',
    strong: ['stt', 'securities transaction tax'],
    near: ['stt', 'securities transaction tax', 'redemption', 'sale', 'exit'],
    all: ['stt securities transaction tax', ...STAMP_VS_STT.rows.flatMap((r) => [r[0], ...r[2]])],
  },
  {
    type: 'glance', sectionId: 'glance', title: 'Taxation at a Glance', sub: 'Compare every product’s LTCG / STCG side by side', section: 'Compare',
    strong: ['taxation at a glance', 'glance', 'compare', 'comparison'],
    near: ['taxation at a glance', 'compare', 'ltcg', 'stcg', 'holding period', 'long term capital gain', 'short term capital gain', 'tax rate'],
    all: ['taxation at a glance compare ltcg stcg holding period slab rate capital gain'],
  },
].map((e) => ({ ...e, strongN: e.strong.map(norm), nearW: words(e.near.join(' ')), allW: words(e.all.join(' ')) }));

const everyWordIn = (q, pool) => q.every((w) => pool.some((p) => p.startsWith(w)));

// Entries matching `query`, best first: the query names the entry (3), every
// word is in its name / section (2), or somewhere in what it says (1). The
// passing mentions (1) are left out when anything matched better.
export function searchTaxGuide(query) {
  const q = words(query);
  if (!q.length) return [];
  const phrase = q.join(' ');
  const found = ENTRIES
    .map((e, i) => {
      let score = 0;
      if (e.strongN.some((s) => ` ${s} `.includes(` ${phrase} `) || ` ${phrase} `.includes(` ${s} `))) score = 3;
      else if (everyWordIn(q, e.nearW)) score = 2;
      else if (everyWordIn(q, e.allW)) score = 1;
      return { ...e, score, i };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  return found.length && found[0].score > 1 ? found.filter((e) => e.score > 1) : found;
}
