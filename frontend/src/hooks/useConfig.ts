'use client';
import { useState, useEffect } from 'react';

export function useConfig() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  return { isLoaded };
}
