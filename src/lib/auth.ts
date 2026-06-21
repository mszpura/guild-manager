import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { prisma } from "@/lib/prisma";

// Auth.js v5. Sesje trzymane w bazie (strategy: "database") — spójne
// z PrismaAdapter i pozwala dołączyć do sesji własne pola użytkownika.
//
// Zmienne środowiskowe:
//   AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET (auto-wykrywane),
//   EMAIL_SERVER, EMAIL_FROM (magic link).
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin?sent=1",
  },
  providers: [
    Google,
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
    }),
  ],
  callbacks: {
    // Przy strategii "database" callback dostaje pełny rekord User z bazy.
    session({ session, user }) {
      session.user.id = user.id;
      session.user.activeOrganizationId = user.activeOrganizationId ?? null;
      return session;
    },
  },
});
