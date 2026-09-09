/**
 * The signed-in reviewer's token and identity, persisted in localStorage.
 *
 * This module imports nothing from the app on purpose: both the axios client
 * (`lib/api.ts`) and the auth store (`lib/auth.ts`) read from here, and routing
 * the persistence through a leaf module keeps them from importing each other.
 */

import type { AuthUser } from "./types";

const STORAGE_KEY = "dilrmp.session";

export interface StoredSession {
  token: string;
  user: AuthUser;
}

export function readSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.token || !parsed?.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSession(session: StoredSession | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode or storage disabled — the session just won't persist */
  }
}

export function sessionToken(): string | null {
  return readSession()?.token ?? null;
}
