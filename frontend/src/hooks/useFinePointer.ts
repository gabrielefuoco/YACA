'use client';

import { useEffect, useState } from 'react';

const QUERY = '(hover: hover) and (pointer: fine)';

/**
 * Vero solo su un dispositivo con mouse.
 *
 * Serve a non attivare l'HTML5 drag dove non esiste: su Android un long-press per scorrere la
 * pagina fa partire il trascinamento della card (difetto del ticket 08.1). Il drag resta un fatto
 * desktop; sul telefono si usa il riordino esplicito.
 */
export function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    const update = () => setFine(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return fine;
}
