-- Posts can be edited by their author; edited_at drives the "edited" marker in the UI.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- Faster "my collections" / collection contents lookups
CREATE INDEX IF NOT EXISTS idx_library_saves_collection ON library_saves(collection_id);
CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id, created_at DESC);
