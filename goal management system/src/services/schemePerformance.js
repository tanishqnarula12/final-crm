// Top Performing Schemes — thin REST wrapper over /api/scheme-performance.
//
// No client-side cache: only the Others → Top Performing Schemes module reads
// this, and it refetches on month/category change (same approach as
// services/notices.js). The heavy payloads — a category's raw rows and the
// original workbook — are separate calls so switching months stays cheap.
import { api } from './api';

// Every reporting month that has data, newest first, each with its versions.
export const listMonths = () =>
  api.get('/scheme-performance/months').then((d) => d.months || []);

// One monthly snapshot: header + per-category summary (no raw rows).
export const getUpload = (id) =>
  api.get(`/scheme-performance/uploads/${id}`).then((d) => d.upload);

// One worksheet in full — raw rows exactly as uploaded, plus its analysis rows.
export const getCategory = (id) =>
  api.get(`/scheme-performance/categories/${id}`).then((d) => d.category);

// The consolidated cross-category analysis list, filtered server-side.
export const listSchemes = (uploadId, { result, category, q } = {}) => {
  const params = new URLSearchParams();
  if (result) params.set('result', result);
  if (category) params.set('category', category);
  if (q) params.set('q', q);
  const qs = params.toString();
  return api
    .get(`/scheme-performance/uploads/${uploadId}/schemes${qs ? `?${qs}` : ''}`)
    .then((d) => d.schemes || []);
};

// The original workbook, byte for byte as uploaded.
export const getOriginalFile = (uploadId) =>
  api.get(`/scheme-performance/uploads/${uploadId}/file`);

// How one scheme has screened month over month (current version of each month).
export const getSchemeHistory = (name) =>
  api
    .get(`/scheme-performance/scheme-history?name=${encodeURIComponent(name)}`)
    .then((d) => d.history || []);

// Distinct scheme names, for the history search box's suggestions.
export const searchSchemeNames = (q) =>
  api
    .get(`/scheme-performance/scheme-names${q ? `?q=${encodeURIComponent(q)}` : ''}`)
    .then((d) => d.names || []);

// Store a monthly snapshot. `mode` is 'new' (add a version) or 'replace' (also
// mark the month's previous version superseded). Neither ever deletes data.
export const createUpload = (payload) =>
  api.post('/scheme-performance/uploads', payload);

// Soft delete — uploader or admin only.
export const deleteUpload = (id) => api.del(`/scheme-performance/uploads/${id}`);
