"use client";

import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import EmblemPlaceholder from "./EmblemPlaceholder";
import { useAuth } from "@/lib/auth";

/**
 * National branding masthead. Tricolor edge, stylised emblem placeholder, the
 * bilingual department stack, and the active official's session badge — driven
 * by whoever is actually signed in, not a hardcoded persona.
 */
export default function GovMasthead() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  const officerId = user ? `DEMO-${user.role}-01` : "—";

  return (
    <div className="shrink-0 border-b border-rule bg-panel">
      <div className="tricolor-edge" />
      <div className="flex items-center justify-between gap-4 px-4 py-2.5">
        {/* emblem + department stack */}
        <div className="flex min-w-0 items-center gap-3">
          <EmblemPlaceholder className="h-11 w-11 shrink-0 text-ink" />
          <div className="min-w-0 leading-tight">
            <div className="text-2xs font-semibold uppercase tracking-wide text-amber-500">
              ग्रामीण विकास मंत्रालय <span className="text-ink-faint">|</span> Ministry of Rural
              Development
            </div>
            <div className="truncate text-base font-bold tracking-tight text-ink md:text-lg">
              डिजिटल भारत भू-अभिलेख आधुनिकीकरण कार्यक्रम (DILRMP)
            </div>
            <div className="truncate font-id text-2xs text-ink-faint">
              National Land Record Digitization &amp; Validation Portal (Bhu-Validate) ·{" "}
              <span className="text-ink-muted">prototype — not a live Government of India service</span>
            </div>
          </div>
        </div>

        {/* initiative badges + session */}
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden items-center gap-1.5 lg:flex">
            <InitiativePill>Digital India</InitiativePill>
            <InitiativePill>Azadi Ka Amrit Mahotsav</InitiativePill>
          </div>

          {user && (
            <div className="flex items-center gap-2 rounded-md border border-rule bg-panel-raised px-3 py-1.5">
              <ShieldCheck className="h-4 w-4 text-verified" />
              <div className="leading-tight">
                <div className="text-xs">
                  <span className="text-ink-faint">Officer:</span> {user.display_name}{" "}
                  <span className="font-id text-ink-faint">({user.role} ID: {officerId})</span>
                </div>
                <div className="text-2xs text-ink-faint">
                  Jurisdiction: set per record · sample dataset
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  logout();
                  router.replace("/login");
                }}
                title="End session"
                className="ml-1 rounded p-1 text-ink-faint hover:bg-panel hover:text-ink-muted"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InitiativePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm border border-rule-strong px-2 py-1 text-2xs font-medium text-ink-muted">
      {children}
    </span>
  );
}
