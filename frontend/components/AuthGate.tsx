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

  if (pathname === "/language") {
    return (
      <>
        <div className="tricolor-edge" />
        {children}
      </>
    );
  }

  const isReview = pathname.startsWith("/review/");

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {/* On paper the portal chrome is dropped and the page flows to its full
          length instead of scrolling inside a screen-height box. */}
      <div className="flex h-screen flex-col overflow-hidden bg-surface print:block print:h-auto print:overflow-visible print:bg-white">
        <div className="print:hidden">
          <GovUtilityStrip />
          <GovMasthead />
        </div>
        <div id="main-content" className="flex min-h-0 flex-1 flex-col print:block">
          {isReview ? (
            children
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">{children}</div>
          )}
        </div>
        <div className="print:hidden">
          <GovFooter compact={isReview} />
        </div>
      </div>
    </>
  );
}
