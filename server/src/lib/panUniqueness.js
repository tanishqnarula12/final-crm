// PAN uniqueness — one PAN, one person, across the WHOLE system.
//
// A PAN identifies a real taxpayer, so the same number must never appear on two
// records anywhere: not two clients, not two leads, and not a lead and a client
// at once (that last case is the one that used to slip through — clients only
// ever checked themselves).
//
// Matching is case-insensitive and whitespace-trimmed, so "abcde1234f " can't
// sneak past an existing "ABCDE1234F".
import { prisma } from '../db.js';

export const normalizePan = (pan) => String(pan ?? '').trim().toUpperCase();

const leadName = (payload) =>
  payload?.name || payload?.leadName || payload?.groupLeader || 'an existing lead';

// Returns { kind: 'client' | 'lead', name, id } describing the record already
// holding this PAN, or null when it's free. Pass the record being saved via
// excludeClientId/excludeLeadId so it never collides with itself.
export async function findPanConflict(pan, { excludeClientId = null, excludeLeadId = null } = {}) {
  const needle = normalizePan(pan);
  if (!needle) return null; // blank PAN is not a duplicate of anything

  const clientHit = await prisma.client.findFirst({
    where: {
      deletedAt: null,
      pan: { equals: needle, mode: 'insensitive' },
      ...(excludeClientId ? { NOT: { id: excludeClientId } } : {}),
    },
    select: { id: true, name: true },
  });
  if (clientHit) return { kind: 'client', name: clientHit.name, id: clientHit.id };

  // A lead's PAN lives in its JSON payload (not a promoted column), so it's
  // matched in app code rather than in the query.
  const leads = await prisma.lead.findMany({
    where: { deletedAt: null, ...(excludeLeadId ? { NOT: { id: excludeLeadId } } : {}) },
    select: { id: true, payload: true },
  });
  const leadHit = leads.find((l) => normalizePan(l.payload?.pan) === needle);
  if (leadHit) return { kind: 'lead', name: leadName(leadHit.payload), id: leadHit.id };

  return null;
}

export const panConflictMessage = (conflict, pan) =>
  `PAN ${normalizePan(pan)} is already registered to ${conflict.kind} "${conflict.name}". `
  + 'A PAN must be unique across the whole system — no two clients or leads can share one.';
