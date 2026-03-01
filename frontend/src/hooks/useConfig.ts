'use client';
import { useState, useEffect } from 'react';
import { decodeConfig } from '@/lib/configCodec';
import { LOCAL_STORAGE_KEYS } from '@/lib/constants';

export function useConfig() {
  const [configBase64, setConfigBase64] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const urlParam = new URLSearchParams(window.location.search).get('config');
    if (urlParam) {
      setConfigBase64(urlParam);
      localStorage.setItem(LOCAL_STORAGE_KEYS.CONFIG, urlParam);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      setConfigBase64(localStorage.getItem(LOCAL_STORAGE_KEYS.CONFIG));
    }
    setIsLoaded(true);
  }, []);

  const updateConfig = (base64: string) => {
    setConfigBase64(base64);
    localStorage.setItem(LOCAL_STORAGE_KEYS.CONFIG, base64);
  };

  const clearConfig = () => {
    setConfigBase64(null);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.CONFIG);
  };

  const parsedConfig = configBase64 ? decodeConfig(configBase64) : null;

  return { configBase64, setConfigBase64: updateConfig, clearConfig, isLoaded, parsedConfig };
}
