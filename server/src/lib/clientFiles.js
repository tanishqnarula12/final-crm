// Client documents live in clients.clientDetails.attachments[] with their file
// inline — base64 `dataUrl`, plus `html` for generated documents (proposals,
// MOMs). In production that was 61 MB of the clients table's 61.5 MB (Sep
// 2026), and the client list shipped all of it on login, after most saves and
// on every 12-second background refresh — the CRM's lag and its Supabase
// egress overrun.
//
// A browser that asks for the "slim" shape (`?slim=1`) gets every attachment
// with its metadata only, marked `fileStripped: true`; it fetches a file's
// contents when someone actually opens or links that file (GET
// /clients/:id/files). The stripping happens inside Postgres, so the file
// bytes never even leave the database for a list. Older bundles that don't ask
// for slim still get the full shape, unchanged.
//
// Saves still send clientDetails back whole, so a slim attachment arriving in
// a PATCH is re-joined with its stored contents (restoreAttachmentFiles) before
// anything else looks at the request — a document can't lose its file by
// round-tripping through a slim browser copy.
import { can } from './permissions.js';

export const FILE_KEYS = ['dataUrl', 'html', 'data'];
export const STRIPPED = 'fileStripped';

const isObj = (a) => !!a && typeof a === 'object' && !Array.isArray(a);
const hasFile = (a) => isObj(a) && FILE_KEYS.some((k) => typeof a[k] === 'string');

function slimAttachment(a) {
  if (!hasFile(a)) return a;
  const out = {};
  for (const [k, v] of Object.entries(a)) if (!FILE_KEYS.includes(k)) out[k] = v;
  out[STRIPPED] = true;
  return out;
}

export function slimClient(client) {
  const atts = client?.clientDetails?.attachments;
  if (!Array.isArray(atts)) return client;
  return { ...client, clientDetails: { ...client.clientDetails, attachments: atts.map(slimAttachment) } };
}

// Same stripping as slimAttachment, done in SQL for the list.
const SLIM_DETAILS_SQL = `CASE WHEN jsonb_typeof("clientDetails"->'attachments') = 'array' THEN
  jsonb_set("clientDetails", '{attachments}', COALESCE((
    SELECT jsonb_agg(CASE
      WHEN jsonb_typeof(a) = 'object' AND (jsonb_typeof(a->'dataUrl') = 'string' OR jsonb_typeof(a->'html') = 'string' OR jsonb_typeof(a->'data') = 'string')
        THEN (a - 'dataUrl' - 'html' - 'data') || '{"${STRIPPED}": true}'::jsonb
      ELSE a END ORDER BY t.ord)
    FROM jsonb_array_elements("clientDetails"->'attachments') WITH ORDINALITY AS t(a, ord)
  ), '[]'::jsonb))
ELSE "clientDetails" END`;

// Every non-deleted client (goals + moms included), attachments slim. Cached
// against the clients/goals/moms fingerprint, so an unchanged table costs no
// read at all no matter how many people are refreshing.
let slimCache = { fingerprint: null, clients: null };

export async function loadSlimClients(prisma, fingerprint) {
  if (fingerprint && slimCache.fingerprint === fingerprint) return slimCache.clients;
  const [rows, details] = await Promise.all([
    prisma.client.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, pan: true, age: true, assumptions: true, assetAllocation: true,
        createdBy: true, assignedTo: true, departmentOwner: true, deletedAt: true, createdAt: true, updatedAt: true,
        goals: { where: { deletedAt: null } },
        moms: { where: { deletedAt: null } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.$queryRawUnsafe(`SELECT id, ${SLIM_DETAILS_SQL} AS "clientDetails" FROM clients WHERE "deletedAt" IS NULL`),
  ]);
  const detailsById = new Map(details.map((d) => [d.id, d.clientDetails]));
  // Same key order as the full shape (clientDetails sits after assetAllocation).
  const clients = rows.map(({ goals, moms, ...c }) => {
    const { createdBy, assignedTo, departmentOwner, deletedAt, createdAt, updatedAt, ...head } = c;
    return {
      ...head,
      clientDetails: detailsById.get(c.id) ?? {},
      createdBy, assignedTo, departmentOwner, deletedAt, createdAt, updatedAt,
      goals, moms,
    };
  });
  if (fingerprint) slimCache = { fingerprint, clients };
  return clients;
}

// File contents for one client's attachments: { [attachmentId]: { dataUrl?, html?, data? } }.
export function pickFiles(client, ids) {
  const want = ids && ids.length ? new Set(ids) : null;
  const files = {};
  for (const a of client?.clientDetails?.attachments || []) {
    if (!isObj(a) || !a.id || (want && !want.has(a.id)) || !hasFile(a)) continue;
    const f = {};
    for (const k of FILE_KEYS) if (typeof a[k] === 'string') f[k] = a[k];
    files[a.id] = f;
  }
  return files;
}

// Key-order-insensitive JSON, for "is this the same attachment?".
const stable = (v) => JSON.stringify(v, (_k, val) => (isObj(val)
  ? Object.fromEntries(Object.keys(val).sort().map((key) => [key, val[key]]))
  : val));

const withoutFiles = (a) => {
  const out = {};
  for (const [k, v] of Object.entries(a)) if (!FILE_KEYS.includes(k) && k !== STRIPPED) out[k] = v;
  return out;
};

// Re-joins slim attachments in a PATCH with their stored contents.
//   • unchanged (same metadata)   → the stored object itself, byte for byte,
//                                  so the per-document permission diff in
//                                  routes/clients.js sees no change
//   • renamed / re-categorised    → stored object with the new metadata
//   • slim but not stored on this client (another tab deleted it, or a flow
//     that copies a document between clients) → looked up on the other
//     clients this user can view; if the file can't be found anywhere it is
//     dropped rather than saved as an empty, file-less entry
// A full attachment that only differs from the stored one in key order is
// normalised to the stored object too.
export async function restoreAttachmentFiles(prisma, user, clientId, incoming, stored) {
  if (!Array.isArray(incoming)) return incoming;
  const storedById = new Map((Array.isArray(stored) ? stored : []).filter((a) => isObj(a) && a.id).map((a) => [a.id, a]));

  const foreignIds = incoming
    .filter((a) => isObj(a) && a[STRIPPED] && !hasFile(a) && a.id && !storedById.has(a.id))
    .map((a) => String(a.id));
  const foreign = foreignIds.length ? await findAttachmentsElsewhere(prisma, user, clientId, foreignIds) : new Map();

  const out = [];
  for (const a of incoming) {
    if (!isObj(a)) { out.push(a); continue; }
    const src = a.id ? (storedById.get(a.id) || foreign.get(a.id)) : null;
    let rec = a;
    if (a[STRIPPED]) {
      const { [STRIPPED]: _mark, ...rest } = a;
      rec = rest;
      if (!hasFile(rec)) {
        if (!src) continue;
        rec = { ...src, ...withoutFiles(rec) };
      }
    }
    out.push(src && stable(rec) === stable(src) ? src : rec);
  }
  return out;
}

async function findAttachmentsElsewhere(prisma, user, clientId, ids) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT c.id AS "clientId", a AS att
       FROM clients c, jsonb_array_elements(CASE WHEN jsonb_typeof(c."clientDetails"->'attachments') = 'array'
                                             THEN c."clientDetails"->'attachments' ELSE '[]'::jsonb END) a
      WHERE c.id <> $1 AND jsonb_typeof(a) = 'object' AND a->>'id' = ANY($2::text[])`,
    clientId, ids,
  );
  if (!rows.length) return new Map();
  const owners = await prisma.client.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } } });
  const viewable = new Set(owners.filter((c) => can(user, 'clients', 'view', c)).map((c) => c.id));
  const found = new Map();
  for (const r of rows) if (viewable.has(r.clientId) && hasFile(r.att) && !found.has(r.att.id)) found.set(r.att.id, r.att);
  return found;
}
