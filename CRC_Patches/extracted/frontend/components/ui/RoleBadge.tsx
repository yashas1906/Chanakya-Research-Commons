import { cx } from "@/lib/format";
import type { Role } from "@/types/crc";

const LABEL: Record<Role, string> = {
  student: "Student",
  faculty: "Faculty",
  researcher: "Researcher",
  admin: "Admin",
};

const TONE: Record<Role, string> = {
  student: "bg-stone-100 text-stone-600",
  faculty: "bg-brand-50 text-brand-700",
  researcher: "bg-brand-50 text-brand-700",
  admin: "bg-saffron-100 text-saffron-600",
};

export function RoleBadge({ role }: { role: Role }) {
  return <span className={cx("inline-flex rounded-full px-2 py-0.5 text-label font-semibold", TONE[role])}>{LABEL[role]}</span>;
}
