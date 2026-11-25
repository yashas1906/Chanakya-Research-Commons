/**
 * Research domains a post can be filed under. Keep in step with backend/domains.py,
 * which rejects anything not on this list.
 */
export const DOMAINS = [
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
] as const;

export const MAX_POST_DOMAINS = 3;

/** Fine-grained research topics (on papers, profiles and trends) and the domain posts about them are filed under. */
const TOPIC_TO_DOMAIN: Record<string, (typeof DOMAINS)[number]> = {
  "digital humanities": "History & Philosophy",
  "cognitive psychology": "Neuroscience & Psychology",
  "media studies": "Media, Communication & Journalism",
  "sociology of technology": "Sociology & Anthropology",
  "crispr gene editing": "Biotechnology & Genetics",
  bioinformatics: "Biotechnology & Genetics",
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
};

/** The domain a topic or domain name belongs to, or null when it has none. */
export function domainOf(topic: string): string | null {
  const key = topic.trim().toLowerCase();
  return DOMAINS.find((d) => d.toLowerCase() === key) ?? TOPIC_TO_DOMAIN[key] ?? null;
}
