"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Skeleton } from "@/components/ui/Skeleton";

/** `/profile` is a shortcut to the signed-in member's own page. */
export default function MyProfilePage() {
  const { user, status, promptLogin } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === "authenticated" && user) router.replace(`/u/${user.user_id}`);
    else if (status === "anonymous") {
      promptLogin("login");
      router.replace("/");
    }
  }, [status, user, router, promptLogin]);
  return <Skeleton className="h-40 w-full" />;
}
