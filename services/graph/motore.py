"""motore.py — IL MOTORE: entra una storia, escono le liste.

E' il pezzo che mancava. Fino a ieri il meccanismo esisteva **solo dentro gli arbitri**: la diffusione,
la potatura e i pesi dei semi erano riscritti in dodici file, quindi si poteva MISURARE il meccanismo ma
non USARLO. Qui stanno in un posto solo, coi valori di `parametri.py`.

COSA ENTRA
  · una **storia**: `[("movie:603", plays), ("tv:1396", plays), ...]` — le chiavi sono quelle del
    canone (`graph.bubbles.KEY`/`ROW_OF`), o una **utente Trakt** per nome (`da_trakt`)
  · gli **slider** (tre, e vedi `slider()` per il perche' dei nomi): `largo`, `lontano`, `cozy`, `canone`

COSA ESCE — il contratto di ritorno deciso nella mappa (§2b):
  {
    "versioni":  {artefatto, ricetta}          le due impronte che vanno nella chiave della cache
    "profilo":   {canone, forma, freddo}       gli assi DEDOTTI dalla storia
    "semi":      {n, da_catalogo}              quanti e da dove
    "mondi":     [{bolla, attivazione, titoli, voti_mediani, vicini}, ...]
    "liste":     [{tipo, mondo, titoli: [(chiave, attivazione), ...]}, ...]
  }

LE LISTE (§3d, Ticket 40): il tuo mondo e i vicini (almeno 50 titoli) · un passo fuori · le uscite nuove · la nicchia di qualita' — piu' un
catalogo per ogni mondo diverso.

E LA REGOLA DEGLI ASSI (§13), che qui e' codice e non opinione: **un asse non sostituisce l'attivazione,
la modula.** Filtrare i titoli dentro un mondo o riordinare i mondi fa crollare il portafoglio a 3-14
titoli con copertura 0,0%; modulare lo tiene pieno (32) e giusto (2,3-2,6%).

    python -m graph.motore --utente coldlocals
    python -m graph.motore --storia storia.json
"""
import json
from collections import defaultdict
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from graph import bubbles as B
from graph import camminata as C
from graph import canon as K
from graph import parametri as P

T0 = time.time()

# ============================================================================================
# GLI SLIDER — i nomi dicono la RICHIESTA, non la persona (§13)
# ============================================================================================
SLIDER_DEFAULT = {
    "largo": 4,        # quante liste: 2 = «resta nel tuo mondo», 8 = «esci»
    "lontano": 0.0,    # 0 = i mondi piu' accesi · 1 = i piu' diversi per fascia e medium
    "cozy": 0.0,       # -1 = impegnativo · 0 = indifferente · +1 = cozy
    "canone": 0.0,     # -1 = nicchia · 0 = come la storia dice · +1 = popolare
}


class Motore:
    """Tutto caricato una volta. Il costo e' il caricamento (~1,3 s misurati il 17/10/2026), non la risposta.

    Il «~20 s» che stava scritto qui era una dichiarazione mai misurata: con gli artefatti pronti il canone
    (66.259 titoli, 3.497 bolle) entra in 1,30 s. Il servizio del ticket 07, processo e server compresi, 2,05 s.
    """

    def __init__(self, silenzioso=False):
        # LA TRANSIZIONE PRONTA: il triangolo si carica, si simmetrizza e si pota UNA VOLTA, e il
        # risultato si salva (`camminata.transizione_pronta`, con le impronte del triangolo e della
        # potatura). Prima si rifaceva a ogni avvio: era il costo dei 2 secondi che restavano.
        self.Tr = C.transizione_pronta()
        self.N = self.Tr.shape[0]
        self.MEM = np.load(K.A("bolle-eterogeneo-subvoti.npy"))
        self.NB = int(self.MEM.max()) + 1
        self.SZ = np.bincount(self.MEM)
        # I MEMBRI SENZA 3.497 SCANSIONI. Prima: `[np.where(self.MEM == b)[0] for b in range(NB)]` —
        # 3.497 passate su 66.259 elementi, ~231 milioni di confronti, a OGNI avvio del motore. E' lo
        # stesso pattern O(N log N) che `collocator.py` usa gia' da tempo: si ordina una volta e si
        # cercano i confini.
        _ord = np.argsort(self.MEM, kind="stable")
        _conf = np.searchsorted(self.MEM[_ord], np.arange(self.NB + 1))
        self.MEMBRI = [_ord[_conf[b]:_conf[b + 1]] for b in range(self.NB)]
        M = np.load(K.A("mappa-finale-6-2.npz"), allow_pickle=True)
        self.INTRA = M["intra"]
        # I VICINI VENGONO DALLA MAPPA PESATA, NON DALLA SOLA `intra`. `M["intra"]` ha i 6 archi
        # intra-medium e basta: finche' si leggeva solo quella, `vicini` e `un_passo_fuori` **non
        # attraversavano mai il confine fra film e serie** — mentre l'engine del prodotto, che diffonde
        # su `P` (esportata dalla mappa intera, ponti compresi), lo attraversa. Due motori che dicono
        # cose diverse sulla stessa mappa. L'ordine e' per PESO: i tre di `un_passo_fuori` sono i ponti
        # piu' forti, non i primi tre per indice.
        _W = sp.csr_matrix((M["grafo_data"], M["grafo_indices"], M["grafo_indptr"]),
                           shape=(self.NB, self.NB)).tocsr()
        self.VICINI = []
        for b in range(self.NB):
            riga = _W.getrow(b)
            ordine = np.argsort(-riga.data)
            self.VICINI.append(np.array([int(riga.indices[o]) for o in ordine
                                         if int(riga.indices[o]) != b], np.int32))
        self.artefatto = K.sha_file("bolle-eterogeneo-subvoti.npy")
        # TUTTI I METADATI IN UN COLPO: `canon.metadati()` li costruisce una volta, vettorizzato, e li
        # salva in `graph/data/`. Qui prima c'erano DUE passate complete sui Parquet TMDB iterate riga per
        # riga (`d.iloc[k]` su ~117.000 righe): erano il costo vero dell'avvio — **51 secondi** misurati,
        # non i 20 che diceva il commento — e la matrice sparsa non c'entrava niente.
        m = K.metadati()
        self.TIT, self.VOT = m["TIT"], m["VOT"]
        self.VAVE, self.POP, self.ANNO = m["VAVE"], m["POP"], m["ANNO"]
        self.NEP = m["NEP"].astype(np.float32)          # (il denominatore del peso delle serie)
        self.COZY, self.IMP = m["COZY"], m["IMP"]       # gli assi, dalle impronte dei generi
        # TICKET 04: Metadati collezione TMDB (saga) e regista per anti-monopolio se presenti a runtime
        self.COLL = m.get("COLL", None)
        self.DIR = m.get("DIR", None)
        self.REGISTA = self.DIR
        # LE QUOTE PER MONDO, PRECALCOLATE UNA VOLTA. Prima `_quota_per_mondo` rifaceva 3.497 `mean()`
        # su maschere lunghe a ogni chiamata di `modula()`, e `B.IS_TV[self.MEM == cb].mean()` in
        # `scegli_mondi` e in `lista` ricostruiva ogni volta una maschera booleana su 66.259 elementi.
        # `np.bincount` fa la stessa cosa — la stessa, elemento per elemento — una volta sola.
        self.QUOTA_TV = np.bincount(self.MEM, weights=B.IS_TV.astype(float),
                                    minlength=self.NB) / np.maximum(self.SZ, 1)
        self.QUOTA_COZY = np.bincount(self.MEM, weights=self.COZY.astype(float),
                                      minlength=self.NB) / np.maximum(self.SZ, 1)
        self.QUOTA_IMP = np.bincount(self.MEM, weights=self.IMP.astype(float),
                                     minlength=self.NB) / np.maximum(self.SZ, 1)
        self._generi = {int(x) for x in P.ASSE_COZY_GENERI.split(",")}
        self._generi_imp = {int(x) for x in P.ASSE_IMPEGNATIVO_GENERI.split(",")}
        self.VOTMED = np.array([K.mediana_voti(self.VOT[self.MEMBRI[b]])
                                for b in range(self.NB)])
        # TICKET 05: Media voto VAVE per bolla (esclusi VAVE <= 0) per normalizzazione nicchia
        self.VAVEMEAN = np.zeros(self.NB, dtype=np.float32)
        for b in range(self.NB):
            vb = self.VAVE[self.MEMBRI[b]]
            vb_pos = vb[vb > 0]
            self.VAVEMEAN[b] = float(np.mean(vb_pos)) if len(vb_pos) > 0 else float(getattr(P, "NICCHIA_VAVE_MIN_FILM", 6.8))
        # la componente LISTE di Trakt: corroborazione per la nicchia di qualita'
        z = np.load(K.A("nuovo-LIST.npz"))
        n = len(z["indptr"]) - 1
        self.LISTDEG = np.asarray((sp.csr_matrix((z["data"], z["indices"], z["indptr"]),
                                                  shape=(n, n)) > 0).sum(1)).ravel().astype(float)
        if not silenzioso:
            stato_coll = "con COLL/DIR" if (self.COLL is not None and self.DIR is not None) else "senza collezione (questo artefatto non ha la collezione)"
            print(f"  motore pronto: {self.NB:,} mondi · {self.N:,} titoli · "
                  f"artefatto {self.artefatto} ({stato_coll}) ({time.time()-T0:.0f}s)", file=sys.stderr)

    @staticmethod
    def _pota(M, k):
        """Vedi `graph/camminata.py`: la camminata sta in un posto solo."""
        return C.pota(M, k)

    # ------------------------------------------------------------------ i semi
    def pesi_semi(self, righe, plays, tipi=None, pesi=None):
        """Vedi `camminata.pesi_semi`: film min(plays,3), serie 1+2x(frazione episodi), volte il tipo."""
        base = C.pesi_semi(righe, plays, self.NEP, tipi=None)
        if pesi is not None:
            # E1: se il prodotto manda il peso numerico lo usa, altrimenti ripiega su PESO_TIPO[tipo]
            fattore = np.array([
                float(p) if p is not None else P.PESO_TIPO.get(str(t), 1.0)
                for p, t in zip(pesi, tipi or ["watched"] * len(righe))
            ], float)
            return base * fattore
        return C.pesi_semi(righe, plays, self.NEP, tipi)

    def diffondi(self, righe, plays, tipi=None, pesi=None):
        """PageRank personalizzato: l'attivazione PER MONDO e quella PER TITOLO."""
        if pesi is not None:
            w = self.pesi_semi(righe, plays, tipi=tipi, pesi=pesi)
            r = C.ppr(self.Tr, righe, w, normalizza=True)
            return C.attiva_per_mondo(r, self.MEM, self.NB), r
        r = C.diffondi(self.Tr, righe, plays, self.NEP, tipi=tipi)
        return C.attiva_per_mondo(r, self.MEM, self.NB), r

    def media_voto_bolla(self, b):
        """Restituisce la media dei voti VAVE della bolla b precalcolata all'avvio (Ticket 05)."""
        if hasattr(self, "VAVEMEAN") and self.VAVEMEAN is not None and 0 <= b < len(self.VAVEMEAN):
            return float(self.VAVEMEAN[b])
        return float(getattr(P, "NICCHIA_VAVE_MIN_FILM", 6.8))

    def calcola_v_mondo(self, bolle_set, att_s, con_stato=False):
        """Calcola la mediana dei voti del bacino acceso pesata per att_s[b] (Ticket 05).
        
        Se il bacino e' vuoto o privo di pesi validi, dichiara il ricorso al fallback assoluto
        su sys.stderr e restituisce il flag is_fallback (se con_stato=True).
        """
        fallback_val = float(getattr(P, "NICCHIA_V_MONDO_FALLBACK", 1000.0))
        if not bolle_set:
            print(f"  [nicchia] bacino vuoto: fallback V_mondo assoluto = {fallback_val:.1f} (soglia non relativa)", file=sys.stderr)
            self._ultimo_v_mondo_fallback = True
            return (fallback_val, True) if con_stato else fallback_val
        bolle_list = list(bolle_set)
        vals = np.array([float(self.VOTMED[b]) for b in bolle_list], dtype=np.float64)
        weights = np.array([max(float(att_s[b]), 0.0) for b in bolle_list], dtype=np.float64)
        tot_w = float(weights.sum())
        if tot_w <= 0:
            if len(vals) > 0:
                self._ultimo_v_mondo_fallback = False
                res = float(np.median(vals))
                return (res, False) if con_stato else res
            print(f"  [nicchia] bacino senza titoli/pesi validi: fallback V_mondo assoluto = {fallback_val:.1f} (soglia non relativa)", file=sys.stderr)
            self._ultimo_v_mondo_fallback = True
            return (fallback_val, True) if con_stato else fallback_val
        ord_idx = np.argsort(vals)
        sorted_vals = vals[ord_idx]
        sorted_weights = weights[ord_idx]
        cum_weights = np.cumsum(sorted_weights)
        idx_med = np.searchsorted(cum_weights, 0.5 * tot_w)
        idx_med = min(idx_med, len(sorted_vals) - 1)
        self._ultimo_v_mondo_fallback = False
        res = float(sorted_vals[idx_med])
        return (res, False) if con_stato else res

    def voto_bayesiano(self, x=None):
        """Voto bayesiano TMDB (formula IMDb): (VOT*VAVE + m*C) / (VOT + m)."""
        m = float(getattr(P, "BAYESIAN_M", 300.0))
        c = float(getattr(P, "BAYESIAN_C", 6.5))
        if x is None:
            return (self.VOT * self.VAVE + m * c) / np.maximum(self.VOT + m, 1e-9)
        return (self.VOT[x] * self.VAVE[x] + m * c) / np.maximum(self.VOT[x] + m, 1e-9)

    def get_collection_id(self, x):
        """Restituisce il collection_id TMDB (int) del titolo x, o None se assente/sconosciuto."""
        if isinstance(x, str):
            x = B.ROW_OF.get(x, -1)
        if x < 0:
            return None
        coll = getattr(self, "COLL", None)
        if coll is None:
            return None
        try:
            if isinstance(coll, dict):
                cid = coll.get(x, None)
            elif 0 <= x < len(coll):
                cid = coll[x]
            else:
                cid = None
            if cid is not None and not (isinstance(cid, float) and np.isnan(cid)) and cid != 0 and cid != "" and cid != -1:
                val = int(cid)
                return val if val > 0 else None
        except Exception:
            return None
        return None

    def get_directors(self, x):
        """Restituisce la lista di registi (stringhe) del titolo x, o [] se assente/sconosciuto."""
        if isinstance(x, str):
            x = B.ROW_OF.get(x, -1)
        if x < 0:
            return []
        dirs = getattr(self, "DIR", None)
        if dirs is None:
            dirs = getattr(self, "REGISTA", None)
        if dirs is None:
            return []
        try:
            if isinstance(dirs, dict):
                d_val = dirs.get(x, [])
            elif 0 <= x < len(dirs):
                d_val = dirs[x]
            else:
                d_val = []
            if isinstance(d_val, (list, tuple, set)):
                return [str(d).strip() for d in d_val if d and str(d).strip() not in ("0", "-1", "None", "nan")]
            elif d_val is not None and not (isinstance(d_val, float) and np.isnan(d_val)) and d_val != "" and d_val != 0 and d_val != -1:
                val_str = str(d_val).strip()
                if val_str and val_str not in ("0", "-1", "None", "nan"):
                    return [val_str]
        except Exception:
            return []
        return []

    def get_anno(self, x):
        """Restituisce l'anno di uscita del titolo x come float, o 0.0 se mancante."""
        if isinstance(x, str):
            x = B.ROW_OF.get(x, -1)
        if x < 0:
            return 0.0
        anno = getattr(self, "ANNO", None)
        if anno is None or not (0 <= x < len(anno)):
            return 0.0
        try:
            val = anno[x]
            if val is not None and not np.isnan(val):
                return float(val)
        except Exception:
            return 0.0
        return 0.0

    def applica_antimonopolio(self, titoli, visti=None, cap_posizioni=None, nome_riga=""):
        """Applica l'anti-monopolio di saga e regista sui primi `cap_posizioni` slot (Ticket 04).

        Regole:
        1. Massimo 1 titolo per TMDB `collection_id` nei primi 20 slot.
        2. Massimo 2 titoli per lo stesso regista nei primi 20 slot.
        3. Dentro una collezione si tiene il titolo con ANNO minore fra i non visti (regola Dune).
        4. I titoli esclusi dal cap non spariscono: scendono dopo la posizione 20, preservando l'ordine
           della saga e garantendo la monotonicita' non crescente dei punteggi.
        5. Se la diversificazione accorcia la riga o la porta sotto la soglia minima, lo dichiara.
        """
        if not titoli:
            return []

        # Strict no-op se non ci sono metadati da far valere (in produzione fino al ticket 18 self.COLL e self.DIR sono None):
        # con self.COLL is None and self.DIR is None restituisce titoli immutato:
        # nessun rebuild, nessun remap dei punteggi, nessun riordino.
        if getattr(self, "COLL", None) is None and getattr(self, "DIR", None) is None:
            return titoli

        if cap_posizioni is None:
            cap_posizioni = int(getattr(P, "DIVERSITA_SLOT_MAX", 20))
        max_saga = int(getattr(P, "DIVERSITA_SAGA_MAX", 1))
        max_dir = int(getattr(P, "DIVERSITA_REGISTA_MAX", 2))

        # 1. Normalizza i candidati in una lista di dict strutturati
        candidates = []
        for item in titoli:
            ch, sc = item[0], float(item[1])
            x = B.ROW_OF.get(ch, -1) if isinstance(ch, str) else int(ch)
            cid = self.get_collection_id(x)
            dirs = self.get_directors(x)
            anno = self.get_anno(x)
            candidates.append({
                "chiave": ch if isinstance(ch, str) else B.KEYS[x],
                "x": x,
                "score": sc,
                "cid": cid,
                "dirs": dirs,
                "anno": anno,
                "raw_item": item,
            })

        # 2. Identifica per ogni collezione presente il titolo con ANNO minore tra i candidati non visti
        coll_candidates = defaultdict(list)
        for c in candidates:
            if c["cid"] is not None:
                coll_candidates[c["cid"]].append(c)

        earliest_in_coll = {}
        for cid, items in coll_candidates.items():
            earliest_in_coll[cid] = min(items, key=lambda it: (it["anno"], -it["score"]))

        # 3. Pass 1: Selezione dei primi `cap_posizioni` (20) slot
        top20 = []
        coda = []
        seen_colls = defaultdict(int)
        dir_counts = defaultdict(int)

        for c in candidates:
            if len(top20) >= cap_posizioni:
                coda.append(c)
                continue

            cid = c["cid"]
            if cid is not None:
                # Regola Dune: dentro la collezione solo il titolo con ANNO minore fra i non visti puo' entrare nei primi slot
                if c["x"] != earliest_in_coll[cid]["x"]:
                    coda.append(c)
                    continue
                if seen_colls[cid] >= max_saga:
                    coda.append(c)
                    continue

            dirs = c["dirs"]
            if dirs and any(dir_counts[d] >= max_dir for d in dirs):
                coda.append(c)
                continue

            # Candidato accettato nei primi slot
            top20.append(c)
            if cid is not None:
                seen_colls[cid] += 1
            for d in dirs:
                dir_counts[d] += 1

        # 4. Pass 2: Ordinamento della coda (dopo la posizione 20)
        # I titoli esclusi NON spariscono: scendono sotto i primi 20.
        # Dentro ciascuna saga in coda, garantiamo che i titoli precedenti per ANNO non siano preceduti da sequel.
        coda_sorted = sorted(coda, key=lambda it: -it["score"])
        coll_order = defaultdict(list)
        for it in coda_sorted:
            if it["cid"] is not None:
                coll_order[it["cid"]].append(it)
        for cid, items in coll_order.items():
            items_by_anno = sorted(items, key=lambda it: (it["anno"], -it["score"]))
            it_iter = iter(items_by_anno)
            for idx, c in enumerate(coda_sorted):
                if c["cid"] == cid:
                    coda_sorted[idx] = next(it_iter)

        # 5. Monotonicita' garantita per assert_monotonia_lista
        result = []
        prev_score = float("inf")
        for it in top20:
            sc = min(prev_score, it["score"])
            result.append((it["chiave"], sc))
            prev_score = sc

        if len(top20) >= cap_posizioni:
            for it in coda_sorted:
                sc = min(prev_score * 0.999, it["score"]) if prev_score < float("inf") else it["score"]
                result.append((it["chiave"], sc))
                prev_score = sc
        else:
            tot_esclusi = len(coda_sorted)
            if tot_esclusi > 0:
                print(f"  [antimonopolio] riga '{nome_riga}': {len(top20)} titoli nei primi {cap_posizioni} slot, "
                      f"{tot_esclusi} titoli esclusi omessi per rispetto dei cap", file=sys.stderr)

        return result

    def deduci(self, righe):
        """Gli assi che la storia dice da sola: canone (voti mediani) e forma (quanti mondi pieni)."""
        voti = self.VOT[righe]
        voti = voti[voti > 0]
        canone = float(np.median(voti)) if len(voti) else 0.0
        bolle, conta = np.unique(self.MEM[righe], return_counts=True)
        forma = int((conta >= max(2, 0.02 * len(righe))).sum())
        return {"canone": canone, "forma": forma, "freddo": len(righe) < P.FREDDO_SOTTO}

    # ------------------------------------------------------------------ gli assi
    def _quota_per_mondo(self, maschera):
        """LA QUOTA DI UN ASSE PER MONDO: precalcolata in `__init__` per COZY e IMP.

        Il calcolo era 3.497 `mean()` su maschere lunghe a ogni chiamata di `modula()`; qui si legge
        un vettore. Il confronto e' per identita' (`is`), che e' sicuro perche' `modula` passa
        esattamente `self.COZY` e `self.IMP`: per una maschera qualsiasi si calcola, come prima.
        """
        if maschera is self.COZY:
            return self.QUOTA_COZY
        if maschera is self.IMP:
            return self.QUOTA_IMP
        return (np.bincount(self.MEM, weights=np.asarray(maschera, float), minlength=self.NB)
                / np.maximum(self.SZ, 1))

    def modula(self, att, slider, dedotto):
        """GLI ASSI MODULANO L'ATTIVAZIONE, non la sostituiscono (§13)."""
        out = att.copy()
        if slider.get("cozy"):
            quota = (self._quota_per_mondo(self.COZY) * slider["cozy"]
                     - self._quota_per_mondo(self.IMP) * slider["cozy"])
            out = out * np.exp(P.ASSE_PESO * quota)
        if slider.get("canone"):
            # LA FASCIA E' UNA FINESTRA CHE SI SPOSTA, NON UN RIORDINO VERSO L'ESTREMO.
            # Qui c'era `abs(q - c) * abs(s) * np.sign(q - c) * s`: ma `abs(x)*sign(x)` E' IDENTICO a
            # `x`, quindi l'esponente era `-(q-c)*s*|s|` — una RETTA, non una campana. Con s>0 premiava
            # i mondi mainstream in assoluto, con s<0 i contenitori a 0 voti: esattamente il riordino
            # verso l'estremo che il commento diceva di evitare (e che in ricetta.py faceva crollare la
            # copertura allo 0,3%). Ora il centro si sposta: +1 = piu' popolare, -1 = piu' di nicchia,
            # e nessuno dei due estremi puo' premiare un mondo a zero voti (P.DELTA_FASCIA).
            q = np.log(np.maximum(self.VOTMED, 1.0))
            c = np.log(max(dedotto["canone"], 1.0)) + slider["canone"] * P.DELTA_FASCIA
            # IL FATTORE `abs(slider)` NON E' DECORATIVO: senza, a `canone = 0.0` non si applica niente e
            # a `canone = 0.01` si applica la penalita' INTERA — un gradino dove l'utente si aspetta una
            # curva. Il ramo `cozy` lo fa gia' cosi' (la `quota` e' moltiplicata per lo slider).
            out = out * np.exp(-P.ASSE_PESO * np.abs(slider["canone"]) * np.abs(q - c))
        return out

    # ------------------------------------------------------------------ la selezione
    def scegli_mondi(self, att, slider):
        quante = int(slider.get("largo", 4))
        lontano = float(slider.get("lontano", 0.0))
        ordine = list(np.argsort(-att)[:60])
        diverse = int(round(quante * lontano))
        scelti = []

        def diverso_da(cb, scelti):
            meio = self.QUOTA_TV[cb] > 0.5
            return all(abs(np.log(max(self.VOTMED[cb], 1) / max(self.VOTMED[bb], 1)))
                       > P.MONDI_DIVERSI_SOGLIA_FASCIA
                       or meio != (self.QUOTA_TV[bb] > 0.5) for bb in scelti)

        # i primi `quante - diverse` per attivazione, gli altri per diversita'
        for cb in ordine:
            cb = int(cb)
            if len(scelti) >= quante:
                break
            if len(scelti) >= quante - diverse or diverso_da(cb, scelti):
                if cb not in scelti:
                    scelti.append(cb)
        return scelti

    def titoli_di(self, bolle, r, visti, quanti_per_mondo=10, medium_filtro=None):
        """I titoli non visti di queste bolle, ordinati per attivazione — SENZA RIPETIZIONI.

        Il dedup non e' un dettaglio: due mondi vicini hanno membri in comune, e concatenando le loro
        liste lo stesso titolo compariva due volte (e lo stesso mondo pure: 733 e 1519 davano le stesse
        voci). Trovato leggendo il documento della lettura, non da un test.
        """
        fuori, gia = [], set()
        for b in bolle:
            m = np.setdiff1d(self.MEMBRI[b], list(visti))
            if medium_filtro == "series":
                m = m[B.IS_TV[m]]
            elif medium_filtro == "movie":
                m = m[~B.IS_TV[m]]
            if len(m):
                for x in m[np.argsort(-r[m])][:quanti_per_mondo].tolist():
                    if x not in gia:
                        gia.add(x)
                        fuori.append(x)
        return fuori

    def bacino_appiattito(self, att, ordine_mondi, non_visti_mondo, max_bolle=None):
        """IL BACINO APPIATTITO (Ticket 03), riusato da ogni riga che ne ha bisogno (Ticket 07).

        `att` e' l'attivazione PER MONDO della diffusione che alimenta la riga: le bolle accese si
        accumulano in ordine di attivazione finche' non coprono MASSA_TARGET (e almeno
        MIN_CANDIDATI titoli grezzi), poi si aggiungono i primi VICINI_PER_BOLLA vicini.

        `max_bolle` limita quante bolle-seme si accumulano (la riga delle ultime visioni ne vuole
        al massimo 3-4): None = nessun tetto, il comportamento di «il tuo mondo». Esisteva una sola
        copia di questo calcolo, e una seconda copia e' il difetto ricorrente di questo cantiere.
        """
        massa_target = float(getattr(P, "IL_TUO_MONDO_MASSA_TARGET", 0.80))
        min_candidati_bacino = int(getattr(P, "IL_TUO_MONDO_MIN_CANDIDATI", 250))
        vicini_k = int(getattr(P, "IL_TUO_MONDO_VICINI_PER_BOLLA", 3))

        tot_massa_att = float(att.sum())
        soglia_massa = massa_target * tot_massa_att if tot_massa_att > 0 else 0.0

        bolle_k = []
        massa_acc = 0.0
        titoli_grezzi_acc = 0
        for b in ordine_mondi:
            cb = int(b)
            if float(att[cb]) <= 0.0 and (massa_acc >= soglia_massa or len(bolle_k) > 0):
                break
            bolle_k.append(cb)
            massa_acc += float(att[cb])
            titoli_grezzi_acc += len(non_visti_mondo(cb))
            if max_bolle is not None and len(bolle_k) >= int(max_bolle):
                break
            if massa_acc >= soglia_massa and titoli_grezzi_acc >= min_candidati_bacino:
                break

        bacino_bolle_set = set(bolle_k)
        for b in bolle_k:
            if b < len(self.VICINI):
                for v in self.VICINI[b][:vicini_k]:
                    if v >= 0:
                        bacino_bolle_set.add(int(v))

        # Set unico di candidati non visti nel bacino (senza iterare bolla per bolla)
        cand_bacino_set = set()
        for b in bacino_bolle_set:
            cand_bacino_set.update(non_visti_mondo(b))
        cand_bacino = np.array(list(cand_bacino_set), dtype=np.int64)
        return bolle_k, bacino_bolle_set, cand_bacino

    # ------------------------------------------------------------------ IL METODO
    def lista(self, storia, slider=None, cap=None, medium=None):
        """Una storia e' una lista di `(chiave, plays)` OPPURE di `(chiave, plays, tipo)`
        OPPURE di `(chiave, plays, tipo, peso)` OPPURE di `(chiave, plays, tipo, peso, recente)`.

        Il `tipo` e' il segnale del prodotto: "loved", "liked", "watched", "library", "catalogo".
        Senza tipo si assume "watched": il comportamento di prima, bit per bit.
        `recente` (Ticket 07) e' un booleano: il seme e' fra gli ultimi visti. Non e' un peso — e'
        una SELEZIONE: la riga «ultime visioni» nasce da una seconda camminata sui soli semi recenti.
        `cap`: tetto di titoli per lista (default 10 se None per compatibilita').
        `medium`: filtro opzionale 'movie' o 'series' (E4).
        """
        slider = {**SLIDER_DEFAULT, **(slider or {})}
        cap_main = int(cap) if cap is not None else 10
        voci = []
        for voce in storia:
            ch = voce[0]
            pl = voce[1] if len(voce) > 1 else 1
            tp = voce[2] if len(voce) > 2 else "watched"
            ps = voce[3] if len(voce) > 3 else None
            rc = bool(voce[4]) if len(voce) > 4 else False
            if ch in B.ROW_OF:
                voci.append((ch, pl, tp, ps, rc))
        if not voci:
            return {"errore": "nessun titolo della storia e' nel canone", "liste": []}
        righe = np.array([B.ROW_OF[v[0]] for v in voci], np.int64)
        plays = np.array([v[1] for v in voci], float)
        tipi = [v[2] for v in voci]
        pesi = [v[3] for v in voci]
        if not any(p is not None for p in pesi):
            pesi = None
        # TICKET 07: gli indici dei semi recenti. Il flag non pesa: seleziona (vedi «ultime visioni»).
        idx_rec = [i for i, v in enumerate(voci) if v[4]]
        n_rec = len(idx_rec)
        dedotto = self.deduci(righe)
        att, r = self.diffondi(righe, plays, tipi=tipi, pesi=pesi)
        att_s = self.modula(att, slider, dedotto)
        visti = set(righe.tolist())
        # TICKET 02: I titoli in watchlist entrano nei visti come tutti gli altri semi
        # (non compaiono automaticamente tra i suggerimenti per il solo fatto di essere in watchlist).
        visti_list = list(visti)

        w_semi = self.pesi_semi(righe, plays, tipi=tipi, pesi=pesi)
        e_init = np.zeros(self.N, np.float64)
        np.add.at(e_init, righe, w_semi)
        e_init /= max(float(e_init.sum()), 1e-12)

        def non_visti_mondo(b):
            m = np.setdiff1d(self.MEMBRI[b], visti_list)
            if medium == "series":
                m = m[B.IS_TV[m]]
            elif medium == "movie":
                m = m[~B.IS_TV[m]]
            return m

        # Selezione dei mondi accesi che alimentano le liste successive («uscite_nuove», «cinema_invisibile»):
        # accumula dal mondo del profilo in poi, in ordine di attivazione modulata, finche' non
        # raggiunge almeno 50 titoli (o i mondi finiscono) e rispetta il limite 'largo'.
        # Il mondo del profilo resta il primo (esente da MIN_TITOLI_MONDO); i successivi richiedono >= 5 titoli non visti.
        ordine_mondi = list(np.argsort(-att_s))
        primo = int(ordine_mondi[0]) if len(ordine_mondi) > 0 else None
        bolle = [primo] if primo is not None else []
        tot_titoli = len(non_visti_mondo(primo)) if primo is not None else 0
        quante = int(slider.get("largo", 4))

        for b in ordine_mondi[1:]:
            if tot_titoli >= P.IL_TUO_MONDO_MIN_TITOLI and len(bolle) >= quante:
                break
            cb = int(b)
            mb = non_visti_mondo(cb)
            if len(mb) >= P.MIN_TITOLI_MONDO:
                bolle.append(cb)
                tot_titoli += len(mb)

        vicini = [int(x) for x in self.VICINI[primo] if x >= 0][:3] if primo is not None else []

        def righe_titoli(bs, quanti=cap_main, nome_riga="un_passo_fuori"):
            quanti_fetch = max(quanti * 2, quanti + 20)
            fuori = [(B.KEYS[r_], float(r[r_])) for r_ in self.titoli_di(bs, r, visti, quanti_fetch, medium_filtro=medium)]
            if len(bs) > 1:
                fuori = sorted(fuori, key=lambda t: -t[1])
            div = self.applica_antimonopolio(fuori, visti=visti, cap_posizioni=P.DIVERSITA_SLOT_MAX, nome_riga=nome_riga)
            return div[:quanti]

        # =========================================================================
        # «IL TUO MONDO» (Ticket 03): Bacino appiattito + Pavimento di qualita' + Ranking combinato
        # =========================================================================
        # 1. Bacino appiattito: top K bolle accese (>=80% massa, min 250 candidati grezzi) + primi 2-3 vicini
        # Il calcolo sta in `bacino_appiattito` perche' dal Ticket 07 lo usa anche la riga delle ultime visioni.
        bolle_k, bacino_bolle_set, cand_bacino = self.bacino_appiattito(att, ordine_mondi, non_visti_mondo)

        # 2. Pavimento di qualita' (maschera vettoriale prima del ranking)
        canone = float(dedotto.get("canone", 0.0))
        soglia_voti = max(
            float(getattr(P, "PAVIMENTO_VOT_MIN", 150)),
            float(getattr(P, "PAVIMENTO_VOT_FATTORE_CANONE", 0.08)) * canone,
        )
        soglia_vave = float(getattr(P, "PAVIMENTO_VAVE_MIN", 6.4))

        if len(cand_bacino) > 0:
            maschera_pavimento = (self.VAVE[cand_bacino] >= soglia_vave) & (self.VOT[cand_bacino] >= soglia_voti)
            cand_sopravvissuti = cand_bacino[maschera_pavimento]
        else:
            cand_sopravvissuti = np.array([], dtype=np.int64)

        # 3. Ranking combinato: score(x) = r[x] * (bayesian_vote(x) / 7.0) ** 1.5
        base_bayes = float(getattr(P, "RANKING_BAYES_BASE", 7.0))
        exp_bayes = float(getattr(P, "RANKING_BAYES_EXP", 1.5))

        if len(cand_sopravvissuti) > 0:
            bayes_cand = self.voto_bayesiano(cand_sopravvissuti)
            score_cand = r[cand_sopravvissuti] * ((bayes_cand / base_bayes) ** exp_bayes)
            ordine_score = np.argsort(-score_cand)
            cand_ordinati = cand_sopravvissuti[ordine_score]
            scores_ordinati = score_cand[ordine_score]
            titoli_uns = [(B.KEYS[c], float(sc)) for c, sc in zip(cand_ordinati, scores_ordinati)]
        else:
            titoli_uns = []

        # TICKET 02: Ripescaggio controllato, max 2:
        # Per i soli semi di tipo library si calcola r_indotta[x] = r[x] - ALPHA * e[x].
        # Un titolo si ripesca solo se r_indotta[x] sta nel top 15% dei candidati non visti e VAVE[x] >= 7.0.
        # Massimo 2 per riga, nelle prime posizioni.
        lib_seeds = [int(r_) for r_, t in zip(righe, tipi) if t == "library"]
        if medium == "series":
            lib_seeds = [x for x in lib_seeds if B.IS_TV[x]]
        elif medium == "movie":
            lib_seeds = [x for x in lib_seeds if not B.IS_TV[x]]

        ripescati_mondo = []
        if lib_seeds and len(cand_bacino) > 0:
            soglia_top_pct = getattr(P, "RIPESCAGGIO_TOP_PCT", 0.15)
            soglia_top15 = float(np.percentile(r[cand_bacino], 100 * (1.0 - soglia_top_pct)))
            vave_min = getattr(P, "RIPESCAGGIO_VAVE_MIN", 7.0)
            qualificati = [
                x for x in lib_seeds
                if int(self.MEM[x]) in bacino_bolle_set
                and float(self.VAVE[x]) >= vave_min
                and float(r[x] - P.ALPHA * e_init[x]) >= soglia_top15
            ]
            qualificati.sort(key=lambda x: -float(r[x] - P.ALPHA * e_init[x]))
            ripescati_mondo = qualificati[:int(getattr(P, "RIPESCAGGIO_MAX", 2))]

        liste = []
        quanti_tuo = max(P.IL_TUO_MONDO_MIN_TITOLI, cap_main) if cap is None or cap >= P.IL_TUO_MONDO_MIN_TITOLI else cap_main
        if ripescati_mondo:
            bayes_rip = self.voto_bayesiano(ripescati_mondo)
            score_rip = r[ripescati_mondo] * ((bayes_rip / base_bayes) ** exp_bayes)
            titoli_rip = [(B.KEYS[x], float(sc)) for x, sc in zip(ripescati_mondo, score_rip)]
            cand_tuo_tutti = sorted(titoli_rip + titoli_uns, key=lambda t: -t[1])
        else:
            cand_tuo_tutti = titoli_uns

        titoli_tuo = self.applica_antimonopolio(cand_tuo_tutti, visti=visti,
                                                cap_posizioni=P.DIVERSITA_SLOT_MAX,
                                                nome_riga="il_tuo_mondo")
        liste.append({"tipo": "il_tuo_mondo", "mondo": primo, "titoli": titoli_tuo[:quanti_tuo]})
        liste.append({"tipo": "un_passo_fuori", "mondo": None, "titoli": righe_titoli(vicini, quanti=cap_main, nome_riga="un_passo_fuori")})

        # le uscite nuove: 2025+ dentro i mondi accesi (la porta d'ingresso lavora di notte)
        nuove = [x for x in np.where(self.ANNO >= P.USCITE_NUOVE_DAL)[0]
                 if int(self.MEM[x]) in set(bolle) and x not in visti]
        if medium == "series":
            nuove = [x for x in nuove if B.IS_TV[x]]
        elif medium == "movie":
            nuove = [x for x in nuove if not B.IS_TV[x]]
        nuove.sort(key=lambda x: (-float(r[x]), -float(self.VOT[x])))
        cand_nuove = [(B.KEYS[x], float(r[x])) for x in nuove]
        div_nuove = self.applica_antimonopolio(cand_nuove, visti=visti, cap_posizioni=P.DIVERSITA_SLOT_MAX, nome_riga="uscite_nuove")
        liste.append({"tipo": "uscite_nuove", "mondo": None, "titoli": div_nuove[:cap_main]})

        # =========================================================================
        # «GEMME NASCOSTE NEL TUO MONDO» (Ticket 05): Nicchia RELATIVA al profilo
        # =========================================================================
        # 1. Bacino appiattito: lo stesso cand_bacino di «il tuo mondo» (Ticket 03)
        is_fallback_v_mondo = False
        if len(cand_bacino) > 0:
            # 2. Tetto relativo di notorieta':
            # V_mondo = mediana dei voti del bacino acceso pesata per att_s[b]
            v_mondo, is_fallback_v_mondo = self.calcola_v_mondo(bacino_bolle_set, att_s, con_stato=True)
            fattore_v_mondo = float(getattr(P, "NICCHIA_FATTORE_V_MONDO", 0.35))
            tetto_vot_max = float(getattr(P, "NICCHIA_TETTO_VOT_MAX", 2500.0))
            # 3. Pavimento assoluto: VOT[x] >= 40
            pavimento_voti = float(getattr(P, "NICCHIA_PAVIMENTO_VOT_MIN", 40.0))
            tetto_voti = max(pavimento_voti, min(fattore_v_mondo * v_mondo, tetto_vot_max))

            # 4. Voto normalizzato sulla bolla e neutralizzazione serie:
            # offset_serie sottratto coerentemente su pavimento, delta bolla e ranking.
            # mu_b = media voto della bolla da self.VAVEMEAN (nessuna ricalcolazione duplicata).
            offset_serie = float(getattr(P, "NICCHIA_SERIE_OFFSET_VOTO", 0.3))
            delta_vave_min = float(getattr(P, "NICCHIA_DELTA_VAVE_MU", 0.4))
            vave_min_film = float(getattr(P, "NICCHIA_VAVE_MIN_FILM", 6.8))

            cand_bolle = self.MEM[cand_bacino]
            mu_b_cand = self.VAVEMEAN[cand_bolle]
            vave_cand = self.VAVE[cand_bacino]
            vot_cand = self.VOT[cand_bacino]
            is_tv_cand = B.IS_TV[cand_bacino]

            # Voto effettivo con offset serie sottratto ovunque
            vave_eff = np.where(is_tv_cand, vave_cand - offset_serie, vave_cand)

            maschera_nicchia = (
                (vot_cand >= pavimento_voti)
                & (vot_cand <= tetto_voti)
                & ((vave_eff - mu_b_cand) >= delta_vave_min)
                & (vave_eff >= vave_min_film)
            )
            nic_sopravvissuti = cand_bacino[maschera_nicchia]

            if len(nic_sopravvissuti) > 0:
                # 5. Ordine: r[x] * (vave_eff[x] - mu_b + 1.0) * (1 + 0.15 * (LISTDEG[x] > 0))
                # Riuso dello slice mu_b_cand[maschera_nicchia] (nessuna ricalcolazione)
                r_nic = r[nic_sopravvissuti]
                mu_nic = mu_b_cand[maschera_nicchia]
                vave_diff = vave_eff[maschera_nicchia] - mu_nic
                bonus_liste = float(getattr(P, "NICCHIA_BONUS_LISTE", 0.15))
                fattore_liste = np.where(self.LISTDEG[nic_sopravvissuti] > 0, 1.0 + bonus_liste, 1.0)

                score_nic = r_nic * (vave_diff + 1.0) * fattore_liste
                ordine_score = np.argsort(-score_nic)
                nic_ordinati = nic_sopravvissuti[ordine_score]
                score_ordinati = score_nic[ordine_score]

                cand_nic = [(B.KEYS[x], float(sc)) for x, sc in zip(nic_ordinati, score_ordinati)]
            else:
                cand_nic = []
        else:
            cand_nic = []
            is_fallback_v_mondo = True

        div_nic = self.applica_antimonopolio(cand_nic, visti=visti, cap_posizioni=P.DIVERSITA_SLOT_MAX, nome_riga="nicchia_di_qualita")
        titoli_nic = div_nic[:cap_main]
        target_nic = cap_main if cap_main is not None else 20
        riga_corta = len(titoli_nic) < target_nic
        if riga_corta:
            print(f"  [nicchia] riga corta: {len(titoli_nic)}/{target_nic} titoli sopravvissuti (il pavimento non si abbassa per riempire)", file=sys.stderr)

        liste.append({
            "tipo": "nicchia_di_qualita",
            "mondo": None,
            "titoli": titoli_nic,
            "corta": riga_corta,
            "target_dimensione": target_nic,
            "totale_sopravvissuti": len(div_nic),
            "soglia_relativa": not is_fallback_v_mondo,
            "fallback_v_mondo": is_fallback_v_mondo
        })

        # =========================================================================
        # �CLASSICI IMPERDIBILI DEL TUO MONDO� (Ticket 06): high-consensus, top-300 per r
        # =========================================================================
        is_fallback_v_mondo_cls = False
        if len(cand_bacino) > 0:
            order_r = np.argsort(-r[cand_bacino])
            top_n = min(300, len(cand_bacino))
            cand_top300 = cand_bacino[order_r][:top_n]

            v_mondo_cls, is_fallback_v_mondo_cls = self.calcola_v_mondo(bacino_bolle_set, att_s, con_stato=True)
            soglia_vot_cls = max(1500.0, 1.5 * float(v_mondo_cls))

            offset_serie_cls = float(getattr(P, "NICCHIA_SERIE_OFFSET_VOTO", 0.3))
            is_tv_cls = B.IS_TV[cand_top300]
            vave_min_cls = np.where(is_tv_cls, 7.7, 7.5)

            canone_cls = float(dedotto.get("canone", 0.0))
            soglia_voti_qp = max(float(getattr(P, "PAVIMENTO_VOT_MIN", 150)), float(getattr(P, "PAVIMENTO_VOT_FATTORE_CANONE", 0.08)) * canone_cls)
            soglia_vave_qp = float(getattr(P, "PAVIMENTO_VAVE_MIN", 6.4))

            vot_c = self.VOT[cand_top300]
            vave_c = self.VAVE[cand_top300]
            maschera_cls = (
                (vot_c >= soglia_vot_cls)
                & (vave_c >= vave_min_cls)
                & (vave_c >= soglia_vave_qp)
                & (vot_c >= soglia_voti_qp)
            )
            surv_cls = cand_top300[maschera_cls]

            if len(surv_cls) > 0:
                bayes_cls = self.voto_bayesiano(surv_cls)
                r_cls = r[surv_cls]
                r_min, r_max = float(r_cls.min()), float(r_cls.max())
                b_min, b_max = float(bayes_cls.min()), float(bayes_cls.max())
                r_norm = (r_cls - r_min) / (r_max - r_min) if r_max > r_min else np.ones_like(r_cls)
                b_norm = (bayes_cls - b_min) / (b_max - b_min) if b_max > b_min else np.ones_like(bayes_cls)
                score_cls = 0.7 * r_norm + 0.3 * b_norm
                ordine_cls = np.argsort(-score_cls)
                surv_ord = surv_cls[ordine_cls]
                score_ord = score_cls[ordine_cls]
                cand_cls = [(B.KEYS[x], float(sc)) for x, sc in zip(surv_ord, score_ord)]
            else:
                cand_cls = []
        else:
            cand_cls = []
            is_fallback_v_mondo_cls = True

        div_cls = self.applica_antimonopolio(cand_cls, visti=visti, cap_posizioni=P.DIVERSITA_SLOT_MAX, nome_riga="classici_imperdibili")
        titoli_cls = div_cls[:cap_main]
        target_cls = cap_main if cap_main is not None else 20
        riga_corta_cls = len(titoli_cls) < target_cls
        if riga_corta_cls:
            print(f"  [classici] riga corta: {len(titoli_cls)}/{target_cls} titoli sopravvissuti (il pavimento non si abbassa per riempire)", file=sys.stderr)

        liste.append({
            "tipo": "classici_imperdibili",
            "mondo": None,
            "titoli": titoli_cls,
            "corta": riga_corta_cls,
            "target_dimensione": target_cls,
            "totale_sopravvissuti": len(div_cls),
            "soglia_relativa": not is_fallback_v_mondo_cls,
            "fallback_v_mondo": is_fallback_v_mondo_cls
        })

        # =========================================================================
        # «SUL FILO DELLE TUE ULTIME VISIONI» (Ticket 07): la recenza come SELEZIONE
        # =========================================================================
        # La misura (parametri.NIENTE_RECENZA / NIENTE_BOOST) dice che la recenza non e' un peso:
        # i soli ultimi 15 titoli fanno lift 47,5x contro 18,2x, e il boost sui punteggi e' vuoto.
        # Qui la recenza SELEZIONA: una SECONDA camminata sui soli semi recenti, bacino appiattito
        # sulle bolle accese da QUELLA camminata, stesso pavimento e stesso ranking di «il tuo mondo».
        # Con meno di ULTIME_VISIONI_MIN_SEMI semi recenti la riga lo DICHIARA invece di sparire.
        riga_uv = {
            "tipo": "ultime_visioni",
            "mondo": None,
            "titoli": [],
            "corta": True,
            "target_dimensione": cap_main,
            "totale_sopravvissuti": 0,
            "semi_recenti": n_rec,
        }
        min_semi_rec = int(getattr(P, "ULTIME_VISIONI_MIN_SEMI", 3))
        if n_rec < min_semi_rec:
            riga_uv["motivo"] = f"ultime_visioni: meno di {min_semi_rec} semi recenti ({n_rec})"
            print(f"  [ultime_visioni] dichiarata vuota: {n_rec} semi recenti (minimo {min_semi_rec})", file=sys.stderr)
        else:
            pesi_rec = None if pesi is None else [pesi[i] for i in idx_rec]
            att_rec, r_rec = self.diffondi(
                righe[idx_rec], plays[idx_rec],
                tipi=[tipi[i] for i in idx_rec], pesi=pesi_rec,
            )
            _, _, cand_rec = self.bacino_appiattito(
                att_rec, list(np.argsort(-att_rec)), non_visti_mondo,
                max_bolle=int(getattr(P, "ULTIME_VISIONI_BOLLE_MAX", 4)),
            )
            if len(cand_rec) > 0:
                maschera_rec = (self.VAVE[cand_rec] >= soglia_vave) & (self.VOT[cand_rec] >= soglia_voti)
                surv_rec = cand_rec[maschera_rec]
            else:
                surv_rec = np.array([], dtype=np.int64)

            if len(surv_rec) > 0:
                bayes_rec = self.voto_bayesiano(surv_rec)
                score_rec = r_rec[surv_rec] * ((bayes_rec / base_bayes) ** exp_bayes)
                ordine_rec = np.argsort(-score_rec)
                cand_uv = [(B.KEYS[x], float(sc)) for x, sc in zip(surv_rec[ordine_rec], score_rec[ordine_rec])]
            else:
                cand_uv = []

            div_uv = self.applica_antimonopolio(cand_uv, visti=visti, cap_posizioni=P.DIVERSITA_SLOT_MAX, nome_riga="ultime_visioni")
            riga_uv["titoli"] = div_uv[:cap_main]
            riga_uv["totale_sopravvissuti"] = len(div_uv)
            riga_uv["corta"] = len(riga_uv["titoli"]) < cap_main
            if riga_uv["corta"]:
                riga_uv["motivo"] = f"ultime_visioni: riga corta {len(riga_uv['titoli'])}/{cap_main} titoli"
                print(f"  [ultime_visioni] riga corta: {len(riga_uv['titoli'])}/{cap_main} titoli sopravvissuti (il pavimento non si abbassa per riempire)", file=sys.stderr)

        liste.append(riga_uv)

        for b in bolle[1:]:
            liste.append({"tipo": f"mondo_{b}", "mondo": int(b), "titoli": righe_titoli([b], quanti=cap_main, nome_riga=f"mondo_{b}")} )

        # IL CONTRATTO DI ORDINE DELLE LISTE.
        # Tutte le liste esportate devono rispettare rigorosamente l'ordine monotono decrescente:
        # - liste dei mondi e un_passo_fuori: ordinate per attivazione r[x];
        # - uscite_nuove: ordinate per attivazione r[x] e freschezza;
        # - nicchia_di_qualita: ordinata per punteggio combinato r[x] * (vave_diff + 1.0) * liste.
        # Nessuna lista e' esente dalla monotonicita' dei propri punteggi esportati.
        for li in liste:
            K.assert_monotonia_lista(li["titoli"], f"lista {li['tipo']}")

        # E2: "catalogo" accende da_catalogo: true, e non compare fra i suggerimenti (e' in visti)
        da_cat = any(t == "catalogo" for t in tipi)

        return {"versioni": {"artefatto": self.artefatto, "ricetta": P.impronta()},
                "slider": slider,
                "profilo": dedotto,
                "semi": {"n": int(len(righe)), "da_catalogo": da_cat, "recenti": int(n_rec)},
                "mondi": [{"bolla": int(b), "attivazione": float(att[b]), "titoli": int(self.SZ[b]),
                           "voti_mediani": float(self.VOTMED[b]),
                           "quota_serie": float(self.QUOTA_TV[b]),
                           "vicini": [int(x) for x in self.VICINI[b][:6]]} for b in bolle],
                "liste": liste}


def da_trakt(utente):
    """La storia di un utente Trakt in cache: [(chiave, plays), ...] IN ORDINE CRONOLOGICO.

    Prima questa funzione ciclava `movie` poi `show` senza leggere `last_watched_at`, quindi l'array era
    **tutti i film e poi tutte le serie**: chi tagliava a meta' credendo di separare passato e futuro
    separava i MEDIUM. Ora la storia arriva gia' ordinata da `canon.storia_trakt`, che e' l'unico posto
    dove questi JSON si leggono. I file sono troncati a 300 voci.
    """
    chiavi, _righe, plays, _eta = K.storia_trakt(utente, ordine="cronologico")
    return [(c, int(p)) for c, p in zip(chiavi, plays)]


def stampa(esito):
    if esito.get("errore"):
        print(f"  ERRORE: {esito['errore']}")
        return
    pr = esito["profilo"]
    print(f"\n  versione artefatto {esito['versioni']['artefatto']} · ricetta "
          f"{esito['versioni']['ricetta']} · slider {esito['slider']}")
    print(f"  profilo DEDOTTO: canone {pr['canone']:,.0f} voti · forma {pr['forma']} mondi · "
          f"{'FREDDO' if pr['freddo'] else 'caldo'} · semi {esito['semi']['n']}")
    print(f"\n  i mondi accesi ({len(esito['mondi'])}, col loro peso e la loro fascia):")
    for m in esito["mondi"]:
        vs = "serie" if m.get("quota_serie", 0) > 0.5 else "film"
        print(f"    mondo {m['bolla']:>5} · acceso {100*m['attivazione']:>5.2f}% · {m['titoli']:>4} titoli · "
              f"{vs} · voti mediani {m['voti_mediani']:>7,.0f}")
    print(f"\n  LE LISTE:")
    for li in esito["liste"]:
        if not li["titoli"]:
            print(f"    {li['tipo']:<20} —  (vuota)")
            continue
        print(f"    {li['tipo']:<20} ({len(li['titoli'])} titoli)")
        print(f"      " + " · ".join(f"{TITOLI.get(k, k)[:26]}" for k, _ in li["titoli"][:8]))


TITOLI = {}


def carica_titoli():
    """Riempie TITOLI (chiave -> nome) per la stampa. Separato perche' serve solo a MOSTRARE.

    PRIMA RILEGGEVA I PARQUET (due letture complete con un ciclo Python su ~117.000 righe) per
    riprendere dei titoli che sono gia' dentro `canon.metadati()`: erano 146 MB di lettura per una
    mappa di stringhe che si costruisce in 40 ms dall'artefatto.
    """
    m = K.metadati()
    for r, chiave in enumerate(K.titoli()[0]):
        TITOLI[chiave] = str(m["TIT"][r])
    return TITOLI


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Il motore: entra una storia, escono le liste")
    ap.add_argument("--utente", help="un utente Trakt in cache")
    ap.add_argument("--storia", help="un JSON: [[chiave, plays], ...]")
    ap.add_argument("--largo", type=int, default=SLIDER_DEFAULT["largo"])
    ap.add_argument("--lontano", type=float, default=SLIDER_DEFAULT["lontano"])
    ap.add_argument("--cozy", type=float, default=SLIDER_DEFAULT["cozy"])
    ap.add_argument("--canone", type=float, default=SLIDER_DEFAULT["canone"])
    ap.add_argument("--json", action="store_true", help="stampa l'esito completo in JSON")
    a = ap.parse_args()

    M = Motore()
    carica_titoli()

    if a.storia:
        storia = [(k, p) for k, p in json.load(open(a.storia, encoding="utf-8"))]
    elif a.utente:
        storia = da_trakt(a.utente)
    else:
        ap.error("serve --utente o --storia")
    esito = M.lista(storia, {"largo": a.largo, "lontano": a.lontano,
                             "cozy": a.cozy, "canone": a.canone})
    if a.json:
        print(json.dumps(esito, ensure_ascii=False, indent=1))
    else:
        stampa(esito)
