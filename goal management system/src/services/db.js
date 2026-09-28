// Clients / Goals / MOMs — data seam.
//
// Every function here keeps the exact signature it had when this file talked
// to Supabase directly, so no calling component changed. What changed is what
// happens *inside*: all reads/writes now go through the backend API
// (server/), which owns the single Postgres database and enforces auth.
import { api } from './api';
import { createListSync } from './listSync';

// Clients come "slim": each document in clientDetails.attachments carries its
// details but not its file (`fileStripped: true`) — the files were ~99% of the
// list's size (61 MB in Sep 2026). A file is fetched when someone opens or
// links it; see services/clientFiles.js. Saving a slim copy back is safe: the
// server re-joins every document with its stored file.
const clientsSync = createListSync('/clients?slim=1', 'clients');

// GET all clients (each with nested goals + moms). Resolves to null when
// nothing changed since the last call (or a client save overlapped it) —
// keep the list you have. `force` always fetches.
export async function getClients({ force = false } = {}) {
  return clientsSync.fetch({ force });
}

// Returns the created client as the server stored it.
export async function addClient(client) {
  const done = clientsSync.beginWrite();
  try {
    const { client: created } = await api.post('/clients?slim=1', {
      id: client.id,
      name: client.name,
      pan: client.pan,
      age: client.age,
      clientDetails: client.clientDetails || {},
    });
    return created;
  } finally {
    done();
  }
}

// Returns the client as the server stored it (documents slim), so callers can
// update just that client on screen instead of reloading every client.
export async function updateClient(clientId, updates) {
  const patch = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.pan !== undefined) patch.pan = updates.pan;
  if (updates.age !== undefined) patch.age = updates.age;
  if (updates.assumptions !== undefined) patch.assumptions = updates.assumptions;
  if (updates.assetAllocation !== undefined) patch.assetAllocation = updates.assetAllocation;
  if (updates.clientDetails !== undefined) patch.clientDetails = updates.clientDetails;
  const done = clientsSync.beginWrite();
  try {
    const { client } = await api.patch(`/clients/${clientId}?slim=1`, patch);
    return client;
  } finally {
    done();
  }
}

// Puts a just-saved client (as the server returned it) into the app's client
// list. Only the client's own fields are taken — goals/MOMs keep what the list
// has, since a save's echo includes soft-deleted ones the list leaves out.
export function applySavedClient(saved) {
  if (!saved?.id || !window.patchClientLocal) return;
  const { goals: _goals, moms: _moms, ...fields } = saved;
  window.patchClientLocal(saved.id, fields);
}

// Notes — each add / edit / delete changes only clientDetails.notes on the
// server (routes/clients.js "Notes"), so a note saves just as fast for a
// client with many documents, and two people adding notes at once can't
// overwrite each other. `fallbackDetails` is the whole clientDetails with the
// change applied: it is sent the old way only when the server doesn't have
// the notes routes yet (a 404 for the route itself). Resolves to the notes
// as stored, after updating this client on screen.
const isMissingRoute = (err) => err?.status === 404 && /^Not found:/.test(err?.message || '');

async function changeNotes(clientId, call, fallbackDetails) {
  let res;
  try {
    res = await guarded(call);
  } catch (err) {
    if (!isMissingRoute(err)) throw err;
    const saved = await updateClient(clientId, { clientDetails: fallbackDetails });
    applySavedClient(saved);
    return saved?.clientDetails?.notes ?? fallbackDetails.notes;
  }
  window.patchClientLocal?.(clientId, (c) => ({
    clientDetails: { ...c.clientDetails, notes: res.notes },
    updatedAt: res.updatedAt,
  }));
  return res.notes;
}

export const addClientNote = (clientId, note, fallbackDetails) =>
  changeNotes(clientId, () => api.post(`/clients/${clientId}/notes`, { note }), fallbackDetails);

export const updateClientNote = (clientId, noteId, text, fallbackDetails) =>
  changeNotes(clientId, () => api.patch(`/clients/${clientId}/notes/${encodeURIComponent(noteId)}`, { text }), fallbackDetails);

export const deleteClientNote = (clientId, noteId, fallbackDetails) =>
  changeNotes(clientId, () => api.del(`/clients/${clientId}/notes/${encodeURIComponent(noteId)}`), fallbackDetails);

export async function deleteClient(clientId) {
  const done = clientsSync.beginWrite();
  try {
    await api.del(`/clients/${clientId}`);
  } finally {
    done();
  }
}

// This client's audit trail — personal-detail edits, document uploads/
// renames/deletes, manager reassignments. Open to any authenticated user
// (same exposure level as the rest of a Client record).
export async function fetchClientActivity(clientId) {
  const { logs } = await api.get(`/clients/${clientId}/activity`);
  return logs;
}

// Returns the server-created goal (with its real createdAt/etc.) so the
// caller can merge it straight into local state instead of reloading
// everything — see App.jsx's handleAddGoal.
// Goals and MOMs ride inside the client list, so their writes hold off a
// client-list refresh that overlapped them (see services/listSync).
const guarded = async (fn) => {
  const done = clientsSync.beginWrite();
  try { return await fn(); } finally { done(); }
};

export async function addGoal(clientId, goal) {
  const { goal: created } = await guarded(() => api.post(`/clients/${clientId}/goals`, goal));
  return created;
}

export async function updateGoal(clientId, goalId, updates) {
  const { goal: updated } = await guarded(() => api.patch(`/goals/${goalId}`, updates));
  return updated;
}

export async function deleteGoal(clientId, goalId) {
  await guarded(() => api.del(`/goals/${goalId}`));
}

export async function addMom(clientId, mom) {
  await guarded(() => api.post(`/clients/${clientId}/moms`, mom));
}

// Lead-side equivalents — MOM drafted against a lead before it's converted
// to a client (the "Create MoM" lead stage). updateMom/deleteMom below are
// shared as-is: they only ever need the momId, not which parent it belongs to.
export async function getLeadMoms(leadId) {
  const { moms } = await api.get(`/leads/${leadId}/moms`);
  return moms;
}

export async function addLeadMom(leadId, mom) {
  await api.post(`/leads/${leadId}/moms`, mom);
}

// Moves a converted lead's MOM(s) over to the new client, so the draft
// doesn't get orphaned under a lead that's no longer part of the active
// pipeline — it shows up in the client's own Draft MOM tab afterward.
export async function reparentLeadMoms(leadId, clientId) {
  await guarded(() => api.post(`/leads/${leadId}/moms/reparent`, { clientId }));
}

export async function updateMom(clientId, momId, updates) {
  await guarded(() => api.patch(`/moms/${momId}`, updates));
}

export async function deleteMom(clientId, momId) {
  await guarded(() => api.del(`/moms/${momId}`));
}
