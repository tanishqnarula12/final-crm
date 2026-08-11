-- Grant RM full stage-change rights on investment prospects (default was
-- NONE) so an RM can move a prospect through Pre-Qualified -> Qualified and
-- beyond, per the new Pre-Qualified workflow.
--
-- Conditional on the cell still being at its old default ('NONE') so this
-- never clobbers a value an admin has since customized via the Permissions
-- Matrix UI — matches the "admin can dial any cell down at any time" design
-- documented in permissionCatalog.js. A fresh database seeded AFTER this
-- change already gets 'ASSIGNED' from the catalog default (see
-- permissionCatalog.js DEF.investmentProspects.changeStage), so this UPDATE
-- is a no-op there (WHERE clause matches zero rows).
UPDATE "role_permissions"
SET "scope" = 'ASSIGNED'
WHERE "role" = 'RM' AND "module" = 'investmentProspects' AND "action" = 'changeStage' AND "scope" = 'NONE';
