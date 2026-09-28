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
//
// Supabase Storage (when configured, lib/storage.js): a newly saved file is
// moved into the private bucket and the attachment keeps only a `storage`
// reference — { dataUrl|html|data: { path, enc, prefix?, contentType, size } },
// path clients/<clientId>/<documentId>/<key>-<content hash>
// — from which the exact original string is rebuilt when the file is opened.
// Browsers never see or send that reference (the slim shape hides it, and one
// arriving in a request is ignored), so a crafted request can't point a
// document at someone else's file. Files already inline stay inline until
// the one-off copy moves them (NEXT_STEPS.md §3, step 2).
import { can } from './permissions.js';
import { storageEnabled, putObject, getObject, pathSegment, contentHash, encodeFileString, decodeFileString } from './storage.js';

export const FILE_KEYS = ['dataUrl', 'html', 'data'];
export const STRIPPED = 'fileStripped';
export const STORAGE = 'storage';

const isObj = (a) => !!a && typeof a === 'object' && !Array.isArray(a);
const hasFile = (a) => isObj(a) && FILE_KEYS.some((k) => typeof a[k] === 'string');
const hasStoredFile = (a) => isObj(a) && isObj(a[STORAGE]) && FILE_KEYS.some((k) => isObj(a[STORAGE][k]));
const hasAnyFile = (a) => hasFile(a) || hasStoredFile(a);

function slimAttachment(a) {
  if (!hasAnyFile(a)) return a;
  const out = {};
  for (const [k, v] of Object.entries(a)) if (!FILE_KEYS.includes(k) && k !== STORAGE) out[k] = v;
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
      WHEN jsonb_typeof(a) = 'object' AND (jsonb_typeof(a->'dataUrl') = 'string' OR jsonb_typeof(a->'html') = 'string' OR jsonb_typeof(a->'data') = 'string'
                                           OR jsonb_typeof(a->'${STORAGE}') = 'object')
        THEN (a - 'dataUrl' - 'html' - 'data' - '${STORAGE}') || '{"${STRIPPED}": true}'::jsonb
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

// File contents for one client's attachments: { [attachmentId]: { dataUrl?, html?, data? } }
// — inline ones as stored, Storage ones fetched and rebuilt exactly. Throws if
// a stored file can't be fetched, so the app shows an error, not a blank.
export async function loadFiles(client, ids) {
  const want = ids && ids.length ? new Set(ids) : null;
  const files = {};
  const jobs = [];
  for (const a of client?.clientDetails?.attachments || []) {
    if (!isObj(a) || !a.id || (want && !want.has(a.id)) || !hasAnyFile(a)) continue;
    const f = {};
    for (const k of FILE_KEYS) {
      if (typeof a[k] === 'string') f[k] = a[k];
      else if (isObj(a[STORAGE]?.[k])) {
        const ref = a[STORAGE][k];
        jobs.push(getObject(ref.path).then((bytes) => { f[k] = decodeFileString(bytes, ref); }));
      }
    }
    files[a.id] = f;
  }
  await Promise.all(jobs);
  return files;
}

// A `storage` reference is only ever written by this server. Drops any that
// arrive in a request (for routes that don't go through
// restoreAttachmentFiles, e.g. creating a client).
export function dropUntrustedRefs(attachments) {
  if (!Array.isArray(attachments)) return attachments;
  return attachments.map((a) => {
    if (!isObj(a) || a[STORAGE] === undefined) return a;
    const { [STORAGE]: _untrusted, ...rest } = a;
    return rest;
  });
}

// Moves the files of newly saved attachments into Storage, leaving a
// `storage` reference in their place. `keep` holds the attachment objects
// exactly as already stored — those are left alone (an inline file that's
// already on record moves only with the one-off copy script). A file that
// can't be stored stays inline, so a save never fails because of Storage.
export async function offloadAttachmentFiles(clientId, attachments, keep = new Set()) {
  if (!storageEnabled() || !Array.isArray(attachments)) return attachments;
  return Promise.all(attachments.map(async (a) => {
    if (!isObj(a) || !a.id || !hasFile(a) || keep.has(a)) return a;
    try {
      return await storeAttachmentFiles(clientId, a);
    } catch (err) {
      console.error(`[storage] kept file inline for client ${clientId} / ${a.id}:`, err.message);
      return a;
    }
  }));
}

// One attachment's inline file(s) → Storage. Exported for the copy script.
export async function storeAttachmentFiles(clientId, a) {
  const refs = { ...(hasStoredFile(a) ? a[STORAGE] : {}) };
  const out = { ...a };
  for (const k of FILE_KEYS) {
    if (typeof a[k] !== 'string') continue;
    const { bytes, contentType, ref } = encodeFileString(a[k], k);
    if (decodeFileString(bytes, ref) !== a[k]) throw new Error(`could not encode ${k} losslessly`);
    // The content hash in the name means two different files can never
    // overwrite each other (even two documents that ended up with the same
    // id); the same file saved twice lands on the same object.
    const path = `clients/${pathSegment(clientId)}/${pathSegment(a.id)}/${k}-${contentHash(bytes)}`;
    await putObject(path, bytes, contentType);
    refs[k] = { path, ...ref, contentType, size: bytes.length };
    delete out[k];
  }
  out[STORAGE] = refs;
  return out;
}

// Key-order-insensitive JSON, for "is this the same attachment?".
const stable = (v) => JSON.stringify(v, (_k, val) => (isObj(val)
  ? Object.fromEntries(Object.keys(val).sort().map((key) => [key, val[key]]))
  : val));

const withoutFiles = (a) => {
  const out = {};
  for (const [k, v] of Object.entries(a)) if (!FILE_KEYS.includes(k) && k !== STRIPPED && k !== STORAGE) out[k] = v;
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
// normalised to the stored object too. A `storage` reference in the request
// is never trusted: it's dropped, and the attachment is resolved like a slim
// one, from what's on record.
export async function restoreAttachmentFiles(prisma, user, clientId, incoming, stored) {
  if (!Array.isArray(incoming)) return incoming;
  const storedById = new Map((Array.isArray(stored) ? stored : []).filter((a) => isObj(a) && a.id).map((a) => [a.id, a]));
  const needsRecord = (a) => isObj(a) && (a[STRIPPED] || a[STORAGE] !== undefined) && !hasFile(a);

  const foreignIds = incoming
    .filter((a) => needsRecord(a) && a.id && !storedById.has(a.id))
    .map((a) => String(a.id));
  const foreign = foreignIds.length ? await findAttachmentsElsewhere(prisma, user, clientId, foreignIds) : new Map();

  const out = [];
  for (const a of incoming) {
    if (!isObj(a)) { out.push(a); continue; }
    const src = a.id ? (storedById.get(a.id) || foreign.get(a.id)) : null;
    const { [STRIPPED]: _mark, [STORAGE]: _untrusted, ...rest } = a;
    let rec = rest;
    if (needsRecord(a)) {
      if (!src) continue;
      rec = { ...src, ...withoutFiles(rest) };
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
  for (const r of rows) if (viewable.has(r.clientId) && hasAnyFile(r.att) && !found.has(r.att.id)) found.set(r.att.id, r.att);
  return found;
}
