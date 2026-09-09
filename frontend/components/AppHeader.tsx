"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";

/** Slim identity bar shown on every signed-in route except the review console,
 *  which runs its own full-height chrome. */
export default function AppHeader() {
  const router = useRouter();
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);

  const signOut = () => {
    logout();
    router.replace("/login");
  };

  return (
    <header className="flex items-center justify-between gap-4 border-b border-rule bg-panel px-4 py-2">
      <Link href="/" className="text-sm text-ink-muted hover:text-ink">
        Land record digitisation
      </Link>

      <div className="flex items-center gap-3 text-sm">
        {user && (
          <span className="text-ink-muted">
            {user.display_name}
            <span className="ml-2 rounded-sm bg-surface px-1.5 py-0.5 text-2xs">
              {user.role}
            </span>
          </span>
        )}
        <button
          type="button"
          onClick={signOut}
          className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-ink-muted hover:bg-surface hover:text-ink"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </header>
  );
}
