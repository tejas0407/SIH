"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Landmark, Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DEMO_ACCOUNTS = [
  { role: "Patwari", id: "patwari.demo", password: "patwari@123" },
  { role: "Tehsildar", id: "tehsildar.demo", password: "tehsildar@123" },
];

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-surface" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const { token, hydrated, hydrate, login } = useAuth();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && token) router.replace(next);
  }, [hydrated, token, next, router]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(loginId, password);
      router.replace(next);
    } catch (err) {
      setError((err as Error).message || "Could not sign in. Try again.");
      setSubmitting(false);
    }
  };

  const fill = (id: string, pw: string) => {
    setLoginId(id);
    setPassword(pw);
    setError(null);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-6 py-12">
      <div className="w-full max-w-sm">
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-verified-wash">
            <Landmark className="h-5 w-5 text-verified" />
          </div>
          <div className="leading-tight">
            <div className="text-[9px] uppercase tracking-[0.14em] text-ink-faint">
              Digital India Land Records Modernization Programme
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold">Bhu&#8209;Validate AI</span>
              <span className="rounded-sm bg-panel-raised px-1.5 py-px font-id text-[10px] text-ink-muted">
                SIH26018
              </span>
            </div>
          </div>
        </header>

        <p className="mb-4 text-sm text-ink-muted">
          Sign in with your user ID and password to open the reviewer console.
        </p>

        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-rule bg-panel p-5">
          <div>
            <label htmlFor="login-id" className="mb-1 block text-[11px] text-ink-faint">
              User ID
            </label>
            <input
              id="login-id"
              className="field font-id text-sm"
              autoComplete="username"
              autoFocus
              spellCheck={false}
              autoCapitalize="none"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-[11px] text-ink-faint">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="field font-id text-sm"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-sm border px-3 py-2 text-sm"
              style={{
                borderColor: "var(--critical-border)",
                background: "var(--critical-wash)",
                color: "var(--critical)",
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={submitting || !loginId.trim() || !password}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-4 rounded-lg border border-dashed border-rule-strong bg-panel px-4 py-3 text-xs text-ink-muted">
          <p className="mb-1.5 font-medium text-ink">Demo accounts</p>
          <ul className="space-y-1">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-3">
                <span>
                  <span className="font-id">{account.id}</span>
                  <span className="mx-1 text-ink-faint">/</span>
                  <span className="font-id">{account.password}</span>
                  <span className="ml-1.5 text-ink-faint">· {account.role}</span>
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] text-focus hover:bg-focus-wash"
                  onClick={() => fill(account.id, account.password)}
                >
                  Use
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
