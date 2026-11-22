import type { Role } from "@/types/crc";

const LABEL: Record<Role, string> = {
  student: "Student",
  faculty: "Faculty",
  researcher: "Researcher",
  admin: "Admin",
};

export function RoleBadge({ role }: { role: Role }) {
  return <span className="inline-flex rounded-full border border-stone-200 bg-sunken px-2 py-0.5 text-label font-medium text-stone-600">{LABEL[role]}</span>;
}
