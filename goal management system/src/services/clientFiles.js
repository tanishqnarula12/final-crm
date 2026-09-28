// On-demand file contents for client documents.
//
// The client list arrives "slim" (services/db.js): each document in
// clientDetails.attachments has its details but not its file, marked
// `fileStripped: true`. Anything that needs the file itself — a preview, a
// download, linking an existing document into a task or prospect — gets it
// from here, which fetches it once (GET /clients/:id/files) and keeps it for
// the session. A document's file never changes under the same id (a rename
// only touches its details; a re-upload gets a new id), so nothing here goes
// stale.
import { useEffect, useMemo, useState } from 'react';
import { api } from './api';

const files = new Map(); // attachment id -> { dataUrl?, html?, data? }
const inflight = new Map();
let heldChars = 0;
const MAX_HELD_CHARS = 120 * 1024 * 1024; // drop the oldest files past ~120 MB of base64

const sizeOf = (f) => Object.values(f || {}).reduce((n, v) => n + (typeof v === 'string' ? v.length : 0), 0);
const remember = (id, f) => {
  if (files.has(id)) heldChars -= sizeOf(files.get(id));
  files.set(id, f);
  heldChars += sizeOf(f);
  for (const [oldId, old] of files) {
    if (heldChars <= MAX_HELD_CHARS || oldId === id) break;
    files.delete(oldId);
    heldChars -= sizeOf(old);
  }
};

// Does this document still need its file fetched?
export const needsFile = (a) => !!a && typeof a === 'object' && a.fileStripped === true && !a.dataUrl && !a.html && !a.data;

// The document with its file filled in, when we have it (otherwise unchanged).
// It keeps its `fileStripped` mark: that mark is how slimForSave knows the
// server strips — and so re-joins — this document's file.
export function withFile(a) {
  if (!needsFile(a)) return a;
  const f = files.get(a.id);
  return f ? { ...a, ...f } : a;
}

// A document as it should be sent back in a client save: without its file
// when the server gave it to us slim (the server re-joins the stored file, so
// re-uploading it is pure waste). Anything without the mark — a new upload,
// or a list from a server that doesn't strip — is sent whole, as before.
export function slimForSave(a) {
  if (!a || typeof a !== 'object' || a.fileStripped !== true) return a;
  const { dataUrl: _d, html: _h, data: _x, ...rest } = a;
  return rest;
}

// Fetches file contents for one client's documents (all of them when `ids`
// is omitted). Concurrent calls for the same thing share one request.
export function fetchClientFiles(clientId, ids) {
  const key = `${clientId}|${ids ? [...ids].sort().join(',') : '*'}`;
  if (inflight.has(key)) return inflight.get(key);
  const qs = ids ? `?ids=${encodeURIComponent(ids.join(','))}` : '';
  const p = api.get(`/clients/${encodeURIComponent(clientId)}/files${qs}`)
    .then(({ files: got } = {}) => {
      Object.entries(got || {}).forEach(([id, f]) => remember(id, f));
      return got || {};
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// One document with its file, fetching it if needed.
export async function ensureFile(clientId, a) {
  if (!needsFile(a) || files.has(a.id)) return withFile(a);
  await fetchClientFiles(clientId, [a.id]);
  return withFile(a);
}

// Task attachments (Renewal / Claim / FD / Other-Policy records) come slim the
// same way (utils/tasks.js asks for ?slim=1); their files live on the task.
export function fetchTaskFiles(taskId, ids) {
  const key = `task:${taskId}|${ids ? [...ids].sort().join(',') : '*'}`;
  if (inflight.has(key)) return inflight.get(key);
  const qs = ids ? `?ids=${encodeURIComponent(ids.join(','))}` : '';
  const p = api.get(`/tasks/${encodeURIComponent(taskId)}/files${qs}`)
    .then(({ files: got } = {}) => {
      Object.entries(got || {}).forEach(([id, f]) => remember(id, f));
      return got || {};
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function ensureTaskFile(taskId, a) {
  if (!needsFile(a) || files.has(a.id) || !taskId) return withFile(a);
  await fetchTaskFiles(taskId, [a.id]);
  return withFile(a);
}

// A client with every document's file filled in — fetched in the background
// the first time; until then the documents are returned slim (their details
// still show). For forms that preview or link a client's existing documents;
// `enabled` false (a form with no documents section) skips the download.
export function useClientWithFiles(client, enabled = true) {
  const [tick, setTick] = useState(0);
  const atts = enabled ? client?.clientDetails?.attachments : null;
  const missing = useMemo(
    () => (Array.isArray(atts) ? atts.filter((a) => needsFile(a) && !files.has(a.id)).map((a) => a.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atts, tick],
  );
  const missingKey = missing.join(',');
  useEffect(() => {
    if (!client?.id || !missing.length) return undefined;
    let alive = true;
    fetchClientFiles(client.id, missing)
      .then(() => { if (alive) setTick((t) => t + 1); })
      .catch((err) => console.error('Could not load client documents:', err));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id, missingKey]);
  return useMemo(() => {
    if (!client || !Array.isArray(atts) || !atts.some(needsFile)) return client;
    return { ...client, clientDetails: { ...client.clientDetails, attachments: atts.map(withFile) } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, atts, tick]);
}

// One document for a preview: { file, loading, error }. `taskId`: the document
// is a task record's attachment (see cobrWorkspaceDocuments), not the client's.
export function useAttachmentFile(clientId, att, taskId = null) {
  const [, setTick] = useState(0);
  const [error, setError] = useState('');
  const pending = needsFile(att) && !files.has(att?.id);
  useEffect(() => {
    if (!pending || !(taskId || clientId)) return undefined;
    let alive = true;
    setError('');
    (taskId ? fetchTaskFiles(taskId, [att.id]) : fetchClientFiles(clientId, [att.id]))
      .then((got) => {
        if (!alive) return;
        if (!got?.[att.id]) setError('This file could not be found.');
        setTick((t) => t + 1);
      })
      .catch((err) => { if (alive) setError(err?.message || 'Could not load this document.'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, taskId, att?.id, pending]);
  return { file: withFile(att), loading: pending && !error, error };
}
