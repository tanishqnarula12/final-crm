// Real team directory — the accounts created through the RBAC system.
//
// Replaces the old hardcoded TEAM_MEMBERS roster. Same cache-over-API seam as
// utils/tasks.js etc.: `loadTeam()` stays synchronous (assignment dropdowns
// read it mid-render), hydrated once on login via `hydrateTeam()`.

import { api } from './api';

let cache = [];

export const loadTeam = () => cache;

export async function hydrateTeam() {
  try {
    const { team } = await api.get('/team');
    cache = Array.isArray(team) ? team : [];
  } catch (err) {
    console.error('Failed to load team directory:', err);
    cache = [];
  }
  window.dispatchEvent(new Event('crm:team-updated'));
  return cache;
}

// Resolve an account id (or a legacy name string) to a display name. Legacy
// records stored a display-name string in owner fields before the RBAC switch;
// if the value isn't a known account id, we show it verbatim (back-compat).
export function teamName(idOrName) {
  if (!idOrName) return '';
  const hit = cache.find((m) => m.id === idOrName);
  return hit ? hit.name : String(idOrName);
}

export const teamMember = (id) => cache.find((m) => m.id === id) || null;

// The uploaded profile photo (base64 data URL) for a team member, resolved by
// account id OR display name — so any avatar keyed by either can show the real
// picture. Returns '' when the person isn't a team member or has no photo (the
// caller then falls back to coloured initials).
export function teamPhoto(idOrName) {
  if (!idOrName) return '';
  const v = String(idOrName).trim();
  const hit = cache.find((m) => m.id === v)
    || cache.find((m) => (m.name || '').trim().toLowerCase() === v.toLowerCase());
  return hit?.photo || '';
}

// Resolve a manager reference from an imported sheet — a team member's id
// verbatim, or their display name (case-insensitively) — to a UNIQUE active
// team-member id. Returns { id, status } with status:
//   'ok'        exactly one match (id set)
//   'empty'     no value provided
//   'nomatch'   a value was given but no team member has that id/name
//   'ambiguous' the name matches MORE THAN ONE account
// Ambiguity is a real hazard here: if two accounts share a display name (e.g.
// an Admin AND an RM both named "Nitesh Luthra"), a name alone cannot safely
// pick one — and owner/RM drives RBAC plus every task/prospect that hangs off
// the client. So the caller must surface an error instead of silently guessing.
export function resolveTeamMemberId(value, team = cache) {
  const v = String(value ?? '').trim();
  if (!v) return { id: '', status: 'empty' };
  if (team.some((m) => m.id === v)) return { id: v, status: 'ok' };
  const matches = team.filter((m) => (m.name || '').trim().toLowerCase() === v.toLowerCase());
  if (matches.length === 1) return { id: matches[0].id, status: 'ok' };
  if (matches.length === 0) return { id: '', status: 'nomatch' };
  return { id: '', status: 'ambiguous' };
}
