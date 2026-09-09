"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Landmark, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";

/** Slim identity bar shown on every signed-in route except the review console,
 *  which runs its own full-height chrome. */
export default function AppHeader() {
  const router = useRouter();
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);

  return (
    <header className="flex h-12 items-center justify-between gap-4 border-b border-rule bg-panel px-4">
      <Link href="/" className="flex items-center gap-2.5">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-verified-wash">
          <Landmark className="h-3.5 w-3.5 text-verified" />
        </div>
        <div className="leading-tight">
          <div className="text-[8px] uppercase tracking-[0.14em] text-ink-faint">DILRMP</div>
          <div className="text-sm font-semibold">Bhu&#8209;Validate AI</div>
        </div>
      </Link>

      <div className="flex items-center gap-3 text-sm">
        {user && (
          <span className="text-ink-muted">
            {user.display_name}
            <span className="ml-2 rounded-sm bg-panel-raised px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              {user.role}
            </span>
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            logout();
            router.replace("/login");
          }}
          className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-ink-faint hover:bg-panel-raised hover:text-ink-muted"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </header>
  );
}
