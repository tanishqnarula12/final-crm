// Shared Zod schemas used by more than one route file.
//
// Numeric fields use z.coerce.number() rather than z.number() — the old
// Supabase-backed path silently accepted loosely-typed values (e.g. a numeric
// string landing in a numeric column), so coercing here preserves that
// leniency instead of introducing a stricter validator that could reject
// requests the app previously accepted.
import { z } from 'zod';

const num = (def) => z.coerce.number().optional().default(def);

export const goalCreateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  amount: num(0),
  targetMonth: num(0),
  targetYear: num(0),
  createdMonth: num(0),
  createdYear: num(0),
  inflation: num(0),
  expectedReturn: num(0),
  sipIncRate: num(0),
  currentInv: num(0),
  currentSip: num(0),
  kidName: z.string().optional().nullable(),
  history: z.array(z.any()).optional().default([]),
  actuals: z.array(z.any()).optional().default([]),
  createdAt: z.coerce.date().optional(),
});
export const goalUpdateSchema = goalCreateSchema.omit({ id: true }).partial();

export const momCreateSchema = z.object({
  id: z.string().min(1),
  meetingNumber: z.string().optional().default(''),
  meetingDate: z.string().optional().default(''),
  data: z.record(z.any()).optional().default({}),
});
export const momUpdateSchema = momCreateSchema.omit({ id: true }).partial();
