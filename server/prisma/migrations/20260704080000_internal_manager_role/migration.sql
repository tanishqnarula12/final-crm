-- Add a new configurable role: INTERNAL_MANAGER. Unlike ADMIN (which bypasses
-- every check and is singular), this is a normal matrix-editable role — it
-- just ships with broad "close to Admin" default rights (ALL on every action
-- except delete, which stays NONE by default like everyone else).
ALTER TYPE "Role" ADD VALUE 'INTERNAL_MANAGER';
