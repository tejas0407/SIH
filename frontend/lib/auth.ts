"use client";

import { create } from "zustand";
import { api } from "./api";
import { readSession, writeSession } from "./session";
import type { AuthUser, LoginResponse } from "./types";

/**
 * The reviewer's sign-in state. The token and identity live in localStorage
 * (see `lib/session.ts`); this store mirrors them into React and is the thing
 * components subscribe to. `hydrated` guards the first render so the auth gate
 * does not flash the login page before the stored session has been read.
 */
interface AuthState {
  token: string | null;
  user: AuthUser | null;
  hydrated: boolean;

  hydrate: () => void;
  login: (loginId: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,

  hydrate: () => {
    const session = readSession();
    set({
      token: session?.token ?? null,
      user: session?.user ?? null,
      hydrated: true,
    });
  },

  login: async (loginId, password) => {
    const { data } = await api.post<LoginResponse>("/auth/login", {
      login_id: loginId.trim(),
      password,
    });
    writeSession({ token: data.access_token, user: data.user });
    set({ token: data.access_token, user: data.user, hydrated: true });
    return data.user;
  },

  logout: () => {
    writeSession(null);
    set({ token: null, user: null, hydrated: true });
  },
}));
