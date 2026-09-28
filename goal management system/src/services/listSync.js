// Background-refresh plumbing shared by the in-memory list caches (clients,
// tasks, prospects, leads, meetings, queries).
//
// 1. "Changed since?" — each list remembers the `version` the server sent with
//    it and passes it back as `?since=`; when nothing changed the server
//    answers `{ unchanged: true }` without reading the table, and fetch()
//    resolves to null so the caller keeps what it has (no re-render either).
//    See server/src/lib/listVersion.js. A server without that support simply
//    never sends a version, and every fetch returns the full list as before.
//
// 2. No stale overwrites — a refresh that was already in flight when a local
//    save started would land AFTER the optimistic update with the pre-save
//    list, so the record visibly flipped back (a prospect moved to Close Won
//    showed Qualified again for a moment) until the save's own response
//    corrected it. Writes are bracketed with beginWrite(); any refresh that
//    overlapped one is discarded (fetch() → null) and the next tick
//    reconciles.
import { api } from './api';

const registry = new Set();

// Forget every list's version (on logout), so the next login always gets full lists.
export const resetListVersions = () => registry.forEach((s) => s.reset());

export function createListSync(path, key) {
  let version = null;
  let pending = 0;
  let writeSeq = 0;

  const sync = {
    // Call before an optimistic local change; call the returned function once
    // the server has answered (either way). Safe to call more than once.
    beginWrite() {
      pending++;
      writeSeq++;
      let open = true;
      return () => {
        if (!open) return;
        open = false;
        pending--;
        writeSeq++;
      };
    },

    // Resolves to the full list when it changed, or null when it didn't — or
    // when a local write overlapped this request (local state is newer).
    // `force` skips the "changed since" check (still guarded against writes).
    async fetch({ force = false } = {}) {
      const seq = writeSeq;
      const since = !force && version ? `${path.includes('?') ? '&' : '?'}since=${encodeURIComponent(version)}` : '';
      const res = await api.get(`${path}${since}`);
      if (pending > 0 || seq !== writeSeq) return null;
      if (res?.unchanged) return null;
      version = typeof res?.version === 'string' ? res.version : null;
      return Array.isArray(res?.[key]) ? res[key] : [];
    },

    reset() { version = null; },
  };
  registry.add(sync);
  return sync;
}
