"use client";

import { useRouter } from "next/navigation";
import { LogOut, UserRound } from "lucide-react";
import EmblemPlaceholder from "./EmblemPlaceholder";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

/**
 * National branding masthead: emblem, ministry and programme name in the
 * chosen language beside English, and who is signed in with a clearly
 * labelled sign-out. Kept to two lines of identity so the working area
 * below gets the height.
 */
export default function GovMasthead() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const { l, en, bi } = useT();

  return (
    <div className="shrink-0 border-b border-rule bg-panel">
      <div className="tricolor-edge" />
      <div className="flex items-center justify-between gap-6 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <EmblemPlaceholder className="h-11 w-11 shrink-0 text-ink" />
          <div className="min-w-0 leading-snug">
            <div className="text-xs font-semibold text-amber-700">
              <span className="font-vernacular">{l("ministry")}</span>
              <span className="mx-1.5 text-ink-faint">|</span>
              {en("ministry")}
            </div>
            <div className="text-lg font-bold text-ink">
              <span className="font-vernacular">{l("lrm")}</span>
              <span className="mx-1.5 font-normal text-ink-faint">/</span>
              {en("lrm")} <span className="font-normal text-ink-muted">(DILRMP)</span>
            </div>
          </div>
        </div>

        {user && (
          <div className="flex shrink-0 items-center gap-3">
            <UserRound className="h-5 w-5 text-ink-muted" aria-hidden />
            <div className="leading-snug">
              <div className="text-sm font-semibold">
                {user.display_name.replace(/\s*\((Patwari|Tehsildar)\)\s*$/i, "")}
              </div>
              <div className="text-xs text-ink-muted">{roleName(user.role)}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                logout();
                router.replace("/login");
              }}
              title={bi("end_session")}
              className="btn ml-1 text-sm"
            >
              <LogOut className="h-4 w-4" />
              <span className="font-vernacular">{l("end_session")}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function roleName(role: string): string {
  if (role === "TEHSILDAR") return "Tehsildar";
  if (role === "PATWARI") return "Patwari";
  return role;
}
