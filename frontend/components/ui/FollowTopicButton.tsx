"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import { describeError } from "@/lib/api";
import { cx } from "@/lib/format";
import { useTopicFollows } from "@/lib/topic-follows";

/** Follow / unfollow a research topic. Followed topics boost matching posts in the personal feed. */
export function FollowTopicButton({ topic, compact = false, className }: { topic: string; compact?: boolean; className?: string }) {
  const { promptLogin } = useAuth();
  const toast = useToast();
  const { signedIn, isFollowing, toggle } = useTopicFollows();
  const [busy, setBusy] = useState(false);
  const following = isFollowing(topic);

  const onClick = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!signedIn) {
      promptLogin("login");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const now = await toggle(topic);
      toast(now ? `Following “${topic}”. Matching posts rise in your feed.` : `Stopped following “${topic}”`);
    } catch (error) {
      toast(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const label = following ? `Unfollow topic ${topic}` : `Follow topic ${topic}`;
  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-pressed={following}
        aria-label={label}
        title={following ? "Following. Click to unfollow" : "Follow this topic"}
        className={cx(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition",
          following ? "border-brand-600 bg-brand-600 text-white" : "border-stone-300 text-stone-500 hover:border-brand-500 hover:text-brand-600",
          className,
        )}
      >
        {following ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={following}
      aria-label={label}
      className={cx(following ? "btn" : "btn-primary", "min-h-9 px-3 text-meta", className)}
    >
      {following ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      {following ? "Following topic" : "Follow topic"}
    </button>
  );
}
