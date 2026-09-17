// Excel export for the Business Prospects list — the same role cobrExcel.js
// plays for the COBR registers, kept separate because that engine is built
// around its own import counterpart (every value stringified so a download
// can be re-uploaded verbatim) and this one deliberately writes Amount as a
// real number and Closing Date as a real Excel date, so the sheet can be
// sorted, summed and re-formatted without first being re-typed by hand.
//
// Callers pass the list's already-FILTERED rows, so an export always matches
// exactly what's on screen rather than dumping the whole database.
import * as XLSX from 'xlsx';
import { CATEGORY_LABEL } from './prospects';

const COLUMNS = [
  'Business Type', 'Proposal Type', 'Group Leader Name', 'Applicant Name',
  'Applicant PAN', 'Amount', 'Closing Date', 'Stage',
];

// A prospect's closing date: the actual close once it has landed on a closing
// stage, otherwise the expected one — the same value the list's own Closing
// column shows, so filtering, display and export can never disagree.
export const prospectClosingDate = (p) => p.closedAt || p.closingDate || '';

// Local YYYY-MM-DD for either a plain date or an ISO timestamp. Never
// `.slice(0, 10)` on a timestamp: that takes the UTC day, which lands on the
// previous date for anything logged after ~05:30 IST.
export const toLocalDay = (v) => {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// The Excel date serial (whole days since 1899-12-30, the epoch Excel's own
// 1900-leap-year quirk implies). Computed from UTC midnights so no timezone
// ever enters the arithmetic: handing SheetJS a JS Date instead lets its
// own conversion pick up the local zone's historical offset and lands on
// 46270.000115 — a datetime ~10s past midnight that no longer compares equal
// to DATE(2026,9,5) in a formula.
const toExcelSerial = (v) => {
  const day = toLocalDay(v);
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
};

export function exportProspectsToExcel(rows, filename) {
  const data = rows.map((p) => ({
    'Business Type': CATEGORY_LABEL[p.proposalCategory] || p.proposalCategory || '',
    'Proposal Type': p.proposalType || '',
    'Group Leader Name': p.groupLeader || '',
    'Applicant Name': p.applicant || '',
    'Applicant PAN': (p.pan || '').toUpperCase(),
    Amount: Number(String(p.amount ?? '').replace(/,/g, '')) || 0,
    'Closing Date': '', // written as a real date serial below
    Stage: p.stage || '',
  }));

  const ws = data.length
    ? XLSX.utils.json_to_sheet(data, { header: COLUMNS })
    : XLSX.utils.aoa_to_sheet([COLUMNS]);

  // Amount is already numeric from json_to_sheet — this only sets how Excel
  // renders it. Closing Date is written as a date cell outright, so it sorts,
  // filters and compares as a date rather than as text.
  rows.forEach((p, i) => {
    const row = i + 2; // 1-based, and row 1 is the header
    const amount = ws[`F${row}`];
    if (amount) amount.z = '#,##0';
    const serial = toExcelSerial(prospectClosingDate(p));
    ws[`G${row}`] = serial == null ? { t: 's', v: '' } : { t: 'n', v: serial, z: 'dd-mm-yyyy' };
  });

  ws['!cols'] = [18, 24, 24, 24, 15, 14, 14, 20].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Business Prospects');
  XLSX.writeFile(wb, filename);
}
