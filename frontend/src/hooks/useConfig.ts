'use client';
import { useState, useEffect } from 'react';

export function useConfig() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoaded(true);
  }, []);

  return { isLoaded };
}
