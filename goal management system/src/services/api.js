// Shared HTTP client for the CRM backend API.
//
// This is the frontend side of the data seam: every module that used to read
// localStorage / Supabase directly will route through here. All requests send
// the session cookie (`credentials: 'include'`) so the httpOnly auth cookie set
// by the backend is used automatically — no tokens are ever stored in JS.
//
// Base URL is configurable via VITE_API_URL so the same build can point at a
// local server now or a self-hosted (Mac Mini) server later.

// NOTE the `.trim()`: an env var pasted into a hosting dashboard often carries a
// stray trailing newline/space (e.g. VITE_API_URL="…/api\n"). The browser
// silently strips such whitespace when building a fetch URL, so REST keeps
// working and the junk goes unnoticed — but it quietly breaks anything that
// parses this value itself (most painfully the Socket.IO URL in services/chat.js,
// where a trailing "\n" defeats the "/api" strip and the socket ends up asking
// for an invalid namespace). Trimming here fixes it at the source for everyone.
const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').trim().replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Network / server-down: surface a clear, consistent error.
    throw new ApiError('Cannot reach the server. Is the API running?', 0);
  }

  // 204 No Content or empty body.
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.details);
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
  baseUrl: BASE_URL,
};
