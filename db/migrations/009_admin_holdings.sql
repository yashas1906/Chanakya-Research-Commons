-- Chanakya holdings posted from the admin dashboard: remember who posted each record and when it was last edited.
ALTER TABLE papers ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE papers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_papers_created_by ON papers (created_by) WHERE created_by IS NOT NULL;
