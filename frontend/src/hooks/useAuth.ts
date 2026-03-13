'use client';
import { useState, useEffect, useCallback } from 'react';
import { StremioAuth } from '@/types';
import { api } from '@/lib/api';

/**
 * Auth hook — cookie-based (JWT HttpOnly).
 * No auth tokens are stored in localStorage/sessionStorage.
 * The backend is the Single Source of Truth for identity.
 */
export function useAuth() {
  const [stremioAuth, setStremioAuthState] = useState<StremioAuth | null>(null);
  const [traktToken, setTraktTokenState] = useState<string | null>(null);
  const [traktRefreshToken, setTraktRefreshTokenState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // On mount, check session via /api/auth/me (cookie-based)
  useEffect(() => {
    api.authMe()
      .then((data) => {
        if (data.authenticated && data.userId) {
          setStremioAuthState({
            authKey: '', // authKey is managed server-side, not exposed
            email: data.email || '',
          });
          if (data.traktConnected) {
            // Trakt status is known but token is server-side
            setTraktTokenState('connected');
          }
        }
      })
      .catch(() => {
        // Not authenticated — leave defaults
      })
      .finally(() => {
        setIsLoaded(true);
      });
  }, []);

  const setStremioAuth = useCallback((auth: StremioAuth | null) => {
    setStremioAuthState(auth);
    // No localStorage — session is in HttpOnly cookie
  }, []);

  const setTraktToken = useCallback((token: string | null) => {
    setTraktTokenState(token);
  }, []);

  const setTraktRefreshToken = useCallback((token: string | null) => {
    setTraktRefreshTokenState(token);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.authLogout();
    } catch {
      // Best-effort
    }
    setStremioAuthState(null);
    setTraktTokenState(null);
    setTraktRefreshTokenState(null);
  }, []);

  return {
    stremioAuth,
    traktToken,
    traktRefreshToken,
    isLoaded,
    setStremioAuth,
    setTraktToken,
    setTraktRefreshToken,
    logout,
  };
}
