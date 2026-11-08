'use client';
import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { CatalogoEsploraVoce, CataloghiEsploraResponse, ModoId, ModoInfo } from '@/types';

interface UseModoCatalogsOptions {
  onConfigChanged?: (configVersion: string) => void;
}

export function useModoCatalogs({ onConfigChanged }: UseModoCatalogsOptions = {}) {
  const [modi, setModi] = useState<ModoInfo[]>([]);
  const [activeModo, setActiveModo] = useState<ModoId>('generale');
  const [isSwitchingModo, setIsSwitchingModo] = useState(false);
  const [propagationMessage, setPropagationMessage] = useState<string | null>(null);
  const [cataloghiData, setCataloghiData] = useState<CataloghiEsploraResponse | null>(null);
  const [cataloghiLoading, setCataloghiLoading] = useState(false);

  const fetchModi = useCallback(async () => {
    try {
      const data = await api.getModi();
      if (data && Array.isArray(data.modi)) {
        setModi(data.modi);
        if (data.attivo) {
          setActiveModo(data.attivo as ModoId);
        }
      }
    } catch (err) {
      console.warn('[useModoCatalogs] Errore caricamento modalità:', err);
    }
  }, []);

  const fetchCataloghi = useCallback(async () => {
    try {
      setCataloghiLoading(true);
      const data = await api.getCataloghi();
      if (data) {
        setCataloghiData(data);
      }
    } catch (err) {
      console.warn('[useModoCatalogs] Errore caricamento cataloghi:', err);
    } finally {
      setCataloghiLoading(false);
    }
  }, []);

  // Inizializzazione: carica modi e cataloghi al montaggio iniziale
  useEffect(() => {
    fetchModi();
    fetchCataloghi();
  }, [fetchModi, fetchCataloghi]);

  // Cambio modalità: UN solo fetch per cambio modo
  const selectModo = useCallback(async (nuovoModo: ModoId) => {
    if (nuovoModo === activeModo || isSwitchingModo) return;
    setIsSwitchingModo(true);
    try {
      const res = await api.attivaModo(nuovoModo);
      setActiveModo(nuovoModo);
      if (res?.propagazione) {
        setPropagationMessage(res.propagazione);
      } else {
        setPropagationMessage(
          'Modalità attivata. I cataloghi su Stremio si aggiorneranno alla prossima apertura dell\'app; se Stremio è già aperta, ricarica la pagina o riavviala.'
        );
      }
      if (res?.configVersion && onConfigChanged) {
        onConfigChanged(res.configVersion);
      }
      // Ricarica cataloghi e modi per il nuovo modo (UN solo fetch per cambio modo)
      await fetchCataloghi();
      await fetchModi();
      return res;
    } catch (err) {
      console.error('[useModoCatalogs] Errore cambio modalità:', err);
      throw err;
    } finally {
      setIsSwitchingModo(false);
    }
  }, [activeModo, isSwitchingModo, onConfigChanged, fetchCataloghi, fetchModi]);

  // Toggle catalogo (Esplora è l'unico punto di attivazione)
  const toggleCatalogActive = useCallback(async (id: string, attivo: boolean) => {
    // Aggiornamento ottimistico dello stato condiviso
    setCataloghiData(prev => {
      if (!prev) return prev;
      const aggiornaLista = (lista?: CatalogoEsploraVoce[]) =>
        lista ? lista.map(item => item.id === id ? { ...item, attivo } : item) : undefined;
      return {
        ...prev,
        gruppi: {
          suggerimenti: aggiornaLista(prev.gruppi.suggerimenti),
          watchlist: aggiornaLista(prev.gruppi.watchlist),
          creazioni: aggiornaLista(prev.gruppi.creazioni),
          tutti: aggiornaLista(prev.gruppi.tutti),
        }
      };
    });

    try {
      const res = await api.attivaCatalogo(id, attivo);
      if (res?.configVersion && onConfigChanged) {
        onConfigChanged(res.configVersion);
      }
      return res;
    } catch (err) {
      console.error('[useModoCatalogs] Errore attivazione catalogo:', err);
      // Revert in caso di errore
      await fetchCataloghi();
      throw err;
    }
  }, [onConfigChanged, fetchCataloghi]);

  // Riordino cataloghi attivi
  const reorderActiveCatalogs = useCallback(async (newIds: string[]) => {
    // Aggiornamento ottimistico dell'ordine
    setCataloghiData(prev => {
      if (!prev?.gruppi) return prev;
      const orderMap = new Map(newIds.map((id, idx) => [id, idx]));
      const updateOrder = (list?: CatalogoEsploraVoce[]) =>
        list ? list.map(c => orderMap.has(c.id) ? { ...c, ordine: orderMap.get(c.id)! } : c) : undefined;
      return {
        ...prev,
        gruppi: {
          suggerimenti: updateOrder(prev.gruppi.suggerimenti),
          watchlist: updateOrder(prev.gruppi.watchlist),
          creazioni: updateOrder(prev.gruppi.creazioni),
          tutti: updateOrder(prev.gruppi.tutti),
        }
      };
    });

    try {
      const res = await api.riordinaCataloghi(newIds);
      if (res?.configVersion && onConfigChanged) {
        onConfigChanged(res.configVersion);
      }
      await fetchCataloghi();
      return res;
    } catch (err) {
      console.error('[useModoCatalogs] Errore riordino cataloghi:', err);
      await fetchCataloghi();
      throw err;
    }
  }, [onConfigChanged, fetchCataloghi]);

  return {
    modi,
    activeModo,
    isSwitchingModo,
    propagationMessage,
    cataloghiData,
    cataloghiLoading,
    selectModo,
    toggleCatalogActive,
    reorderActiveCatalogs,
    fetchCataloghi,
    fetchModi,
  };
}
