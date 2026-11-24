"use client";

import { useState } from "react";
import { Check, Loader2, UserPlus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useMemberFollows } from "@/lib/member-follows";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/lib/format";
import { describeError } from "@/lib/api";

/**
 * Follow / Following for a member. Hidden on your own name. Logged-out visitors are asked to log in
 * and stay on the same page. `compact` is the small text button used inside post headers and lists.
 */
export function FollowUserButton({ userId, name, compact = false, className }: { userId: string; name: string; compact?: boolean; className?: string }) {
  const { user, promptLogin } = useAuth();
  const { isFollowing, toggle } = useMemberFollows();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!userId || user?.user_id === userId) return null;
  const following = isFollowing(userId);

  const onClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!user) {
      promptLogin("login");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const now = await toggle(userId);
      toast(now ? `Following ${name}. Their posts rank higher in your feed.` : `Unfollowed ${name}`);
    } catch (error) {
      toast(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-pressed={following}
        aria-label={following ? `Unfollow ${name}` : `Follow ${name}`}
        className={cx(
          "relative z-10 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-label font-semibold transition",
          following ? "text-stone-500 hover:bg-stone-100" : "text-brand-600 hover:bg-brand-50",
          className,
        )}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : following ? <Check className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
        {following ? "Following" : "Follow"}
      </button>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={busy} aria-pressed={following} className={cx(following ? "btn" : "btn-primary", className)}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : following ? <Check className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
      {following ? "Following" : "Follow"}
    </button>
  );
}
