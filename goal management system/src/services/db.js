// Clients / Goals / MOMs — data seam.
//
// Every function here keeps the exact signature it had when this file talked
// to Supabase directly, so no calling component changed. What changed is what
// happens *inside*: all reads/writes now go through the backend API
// (server/), which owns the single Postgres database and enforces auth.
import { api } from './api';

// GET all clients (each with nested goals + moms) — mirrors the previous
// `select('*, goals(*), moms(*)')` shape exactly; the server's field names
// already match these camelCase keys, so no remapping is needed here.
export async function getClients() {
  const { clients } = await api.get('/clients');
  return clients;
}

export async function addClient(client) {
  await api.post('/clients', {
    id: client.id,
    name: client.name,
    pan: client.pan,
    age: client.age,
    clientDetails: client.clientDetails || {},
  });
}

export async function updateClient(clientId, updates) {
  const patch = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.pan !== undefined) patch.pan = updates.pan;
  if (updates.age !== undefined) patch.age = updates.age;
  if (updates.assumptions !== undefined) patch.assumptions = updates.assumptions;
  if (updates.assetAllocation !== undefined) patch.assetAllocation = updates.assetAllocation;
  if (updates.clientDetails !== undefined) patch.clientDetails = updates.clientDetails;
  await api.patch(`/clients/${clientId}`, patch);
}

export async function deleteClient(clientId) {
  await api.del(`/clients/${clientId}`);
}

// This client's audit trail — personal-detail edits, document uploads/
// renames/deletes, manager reassignments. Open to any authenticated user
// (same exposure level as the rest of a Client record).
export async function fetchClientActivity(clientId) {
  const { logs } = await api.get(`/clients/${clientId}/activity`);
  return logs;
}

export async function addGoal(clientId, goal) {
  await api.post(`/clients/${clientId}/goals`, goal);
}

export async function updateGoal(clientId, goalId, updates) {
  await api.patch(`/goals/${goalId}`, updates);
}

export async function deleteGoal(clientId, goalId) {
  await api.del(`/goals/${goalId}`);
}

export async function addMom(clientId, mom) {
  await api.post(`/clients/${clientId}/moms`, mom);
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
  await api.post(`/leads/${leadId}/moms/reparent`, { clientId });
}

export async function updateMom(clientId, momId, updates) {
  await api.patch(`/moms/${momId}`, updates);
}

export async function deleteMom(clientId, momId) {
  await api.del(`/moms/${momId}`);
}
