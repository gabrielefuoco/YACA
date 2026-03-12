"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Provider globale per NextAuth.js.
 * Avvolge l'intera applicazione per rendere disponibile `useSession()` ovunque.
 * Il SessionProvider gestisce automaticamente il refresh periodico della sessione JWT.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider basePath="/api/auth">{children}</SessionProvider>;
}
