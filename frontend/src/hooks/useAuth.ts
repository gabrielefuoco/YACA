'use client';
import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

/**
 * Dati della sessione utente ricevuti dal backend.
 * Nessun dato sensibile è memorizzato lato client (no localStorage per auth).
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

export function useAuth() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Carica la sessione dal backend via cookie HttpOnly
  const refreshSession = useCallback(async () => {
    try {
      const data = await api.authSession();
      if (data.authenticated && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = async (email: string, password: string) => {
    const data = await api.authLogin(email, password);
    if (data.success) {
      setUser({
        userId: data.userId,
        email: data.email,
        isNewUser: data.isNewUser,
        traktToken: data.traktToken,
        traktRefreshToken: data.traktRefreshToken,
        profiles: data.profiles,
        activeProfileId: data.activeProfileId,
        configVersion: null,
      });
    }
    return data;
  };

  const logout = async () => {
    try {
      await api.authLogout();
    } catch { /* ignore */ }
    setUser(null);
  };

  return {
    user,
    isAuthenticated: Boolean(user),
    isLoaded,
    login,
    logout,
    refreshSession,
  };
}
