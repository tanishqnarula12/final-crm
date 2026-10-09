// Reads a proposal PDF that this CRM generated (Print / Save PDF) back into
// the proposal form's own shape, so a pre-existing proposal can be uploaded
// and edited instead of retyped. Pure functions over the PDF's positioned
// text — no PDF library here (proposalPdf.js does the reading), so this can
// be tested on its own.
//
// How it reads a table: the printed proposal is built from HTML tables, so
// every table has a header row whose first column is "#" / "S.No", every
// body row starts with its number in that column, and every cell prints
// something ("—" / "-" for blank). Columns come from the header's positions;
// rows from the row numbers. A wrapped cell (a long scheme name over two
// lines) is vertically centred on its row's number, which is how its lines
// are matched to the right row. Every table is then checked — numbers run
// 1, 2, 3…, no cell came out empty, and printed TOTALs equal the sum of the
// rows read — and anything that doesn't check out is reported, never
// silently filled in.

// ---- text items → fragments → lines ---------------------------------------

// One page of pdf.js getTextContent() output → { width, height, items }.
export function pageFromTextContent(textContent, width, height) {
  const items = [];
  textContent.items.forEach((it) => {
    if (!it || typeof it.str !== 'string' || !it.transform) return;
    const [, , c, d, e, f] = it.transform;
    items.push({ str: it.str, x0: e, x1: e + (it.width || 0), y: height - f, size: Math.hypot(c, d) || it.height || 0 });
  });
  return { width, height, items };
}

// Letters and digits only (plus "#"), upper-cased: the printed headers and
// labels use letter-spacing and upper-casing, which the PDF's text keeps as
// "S . N O" / "B A S E C O V E R".
export const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9#]/g, '');

// pages: [{ width, height, items: [{ str, x0, x1, y, size }] }] — y is the
// text baseline measured down from the top of the page.
export function buildLines(pages) {
  const frags = [];
  let offset = 0;
  pages.forEach((pg, pageIndex) => {
    const items = pg.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ ...it, page: pageIndex, yAbs: it.y + offset }))
      .sort((a, b) => a.y - b.y || a.x0 - b.x0);
    // Same baseline + close together = one piece of text (a "₹" and its
    // figure, a "⚠" badge and its "Yes", the words of a letter-spaced
    // heading). Different table cells are always further apart than this.
    const used = new Set();
    items.forEach((it, i) => {
      if (used.has(i)) return;
      used.add(i);
      const group = [it];
      let last = it;
      for (;;) {
        let best = -1;
        for (let j = 0; j < items.length; j++) {
          if (used.has(j)) continue;
          const c = items[j];
          const tol = Math.max(1.2, 0.3 * Math.min(c.size, last.size));
          if (Math.abs(c.y - last.y) > tol && Math.abs(c.y - it.y) > tol) continue;
          const gap = c.x0 - last.x1;
          if (gap < -0.5 * last.size || gap > 0.9 * Math.max(c.size, last.size)) continue;
          if (best < 0 || c.x0 < items[best].x0) best = j;
        }
        if (best < 0) break;
        used.add(best);
        group.push(items[best]);
        last = items[best];
      }
      let text = '';
      group.forEach((g, gi) => {
        if (gi === 0) { text = g.str; return; }
        const gap = g.x0 - group[gi - 1].x1;
        const needsSpace = gap > 0.15 * g.size && !/\s$/.test(text) && !/^\s/.test(g.str);
        text += (needsSpace ? ' ' : '') + g.str;
      });
      frags.push({
        text: text.replace(/\s+/g, ' ').trim(),
        x0: group[0].x0,
        x1: Math.max(...group.map((g) => g.x1)),
        y: it.y,
        yAbs: it.yAbs,
        size: Math.max(...group.map((g) => g.size)),
        page: pageIndex,
        pw: pg.width,
      });
    });
    offset += pg.height;
  });

  frags.sort((a, b) => a.yAbs - b.yAbs || a.x0 - b.x0);
  const lines = [];
  frags.forEach((f) => {
    const line = lines[lines.length - 1];
    if (line && line.page === f.page && Math.abs(f.yAbs - line.yAbs) <= 0.35 * Math.max(f.size, line.size)) {
      line.frags.push(f);
      line.size = Math.max(line.size, f.size);
    } else {
      lines.push({ yAbs: f.yAbs, page: f.page, size: f.size, frags: [f] });
    }
  });
  // Sizes are compared relative to the document's usual text size, so a PDF
  // printed at another scale reads the same.
  const sizes = frags.map((f) => f.size).sort((a, b) => a - b);
  const typical = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 1;
  lines.forEach((l) => {
    l.frags.sort((a, b) => a.x0 - b.x0);
    l.text = l.frags.map((f) => f.text).join(' ');
    l.key = norm(l.text);
    l.x0 = l.frags[0].x0;
    l.x1 = Math.max(...l.frags.map((f) => f.x1));
    l.rel = l.size / typical;
    l.frags.forEach((f) => { f.rel = f.size / typical; });
  });
  return lines;
}

// The running header/footer every printed page repeats, and anything below a
// page's footer, carry no form data.
export function dropPageFurniture(lines) {
  const footerTop = {};
  lines.forEach((l) => {
    if (/^(THISDOCUMENTISCONFIDENTIAL|THISPROPOSALISPREPAREDFORDISCUSSION)/.test(l.key)) {
      if (footerTop[l.page] === undefined || l.yAbs < footerTop[l.page]) footerTop[l.page] = l.yAbs;
    }
  });
  return lines.filter((l) => {
    if (footerTop[l.page] !== undefined && l.yAbs >= footerTop[l.page] - 0.5) return false;
    if (l.key === 'TEAMFINTNESS' || l.key === 'INVESTMENTADVISORY') return false;
    if (/^INSURANCEPROPOSAL./.test(l.key)) return false; // "INSURANCE PROPOSAL · NAME"
    return true;
  });
}

// ---- tables ---------------------------------------------------------------

const isHash = (f) => f.text.replace(/\s/g, '') === '#' || norm(f.text) === 'SNO';
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Every table header in the document: the leftmost "#" / "S.No" heading of
// a run of small, equal-sized heading text, with its column groups.
function findHeaders(lines) {
  const headers = [];
  lines.forEach((line, li) => {
    line.frags.forEach((f) => {
      if (!isHash(f)) return;
      const hs = f.size;
      const sameSize = (l) => l.frags.every((g) => near(g.size, hs, 0.3));
      if (!sameSize(line)) return;
      // The heading row: this line plus the wrapped heading lines just above
      // and below it (headings are vertically centred too).
      let a = li;
      let b = li;
      while (a > 0 && sameSize(lines[a - 1]) && lines[a - 1].page === line.page && lines[a].yAbs - lines[a - 1].yAbs < 2.2 * hs) a--;
      while (b < lines.length - 1 && sameSize(lines[b + 1]) && lines[b + 1].page === line.page && lines[b + 1].yAbs - lines[b].yAbs < 2.2 * hs) b++;
      const frags = [];
      for (let k = a; k <= b; k++) frags.push(...lines[k].frags);
      if (frags.some((g) => g !== f && g.x0 < f.x0 - 1)) return; // a "#" inside "# SHIPMENTS"
      if (headers.some((h) => h.first <= li && h.last >= li)) return;
      headers.push({ first: a, last: b, size: hs, hash: f, columns: groupColumns(frags) });
    });
  });
  return headers;
}

// Heading pieces that overlap horizontally, or share a left or right edge,
// are one column ("DATE OF" over "BIRTH", right-aligned "AMOUNT" over "(RS)").
function groupColumns(frags) {
  const groups = [];
  [...frags].sort((p, q) => p.x0 - q.x0).forEach((f) => {
    const g = groups.find((c) => c.some((h) => (f.x0 < h.x1 - 0.5 && f.x1 > h.x0 + 0.5) || near(f.x0, h.x0, 1.5) || near(f.x1, h.x1, 1.5)));
    if (g) g.push(f); else groups.push([f]);
  });
  return groups
    .map((g) => {
      const sorted = [...g].sort((p, q) => p.yAbs - q.yAbs || p.x0 - q.x0);
      return {
        label: sorted.map((h) => h.text).join(' '),
        key: sorted.map((h) => norm(h.text)).join(''),
        x0: Math.min(...g.map((h) => h.x0)),
        x1: Math.max(...g.map((h) => h.x1)),
      };
    })
    .sort((p, q) => p.x0 - q.x0);
}

const sameColumns = (a, b) => a.length === b.length && a.every((c, i) => c.key === b[i].key);

const isInt = (f) => /^\d{1,3}$/.test(f.text);
export const isTotalLine = (l) => l.frags.some((f) => f.text === 'TOTAL');

// Reads every table. `isStop(line)` says whether a line ends a table body
// (a section title, a TOTAL row, a remarks box…); so does any text bigger
// than the table's own. Returns
// [{ first, last, columns, rows: [{ n, cells: [string[] lines per column] }], totalLine }].
export function readTables(lines, { isStop, rightAligned = () => false }) {
  const headers = findHeaders(lines);
  const tables = [];
  let h = 0;
  while (h < headers.length) {
    const head = headers[h];
    const firstNo = lines.slice(head.last + 1, head.last + 8)
      .flatMap((l) => l.frags).find((f) => isInt(f) && near(f.x0, head.hash.x0, 3));
    const bodySize = firstNo ? firstNo.size : head.size * 1.3;
    const stops = (l) => isStop(l) || l.frags.some((f) => f.size > bodySize * 1.12);

    // The body runs until a stop line or the next table's header — unless
    // that header is this table's own, repeated at the top of the next page.
    const body = [];
    let k = head.last + 1;
    let next = h + 1;
    for (;;) {
      while (k < lines.length && !(next < headers.length && k === headers[next].first) && !stops(lines[k])) body.push(lines[k++]);
      const cont = next < headers.length && k === headers[next].first
        && sameColumns(headers[next].columns, head.columns)
        && lines[k].page !== (body.length ? body[body.length - 1].page : lines[head.last].page);
      if (!cont) break;
      k = headers[next].last + 1;
      next++;
    }
    // A table followed straight by another table's header with only a
    // numbered name line between them (a Term Life insured's heading in an
    // older print, the same size as the table text): that line isn't a row.
    if (next < headers.length && k === headers[next].first && body.length) {
      const l = body[body.length - 1];
      if (l.frags.length === 2 && isInt(l.frags[0])) body.pop();
    }
    const totalLine = k < lines.length && isTotalLine(lines[k]) ? lines[k] : null;
    const last = body.length ? lines.indexOf(body[body.length - 1]) : head.last;
    tables.push({ first: head.first, last, head, columns: head.columns, ...readBody(body, head, rightAligned), totalLine });
    h = next;
  }
  return tables;
}

function columnOf(frag, columns, rightAligned) {
  let best = 0;
  let bestD = Infinity;
  columns.forEach((c, i) => {
    const d = rightAligned(c.key) ? Math.abs(frag.x1 - c.x1) : Math.abs(frag.x0 - c.x0);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

function readBody(bodyLines, head, rightAligned) {
  const columns = head.columns;
  const hashCol = 0;
  // Row numbers: whole numbers in the "#" column.
  let anchors = [];
  const rest = [];
  bodyLines.forEach((l) => l.frags.forEach((f) => {
    const col = columnOf(f, columns, rightAligned);
    if (col === hashCol && isInt(f)) anchors.push(f);
    else rest.push({ f, col });
  }));
  anchors.sort((a, b) => a.yAbs - b.yAbs);
  if (anchors.length) {
    const size = anchors[0].size;
    anchors.filter((a) => !near(a.size, size, 0.35)).forEach((f) => rest.push({ f, col: hashCol }));
    anchors = anchors.filter((a) => near(a.size, size, 0.35));
  }
  const problems = [];
  anchors.forEach((a, i) => { if (Number(a.text) !== i + 1) problems.push('row numbers'); });
  const rows = anchors.map((a) => ({ n: Number(a.text), center: a.yAbs - 0.33 * a.size, page: a.page, cells: columns.map(() => []), clipped: columns.map(() => false) }));
  if (!rows.length) return { rows, problems: bodyLines.length ? ['no rows'] : [] };

  // Each column's lines, top to bottom, split into consecutive runs — one
  // run per row — so that each run is centred on its row's number.
  for (let c = 0; c < columns.length; c++) {
    if (c === hashCol) continue;
    const pieces = rest.filter((p) => p.col === c).map((p) => p.f).sort((a, b) => a.yAbs - b.yAbs || a.x0 - b.x0);
    const cl = [];
    pieces.forEach((p) => {
      const last = cl[cl.length - 1];
      if (last && last.page === p.page && Math.abs(p.yAbs - last.yAbs) <= 0.35 * Math.max(p.size, last.size)) {
        last.text += ' ' + p.text;
        last.size = Math.max(last.size, p.size);
        last.x1 = Math.max(last.x1, p.x1);
      } else cl.push({ ...p });
    });
    const assign = partition(cl, rows);
    assign.forEach((group, r) => {
      rows[r].cells[c] = group.map((g) => g.text);
      // Older prints let a long value run off the page edge, where the PDF
      // simply doesn't have the rest of it.
      rows[r].clipped[c] = group.some((g) => g.x1 > g.pw + 0.5);
    });
  }
  rows.forEach((r) => {
    r.cells[hashCol] = [String(r.n)];
    r.cells.forEach((cell, c) => { if (!cell.length) problems.push(`empty ${columns[c].label}`); });
  });
  return { rows, problems };
}

// Splits a column's lines (in order) into one consecutive run per row so the
// runs' centres sit as close as possible to the rows' centres.
function partition(cl, rows) {
  const n = rows.length;
  const m = cl.length;
  const center = (k, i) => {
    const a = cl[k];
    const b = cl[i - 1];
    if (a.page !== b.page) return Infinity;
    return ((a.yAbs - 0.33 * a.size) + (b.yAbs - 0.33 * b.size)) / 2;
  };
  const EMPTY = 1e6;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
  const from = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(-1));
  dp[0][0] = 0;
  for (let j = 1; j <= n; j++) {
    for (let i = 0; i <= m; i++) {
      if (dp[j - 1][i] + EMPTY < dp[j][i]) { dp[j][i] = dp[j - 1][i] + EMPTY; from[j][i] = i; }
      for (let k = 0; k < i; k++) {
        if (dp[j - 1][k] === Infinity) continue;
        const cost = dp[j - 1][k] + Math.abs(center(k, i) - rows[j - 1].center);
        if (cost < dp[j][i]) { dp[j][i] = cost; from[j][i] = k; }
      }
    }
  }
  const groups = new Array(n);
  let i = m;
  for (let j = n; j >= 1; j--) {
    const k = from[j][i];
    groups[j - 1] = k < 0 ? [] : cl.slice(k, i);
    i = k < 0 ? i : k;
  }
  return groups;
}

// ---- cell values ------------------------------------------------------------

const DASH = /^[-–—]$/;

// A wrapped cell's lines back into one value. A line ending in a hyphen
// ("Best-in-" / "class") joins without a space; so do token fields (an email
// address can break anywhere).
export function joinCell(parts, token = false) {
  let out = '';
  (parts || []).forEach((p) => {
    const t = p.trim();
    if (!t) return;
    if (!out) { out = t; return; }
    if (token || /\S-$/.test(out)) out += t;
    else out += ' ' + t;
  });
  return out.replace(/\s+/g, ' ').trim();
}

export const textValue = (parts, token) => {
  const v = joinCell(parts, token);
  return DASH.test(v) ? '' : v;
};

const fmtIN = (digits) => (digits ? Number(digits).toLocaleString('en-IN') : '');

// "₹ 1,50,000" → "1,50,000" (the form's own comma format); "—" → "".
// Returns null when the cell isn't an amount at all.
export function amountValue(parts, { allowNegative = false } = {}) {
  const v = joinCell(parts);
  if (!v || DASH.test(v)) return '';
  const m = v.replace(/₹|Rs\.?|INR/gi, '').replace(/\s/g, '').match(/^(-?)([\d,]+)(\.\d+)?$/);
  if (!m) return null;
  const digits = m[2].replace(/,/g, '').replace(/^0+(?=\d)/, '');
  const neg = allowNegative && m[1] === '-' && Number(digits) !== 0;
  return (neg ? '-' : '') + fmtIN(digits);
}

// "13/4/1963" (how the proposal prints a date) → "1963-04-13".
export function dateValue(parts) {
  const v = joinCell(parts);
  if (!v || DASH.test(v)) return '';
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export const yesNo = (parts) => (/\bYES\b/i.test(joinCell(parts)) ? 'Yes' : 'No');

const PENDING = /^Pending (quotation|issuance)$/i;

// ---- shared helpers -------------------------------------------------------

function valueReader(table, row, warnings, where) {
  const idx = (key) => table.columns.findIndex((c) => c.key === key);
  const told = new Set();
  const cell = (key) => {
    const i = idx(key);
    if (i < 0) return null;
    if (row.clipped?.[i] && !told.has(i)) {
      told.add(i);
      warnings.push(`${where}, row ${row.n}: ${table.columns[i].label} runs off the edge of the page in this PDF, so part of it is missing — please check it.`);
    }
    return row.cells[i];
  };
  const bad = (label, raw) => warnings.push(`${where}, row ${row.n}: couldn't read ${label} "${joinCell(raw)}" — please check it.`);
  return {
    has: (key) => idx(key) >= 0,
    text: (key, token) => { const c = cell(key); return c ? textValue(c, token) : ''; },
    amount: (key, label, opts) => {
      const c = cell(key);
      if (!c) return '';
      const raw = joinCell(c);
      if (PENDING.test(raw)) return '';
      const v = amountValue(c, opts);
      if (v === null) { bad(label, c); return ''; }
      return v;
    },
    date: (key, label) => {
      const c = cell(key);
      if (!c) return '';
      const v = dateValue(c);
      if (v === null) { bad(label, c); return ''; }
      return v;
    },
    raw: (key) => cell(key),
  };
}

function checkTable(table, where, warnings) {
  if (table.problems?.length) warnings.push(`${where}: part of this table couldn't be read reliably — please check every row.`);
}

function unknownColumns(table, known, where, warnings) {
  const extra = table.columns.slice(1).filter((c) => !known.includes(c.key));
  if (extra.length) warnings.push(`${where}: column${extra.length > 1 ? 's' : ''} ${extra.map((c) => `"${c.label}"`).join(', ')} not recognised and skipped.`);
}

// "Prepared for: <name>" — a long name can wrap onto the next line.
function preparedFor(lines) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].text.match(/^Prepared for:\s*(.*)$/i);
    if (!m) continue;
    let name = m[1].trim();
    for (let k = i + 1; k < lines.length; k++) {
      const prev = lines[k - 1];
      const l = lines[k];
      if (l.page !== prev.page || !near(l.x0, lines[i].x0, 1) || !near(l.size, prev.size, 0.3) || l.yAbs - prev.yAbs > 1.8 * prev.size) break;
      name = joinCell([name, l.text]);
    }
    return name;
  }
  return '';
}

export function proposalKind(lines) {
  if (lines.some((l) => l.key === 'INSURANCEPROPOSAL' || l.key === 'PROPOSALTYPE' || /^INSURANCEPROPOSAL./.test(l.key))) return 'insurance';
  if (lines.some((l) => l.key === 'INVESTMENTADVISORY' || sectionOf(l))) return 'investment';
  return null;
}

// ---- Investment / Other Code ---------------------------------------------

export const INVESTMENT_TYPES = [
  { id: 'sip', label: 'Purchase with SIP', aliases: ['Fresh SIP'] },
  { id: 'specialsip', label: 'Special SIP' },
  { id: 'sipchanges', label: 'Proposed SIP Changes' },
  { id: 'sipcancel', label: 'SIP Cancellation' },
  { id: 'sippause', label: 'SIP Pause' },
  { id: 'sipregistration', label: 'SIP Registration' },
  { id: 'stpcancel', label: 'STP Cancelation' },
  { id: 'swpcancel', label: 'SWP Cancelation' },
  { id: 'redemption', label: 'Redemption Proposal' },
  { id: 'lumpsum', label: 'Lumpsum Investment' },
  { id: 'stp', label: 'STP Proposal' },
  { id: 'swp', label: 'SWP Proposal' },
  { id: 'switch', label: 'Switch Proposal' },
];
const TYPE_BY_KEY = {};
INVESTMENT_TYPES.forEach((t) => [t.label, ...(t.aliases || [])].forEach((l) => { TYPE_BY_KEY[norm(l)] = t.id; }));

const INV_COLUMNS = {
  CATEGORY: 'category', SCHEMENAME: 'scheme',
  DATEOFSIP: 'date', DATEOFSWP: 'date',
  AMOUNTRS: 'amount', SIPAMOUNTRS: 'amount', SWPAMOUNTRS: 'amount', STPAMOUNTRS: 'amount',
  CURRENTSIPRS: 'currentSip', PROPOSEDSIPRS: 'proposedSip', TOTALSIPRS: 'totalSip',
  FROMCATEGORY: 'fromCategory', FROMSCHEMENAME: 'fromScheme', TOCATEGORY: 'toCategory', TOSCHEMENAME: 'toScheme',
  FROMAMOUNTRS: 'fromAmount', TOAMOUNTRS: 'toAmount',
  ALLUNITS: 'allUnits', SHORTTERMRS: 'shortTerm', LONGTERMRS: 'longTerm', TAXLIABILITY: 'taxLiability',
  FREQUENCY: 'frequency', // STP, since 9 Oct 2026 — older STP prints have no such column
};
const STP_FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Yearly'];
const INV_AMOUNT_KEYS = ['amount', 'currentSip', 'proposedSip', 'totalSip', 'fromAmount', 'toAmount', 'shortTerm', 'longTerm'];
const INV_RIGHT = new Set([...Object.keys(INV_COLUMNS).filter((k) => INV_AMOUNT_KEYS.includes(INV_COLUMNS[k])), 'AMOUNT']);
const ACC_TYPES = ['Savings', 'Current', 'NRE', 'NRO'];

const sectionOf = (l) => (l.rel >= 1.15 ? TYPE_BY_KEY[l.key] : undefined);
const INV_STOP = /^(REMARKS$|ACCOMPANYINGBANKDETAILS$|APPLICABLETAXRATES|EQUITYTAXLIABILITY|DEBTTAXLIABILITY)|LAKHEXEMPTION|THISSIPWILLBEAUTOMATICALLYRESUMED/;

const squash = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');

// schemes: { [category]: [scheme names] } — the same list the form offers,
// used to put a scheme name back exactly as the list spells it.
export function parseInvestmentProposal(pages, { schemes = {} } = {}) {
  const all = buildLines(pages);
  const kind = proposalKind(all);
  if (kind !== 'investment') return { ok: false, kind, error: kind === 'insurance' ? 'insurance' : 'unknown' };
  const lines = dropPageFurniture(all);
  const warnings = [];

  const categories = Object.keys(schemes);
  const catBySquash = Object.fromEntries(categories.map((c) => [squash(c), c]));
  const schemeIndex = {};
  categories.forEach((c) => (schemes[c] || []).forEach((s) => { if (!schemeIndex[squash(s)]) schemeIndex[squash(s)] = s; }));
  const category = (v, where) => {
    if (!v) return '';
    const hit = catBySquash[squash(v)];
    if (!hit) warnings.push(`${where}: category "${v}" isn't in the list — please pick it again.`);
    return hit || v;
  };
  const scheme = (v, cat) => {
    if (!v) return '';
    const inCat = (schemes[cat] || []).find((s) => squash(s) === squash(v));
    return inCat || schemeIndex[squash(v)] || v;
  };

  // Sections, in the order they were printed.
  const marks = [];
  lines.forEach((l, i) => { const id = sectionOf(l); if (id) marks.push({ id, i }); });
  if (!marks.length) return { ok: false, kind, error: 'nothing' };

  const isStop = (l) => !!sectionOf(l) || isTotalLine(l) || INV_STOP.test(l.key);
  const tables = readTables(lines, { isStop, rightAligned: (key) => INV_RIGHT.has(key) });

  const result = {
    ok: true, kind,
    clientName: preparedFor(lines),
    selTypes: [], sections: {}, remarks: {}, bankDetails: {},
    redemptionIncludeExemption: true, redemptionBookedGain: '',
    counts: {},
    warnings,
  };

  marks.forEach((mk, si) => {
    const endLine = si + 1 < marks.length ? marks[si + 1].i : lines.length;
    if (result.selTypes.includes(mk.id)) return;
    const label = INVESTMENT_TYPES.find((t) => t.id === mk.id).label;
    result.selTypes.push(mk.id);
    const inSection = tables.filter((t) => t.first > mk.i && t.first < endLine);
    const isBank = (t) => t.columns.some((c) => c.key === 'BANKNAME');
    const main = inSection.find((t) => !isBank(t));
    const bank = inSection.find(isBank);

    const rows = [];
    if (main) {
      checkTable(main, label, warnings);
      unknownColumns(main, Object.keys(INV_COLUMNS), label, warnings);
      main.rows.forEach((r) => {
        const v = valueReader(main, r, warnings, label);
        const row = {};
        Object.entries(INV_COLUMNS).forEach(([col, key]) => {
          if (!v.has(col) || key === 'totalSip' || key === 'taxLiability') return;
          if (INV_AMOUNT_KEYS.includes(key)) row[key] = v.amount(col, labelOfKey(key), { allowNegative: true });
          else if (key === 'allUnits') row.allUnits = /all\s*units/i.test(joinCell(v.raw(col)));
          else row[key] = v.text(col);
        });
        // Redemption prints "(All Units)" after the scheme name.
        if (mk.id === 'redemption' && row.scheme !== undefined) {
          const m = row.scheme.match(/^(.*?)\s*\(All Units\)$/i);
          row.allUnits = !!m;
          if (m) row.scheme = m[1].trim();
        }
        ['category', 'fromCategory', 'toCategory'].forEach((k) => { if (row[k] !== undefined) row[k] = category(row[k], `${label}, row ${r.n}`); });
        if (row.frequency) {
          const f = STP_FREQUENCIES.find((x) => x.toLowerCase() === row.frequency.toLowerCase());
          if (!f) warnings.push(`${label}, row ${r.n}: frequency "${row.frequency}" isn't one of ${STP_FREQUENCIES.join(' / ')} — please pick it again.`);
          row.frequency = f || '';
        }
        if (row.scheme !== undefined) row.scheme = scheme(row.scheme, row.category);
        if (row.fromScheme !== undefined) row.fromScheme = scheme(row.fromScheme, row.fromCategory);
        if (row.toScheme !== undefined) row.toScheme = scheme(row.toScheme, row.toCategory);
        rows.push(row);
      });
      checkTotals(main, rows, label, warnings);
      if (mk.id === 'stp') {
        rows.forEach((row) => { row.installments = installmentsOf(row.fromAmount, row.toAmount); });
        if (rows.length && !main.columns.some((c) => c.key === 'FREQUENCY')) {
          warnings.push(`${label}: Frequency isn't printed on this older proposal PDF — please pick it for each row.`);
        }
      }
    } else {
      warnings.push(`${label}: no table found in the PDF.`);
    }
    if (rows.length) result.sections[mk.id] = rows;
    result.counts[mk.id] = rows.length;

    if (bank) {
      checkTable(bank, `${label} bank details`, warnings);
      result.bankDetails[mk.id] = bank.rows.map((r) => {
        const v = valueReader(bank, r, warnings, `${label} bank details`);
        const type = v.text('TYPE');
        return {
          bankName: v.text('BANKNAME'),
          accNo: v.text('ACCOUNTNO', true),
          ifsc: v.text('IFSC', true),
          accType: ACC_TYPES.find((t) => t.toLowerCase() === type.toLowerCase()) || 'Savings',
          amount: v.amount('AMOUNT', 'Amount'),
        };
      });
    }

    const sectionLines = lines.slice(mk.i + 1, endLine);
    if (mk.id === 'redemption') {
      const ex = sectionLines.find((l) => /LAKHEXEMPTION(INCLUDED|EXCLUDED)/.test(l.key));
      if (ex) {
        result.redemptionIncludeExemption = /LAKHEXEMPTIONINCLUDED/.test(ex.key);
        const g = ex.text.match(/Booked Gain:\s*₹?\s*([\d,]+)/i);
        result.redemptionBookedGain = g ? amountValue([g[1]]) || '' : '';
      }
    }
    const remarks = readRemarks(sectionLines, pages);
    if (remarks) result.remarks[mk.id] = remarks;
  });

  return result;
}

// STP Installments aren't printed. The form works To Amount out as From
// Amount ÷ Installments (rounded to the rupee), so when the printed pair is
// such an even split the count comes back from it; otherwise it stays blank.
function installmentsOf(from, to) {
  const f = Number(String(from || '').replace(/,/g, ''));
  const t = Number(String(to || '').replace(/,/g, ''));
  if (!(f > 0 && t > 0)) return '';
  const n = Math.round(f / t);
  return n >= 1 && Math.round(f / n) === t ? String(n) : '';
}

function labelOfKey(key) {
  return { amount: 'Amount', currentSip: 'Current SIP', proposedSip: 'Proposed SIP', fromAmount: 'From Amount', toAmount: 'To Amount', shortTerm: 'Short Term', longTerm: 'Long Term' }[key] || key;
}

// The printed TOTAL row must equal the sum of the rows read.
function checkTotals(table, rows, where, warnings) {
  const line = table.totalLine;
  if (!line) return;
  const right = (key) => INV_RIGHT.has(key);
  line.frags.forEach((f) => {
    if (/^TOTAL$/i.test(f.text.trim())) return;
    const printed = amountValue([f.text], { allowNegative: true });
    if (printed === null || printed === '') return;
    const col = table.columns[columnOf(f, table.columns, right)];
    const key = INV_COLUMNS[col.key];
    if (!key) return;
    const n = (s) => Number(String(s || '0').replace(/,/g, '')) || 0;
    const sum = key === 'totalSip'
      ? rows.reduce((s, r) => s + n(r.currentSip) + n(r.proposedSip), 0)
      : rows.reduce((s, r) => s + n(r[key]), 0);
    if (Math.round(sum) !== n(printed)) warnings.push(`${where}: the rows read add up to ₹ ${sum.toLocaleString('en-IN')} but the PDF's total says ₹ ${printed} — please check the amounts.`);
  });
}

// The remarks box: "REMARKS" then the text. A line the browser wrapped only
// because the next word didn't fit rejoins with a space; a line that ends
// early was a line break the advisor typed.
function readRemarks(sectionLines, pages) {
  const at = sectionLines.findIndex((l) => l.key === 'REMARKS');
  if (at < 0) return '';
  const body = [];
  for (let k = at + 1; k < sectionLines.length; k++) {
    const l = sectionLines[k];
    if (body.length && l.frags.some((f) => f.size > body[0].size * 1.3)) break;
    body.push(l);
  }
  if (!body.length) return '';
  const left = Math.min(...body.map((l) => l.x0));
  let out = '';
  body.forEach((l, i) => {
    if (i === 0) { out = l.text; return; }
    const prev = body[i - 1];
    const pitch = 1.8 * prev.size;
    const right = (pages[prev.page]?.width || 595) - left;
    const steps = prev.page === l.page ? Math.max(1, Math.round((l.yAbs - prev.yAbs) / pitch)) : 1;
    if (steps > 1) { out += '\n'.repeat(steps) + l.text; return; }
    const firstWord = l.text.split(' ')[0];
    const lineWidth = l.x1 - l.x0;
    const wordWidth = lineWidth * (firstWord.length / Math.max(1, l.text.length));
    const wrapped = prev.x1 + 0.28 * prev.size + wordWidth > right - 0.5;
    out += (wrapped ? ' ' : '\n') + l.text;
  });
  return out;
}

// ---- Insurance --------------------------------------------------------------

const INS_SECTIONS = {
  CLIENTDETAILS: 'applicants',
  MEDICALINSURANCE: 'medical',
  TERMLIFEINSURANCE: 'term',
  ACCIDENTALINSURANCE: 'accidental',
  TRAVELINSURANCE: 'travel',
  MARINEINSURANCE: 'marine',
  MOTORINSURANCE: 'motor',
  INDEMNITYINSURANCE: 'indemnity',
};
const INS_SUBLABELS = ['BASECOVER', 'TOPUPCOVER', 'TRAVELLERDETAILS', 'TRIPDETAILS', 'COVERAGEDOCUMENTATION', 'SHIPMENTCOVERDETAILS', 'ADDITIONALDETAILS', 'VEHICLEDETAILS', 'POLICYRENEWALDETAILS', 'IDENTIFICATIONISSUANCEDETAILS', 'BUSINESSCOVERAGEDETAILS', 'CLAIMSCONTRACTUALDETAILS'];

// Section title fragment (the title line also carries the Port / New badge).
const insSectionOf = (l) => {
  for (const f of l.frags) {
    if (f.rel < 1.25) continue;
    const id = INS_SECTIONS[norm(f.text)];
    if (id) return id;
  }
  return undefined;
};

const EMPTY = {
  travel: { travellerName: '', dobAge: '', passportNumber: '', nationality: '', mobile: '', email: '', tripStartDate: '', tripEndDate: '', destination: '', tripType: '', purpose: '', travellersCount: '', sum: '', pedCondition: '', nominee: '', premium: '', policyNumber: '' },
  marine: { policyholderName: '', contactPerson: '', mobile: '', email: '', typeOfCover: '', natureOfGoods: '', invoiceValue: '', sum: '', origin: '', destination: '', modeOfTransport: '', transitStartDate: '', transitEndDuration: '', shipmentsCount: '', packingDetails: '', conveyanceVessel: '', previousPolicyDetails: '', claimHistory: '', premium: '', policyNumber: '' },
  motor: { vehicleOwnerName: '', vehicleRegistrationNumber: '', makeModel: '', variant: '', manufacturingYear: '', registrationDate: '', vehicleType: '', fuelType: '', idv: '', policyType: '', previousPolicyNumber: '', previousInsurer: '', previousPolicyExpiryDate: '', ncbPercent: '', claimHistory: '', hypothecationDetails: '', rcDetails: '', engineNumber: '', chassisNumber: '', premium: '', policyNumber: '' },
  indemnity: { insuredName: '', businessProfession: '', registeredAddress: '', contactPerson: '', mobile: '', email: '', natureScope: '', professionalCategory: '', annualTurnover: '', employeesCount: '', coverageRequired: '', sum: '', deductible: '', geographicalTerritory: '', policyPeriod: '', previousPolicyDetails: '', existingClaims: '', pendingClaims: '', retroactiveDate: '', contractualRequirements: '', premium: '', policyNumber: '' },
};

// "Packing: Wooden crates · Vessel: MSC Aurora" → { Packing: …, Vessel: … }
function splitNotes(text, labels) {
  const out = {};
  if (!text) return out;
  const re = new RegExp(`(?:^|\\s·\\s)(${labels.map((l) => l.replace(/ /g, '\\s')).join('|')}):\\s`, 'g');
  const hits = [];
  let m;
  while ((m = re.exec(text))) hits.push({ label: m[1], start: m.index, valueStart: m.index + m[0].length });
  hits.forEach((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].start : text.length;
    out[h.label.replace(/\s+/g, ' ')] = text.slice(h.valueStart, end).trim();
  });
  return out;
}

// "Hyundai Creta (SX(O) 1.5 Turbo)" → ["Hyundai Creta", "SX(O) 1.5 Turbo"]
function splitVariant(v) {
  if (!v.endsWith(')')) return [v, ''];
  let depth = 0;
  for (let i = v.length - 1; i >= 0; i--) {
    if (v[i] === ')') depth++;
    else if (v[i] === '(') { depth--; if (depth === 0) return i > 0 && v[i - 1] === ' ' ? [v.slice(0, i - 1).trim(), v.slice(i + 1, -1)] : [v, '']; }
  }
  return [v, ''];
}

export function parseInsuranceProposal(pages) {
  const all = buildLines(pages);
  const kind = proposalKind(all);
  if (kind !== 'insurance') return { ok: false, kind, error: kind === 'investment' ? 'investment' : 'unknown' };
  const lines = dropPageFurniture(all);
  const warnings = [];

  const marks = [];
  lines.forEach((l, i) => { const id = insSectionOf(l); if (id) marks.push({ id, i }); });
  if (!marks.length) return { ok: false, kind, error: 'nothing' };

  const isSub = (l) => INS_SUBLABELS.includes(l.key);
  const isStop = (l) => !!insSectionOf(l) || isSub(l);
  const tables = readTables(lines, { isStop });

  const result = {
    ok: true, kind,
    proposer: preparedFor(lines),
    types: { medical: false, term: false, accidental: false, travel: false, marine: false, motor: false, indemnity: false },
    applicants: [], isPort: false, portDate: '',
    basePolicies: [], topupPolicies: [], termGroups: [], accidentalPolicies: [],
    travelPolicies: [], marinePolicies: [], motorPolicies: [], indemnityPolicies: [],
    warnings,
  };

  const sectionTables = (mk, endLine) => tables.filter((t) => t.first > mk.i && t.first < endLine);
  // The sub-label printed just above a table ("BASE COVER", "TRIP DETAILS").
  const subOf = (t, mk) => {
    for (let k = t.first - 1; k > mk.i; k--) if (isSub(lines[k])) return lines[k].key;
    return '';
  };
  const rowsOf = (t, where, known, fn) => {
    checkTable(t, where, warnings);
    unknownColumns(t, known, where, warnings);
    return t.rows.map((r) => fn(valueReader(t, r, warnings, where), r));
  };

  marks.forEach((mk, si) => {
    const endLine = si + 1 < marks.length ? marks[si + 1].i : lines.length;
    const ts = sectionTables(mk, endLine);
    if (mk.id !== 'applicants') result.types[mk.id] = true;

    if (mk.id === 'applicants') {
      const t = ts[0];
      if (!t) return;
      result.applicants = rowsOf(t, 'Client Details', ['NAME', 'RELATION', 'DATEOFBIRTH', 'SMOKING', 'TOBACCO', 'ALCOHOL', 'PREEXISTINGDISEASE'], (v) => {
        const ped = v.raw('PREEXISTINGDISEASE') || [];
        const pedText = joinCell(ped);
        const spec = pedText.match(/\((.*)\)\s*$/);
        return {
          name: v.text('NAME'),
          relation: v.text('RELATION'),
          dob: v.date('DATEOFBIRTH', 'Date of Birth'),
          smoking: yesNo(v.raw('SMOKING')),
          tobacco: yesNo(v.raw('TOBACCO')),
          alcohol: yesNo(v.raw('ALCOHOL')),
          ped: yesNo([pedText.replace(/\(.*\)\s*$/, '')]),
          pedSpecify: spec ? spec[1].trim() : '',
        };
      });
      return;
    }

    if (mk.id === 'medical') {
      const title = lines[mk.i];
      const badge = title.frags.find((f) => /^(Port|New)\b/i.test(f.text));
      if (badge && /^Port/i.test(badge.text)) {
        result.isPort = true;
        const d = badge.text.replace(/^Port\s*·?\s*/i, '');
        const iso = dateValue([d]);
        result.portDate = iso || '';
        if (iso === null) warnings.push(`Medical Insurance: couldn't read the port date "${d}" — please check it.`);
      }
      ts.forEach((t) => {
        const sub = subOf(t, mk);
        if (sub === 'TOPUPCOVER') {
          result.topupPolicies = rowsOf(t, 'Top-Up Cover', ['COMPANY', 'POLICYNAME', 'DEDUCTIBLE', 'SUMASSURED', 'PREMIUMPA'], (v) => ({
            company: v.text('COMPANY'), name: v.text('POLICYNAME'),
            deductible: v.amount('DEDUCTIBLE', 'Deductible'), sum: v.amount('SUMASSURED', 'Sum Assured'), premium: v.amount('PREMIUMPA', 'Premium'),
          }));
        } else {
          result.basePolicies = rowsOf(t, 'Base Cover', ['COMPANYANDPOLICYNAME', 'SUMASSURED', 'PREMIUMPA', 'RIDERS'], (v) => ({
            name: v.text('COMPANYANDPOLICYNAME'), sum: v.amount('SUMASSURED', 'Sum Assured'), premium: v.amount('PREMIUMPA', 'Premium'), riders: v.text('RIDERS'),
          }));
        }
      });
      return;
    }

    if (mk.id === 'term') {
      // Each insured: a numbered name line ("1  Rahul Sharma"), then their
      // table — none when no policy was entered for them.
      const inTable = (k) => tables.some((t) => k >= t.first && k <= t.last);
      const titles = [];
      for (let k = mk.i + 1; k < endLine; k++) {
        const l = lines[k];
        if (!inTable(k) && l.frags.length >= 2 && isInt(l.frags[0])) titles.push(k);
      }
      titles.forEach((k, ti) => {
        const name = joinCell(lines[k].frags.slice(1).map((f) => f.text));
        const insuredName = name === '(Unnamed Insured)' ? '' : name;
        const until = ti + 1 < titles.length ? titles[ti + 1] : endLine;
        const t = tables.find((x) => x.first > k && x.first < until);
        const policies = t
          ? rowsOf(t, `Term Life (${insuredName || 'insured'})`, ['COMPANYANDPOLICYNAME', 'SUMASSURED', 'COVERTILLAGE', 'PREMIUMPA'], (v) => ({
            name: v.text('COMPANYANDPOLICYNAME'),
            sum: v.amount('SUMASSURED', 'Sum Assured'),
            cover: v.text('COVERTILLAGE').replace(/\s*yrs$/i, '').replace(/^[-–—]$/, ''),
            premium: v.amount('PREMIUMPA', 'Premium'),
          }))
          : [];
        result.termGroups.push({ insuredName, policies: policies.length ? policies : [{ name: '', sum: '', cover: '', premium: '' }] });
      });
      return;
    }

    if (mk.id === 'accidental') {
      const t = ts[0];
      if (t) result.accidentalPolicies = rowsOf(t, 'Accidental Insurance', ['COMPANYANDPOLICYNAME', 'SUMASSURED', 'PREMIUMPA', 'RIDERS'], (v) => ({
        name: v.text('COMPANYANDPOLICYNAME'), sum: v.amount('SUMASSURED', 'Sum Assured'), premium: v.amount('PREMIUMPA', 'Premium'), riders: v.text('RIDERS'),
      }));
      return;
    }

    // The multi-table types: each table holds some of an entry's fields, one
    // row per entry, in the same order.
    const parts = {};
    ts.forEach((t) => { parts[subOf(t, mk)] = t; });
    const merge = (where, readers) => {
      const counts = readers.filter(([t]) => t).map(([t]) => t.rows.length);
      if (!counts.length) return [];
      if (counts.some((c) => c !== counts[0])) warnings.push(`${where}: the tables list different numbers of entries — please check them.`);
      const n = Math.max(...counts);
      const out = Array.from({ length: n }, () => ({ ...EMPTY[mk.id] }));
      readers.forEach(([t, label, known, fn]) => {
        if (!t) return;
        rowsOf(t, `${where} — ${label}`, known, fn).forEach((vals, i) => Object.assign(out[i], vals));
      });
      return out;
    };

    if (mk.id === 'travel') {
      result.travelPolicies = merge('Travel Insurance', [
        [parts.TRAVELLERDETAILS, 'Traveller Details', ['TRAVELLERNAME', 'DOBAGE', 'PASSPORTNO', 'NATIONALITY', 'MOBILE', 'EMAIL'], (v, r) => {
          const email = v.text('EMAIL', true);
          if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) warnings.push(`Travel Insurance, row ${r.n}: the email "${email}" doesn't look complete — please check it.`);
          return {
            travellerName: v.text('TRAVELLERNAME'), dobAge: v.text('DOBAGE'), passportNumber: v.text('PASSPORTNO', true),
            nationality: v.text('NATIONALITY'), mobile: v.text('MOBILE'), email,
          };
        }],
        [parts.TRIPDETAILS, 'Trip Details', ['DESTINATION', 'TRIPTYPE', 'PURPOSE', 'STARTDATE', 'ENDDATE', '#TRAVELLERS'], (v) => ({
          destination: v.text('DESTINATION'), tripType: v.text('TRIPTYPE'), purpose: v.text('PURPOSE'),
          tripStartDate: v.date('STARTDATE', 'Start Date'), tripEndDate: v.date('ENDDATE', 'End Date'), travellersCount: v.text('#TRAVELLERS'),
        })],
        [parts.COVERAGEDOCUMENTATION, 'Coverage & Documentation', ['SUMINSURED', 'PREMIUMPA', 'POLICYNO', 'PREEXISTINGMEDICALCONDITION', 'NOMINEE'], (v) => ({
          sum: v.amount('SUMINSURED', 'Sum Insured'), premium: v.amount('PREMIUMPA', 'Premium'),
          policyNumber: PENDING.test(v.text('POLICYNO')) ? '' : v.text('POLICYNO', true),
          pedCondition: v.text('PREEXISTINGMEDICALCONDITION'), nominee: v.text('NOMINEE'),
        })],
      ]);
    } else if (mk.id === 'marine') {
      result.marinePolicies = merge('Marine Insurance', [
        [parts.SHIPMENTCOVERDETAILS, 'Shipment & Cover Details', ['POLICYHOLDER', 'TYPEOFCOVER', 'GOODS', 'ROUTE', 'MODE', 'INVOICEVALUE', 'SUMINSURED'], (v) => {
          const route = v.text('ROUTE');
          const [o, d] = route.includes('→') ? route.split('→').map((s) => s.trim()) : [route, ''];
          return {
            policyholderName: v.text('POLICYHOLDER'), typeOfCover: v.text('TYPEOFCOVER'), natureOfGoods: v.text('GOODS'),
            origin: o === '?' ? '' : o, destination: d === '?' ? '' : d, modeOfTransport: v.text('MODE'),
            invoiceValue: v.amount('INVOICEVALUE', 'Invoice Value'), sum: v.amount('SUMINSURED', 'Sum Insured'),
          };
        }],
        [parts.ADDITIONALDETAILS, 'Additional Details', ['TRANSIT', '#SHIPMENTS', 'PREMIUM', 'POLICYNO', 'NOTES'], (v) => {
          const transit = joinCell(v.raw('TRANSIT'));
          const [datePart, ...rest] = transit.split(' – ');
          const start = dateValue([datePart]);
          if (start === null) warnings.push(`Marine Insurance, transit "${transit}": couldn't read the start date — please check it.`);
          const notes = splitNotes(v.text('NOTES'), ['Packing', 'Vessel', 'Previous Policy', 'Claim History']);
          return {
            transitStartDate: start || '', transitEndDuration: rest.join(' – ').trim(),
            shipmentsCount: v.text('#SHIPMENTS'), premium: v.amount('PREMIUM', 'Premium'),
            policyNumber: PENDING.test(v.text('POLICYNO')) ? '' : v.text('POLICYNO', true),
            packingDetails: notes.Packing || '', conveyanceVessel: notes.Vessel || '',
            previousPolicyDetails: notes['Previous Policy'] || '', claimHistory: notes['Claim History'] || '',
          };
        }],
      ]);
    } else if (mk.id === 'motor') {
      result.motorPolicies = merge('Motor Insurance', [
        [parts.VEHICLEDETAILS, 'Vehicle Details', ['VEHICLEOWNER', 'REGISTRATIONNO', 'MAKEMODEL', 'MFGYEAR', 'VEHICLETYPE', 'FUELTYPE', 'IDV'], (v) => {
          const [makeModel, variant] = splitVariant(v.text('MAKEMODEL'));
          return {
            vehicleOwnerName: v.text('VEHICLEOWNER'), vehicleRegistrationNumber: v.text('REGISTRATIONNO'),
            makeModel, variant, manufacturingYear: v.text('MFGYEAR'), vehicleType: v.text('VEHICLETYPE'),
            fuelType: v.text('FUELTYPE'), idv: v.amount('IDV', 'IDV'),
          };
        }],
        [parts.POLICYRENEWALDETAILS, 'Policy & Renewal Details', ['POLICYTYPE', 'PREVIOUSINSURER', 'PREVIOUSPOLICYNO', 'NCB', 'CLAIMHISTORY', 'RCDETAILS'], (v) => ({
          policyType: v.text('POLICYTYPE'), previousInsurer: v.text('PREVIOUSINSURER'), previousPolicyNumber: v.text('PREVIOUSPOLICYNO', true),
          ncbPercent: v.text('NCB'), claimHistory: v.text('CLAIMHISTORY'), rcDetails: v.text('RCDETAILS'),
        })],
        [parts.IDENTIFICATIONISSUANCEDETAILS, 'Identification & Issuance Details', ['ENGINENO', 'CHASSISNO', 'PREMIUM', 'POLICYNO'], (v) => ({
          engineNumber: v.text('ENGINENO', true), chassisNumber: v.text('CHASSISNO', true), premium: v.amount('PREMIUM', 'Premium'),
          policyNumber: PENDING.test(v.text('POLICYNO')) ? '' : v.text('POLICYNO', true),
        })],
      ]);
    } else if (mk.id === 'indemnity') {
      result.indemnityPolicies = merge('Indemnity Insurance', [
        [parts.BUSINESSCOVERAGEDETAILS, 'Business & Coverage Details', ['INSUREDCOMPANY', 'BUSINESSPROFESSION', 'COVERAGEREQUIRED', 'ANNUALTURNOVER', 'LIMITOFINDEMNITY'], (v) => ({
          insuredName: v.text('INSUREDCOMPANY'), businessProfession: v.text('BUSINESSPROFESSION'), coverageRequired: v.text('COVERAGEREQUIRED'),
          annualTurnover: v.amount('ANNUALTURNOVER', 'Annual Turnover'), sum: v.amount('LIMITOFINDEMNITY', 'Limit of Indemnity'),
        })],
        [parts.CLAIMSCONTRACTUALDETAILS, 'Claims & Contractual Details', ['POLICYPERIOD', 'RETROACTIVEDATE', 'PREMIUM', 'POLICYNO', 'NOTES'], (v) => {
          const notes = splitNotes(v.text('NOTES'), ['Previous Policy', 'Existing Claims', 'Pending Claims', 'Contractual']);
          return {
            policyPeriod: v.text('POLICYPERIOD'), retroactiveDate: v.date('RETROACTIVEDATE', 'Retroactive Date'),
            premium: v.amount('PREMIUM', 'Premium'), policyNumber: PENDING.test(v.text('POLICYNO')) ? '' : v.text('POLICYNO', true),
            previousPolicyDetails: notes['Previous Policy'] || '', existingClaims: notes['Existing Claims'] || '',
            pendingClaims: notes['Pending Claims'] || '', contractualRequirements: notes.Contractual || '',
          };
        }],
      ]);
    }
  });

  return result;
}
