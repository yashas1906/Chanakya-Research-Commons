"use client";

import Link from "next/link";
import type { Role } from "@/types/crc";
import { useAuth } from "@/context/AuthContext";

export function RequireRole({ min, children }: { min: Role; children: React.ReactNode }) {
  const { user, can, promptLogin } = useAuth();
  if (!user) return <section className="card p-6"><h2 className="font-serif text-h2 text-ink">Sign in to continue</h2><p className="mt-2 text-body text-stone-600">This view requires a Chanakya account.</p><button type="button" className="btn-primary mt-4" onClick={promptLogin}>Sign in</button></section>;
  if (!can(min)) return <section className="card p-6"><h2 className="font-serif text-h2 text-ink">Access is limited</h2><p className="mt-2 text-body text-stone-600">This area is available to {min === "faculty" ? "Faculty and Researcher" : "Admin"} accounts.</p><Link href="/" className="mt-4 inline-flex text-ui font-medium text-stone-700 hover:text-ink">Return home</Link></section>;
  return <>{children}</>;
}
