"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useA11y } from "@/lib/a11y";
import { useAuth } from "@/lib/auth";
import { useLang } from "@/lib/i18n";
import GovUtilityStrip from "./gov/GovUtilityStrip";
import GovMasthead from "./gov/GovMasthead";
import GovFooter from "./gov/GovFooter";

/**
 * The application shell. Reads the stored session and accessibility/language
 * preferences once, guards every route behind sign-in, and wraps signed-in
 * pages in the government chrome: utility strip, national masthead, and the
 * NIC-pattern footer. The review console fills the remaining height itself.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const token = useAuth((s) => s.token);
  const hydrated = useAuth((s) => s.hydrated);
  const hydrate = useAuth((s) => s.hydrate);
  const hydrateA11y = useA11y((s) => s.hydrate);
  const hydrateLang = useLang((s) => s.hydrate);

  useEffect(() => {
    hydrate();
    hydrateA11y();
    hydrateLang();
  }, [hydrate, hydrateA11y, hydrateLang]);

  const isLoginRoute = pathname === "/login";

  useEffect(() => {
    if (hydrated && !token && !isLoginRoute) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [hydrated, token, isLoginRoute, pathname, router]);

  if (isLoginRoute) {
    return (
      <>
        <div className="tricolor-edge" />
        {children}
      </>
    );
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-ink-muted">
        Loading…
      </div>
    );
  }

  if (!token) return null; // redirect in flight

  const isReview = pathname.startsWith("/review/");

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="flex h-screen flex-col overflow-hidden bg-surface">
        <GovUtilityStrip />
        <GovMasthead />
        <div id="main-content" className="flex min-h-0 flex-1 flex-col">
          {isReview ? children : <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>}
        </div>
        <GovFooter compact={isReview} />
      </div>
    </>
  );
}
