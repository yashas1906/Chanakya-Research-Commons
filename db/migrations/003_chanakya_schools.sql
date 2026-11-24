-- 003: Move the Commons onto the six official Chanakya University schools.
--
--   SAHSS  School of Arts, Humanities and Social Sciences
--   SBS    School of Biosciences
--   SOE    School of Engineering
--   SLGPP  School of Law, Governance and Public Policy
--   SMS    School of Management Sciences
--   SMNS   School of Mathematics and Natural Sciences
--
-- users.department now holds the school name, and papers.topics carries one school label per paper
-- (the label the library filter and the warehouse use).
--
-- Mapping of the old seed departments:
--   Computer Science & AI, Electronics & Communication -> SOE
--   Biotechnology                                       -> SBS
--   Management & Commerce                               -> SMS
--   School of Law                                       -> SLGPP
--   Liberal Arts & Humanities                           -> SAHSS
--
-- The old data had no mathematics / natural-science department, so SMNS is carved out of what was
-- engineering: seeded members whose interests are data mining or signal processing, and papers on
-- those topics or whose title/abstract is clearly statistics / mathematics / physics / chemistry.
-- Change the two "SMNS carve" rules below if you want a different split.
--
-- Safe to run more than once. Afterwards run:  python data_pipeline/run_dw_elt.py

BEGIN;

CREATE TEMP TABLE school_map (old_name TEXT PRIMARY KEY, new_name TEXT NOT NULL) ON COMMIT DROP;
INSERT INTO school_map (old_name, new_name) VALUES
  ('Computer Science & AI',        'School of Engineering'),
  ('Electronics & Communication',  'School of Engineering'),
  ('Biotechnology',                'School of Biosciences'),
  ('Biotechnology & Life Sciences','School of Biosciences'),
  ('Management & Commerce',        'School of Management Sciences'),
  ('School of Law',                'School of Law, Governance and Public Policy'),
  ('School of Law & Public Policy','School of Law, Governance and Public Policy'),
  ('Liberal Arts & Humanities',    'School of Arts, Humanities and Social Sciences'),
  -- already-correct names map to themselves, which makes the script re-runnable
  ('School of Arts, Humanities and Social Sciences', 'School of Arts, Humanities and Social Sciences'),
  ('School of Biosciences',                         'School of Biosciences'),
  ('School of Engineering',                         'School of Engineering'),
  ('School of Law, Governance and Public Policy',   'School of Law, Governance and Public Policy'),
  ('School of Management Sciences',                 'School of Management Sciences'),
  ('School of Mathematics and Natural Sciences',    'School of Mathematics and Natural Sciences');

-- 1. Members ---------------------------------------------------------------------------------
UPDATE users u SET department = m.new_name
FROM school_map m
WHERE u.department = m.old_name AND u.department <> m.new_name;

-- SMNS carve (members): seeded members in engineering whose interests are statistical / signal based.
CREATE TEMP TABLE carved_users ON COMMIT DROP AS
SELECT user_id FROM users
WHERE is_synthetic
  AND department = 'School of Engineering'
  AND interest_tags && ARRAY['data mining', 'signal processing'];

UPDATE users SET department = 'School of Mathematics and Natural Sciences'
WHERE user_id IN (SELECT user_id FROM carved_users);

-- 2. Papers: one school label per paper, inside papers.topics ---------------------------------------
UPDATE papers p
SET topics = ARRAY(
  SELECT x FROM (
    SELECT COALESCE(m.new_name, u.t) AS x, u.ord
    FROM unnest(p.topics) WITH ORDINALITY AS u(t, ord)
    LEFT JOIN school_map m ON m.old_name = u.t
  ) s GROUP BY x ORDER BY MIN(ord)
)
WHERE p.topics && (SELECT array_agg(old_name) FROM school_map WHERE old_name <> new_name);

-- SMNS carve (papers).
CREATE TEMP TABLE carved_papers ON COMMIT DROP AS
SELECT paper_id FROM papers
WHERE 'School of Engineering' = ANY(topics)
  AND NOT ('School of Mathematics and Natural Sciences' = ANY(topics))
  AND (
    topics && ARRAY['data mining', 'signal processing']
    OR canonical_title ~* '(statistic|probabilist|bayesian|stochastic|mathematic|numerical|theorem|quantum|physic|chemi|differential equation|algebra|inference)'
    OR coalesce(abstract, '') ~* '(quantum|theorem|stochastic process|differential equation|numerical method|bayesian inference)'
  );

UPDATE papers
SET topics = array_replace(topics, 'School of Engineering', 'School of Mathematics and Natural Sciences')
WHERE paper_id IN (SELECT paper_id FROM carved_papers);

-- 3. Free text that names the old departments ------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT old_name, new_name FROM school_map WHERE old_name <> new_name LOOP
    UPDATE users SET bio  = replace(bio,  r.old_name, r.new_name) WHERE bio  LIKE '%' || r.old_name || '%';
    UPDATE posts SET body = replace(body, r.old_name, r.new_name) WHERE body LIKE '%' || r.old_name || '%';
  END LOOP;
END $$;

UPDATE users SET bio = replace(bio, 'School of Engineering', 'School of Mathematics and Natural Sciences')
WHERE user_id IN (SELECT user_id FROM carved_users) AND bio LIKE '%School of Engineering%';
UPDATE posts SET body = replace(body, 'School of Engineering', 'School of Mathematics and Natural Sciences')
WHERE author_id IN (SELECT user_id FROM carved_users) AND body LIKE '%School of Engineering%';

-- 4. Warehouse inputs: topic tags on logged events -------------------------------------------------
UPDATE activity_events e
SET topic_tags = ARRAY(
  SELECT x FROM (
    SELECT COALESCE(m.new_name, u.t) AS x, u.ord
    FROM unnest(e.topic_tags) WITH ORDINALITY AS u(t, ord)
    LEFT JOIN school_map m ON m.old_name = u.t
  ) s GROUP BY x ORDER BY MIN(ord)
)
WHERE e.topic_tags && (SELECT array_agg(old_name) FROM school_map WHERE old_name <> new_name);

UPDATE activity_events e
SET topic_tags = array_replace(e.topic_tags, 'School of Engineering', 'School of Mathematics and Natural Sciences')
FROM carved_papers cp
WHERE e.target_id = cp.paper_id AND 'School of Engineering' = ANY(e.topic_tags);

-- 5. Summary ---------------------------------------------------------------------------------------
SELECT department AS school, COUNT(*) AS members FROM users GROUP BY department ORDER BY department;

COMMIT;
