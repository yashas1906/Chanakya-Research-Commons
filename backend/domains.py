"""
Research domains: the fixed list a post can be filed under.

Posts used to take free-text topics, which left one-off tags (typos, "os") in the feed's topic list.
A post now picks one to three of these domains from a dropdown. Keep this list in step with
frontend/lib/domains.ts and db/migrations/008_post_domains.sql.
"""

DOMAINS = [
    "Artificial Intelligence & Machine Learning",
    "Computer Science & Software Engineering",
    "Data Science & Analytics",
    "Cybersecurity & Privacy",
    "Electronics & Communication Engineering",
    "Electrical Engineering & Power Systems",
    "Mechanical & Aerospace Engineering",
    "Civil & Environmental Engineering",
    "Chemical & Materials Engineering",
    "Robotics & Automation",
    "Mathematics & Statistics",
    "Physics & Astronomy",
    "Chemistry",
    "Earth & Climate Sciences",
    "Energy & Sustainability",
    "Life Sciences & Biology",
    "Biotechnology & Genetics",
    "Medicine & Health Sciences",
    "Neuroscience & Psychology",
    "Agriculture & Food Science",
    "Business & Management",
    "Finance & Economics",
    "Marketing & Consumer Behaviour",
    "Law & Legal Studies",
    "Public Policy & Governance",
    "Political Science & International Relations",
    "Sociology & Anthropology",
    "Education",
    "History & Philosophy",
    "Languages, Linguistics & Literature",
    "Media, Communication & Journalism",
    "Arts, Design & Architecture",
]

MAX_POST_DOMAINS = 3

# The fine-grained research topics papers and profiles carry, and the domain each one belongs to.
# Used to turn a followed topic into the domain posts are filed under.
TOPIC_TO_DOMAIN = {
    "digital humanities": "History & Philosophy",
    "cognitive psychology": "Neuroscience & Psychology",
    "media studies": "Media, Communication & Journalism",
    "sociology of technology": "Sociology & Anthropology",
    "crispr gene editing": "Biotechnology & Genetics",
    "bioinformatics": "Biotechnology & Genetics",
    "protein folding": "Life Sciences & Biology",
    "synthetic biology": "Biotechnology & Genetics",
    "large language models": "Artificial Intelligence & Machine Learning",
    "graph neural networks": "Artificial Intelligence & Machine Learning",
    "computer vision": "Artificial Intelligence & Machine Learning",
    "wireless sensor networks": "Electronics & Communication Engineering",
    "vlsi design": "Electronics & Communication Engineering",
    "embedded systems": "Electronics & Communication Engineering",
    "signal processing": "Electronics & Communication Engineering",
    "artificial intelligence regulation": "Law & Legal Studies",
    "data privacy law": "Law & Legal Studies",
    "intellectual property": "Law & Legal Studies",
    "cyber law": "Law & Legal Studies",
    "public policy": "Public Policy & Governance",
    "supply chain analytics": "Business & Management",
    "fintech adoption": "Finance & Economics",
    "sustainable finance": "Finance & Economics",
    "consumer behavior": "Marketing & Consumer Behaviour",
    "data mining": "Data Science & Analytics",
    "statistical inference": "Mathematics & Statistics",
    "numerical optimization": "Mathematics & Statistics",
}

_BY_LOWER = {d.lower(): d for d in DOMAINS}


def domain_for(tag: str) -> str | None:
    """The domain a tag names or belongs to, or None."""
    key = (tag or "").strip().lower()
    return _BY_LOWER.get(key) or TOPIC_TO_DOMAIN.get(key)


def clean_domains(tags: list[str] | None) -> list[str]:
    """Keep only known domains (in canonical spelling), without duplicates, at most MAX_POST_DOMAINS."""
    out: list[str] = []
    for tag in tags or []:
        domain = _BY_LOWER.get((tag or "").strip().lower())
        if domain and domain not in out:
            out.append(domain)
    return out[:MAX_POST_DOMAINS]
