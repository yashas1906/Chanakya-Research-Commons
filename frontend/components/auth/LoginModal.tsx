"use client";

import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ApiError, describeError } from "@/lib/api";

export function LoginModal() {
  const { loginOpen, closeLogin, login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [passcode, setPasscode] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  if (!loginOpen) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), passcode);
      setPasscode("");
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status === 401
        ? "Those details don’t match a Chanakya account."
        : describeError(reason));
    } finally {
      setBusy(false);
    }
  };

  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") closeLogin();
    if (event.key !== "Tab") return;
    const controls = dialog.current?.querySelectorAll<HTMLElement>("button, input, [href], [tabindex]:not([tabindex='-1'])");
    if (!controls?.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4" onMouseDown={(e) => {
      if (e.target === e.currentTarget) closeLogin();
    }}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        onKeyDown={handleKeys}
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-paper p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Chanakya University</p>
            <h2 id="login-title" className="mt-1 font-sans text-h2 font-semibold text-ink">Sign in to CRC</h2>
          </div>
          <button type="button" className="rounded-full p-2 text-stone-500 hover:bg-sunken" onClick={closeLogin} aria-label="Close sign in">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form className="mt-5 space-y-4" onSubmit={submit}>
          <label className="block space-y-1.5 text-ui font-medium text-stone-700">
            University email or ID
            <input
              autoFocus
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="input"
              placeholder="name@chanakyauniversity.edu.in or 24CU1000"
              required
            />
          </label>
          <label className="block space-y-1.5 text-ui font-medium text-stone-700">
            Passcode / PIN
            <span className="relative block">
              <input
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="input pr-12"
                required
              />
              <button type="button" onClick={() => setVisible((v) => !v)} className="absolute inset-y-0 right-2 flex items-center px-2 text-stone-500" aria-label={visible ? "Hide passcode" : "Show passcode"}>
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>
          {error && <p role="alert" className="text-meta text-terracotta-700">{error}</p>}
          <button type="submit" disabled={busy || !identifier.trim() || !passcode} className="btn-primary h-11 w-full">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
