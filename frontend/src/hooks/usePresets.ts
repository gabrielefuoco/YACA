'use client';
import { useState, useEffect } from 'react';
import { Preset, ProfileTemplate } from '@/types';
import { api } from '@/lib/api';

export function usePresets() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [profileTemplates, setProfileTemplates] = useState<ProfileTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPresets()
      .then((data) => {
        setPresets(data.presets ?? []);
        setProfileTemplates(data.profileTemplates ?? []);
      })
      .catch(() => setError('Errore nel caricamento dei preset'))
      .finally(() => setLoading(false));
  }, []);

  const categories = [...new Set(presets.map((p) => p.category))].filter(Boolean);

  return { presets, profileTemplates, loading, error, categories };
}
