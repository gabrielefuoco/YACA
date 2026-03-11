/**
 * Route handler per NextAuth.js (Auth.js v5).
 * Espone GET e POST su /api/auth/* per gestire login, logout, callback e sessione.
 *
 * I cookie di sessione JWT (HttpOnly, Secure, SameSite) vengono gestiti automaticamente
 * da NextAuth. Il backend Express è completamente stateless.
 */

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
