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

export async function updateMom(clientId, momId, updates) {
  await api.patch(`/moms/${momId}`, updates);
}

export async function deleteMom(clientId, momId) {
  await api.del(`/moms/${momId}`);
}
