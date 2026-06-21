import type { DefaultSession } from "next-auth";

// Rozszerzenie typów Auth.js — dokładamy id użytkownika i jego aktywne stowarzyszenie.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      activeOrganizationId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    activeOrganizationId?: string | null;
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    activeOrganizationId?: string | null;
  }
}
