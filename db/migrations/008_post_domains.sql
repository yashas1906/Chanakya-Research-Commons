-- Posts move from free-text topics to a fixed list of research domains (backend/domains.py).
-- Each old topic is mapped to its domain; tags that are already domains are kept; anything else
-- (one-off free text such as "os") is dropped. Safe to run more than once.

CREATE TEMP TABLE IF NOT EXISTS _topic_domain (topic TEXT PRIMARY KEY, domain TEXT NOT NULL);
TRUNCATE _topic_domain;
INSERT INTO _topic_domain (topic, domain) VALUES
  ('digital humanities', 'History & Philosophy'),
  ('cognitive psychology', 'Neuroscience & Psychology'),
  ('media studies', 'Media, Communication & Journalism'),
  ('sociology of technology', 'Sociology & Anthropology'),
  ('crispr gene editing', 'Biotechnology & Genetics'),
  ('bioinformatics', 'Biotechnology & Genetics'),
  ('protein folding', 'Life Sciences & Biology'),
  ('synthetic biology', 'Biotechnology & Genetics'),
  ('large language models', 'Artificial Intelligence & Machine Learning'),
  ('graph neural networks', 'Artificial Intelligence & Machine Learning'),
  ('computer vision', 'Artificial Intelligence & Machine Learning'),
  ('wireless sensor networks', 'Electronics & Communication Engineering'),
  ('vlsi design', 'Electronics & Communication Engineering'),
  ('embedded systems', 'Electronics & Communication Engineering'),
  ('signal processing', 'Electronics & Communication Engineering'),
  ('artificial intelligence regulation', 'Law & Legal Studies'),
  ('data privacy law', 'Law & Legal Studies'),
  ('intellectual property', 'Law & Legal Studies'),
  ('cyber law', 'Law & Legal Studies'),
  ('public policy', 'Public Policy & Governance'),
  ('supply chain analytics', 'Business & Management'),
  ('fintech adoption', 'Finance & Economics'),
  ('sustainable finance', 'Finance & Economics'),
  ('consumer behavior', 'Marketing & Consumer Behaviour'),
  ('data mining', 'Data Science & Analytics'),
  ('statistical inference', 'Mathematics & Statistics'),
  ('numerical optimization', 'Mathematics & Statistics'),
  ('os', 'Computer Science & Software Engineering');

-- The domains themselves map to themselves, so re-running leaves migrated posts unchanged.
INSERT INTO _topic_domain (topic, domain)
SELECT lower(d), d FROM unnest(ARRAY[
  'Artificial Intelligence & Machine Learning', 'Computer Science & Software Engineering', 'Data Science & Analytics',
  'Cybersecurity & Privacy', 'Electronics & Communication Engineering', 'Electrical Engineering & Power Systems',
  'Mechanical & Aerospace Engineering', 'Civil & Environmental Engineering', 'Chemical & Materials Engineering',
  'Robotics & Automation', 'Mathematics & Statistics', 'Physics & Astronomy', 'Chemistry', 'Earth & Climate Sciences',
  'Energy & Sustainability', 'Life Sciences & Biology', 'Biotechnology & Genetics', 'Medicine & Health Sciences',
  'Neuroscience & Psychology', 'Agriculture & Food Science', 'Business & Management', 'Finance & Economics',
  'Marketing & Consumer Behaviour', 'Law & Legal Studies', 'Public Policy & Governance',
  'Political Science & International Relations', 'Sociology & Anthropology', 'Education', 'History & Philosophy',
  'Languages, Linguistics & Literature', 'Media, Communication & Journalism', 'Arts, Design & Architecture'
]) AS d
ON CONFLICT (topic) DO NOTHING;

UPDATE posts p
SET tags = COALESCE((
  SELECT array_agg(domain ORDER BY first_pos)
  FROM (
    SELECT m.domain, MIN(t.pos) AS first_pos
    FROM unnest(p.tags) WITH ORDINALITY AS t(tag, pos)
    JOIN _topic_domain m ON m.topic = lower(trim(t.tag))
    GROUP BY m.domain
  ) mapped
), '{}')
WHERE p.tags IS NOT NULL AND cardinality(p.tags) > 0;
