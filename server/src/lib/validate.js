// Tiny helper: parse+validate a request body against a Zod schema, throwing a
// ZodError (handled centrally -> 400) on failure.
export const parseBody = (schema, body) => schema.parse(body ?? {});

// Shape returned to the client for a user — never includes the password hash.
export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  roles: u.roles ?? [],
  active: u.active,
  lastLoginAt: u.lastLoginAt ?? null,
  createdAt: u.createdAt,
});
