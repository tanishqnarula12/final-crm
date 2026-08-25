// Excel import/export for the COBR workspace's Renewals / Claims / Fixed
// Deposits / Other Insurance Policies registers.
//
// Field-spec driven so all four modules share one engine: each module
// exports a `*_EXCEL_FIELDS` array from utils/cobrModules.js listing exactly
// its sub-form fields (label, type, whether it's required — optionally as a
// function of the row, for Motor's conditional sub-types and Up/Cross
// Sell's conditional amounts). Download and Upload use the exact same
// column set (the field labels), so the two formats can never drift apart.
//
// `groupLeader`/`applicant` (every module's client-identity pair) and
// `assignedTo` (every module's team-member field) are special-cased here
// rather than per module, since all four modals share the same
// ClientApplicantFields/AssignmentFields components.
import * as XLSX from 'xlsx';
import { loadTeam, teamName } from '../services/team';
import { parseFlexibleDate } from './calc';

const normHeader = (h) => String(h).toLowerCase().replace(/[\s._-]/g, '');

export const fieldLabels = (fields) => fields.map((f) => f.label);

function displayValue(f, r) {
  if (f.key === 'assignedTo') return teamName(r.assignedTo) || '';
  const v = r[f.key];
  if (f.type === 'boolean') return v ? 'Yes' : 'No';
  return v == null ? '' : v;
}

// Builds and downloads an .xlsx from whatever rows are handed in — callers
// pass the table's currently-*filtered* rows so the download always
// respects whatever search/stage/date filter is active, per spec.
export function exportRecordsToExcel({ fields, rows, sheetName, filename }) {
  const headers = fieldLabels(fields);
  const data = rows.map((r) => {
    const out = {};
    fields.forEach((f) => { out[f.label] = displayValue(f, r); });
    return out;
  });
  const ws = data.length
    ? XLSX.utils.json_to_sheet(data, { header: headers })
    : XLSX.utils.aoa_to_sheet([headers]);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

function coerceCell(f, raw, team, errors) {
  const s = raw == null ? '' : String(raw).trim();
  if (f.key === 'assignedTo') {
    if (!s) return '';
    const hit = team.find((m) => m.name.trim().toLowerCase() === s.toLowerCase());
    if (!hit) { errors.push(`Assigned To "${s}" — no such team member`); return ''; }
    return hit.id;
  }
  if (f.type === 'number') {
    if (!s) return '';
    const n = Number(s);
    if (Number.isNaN(n)) { errors.push(`${f.label} must be a number`); return ''; }
    return n;
  }
  if (f.type === 'date') {
    if (!s) return '';
    const iso = parseFlexibleDate(raw);
    if (!iso) { errors.push(`${f.label} "${s}" is not a valid date`); return ''; }
    return iso;
  }
  if (f.type === 'boolean') return ['yes', 'y', 'true', '1'].includes(s.toLowerCase());
  if (f.type === 'select') {
    if (!s) return '';
    const hit = (f.options || []).find((o) => o.toLowerCase() === s.toLowerCase());
    if (!hit) { errors.push(`${f.label} "${s}" is not a valid option`); return s; }
    return hit;
  }
  return s;
}

// Reads the uploaded workbook's first sheet, header-matches each column
// against `fields[].label` (case/space/punctuation-insensitive), then
// resolves + validates every row. Returns a Promise<{ headerError, results }>
// — `results[]` is `{ rowNum, resolved, errors }`; a row with zero errors is
// ready to import as-is (`resolved` is already shaped like the module's
// record fields).
export function parseExcelFile(file, { fields, clients = [], dedupeKeyFor, existingKeys = new Set() }) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!data.length) { resolve({ headerError: 'The sheet appears to be empty.', results: [] }); return; }

        const headers = Object.keys(data[0]);
        const keyFor = {};
        fields.forEach((f) => {
          const target = normHeader(f.label);
          const hit = headers.find((h) => normHeader(h) === target);
          if (hit) keyFor[f.key] = hit;
        });

        const alwaysRequired = fields.filter((f) => f.required === true && !keyFor[f.key]);
        if (alwaysRequired.length) {
          resolve({
            headerError: `Missing required column${alwaysRequired.length > 1 ? 's' : ''}: ${alwaysRequired.map((f) => f.label).join(', ')}. Download the current Excel first to get the exact column format.`,
            results: [],
          });
          return;
        }

        const team = loadTeam();
        const results = data.map((raw, i) => {
          const rowNum = i + 2; // header is row 1
          const errors = [];
          const resolved = {};

          const clientCell = keyFor.groupLeader ? String(raw[keyFor.groupLeader] ?? '').trim() : '';
          const applicantCell = keyFor.applicant ? String(raw[keyFor.applicant] ?? '').trim() : '';
          let matchedClient = null;
          if (!clientCell) errors.push('Client / Group Leader is required');
          else {
            matchedClient = clients.find((c) => (c.name || '').trim().toLowerCase() === clientCell.toLowerCase());
            if (!matchedClient) errors.push(`Client "${clientCell}" not found`);
          }
          if (!applicantCell) errors.push('Applicant is required');
          resolved.groupLeaderId = matchedClient?.id || '';
          resolved.groupLeader = matchedClient?.name || clientCell;
          resolved.applicant = applicantCell;
          resolved.pan = '';
          if (matchedClient && applicantCell) {
            const opts = [
              { name: matchedClient.name, pan: matchedClient.pan || '' },
              ...(matchedClient.clientDetails?.familyDetails || []).map((fam) => ({ name: fam.name, pan: fam.pan || '' })),
            ];
            const hit = opts.find((o) => o.name.trim().toLowerCase() === applicantCell.toLowerCase());
            if (hit) resolved.pan = hit.pan;
            else errors.push(`Applicant "${applicantCell}" not found under "${matchedClient.name}"`);
          }

          fields.forEach((f) => {
            if (f.key === 'groupLeader' || f.key === 'applicant') return;
            const cellKey = keyFor[f.key];
            resolved[f.key] = coerceCell(f, cellKey ? raw[cellKey] : '', team, errors);
          });

          fields.forEach((f) => {
            if (f.key === 'groupLeader' || f.key === 'applicant') return;
            const isRequired = typeof f.required === 'function' ? f.required(resolved) : !!f.required;
            if (!isRequired) return;
            const v = resolved[f.key];
            if (v === '' || v == null) errors.push(`${f.label} is required`);
          });

          if (dedupeKeyFor && errors.length === 0) {
            const key = dedupeKeyFor(resolved);
            if (key && existingKeys.has(key)) errors.push('Duplicate — a matching record already exists');
          }

          return { rowNum, resolved, errors };
        });

        resolve({ headerError: '', results });
      } catch {
        resolve({ headerError: 'Failed to read the file. Make sure it is a valid .xlsx or .xls file.', results: [] });
      }
    };
    reader.readAsArrayBuffer(file);
  });
}
