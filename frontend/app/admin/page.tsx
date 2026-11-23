import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { Skeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = { title: "Admin dashboard", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <Suspense fallback={<Skeleton className="h-10 max-w-2xl" />}>
      <AdminDashboard />
    </Suspense>
  );
}
