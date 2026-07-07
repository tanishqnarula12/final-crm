// Centralized error + 404 handling so route handlers can just `throw` and
// async errors surface as clean JSON instead of crashing the process.

// Wrap an async route handler so rejected promises reach the error handler.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export function notFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Zod validation errors -> 400 with field details.
  if (err?.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation failed', details: err.issues });
  }
  // Prisma unique-constraint violation -> 409.
  if (err?.code === 'P2002') {
    return res.status(409).json({ error: 'A record with that value already exists.' });
  }
  // Prisma record-not-found -> 404.
  if (err?.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found.' });
  }
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.expose ? err.message : 'Internal server error' });
}
