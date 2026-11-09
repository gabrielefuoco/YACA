'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { CatalogoEsploraVoce, CataloghiEsploraResponse, ModoId, ModoInfo } from '@/types';

interface UseModoCatalogsOptions {
  onConfigChanged?: (configVersion: string) => void;
}

export function useModoCatalogs({ onConfigChanged }: UseModoCatalogsOptions = {}) {
  const [modi, setModi] = useState<ModoInfo[]>([]);
  const [activeModo, setActiveModo] = useState<ModoId>('generale');
  const [selectedModo, setSelectedModo] = useState<ModoId>('generale');
  const [isSwitchingModo, setIsSwitchingModo] = useState(false);
  const [propagationMessage, setPropagationMessage] = useState<string | null>(null);
  const [cataloghiData, setCataloghiData] = useState<CataloghiEsploraResponse | null>(null);
  const [cataloghiLoading, setCataloghiLoading] = useState(false);

  const selectedModoRef = useRef<ModoId>(selectedModo);
  useEffect(() => {
    selectedModoRef.current = selectedModo;
  }, [selectedModo]);

  const fetchCataloghi = useCallback(async (modo?: ModoId, opzioni?: { silenzioso?: boolean }) => {
    const modoDaCaricare = modo || selectedModoRef.current;
    try {
      // Silenzioso = la lista resta a schermo mentre arriva quella nuova. Il caricamento
      // rumoroso serve solo al primo arrivo, quando non c'è niente da mostrare.
      if (!opzioni?.silenzioso) setCataloghiLoading(true);
      const data = await api.getCataloghi(modoDaCaricare);
      if (data) {
        setCataloghiData(data);
      }
    } catch (err) {
      console.warn('[useModoCatalogs] Errore caricamento cataloghi:', err);
    } finally {
      if (!opzioni?.silenzioso) setCataloghiLoading(false);
    }
  }, []);

  const fetchModi = useCallback(async () => {
    try {
      const data = await api.getModi();
      if (data && Array.isArray(data.modi)) {
        setModi(data.modi);
        if (data.attivo) {
          const attivoModo = data.attivo as ModoId;
          setActiveModo(attivoModo);
          return attivoModo;
        }
      }
    } catch (err) {
      console.warn('[useModoCatalogs] Errore caricamento modalità:', err);
    }
    return null;
  }, []);

  // Inizializzazione: carica modi e cataloghi per il modo attivo al montaggio iniziale
  useEffect(() => {
    let isMounted = true;
    (async () => {
      const attivo = await fetchModi();
      if (!isMounted) return;
      const initialModo = attivo || 'generale';
      setSelectedModo(initialModo);
      await fetchCataloghi(initialModo);
    })();
    return () => {
      isMounted = false;
    };
  }, [fetchModi, fetchCataloghi]);

  // Selezione della modalità da visualizzare/configurare nel pannello
  const selectModoTab = useCallback(
    (nuovoModo: ModoId) => {
      setSelectedModo(nuovoModo);
      fetchCataloghi(nuovoModo);
    },
    [fetchCataloghi]
  );

  // Cambio modalità attiva su Stremio
  const selectModo = useCallback(
    async (nuovoModo: ModoId) => {
      if (nuovoModo === activeModo || isSwitchingModo) return;
      setIsSwitchingModo(true);
      try {
        const res = await api.attivaModo(nuovoModo);
        setActiveModo(nuovoModo);
        setSelectedModo(nuovoModo);
        if (res?.propagazione) {
          setPropagationMessage(res.propagazione);
        } else {
          setPropagationMessage(
            "Modalità attivata. I cataloghi su Stremio si aggiorneranno alla prossima apertura dell'app; se Stremio è già aperta, ricarica la pagina o riavviala."
          );
        }
        if (res?.configVersion && onConfigChanged) {
          onConfigChanged(res.configVersion);
        }
        // Ricarica cataloghi e modi per il nuovo modo
        await fetchCataloghi(nuovoModo);
        await fetchModi();
        return res;
      } catch (err) {
        console.error('[useModoCatalogs] Errore cambio modalità:', err);
        throw err;
      } finally {
        setIsSwitchingModo(false);
      }
    },
    [activeModo, isSwitchingModo, onConfigChanged, fetchCataloghi, fetchModi]
  );

  // Toggle catalogo: passa sempre la modalità selezionata e ricarica i cataloghi dal backend
  const toggleCatalogActive = useCallback(
    async (id: string, attivo: boolean, modoOverride?: ModoId) => {
      const modo = modoOverride || selectedModoRef.current;
      // Aggiornamento ottimistico dello stato condiviso
      setCataloghiData((prev) => {
        if (!prev) return prev;
        const aggiornaLista = (lista?: CatalogoEsploraVoce[]) =>
          lista ? lista.map((item) => (item.id === id ? { ...item, attivo } : item)) : undefined;
        return {
          ...prev,
          gruppi: {
            suggerimenti: aggiornaLista(prev.gruppi?.suggerimenti),
            watchlist: aggiornaLista(prev.gruppi?.watchlist),
            creazioni: aggiornaLista(prev.gruppi?.creazioni),
            tutti: aggiornaLista(prev.gruppi?.tutti),
          },
        };
      });

      try {
        const res = await api.attivaCatalogo(id, attivo, modo);
        if (res?.configVersion && onConfigChanged) {
          onConfigChanged(res.configVersion);
        }
        // Ricarica silenziosa: la lista resta visibile, niente spinner a tutto schermo.
        await fetchCataloghi(modo, { silenzioso: true });
        return res;
      } catch (err) {
        console.error('[useModoCatalogs] Errore attivazione catalogo:', err);
        // Revert in caso di errore
        await fetchCataloghi(modo, { silenzioso: true });
        throw err;
      }
    },
    [onConfigChanged, fetchCataloghi]
  );

  // Riordino cataloghi attivi: passa sempre la modalità selezionata e ricarica i cataloghi dal backend
  const reorderActiveCatalogs = useCallback(
    async (newIds: string[], modoOverride?: ModoId) => {
      const modo = modoOverride || selectedModoRef.current;
      // Aggiornamento ottimistico dell'ordine
      setCataloghiData((prev) => {
        if (!prev?.gruppi) return prev;
        const orderMap = new Map(newIds.map((id, idx) => [id, idx]));
        const updateOrder = (list?: CatalogoEsploraVoce[]) =>
          list
            ? list.map((c) => (orderMap.has(c.id) ? { ...c, ordine: orderMap.get(c.id)! } : c))
            : undefined;
        return {
          ...prev,
          gruppi: {
            suggerimenti: updateOrder(prev.gruppi?.suggerimenti),
            watchlist: updateOrder(prev.gruppi?.watchlist),
            creazioni: updateOrder(prev.gruppi?.creazioni),
            tutti: updateOrder(prev.gruppi?.tutti),
          },
        };
      });

      try {
        const res = await api.riordinaCataloghi(newIds, modo);
        if (res?.configVersion && onConfigChanged) {
          onConfigChanged(res.configVersion);
        }
        // Ricarica silenziosa: l'ordine ottimistico resta a schermo.
        await fetchCataloghi(modo, { silenzioso: true });
        return res;
      } catch (err) {
        console.error('[useModoCatalogs] Errore riordino cataloghi:', err);
        await fetchCataloghi(modo, { silenzioso: true });
        throw err;
      }
    },
    [onConfigChanged, fetchCataloghi]
  );

  return {
    modi,
    activeModo,
    selectedModo,
    setSelectedModo,
    selectModoTab,
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
