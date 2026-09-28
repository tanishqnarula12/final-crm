// Supabase Storage — where document files live instead of inline in the
// database (see lib/clientFiles.js). Talks to the Storage REST API with the
// service-role key, so the bucket stays private: files are only ever read
// through this server, after the CRM's own permission checks.
//
// A file is stored as its real bytes (a PDF as a PDF). What gets written back
// into the record is a small reference that lets the server rebuild the exact
// string the app used to store — `dataUrl`, `html` or `data` — character for
// character, so nothing that reads documents has to change.
import crypto from 'crypto';
import { config } from '../config.js';

const { url, serviceKey, bucket } = config.storage;
export const storageEnabled = () => !!(url && serviceKey && bucket);

const TIMEOUT_MS = 30_000;
const authHeaders = (extra = {}) => ({ Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, ...extra });
const objectUrl = (path) => `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`;

async function failure(res, what) {
  let detail = '';
  try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
  return new Error(`Storage ${what} failed (${res.status})${detail ? `: ${detail}` : ''}`);
}

export async function putObject(path, bytes, contentType) {
  const res = await fetch(objectUrl(path), {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': contentType, 'x-upsert': 'true' }),
    body: bytes,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw await failure(res, 'upload');
}

export async function getObject(path) {
  const res = await fetch(objectUrl(path), { headers: authHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw await failure(res, 'download');
  return Buffer.from(await res.arrayBuffer());
}

// A storage-safe path segment for an id (ids are app-generated, but never
// trust them to be path-safe): readable part + a short hash when anything
// had to be replaced, so two ids can't collide.
export function pathSegment(id) {
  const s = String(id);
  const safe = s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  return safe === s ? safe : `${safe}-${crypto.createHash('sha1').update(s).digest('hex').slice(0, 10)}`;
}

export const contentHash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);

// The string an app stored (`data:<mime>;base64,<…>`, or plain text such as a
// generated document's HTML) → the bytes to store + how to rebuild it.
export function encodeFileString(str, key) {
  const m = /^(data:([^,;]*)[^,]*;base64,)/.exec(str);
  if (m) {
    const bytes = Buffer.from(str.slice(m[1].length), 'base64');
    if (m[1] + bytes.toString('base64') === str) {
      return { bytes, contentType: m[2] || 'application/octet-stream', ref: { enc: 'base64', prefix: m[1] } };
    }
  }
  const contentType = key === 'html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
  return { bytes: Buffer.from(str, 'utf8'), contentType, ref: { enc: 'text' } };
}

export function decodeFileString(bytes, ref) {
  return ref.enc === 'base64' ? ref.prefix + bytes.toString('base64') : bytes.toString('utf8');
}
