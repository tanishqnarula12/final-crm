// Task attachments (the Renewal / Claim / FD / Other-Policy registers are Task
// rows too) live inside tasks.payload with their file inline as base64
// `dataUrl`: payload.attachments[] and, copied again for each stage change,
// payload.stageHistory[].attachments[]. In production that was ~9.4 MB of the
// 9.5 MB tasks table (Sep 2026, 27 files), and every open Tasks / COBR /
// Dashboard / client-profile screen downloaded all of it again after any
// task changed.
//
// Same approach as client documents (lib/clientFiles.js): a browser that asks
// for `?slim=1` gets each attachment's details without its file, marked
// `fileStripped: true`, and fetches a file when someone opens it (GET
// /tasks/:id/files). Saves send the tasks back slim, and restoreTaskFiles puts
// the stored files back before anything compares or stores them. Browsers
// that don't ask for slim get the full shape, unchanged.
import { can } from './permissions.js';

export const STRIPPED = 'fileStripped';
const FILE_KEYS = ['dataUrl', 'data'];

const isObj = (a) => !!a && typeof a === 'object' && !Array.isArray(a);
const hasFile = (a) => isObj(a) && FILE_KEYS.some((k) => typeof a[k] === 'string');

function slimAttachment(a) {
  if (!hasFile(a)) return a;
  const out = {};
  for (const [k, v] of Object.entries(a)) if (!FILE_KEYS.includes(k)) out[k] = v;
  out[STRIPPED] = true;
  return out;
}

// Calls fn(list, setList) for every attachment list in a task payload.
function eachAttachmentList(payload, fn) {
  if (!isObj(payload)) return;
  if (Array.isArray(payload.attachments)) fn(payload.attachments, (next) => { payload.attachments = next; });
  if (Array.isArray(payload.stageHistory)) {
    payload.stageHistory.forEach((h) => {
      if (isObj(h) && Array.isArray(h.attachments)) fn(h.attachments, (next) => { h.attachments = next; });
    });
  }
}

const hasAnyFile = (payload) => {
  let found = false;
  eachAttachmentList(payload, (list) => { if (!found && list.some(hasFile)) found = true; });
  return found;
};

// A task payload with every attachment slim. Untouched payloads are returned
// as-is (no copy), so slimming a list of mostly file-less tasks is cheap.
export function slimTask(payload) {
  if (!hasAnyFile(payload)) return payload;
  const out = { ...payload };
  if (Array.isArray(out.attachments)) out.attachments = out.attachments.map(slimAttachment);
  if (Array.isArray(out.stageHistory)) {
    out.stageHistory = out.stageHistory.map((h) => (isObj(h) && Array.isArray(h.attachments)
      ? { ...h, attachments: h.attachments.map(slimAttachment) }
      : h));
  }
  return out;
}

// Slim payloads for a cached row list, computed once per row list.
const slimCache = new WeakMap();
export function slimTaskList(rows) {
  let hit = slimCache.get(rows);
  if (!hit) {
    hit = new Map(rows.map((r) => [r.id, slimTask(r.payload)]));
    slimCache.set(rows, hit);
  }
  return hit;
}

// { [attachmentId]: { dataUrl?, data? } } for one task (every list; the same
// file appears in attachments and in stage history under one id).
export function pickTaskFiles(payload, ids) {
  const want = ids && ids.length ? new Set(ids) : null;
  const files = {};
  eachAttachmentList(payload, (list) => {
    for (const a of list) {
      if (!isObj(a) || !a.id || files[a.id] || (want && !want.has(a.id)) || !hasFile(a)) continue;
      const f = {};
      for (const k of FILE_KEYS) if (typeof a[k] === 'string') f[k] = a[k];
      files[a.id] = f;
    }
  });
  return files;
}

// Everyone who can see a task may open its files — and, like
// GET /closed-for-client, anyone who can view the client may open a CLOSED
// task's files.
export async function canOpenTaskFiles(prisma, user, row, moduleFor) {
  if (can(user, moduleFor(row), 'view', row)) return true;
  const p = row.payload || {};
  if (p.stage !== 'Completed' && p.stage !== 'Lost') return false;
  const client = p.groupLeaderId
    ? await prisma.client.findFirst({ where: { id: p.groupLeaderId, deletedAt: null } })
    : null;
  return !!client && can(user, 'clients', 'view', client);
}

const hasStripped = (payload) => {
  let found = false;
  eachAttachmentList(payload, (list) => { if (!found && list.some((a) => isObj(a) && a[STRIPPED])) found = true; });
  return found;
};

// Puts the stored file back into every slim attachment of the incoming tasks
// (mutates them). A slim attachment is matched by id against every
// attachment list of the stored task, then — for one copied between records —
// of the other tasks this user can see. If its file can't be found anywhere
// it is dropped rather than saved as an empty, file-less entry. Returns the
// number of attachments dropped.
export async function restoreTaskFiles(prisma, user, incoming, moduleFor) {
  const needing = (incoming || []).filter((t) => isObj(t) && hasStripped(t));
  if (!needing.length) return 0;
  const stored = await prisma.task.findMany({ where: { id: { in: needing.map((t) => String(t.id)) } } });
  const storedById = new Map(stored.map((r) => [r.id, r]));

  const filesFor = new Map(); // taskId -> files map
  const storedAttsFor = new Map(); // taskId -> Map(attachmentId -> [stored objects])
  const missing = new Set();
  for (const t of needing) {
    const row = storedById.get(t.id);
    const files = row ? pickTaskFiles(row.payload) : {};
    filesFor.set(t.id, files);
    const atts = new Map();
    if (row) eachAttachmentList(row.payload, (list) => list.forEach((a) => {
      if (isObj(a) && a.id) atts.set(a.id, [...(atts.get(a.id) || []), a]);
    }));
    storedAttsFor.set(t.id, atts);
    eachAttachmentList(t, (list) => list.forEach((a) => {
      if (isObj(a) && a[STRIPPED] && !hasFile(a) && a.id && !files[a.id]) missing.add(String(a.id));
    }));
  }
  const elsewhere = missing.size ? await findTaskFilesElsewhere(prisma, user, [...missing], moduleFor) : {};

  let dropped = 0;
  for (const t of needing) {
    const files = filesFor.get(t.id);
    const storedAtts = storedAttsFor.get(t.id);
    eachAttachmentList(t, (list, setList) => {
      const next = [];
      for (const a of list) {
        if (!isObj(a) || !a[STRIPPED]) { next.push(a); continue; }
        const { [STRIPPED]: _mark, ...rest } = a;
        let rec = rest;
        if (!hasFile(rec)) {
          const f = (a.id && (files[a.id] || elsewhere[a.id])) || null;
          if (!f) { dropped++; continue; }
          rec = { ...rest, ...f };
        }
        // An unchanged attachment goes back as the stored object itself, so
        // the save sees no change (key order included) — otherwise an
        // untouched task would look edited and could be refused.
        const same = (storedAtts.get(a.id) || []).find((s) => stable(s) === stable(rec));
        next.push(same || rec);
      }
      setList(next);
    });
  }
  return dropped;
}

// Key-order-insensitive JSON, for "is this the same attachment?".
const stable = (v) => JSON.stringify(v, (_k, val) => (isObj(val)
  ? Object.fromEntries(Object.keys(val).sort().map((key) => [key, val[key]]))
  : val));

async function findTaskFilesElsewhere(prisma, user, ids, moduleFor) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT t.id FROM tasks t,
       LATERAL (
         SELECT a FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.payload->'attachments') = 'array' THEN t.payload->'attachments' ELSE '[]'::jsonb END) a
         UNION ALL
         SELECT a FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.payload->'stageHistory') = 'array' THEN t.payload->'stageHistory' ELSE '[]'::jsonb END) h,
                       jsonb_array_elements(CASE WHEN jsonb_typeof(h->'attachments') = 'array' THEN h->'attachments' ELSE '[]'::jsonb END) a
       ) x
      WHERE jsonb_typeof(x.a) = 'object' AND x.a->>'id' = ANY($1::text[])`,
    ids,
  );
  if (!rows.length) return {};
  const owners = await prisma.task.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
  const found = {};
  for (const row of owners) {
    if (!can(user, moduleFor(row), 'view', row)) continue;
    const files = pickTaskFiles(row.payload, ids);
    for (const [id, f] of Object.entries(files)) if (!found[id]) found[id] = f;
  }
  return found;
}
