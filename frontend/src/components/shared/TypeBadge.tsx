'use client';
import { Badge } from '@/components/ui/badge';

interface TypeBadgeProps {
  type: 'movie' | 'series' | 'both';
}

export function TypeBadge({ type }: TypeBadgeProps) {
  if (type === 'movie') return <Badge variant="movie">Film</Badge>;
  if (type === 'series') return <Badge variant="series">Serie</Badge>;
  return (
    <span className="flex gap-1">
      <Badge variant="movie">Film</Badge>
      <Badge variant="series">Serie</Badge>
    </span>
  );
}
