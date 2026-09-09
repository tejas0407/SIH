"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DEMO_ACCOUNTS = [
  { role: "Patwari", id: "patwari.demo", password: "patwari@123" },
  { role: "Tehsildar", id: "tehsildar.demo", password: "tehsildar@123" },
];

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
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

  // Already signed in — don't show the form, go where they were headed.
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
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <header className="mb-6">
          <h1 className="text-xl">Land record reviewer</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Sign in with your user ID and password to open the review console.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded border border-rule bg-panel p-5"
        >
          <div>
            <label htmlFor="login-id" className="mb-1 block text-xs text-ink-muted">
              User ID
            </label>
            <input
              id="login-id"
              className="field font-id"
              autoComplete="username"
              autoFocus
              spellCheck={false}
              autoCapitalize="none"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-xs text-ink-muted">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="field font-id"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-sm border border-critical bg-critical-wash px-3 py-2 text-sm text-critical"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full justify-center"
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

        <div className="mt-4 rounded border border-dashed border-rule-strong bg-panel px-4 py-3 text-xs text-ink-muted">
          <p className="mb-1.5 font-medium text-ink">Demo accounts</p>
          <ul className="space-y-1">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-3">
                <span>
                  <span className="font-id">{account.id}</span>
                  <span className="mx-1">/</span>
                  <span className="font-id">{account.password}</span>
                  <span className="ml-1.5">· {account.role}</span>
                </span>
                <button
                  type="button"
                  className="shrink-0 rounded-sm px-1.5 py-0.5 text-2xs text-focus hover:bg-focus-wash"
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
