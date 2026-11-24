"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookMarked, Eye, EyeOff, MessageSquareText, Search, X } from "lucide-react";
import { useAuth, type AuthMode } from "@/context/AuthContext";
import { ApiError, describeError } from "@/lib/api";
import { cx } from "@/lib/format";
import { SCHOOLS } from "@/types/crc";

const PERKS = [
  { icon: Search, title: "One search for everything", text: "Papers, scholars and discussions ranked together." },
  { icon: BookMarked, title: "Build the shared library", text: "Save, organise and see what colleagues read." },
  { icon: MessageSquareText, title: "Ask with citations", text: "Answers grounded in passages you can inspect." },
];

function PasswordField({ label, value, onChange, autoComplete, hint }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="flex flex-col gap-1.5 text-meta font-semibold text-stone-700">
      {label}
      <span className="relative block">
        <input
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="input pr-11 font-normal"
          required
          minLength={6}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-1.5 flex items-center rounded-full px-2 text-stone-500 hover:text-ink"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
      {hint && <span className="block text-label font-normal text-stone-500">{hint}</span>}
    </label>
  );
}

export function AuthModal() {
  const { loginOpen, closeLogin, login, register, authMode, setAuthMode } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [passcode, setPasscode] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"student" | "faculty" | "researcher">("student");
  const [universityId, setUniversityId] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState<string>(SCHOOLS[0]);
  const [interests, setInterests] = useState("");
  const [password, setPassword] = useState("");
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Lock page scroll while the dialog is open; clear transient state when it closes.
  useEffect(() => {
    if (!loginOpen) {
      setError(null);
      setPasscode("");
      setPassword("");
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [loginOpen]);

  useEffect(() => setError(null), [authMode]);

  if (!mounted || !loginOpen) return null;

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (authMode === "login") {
        await login(identifier.trim(), passcode);
      } else {
        await register({
          full_name: fullName.trim(),
          university_id: universityId.trim(),
          email: email.trim(),
          password,
          role,
          department,
          interest_tags: interests.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean),
        });
      }
      window.dispatchEvent(new CustomEvent("crc:toast", { detail: authMode === "login" ? "Welcome back." : "Account created. Welcome to CRC." }));
    } catch (reason) {
      setError(
        authMode === "login" && reason instanceof ApiError && reason.status === 401
          ? "Those details don’t match a Chanakya account."
          : describeError(reason),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      closeLogin();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = dialog.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input, select, [href], [tabindex]:not([tabindex='-1'])");
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

  const isLogin = authMode === "login";
  const duplicate = !isLogin && error?.toLowerCase().includes("already exists");

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink/60 p-4 backdrop-blur-[3px] animate-fade"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeLogin();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onKeyDown={handleKeys}
        className="relative my-auto grid w-full max-w-[860px] overflow-hidden rounded-2xl bg-paper shadow-pop animate-pop md:grid-cols-[320px_minmax(0,1fr)]"
      >
        {/* Brand panel */}
        <aside className="hero hidden flex-col justify-between p-8 md:flex">
          <svg aria-hidden className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 text-saffron-300/20" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="1">
            {[30, 50, 70, 90].map((r) => <circle key={r} cx="100" cy="100" r={r} />)}
          </svg>
          <div className="relative">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-saffron-400 font-display text-lg text-brand-900">C</span>
            <h2 className="mt-6 font-display text-[26px] leading-tight">Where Chanakya’s research comes together.</h2>
          </div>
          <ul className="relative mt-7 space-y-5">
            {PERKS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15"><Icon className="h-4 w-4" /></span>
                <span>
                  <span className="block text-ui font-semibold">{title}</span>
                  <span className="block text-meta text-brand-100">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </aside>

        {/* Form panel */}
        <div className="relative max-h-[92dvh] overflow-y-auto p-6 sm:p-9">
          <button
            type="button"
            className="absolute right-3 top-3 rounded-full p-2 text-stone-500 transition hover:bg-stone-100 hover:text-ink"
            onClick={closeLogin}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="mb-6 flex w-fit rounded-full bg-stone-100 p-1" role="tablist" aria-label="Account">
            {(["login", "register"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={authMode === mode}
                onClick={() => switchMode(mode)}
                className={cx(
                  "rounded-full px-4 py-1.5 text-meta font-semibold transition",
                  authMode === mode ? "bg-paper text-ink shadow-card" : "text-stone-600 hover:text-ink",
                )}
              >
                {mode === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>

          <h2 id="auth-title" className="font-display text-h2 text-ink">{isLogin ? "Welcome back" : "Create your account"}</h2>
          <p className="mt-1 text-ui text-stone-600">
            {isLogin ? "Log in with your university email or ID." : "Join the Chanakya research community."}
          </p>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            {isLogin ? (
              <>
                <label className="flex flex-col gap-1.5 text-meta font-semibold text-stone-700">
                  University email or ID
                  <input
                    autoFocus
                    autoComplete="username"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    className="input font-normal"
                    placeholder="name@chanakyauniversity.edu.in or 24CU1000"
                    required
                  />
                </label>
                <PasswordField label="Passcode / PIN" value={passcode} onChange={setPasscode} autoComplete="current-password" />
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1.5 text-meta font-semibold text-stone-700">
                  Full name
                  <input autoFocus autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} className="input font-normal" required minLength={2} />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-meta font-semibold text-stone-700">
                    Role / Identity
                    <select
                      value={role}
                      onChange={(event) => setRole(event.target.value as "student" | "faculty" | "researcher")}
                      className="input font-normal capitalize"
                    >
                      <option value="student">Student</option>
                      <option value="faculty">Faculty</option>
                      <option value="researcher">Researcher</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-meta font-semibold text-stone-700">
                    University ID
                    <input value={universityId} onChange={(event) => setUniversityId(event.target.value)} className="input font-normal" placeholder="24CU1234" required minLength={3} />
                  </label>
                </div>
                <label className="flex flex-col gap-1.5 text-meta font-semibold text-stone-700">
                  Department / School
                  <select value={department} onChange={(event) => setDepartment(event.target.value)} className="input font-normal">
                    {SCHOOLS.map((school) => <option key={school}>{school}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-meta font-semibold text-stone-700">
                  University email
                  <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input font-normal" placeholder="name@chanakyauniversity.edu.in" required />
                </label>
                <label className="flex flex-col gap-1.5 text-meta font-semibold text-stone-700">
                  Research interests <span className="font-normal text-stone-500">(optional, comma-separated)</span>
                  <input value={interests} onChange={(event) => setInterests(event.target.value)} className="input font-normal" placeholder="graph neural networks, data mining" />
                </label>
                <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="new-password" hint="At least 6 characters." />
              </>
            )}

            {error && (
              <p role="alert" className="rounded-lg border border-terracotta-200 bg-terracotta-50 px-3 py-2 text-meta text-terracotta-700">
                {error}
                {duplicate && (
                  <>
                    {" "}
                    <button type="button" onClick={() => switchMode("login")} className="font-semibold underline underline-offset-2">Log in instead</button>
                  </>
                )}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-primary h-11 w-full text-body">
              {busy ? (isLogin ? "Logging in…" : "Creating account…") : isLogin ? "Log in" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-center text-meta text-stone-600">
            {isLogin ? "New to CRC?" : "Already have an account?"}{" "}
            <button type="button" onClick={() => switchMode(isLogin ? "register" : "login")} className="font-semibold text-brand-600 hover:underline">
              {isLogin ? "Create an account" : "Log in"}
            </button>
          </p>
          {!isLogin && (
            <p className="mt-2 text-center text-label text-stone-500">
              New accounts start as Students. Faculty and admin access is verified by the university.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
