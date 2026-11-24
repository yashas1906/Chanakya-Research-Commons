-- 007: Backfill the activity history the warehouse reads. Safe to run more than once.
--
-- The seed wrote comments and votes straight into their tables without matching activity_events, so the
-- warehouse (dw.fact_research_activity) and trend detection never saw them (2 comment events vs ~2,000 comments).
-- Each missing event is added at the original timestamp and tagged with the post's topics.

INSERT INTO activity_events (user_id, event_type, target_id, topic_tags, occurred_at)
SELECT c.author_id, 'add_comment', c.comment_id, p.tags, c.created_at
FROM comments c
JOIN posts p ON p.post_id = c.post_id
WHERE NOT EXISTS (
    SELECT 1 FROM activity_events e WHERE e.event_type = 'add_comment' AND e.target_id = c.comment_id
);

INSERT INTO activity_events (user_id, event_type, target_id, topic_tags, occurred_at)
SELECT v.user_id, 'vote_post', v.post_id, p.tags, v.created_at
FROM post_upvotes v
JOIN posts p ON p.post_id = v.post_id
WHERE NOT EXISTS (
    SELECT 1 FROM activity_events e WHERE e.event_type = 'vote_post' AND e.target_id = v.post_id AND e.user_id = v.user_id
);

-- Topic tags for comment / vote / save events logged before the backend started tagging them.
UPDATE activity_events e SET topic_tags = p.tags
FROM comments c JOIN posts p ON p.post_id = c.post_id
WHERE e.event_type = 'add_comment' AND e.target_id = c.comment_id AND (e.topic_tags IS NULL OR cardinality(e.topic_tags) = 0);

UPDATE activity_events e SET topic_tags = p.tags
FROM posts p
WHERE e.event_type = 'vote_post' AND e.target_id = p.post_id AND (e.topic_tags IS NULL OR cardinality(e.topic_tags) = 0);

UPDATE activity_events e
SET topic_tags = ARRAY(SELECT t FROM unnest(pa.topics) t ORDER BY t LIKE 'School of %', t)
FROM papers pa
WHERE e.event_type = 'save_paper' AND e.target_id = pa.paper_id AND (e.topic_tags IS NULL OR cardinality(e.topic_tags) = 0);
