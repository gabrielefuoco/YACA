'use client';
import { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface PosterImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  /** Contenuto mostrato al posto dell'immagine quando manca o non carica. */
  fallbackClassName?: string;
  /** Se true mostra anche il titolo sotto l'icona di fallback. */
  showFallbackTitle?: boolean;
}

/**
 * Immagine di copertina che degrada in modo pulito.
 *
 * Senza `onError` un URL rotto (host morto, 404, HTML al posto dell'immagine) mostra
 * l'icona di immagine rotta del browser e il testo alternativo grezzo: nella griglia
 * della libreria sembrava "copertina mancante" con il titolo sovrapposto.
 */
export function PosterImage({
  src,
  alt,
  className = 'w-full h-full object-cover',
  fallbackClassName = '',
  showFallbackTitle = true,
}: PosterImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`w-full h-full bg-marrow-light/20 flex flex-col items-center justify-center gap-1 p-2 text-center ${fallbackClassName}`}>
        <ImageOff className="h-5 w-5 text-marrow-deep/30" aria-hidden="true" />
        {showFallbackTitle && (
          <span className="text-[10px] font-bold leading-tight text-marrow-deep/60 line-clamp-3">{alt}</span>
        )}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export default PosterImage;
