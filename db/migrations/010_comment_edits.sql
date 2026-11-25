-- Members can edit and delete their own comments.
-- edited_at: when the author last changed the text. is_deleted: deleted, but kept as a placeholder because it has replies.
ALTER TABLE comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
