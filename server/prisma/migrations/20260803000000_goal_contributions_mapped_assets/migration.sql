-- Goal Create Log ledger + mapped assets.
--
-- contributions: typed money events that feed the projection directly —
--   { id, type: 'valuation' | 'sip', date, amount }
--   'valuation' = a point-in-time portfolio snapshot (only the latest counts)
--   'sip'       = a permanent change to the running monthly SIP from that date
-- mappedAssets: the client's Asset Allocation holdings earmarked toward this
--   goal's starting corpus — { id, sectionId, label, amount }
--
-- Additive only: both default to '[]', so every existing goal row keeps its
-- current behaviour. The legacy `actuals` column is deliberately left in place
-- and untouched — goals logged before this migration are still read from it
-- (see goalContributions() on the client) until their log is next saved.
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "contributions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "goals" ADD COLUMN IF NOT EXISTS "mappedAssets" JSONB NOT NULL DEFAULT '[]';
