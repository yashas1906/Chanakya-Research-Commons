"use client";

import { useState } from "react";
import { ShieldCheck, ShieldX } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { describeError, setMemberSpamFlag } from "@/lib/api";

/** Admin action on a members-table row: clear a (false-positive) spam flag, or flag a member by hand. */
export function SpamToggle({ userId, name, flagged, onChanged }: { userId: string; name: string; flagged: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const click = async () => {
    if (!flagged && !window.confirm(`Flag ${name} as spam? Their profile and posts will be hidden from other members.`)) return;
    setBusy(true);
    try {
      await setMemberSpamFlag(userId, !flagged);
      toast(flagged ? `${name} cleared; later scans will skip them` : `${name} flagged as spam`);
      onChanged();
    } catch (e) {
      toast(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={click}
      disabled={busy}
      className={flagged ? "btn min-h-8 whitespace-nowrap px-2.5 text-label" : "btn-ghost min-h-8 whitespace-nowrap px-2.5 text-label text-stone-500"}
      title={flagged ? "Not spam: clear the flag" : "Flag as spam"}
    >
      {flagged ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldX className="h-3.5 w-3.5" />}
      {flagged ? "Clear flag" : "Flag"}
    </button>
  );
}
