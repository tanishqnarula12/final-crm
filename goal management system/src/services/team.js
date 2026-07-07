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
