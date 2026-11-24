-- 006: Moderation memory. Safe to run more than once.
--   users.spam_cleared_at  set when an admin clears a spam flag (false positive). Automated scans skip a
--                          cleared member unless they post again after the clearance.
ALTER TABLE users ADD COLUMN IF NOT EXISTS spam_cleared_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_system_alerts_entity ON system_alerts (entity_ref) WHERE is_resolved = FALSE;
