"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import AppHeader from "./AppHeader";

/**
 * Wraps the whole app. Reads the stored session once on mount, then:
 *  - `/login` renders on its own, gate or no gate;
 *  - any other route with no token bounces to `/login?next=…`;
 *  - a signed-in route renders with the identity bar, except the review
 *    console (`/review/[khataId]`), which owns its full-height layout.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const token = useAuth((state) => state.token);
  const hydrated = useAuth((state) => state.hydrated);
  const hydrate = useAuth((state) => state.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const isLoginRoute = pathname === "/login";

  useEffect(() => {
    if (hydrated && !token && !isLoginRoute) {
      const next = encodeURIComponent(pathname);
      router.replace(`/login?next=${next}`);
    }
  }, [hydrated, token, isLoginRoute, pathname, router]);

  if (isLoginRoute) return <>{children}</>;

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-ink-muted">
        Loading…
      </div>
    );
  }

  if (!token) return null; // redirect in flight

  const bare = pathname.startsWith("/review/");

  return (
    <>
      {!bare && <AppHeader />}
      {children}
    </>
  );
}
