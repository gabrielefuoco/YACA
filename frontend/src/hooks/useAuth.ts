'use client';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useCallback } from 'react';

/**
 * Dati della sessione utente derivati dal JWT di NextAuth.
 * Nessun dato sensibile è memorizzato lato client (no localStorage, no sessionStorage per auth).
 */
export interface SessionUser {
  userId: string;
  email: string;
  isNewUser: boolean;
  traktToken: string | null;
  traktRefreshToken: string | null;
  profiles: any[];
  activeProfileId: string;
  configVersion: string | null;
}

/**
 * Hook di autenticazione basato su NextAuth.js.
 * Wrappa useSession() e fornisce un'interfaccia compatibile con il resto dell'app.
 *
 * NON usa localStorage o sessionStorage per dati di autenticazione.
 * I cookie JWT HttpOnly sono gestiti automaticamente da NextAuth.
 */
export function useAuth() {
  const { data: session, status, update } = useSession();

  // Mappa i dati della sessione NextAuth alla struttura SessionUser
  const user: SessionUser | null = session?.user
    ? {
        userId: session.user.userId ?? '',
        email: session.user.email ?? '',
        isNewUser: session.user.isNewUser ?? false,
        traktToken: session.user.traktToken ?? null,
        traktRefreshToken: session.user.traktRefreshToken ?? null,
        profiles: session.user.profiles ?? [],
        activeProfileId: session.user.activeProfileId ?? 'global',
        configVersion: null,
      }
    : null;

  /**
   * Login tramite NextAuth CredentialsProvider.
   * Chiama signIn("credentials", ...) che invoca la funzione authorize()
   * nel file auth.ts, che a sua volta valida le credenziali contro Stremio API.
   */
  const login = useCallback(async (email: string, password: string) => {
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      return { success: false, error: result.error };
    }
    return { success: true };
  }, []);

  /**
   * Logout: distrugge il cookie JWT HttpOnly.
   */
  const logout = useCallback(async () => {
    await signOut({ redirect: false });
  }, []);

  /**
   * Refresh della sessione: forza il rinnovo del token JWT.
   * Utile dopo aver aggiornato i dati utente sul backend (es. dopo configure).
   */
  const refreshSession = useCallback(async () => {
    await update();
  }, [update]);

  return {
    user,
    isAuthenticated: status === 'authenticated',
    isLoaded: status !== 'loading',
    login,
    logout,
    refreshSession,
  };
}
