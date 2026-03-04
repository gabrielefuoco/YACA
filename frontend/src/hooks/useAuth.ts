'use client';
import { useState, useEffect } from 'react';
import { StremioAuth } from '@/types';
import { LOCAL_STORAGE_KEYS } from '@/lib/constants';

export function useAuth() {
  const [stremioAuth, setStremioAuthState] = useState<StremioAuth | null>(null);
  const [traktToken, setTraktTokenState] = useState<string | null>(null);
  const [traktRefreshToken, setTraktRefreshTokenState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.STREMIO_AUTH);
      if (raw) setStremioAuthState(JSON.parse(raw));
    } catch { }
    setTraktTokenState(localStorage.getItem(LOCAL_STORAGE_KEYS.TRAKT_TOKEN));
    setTraktRefreshTokenState(localStorage.getItem(LOCAL_STORAGE_KEYS.TRAKT_REFRESH_TOKEN));
    setIsLoaded(true);
  }, []);

  const setStremioAuth = (auth: StremioAuth | null) => {
    setStremioAuthState(auth);
    if (auth) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.STREMIO_AUTH, JSON.stringify(auth));
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEYS.STREMIO_AUTH);
    }
  };

  const setTraktToken = (token: string | null) => {
    setTraktTokenState(token);
    if (token) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.TRAKT_TOKEN, token);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEYS.TRAKT_TOKEN);
    }
  };

  const setTraktRefreshToken = (token: string | null) => {
    setTraktRefreshTokenState(token);
    if (token) {
      localStorage.setItem(LOCAL_STORAGE_KEYS.TRAKT_REFRESH_TOKEN, token);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEYS.TRAKT_REFRESH_TOKEN);
    }
  };

  const logout = () => {
    setStremioAuth(null);
    setTraktToken(null);
    setTraktRefreshToken(null);
  };

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
