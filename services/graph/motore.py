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
    "semi":      {n, da_catalogo, recenti}   quanti, da dove, e quanti degli ultimi visti
    "mondi":     [{bolla, attivazione, titoli, voti_mediani, vicini}, ...]
    "liste":     [{tipo, mondo, titoli: [(chiave, attivazione), ...]}, ...]
  }

LE LISTE (§3d, Ticket 40): il tuo mondo e i vicini (almeno 50 titoli) · un passo fuori · le uscite nuove · la nicchia di qualita' · i classici imperdibili (Ticket 06) · sul filo delle tue ultime visioni (Ticket 07) · un micro-cluster per filone (Ticket 08) — piu' un
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
import re

import numpy as np
import pandas as pd
import scipy.sparse as sp
import scipy.sparse.csgraph as cg

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from graph import bubbles as B
from graph import camminata as C
from graph import canon as K
from graph import parametri as P
from graph import uscite as U

# LA SPECIFICITA' DELLE RIGHE (Ticket 11): piu' basso = piu' specifico, quindi pesca per PRIMO nel
# waterfall. La tabella sta in `parametri.py` (e' un dato di prodotto, e cambiarla deve cambiare la
# ricetta). Qui resta un alias per chi legge il motore.
SPECIFICITA = dict(P.SPECIFICITA)
# L'unica sovrapposizione ammessa, come COPPIA di famiglie (Ticket 11): il tuo mondo puo' tenere un
# titolo che un micro-cluster ha gia' preso. La quantita' e' `WATERFALL_SOVRAPPOSIZIONE_MICRO`.
SOVRAPPOSIZIONE_FAMIGLIE = ("il_tuo_mondo", "micro_cluster")


def famiglia_riga(tipo):
    """`micro_cluster_2` -> `micro_cluster`, `mondo_3379` -> `mondo`: la chiave della specificita'."""
    return re.sub(r"_\d+$", "", str(tipo))


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
        # TICKET 10: la cache delle uscite collocate. Se manca non si parte meno: la riga lo dira'.
        self.USCITE = U.carica()
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
        """Voto bayesiano TMDB (formula IMDb). La formula sta in `canon.voto_bayesiano`: una copia sola."""
        if x is None:
            return K.voto_bayesiano(self.VOT, self.VAVE)
        return K.voto_bayesiano(self.VOT[x], self.VAVE[x])

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
    def distanza_fra_mondi(self, a, b):
        """QUANTO DUE MONDI SONO LONTANI (Ticket 09): differenza di fascia di notorieta' (log) piu' il
        medium. E' la stessa misura che `scegli_mondi` usa per la diversita'
        (`MONDI_DIVERSI_SOGLIA_FASCIA`), estratta perche' il fallback dei punti d'incontro deve SCEGLIERE
        la coppia piu' lontana, non solo chiedere se due mondi sono diversi.

        Divergenza misurata dal ticket 09: `scegli_mondi(att, {largo: 2, lontano: 1.0})` NON sceglie i
        due mondi piu' lontani — con `lontano = 1.0` tutti gli slot sono «diversi» e il filtro viene
        saltato (`len(scelti) >= quante - diverse` e' sempre vero), quindi torna i primi due per
        attivazione. Il fallback usa questa funzione, non quella scorciatoia.
        """
        fascia = abs(np.log(max(float(self.VOTMED[int(a)]), 1.0) / max(float(self.VOTMED[int(b)]), 1.0)))
        medio = 1.0 if (self.QUOTA_TV[int(a)] > 0.5) != (self.QUOTA_TV[int(b)] > 0.5) else 0.0
        return float(fascia) + medio

    def scegli_mondi(self, att, slider):
        quante = int(slider.get("largo", 4))
        lontano = float(slider.get("lontano", 0.0))
        ordine = list(np.argsort(-att)[:60])
        diverse = int(round(quante * lontano))
        scelti = []

        def diverso_da(cb, scelti):
            return all(self.distanza_fra_mondi(cb, bb) > P.MONDI_DIVERSI_SOGLIA_FASCIA for bb in scelti)

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

    def pavimento(self, cand, soglia_voti, soglia_vave):
        """IL PAVIMENTO DI QUALITA' (Ticket 03), una maschera sola per tutte le righe.

        `VAVE >= soglia_vave` e `VOT >= soglia_voti`. La stessa formula serviva a «il tuo mondo»
        e alla riga delle ultime visioni (Ticket 07): due copie divergono, e in questo cantiere
        e' gia' successo quattro volte.
        """
        if len(cand) == 0:
            return np.array([], dtype=np.int64)
        return cand[(self.VAVE[cand] >= soglia_vave) & (self.VOT[cand] >= soglia_voti)]

    def titoli_seme(self, nodi, pesi, quanti=None):
        """I titoli dei semi piu' pesanti (a pari peso, nodo piu' basso) — un posto solo (Ticket 08/09).

        Deduplica i nodi e somma i pesi: lo stesso titolo puo' arrivare da due sorgenti (watchlist + loved)
        e non deve uscire due volte. `quanti` default = `MICRO_CLUSTER_SEMI_PARLANTI`.
        """
        nodi = np.asarray(nodi, np.int64)
        pesi = np.asarray(pesi, np.float64)
        nodi_u, inversa = np.unique(nodi, return_inverse=True)
        pesi_u = np.zeros(len(nodi_u), np.float64)
        np.add.at(pesi_u, inversa, pesi)
        quanti = int(P.MICRO_CLUSTER_SEMI_PARLANTI) if quanti is None else int(quanti)
        ordine = sorted(range(len(nodi_u)), key=lambda j: (-float(pesi_u[j]), int(nodi_u[j])))
        return [str(self.TIT[int(nodi_u[j])]) for j in ordine[:quanti]]

    def waterfall_righe(self, liste, cap_main):
        """IL WATERFALL (Ticket 11): ogni titolo in UNA riga sola, in ordine di specificita'.

        PERCHE' ESISTE. Le righe erano additive: lo stesso film poteva stare in piu' righe hero, e una
        riga specialistica perdeva il suo titolo migliore perche' «il tuo mondo» (bacino grande) era
        arrivato prima. Qui le righe pescano in ordine di `SPECIFICITA`: prima le righe a bacino stretto,
        poi ultime visioni e micro-cluster, infine «il tuo mondo». La `specificita` di ogni riga e' un
        campo (dato), e l'ordine viene da li', non dall'ordine di costruzione del codice.

        L'UNICA SOVRAPPOSIZIONE AMMESSA (`WATERFALL_SOVRAPPOSIZIONE_MICRO`, fra le famiglie
        `SOVRAPPOSIZIONE_FAMIGLIE`): «il tuo mondo» puo' tenere un titolo che un micro-cluster ha gia'
        preso — e solo se nessuna riga piu' specifica l'ha gia' portato via. Il motivo e' di prodotto: se
        il filone porta un titolo che e' anche fra i migliori del mondo, toglierlo lo nasconderebbe a chi
        apre la home. Uno solo, non due, e non e' sfruttabile donando un titolo da ogni filone.

        Ogni riga porta `specificita` e `doppioni_tolti`: quest'ultimo conta le **copie evitate** (quante
        volte il pool ha incontrato un titolo gia' assegnato), non i titoli persi — il numero giusto per
        «prima/dopo» si misura confrontando le righe con e senza il waterfall. Se il taglio porta la riga
        sotto il target, lo DICHIARA col conteggio aggiornato, e la riga resta.
        """
        def _specificita(tipo):
            famiglia = famiglia_riga(tipo)
            if famiglia not in SPECIFICITA and famiglia != "mondo":
                # Una famiglia nuova non deve scivolare in fondo in silenzio: l'ordine e' un dato, e un
                # dato mancante si grida.
                print(f"  [waterfall] ATTENZIONE: famiglia di riga senza specificita': {tipo} "
                      f"(finisce a {P.SPECIFICITA_DEFAULT})", file=sys.stderr)
            return int(SPECIFICITA.get(famiglia, P.SPECIFICITA_DEFAULT))

        ordine = sorted(range(len(liste)), key=lambda i: (_specificita(liste[i]["tipo"]), i))
        assegnati = {}
        consentite = int(P.WATERFALL_SOVRAPPOSIZIONE_MICRO)
        for i in ordine:
            li = liste[i]
            tipo = li["tipo"]
            famiglia = famiglia_riga(tipo)
            li["specificita"] = _specificita(tipo)
            if "doppioni_tolti" in li:
                continue  # gia' passato da un waterfall: non si azzera il conteggio
            li["doppioni_tolti"] = 0
            # Una riga senza `_pool` (vuota per costruzione) non deve sparire dal conteggio: i suoi
            # titoli, se ne ha, vanno comunque marcati come assegnati.
            pool = li.pop("_pool", None)
            if pool is None:
                pool = list(li.get("titoli") or [])
            cap = int(li.get("target_dimensione") or cap_main)
            if li["titoli"] != pool[:cap]:
                raise AssertionError(
                    f"{tipo}: titoli != pool[:cap] ({len(li['titoli'])} vs {len(pool[:cap])})"
                )
            sovrapposizioni, tolti = 0, 0
            scelti, occupati = [], set()
            for ch, sc in pool:
                if ch in occupati:
                    continue
                if ch in assegnati:
                    ammessa = (
                        famiglia == SOVRAPPOSIZIONE_FAMIGLIE[0]
                        and famiglia_riga(assegnati[ch]) == SOVRAPPOSIZIONE_FAMIGLIE[1]
                        and sovrapposizioni < consentite
                    )
                    if not ammessa:
                        tolti += 1
                        continue
                    sovrapposizioni += 1
                scelti.append((ch, sc))
                occupati.add(ch)
                if len(scelti) >= cap:
                    break
            li["titoli"] = scelti
            li["doppioni_tolti"] = int(tolti)
            li["target_dimensione"] = cap
            # Il campo resta «quanti candidati erano nel bacino prima del taglio» (era `len(div)`);
            # il numero di titoli tolti dal dedup sta in `doppioni_tolti`.
            li["totale_sopravvissuti"] = max(int(li.get("totale_sopravvissuti") or 0), len(pool))
            for ch, _sc in scelti:
                assegnati[ch] = tipo
            if len(scelti) < cap:
                li["corta"] = True
                vecchio = str(li.get("motivo") or "")
                pezzo = (f"{tolti} copie gia' in righe piu' specifiche, restano {len(scelti)}/{cap}"
                         if tolti else f"riga corta {len(scelti)}/{cap} titoli")
                # Un motivo sostanziale (es. «cache assente, solo il canone storico») NON si butta: si
                # aggiunge il conto del dedup. Un motivo che era solo un conteggio si riscrive.
                if vecchio and "riga corta" not in vecchio and "copie gia'" not in vecchio:
                    li["motivo"] = f"{vecchio}; {tipo}: {pezzo}"
                else:
                    li["motivo"] = f"{tipo}: {pezzo}"
            else:
                li["corta"] = False
                if li.get("motivo") and "riga corta" in str(li["motivo"]):
                    li.pop("motivo", None)
            if tolti:
                print(f"  [waterfall] {tipo}: {tolti} copie evitate, riga {len(scelti)}/{cap} "
                      f"dopo il dedup", file=sys.stderr)
        return liste

    def dichiara_corta(self, quanti, cap, nome, prefisso=None):
        """LA DICHIARAZIONE DI UNA RIGA CORTA, in un posto solo (Ticket 08).

        Quattro righe (nicchia, classici, ultime visioni, micro-cluster) avevano copiato lo stesso
        confronto e lo stesso log — e le copie avevano gia' cominciato a divergere (`motivo` c'era in due
        su quattro). `prefisso` decide se il motivo entra anche nel payload: la scelta e' della riga, il
        testo e il log no.
        """
        if quanti >= cap:
            return False, None
        print(f"  [{nome}] riga corta: {quanti}/{cap} titoli sopravvissuti "
              f"(il pavimento non si abbassa per riempire)", file=sys.stderr)
        motivo = f"{prefisso}: riga corta {quanti}/{cap} titoli" if prefisso else None
        return True, motivo

    def ranking(self, cand, r, base_bayes, exp_bayes):
        """IL RANKING COMBINATO: `score(x) = r[x] * (bayes(x)/base) ** exp`, in un posto solo."""
        return r[cand] * ((self.voto_bayesiano(cand) / base_bayes) ** exp_bayes)

    def ordina_per_ranking(self, cand, r, base_bayes, exp_bayes):
        """I candidati ordinati per ranking, come `[(chiave, punteggio)]` decrescente."""
        if len(cand) == 0:
            return []
        score = self.ranking(cand, r, base_bayes, exp_bayes)
        ordine = np.argsort(-score)
        return [(B.KEYS[x], float(sc)) for x, sc in zip(cand[ordine], score[ordine])]

    def cluster_di_semi(self, righe, w_semi, max_cluster=None):
        """I FILONI DEI SEMI (Ticket 08): raggruppa i semi e restituisce i gruppi che contano.

        PERCHE' ESISTE. `lista` fa UNA diffusione su tutti i semi: il filone con piu' peso decide `r`
        per tutti, e un interesse minoritario sparisce dentro il frullato. Qui i semi si guardano da
        soli — due semi sono collegati se stanno nella stessa bolla, in bolle ADIACENTI (`VICINI`), o
        se hanno un arco in `Tr` — e si prendono le **componenti connesse** (il ticket le ammette al
        posto di Leiden, e su <=300 nodi una partizione in piu' sarebbe solo latenza).

        Il costo e' O(n^2) con n <= 300 semi: una matrice booleana densa (90 kB), poi
        `scipy.sparse.csgraph.connected_components` — che e' gia' una dipendenza del repo
        (`steps/06_mappa.py`): le componenti non si riscrivono a mano. Restituisce, ordinati per peso
        decrescente (a pari peso: bolla dominante crescente), fino a `max_cluster` (default
        `MICRO_CLUSTER_MAX`) dict:
          `indici`  posizioni nei vettori della storia (righe/plays/tipi/pesi) del cluster
          `nodi`    i nodi (titoli) del cluster, senza doppioni
          `pesi`    il peso di ogni nodo, DOPO la somma dei doppioni: e' da qui che si scelgono i
                    titoli parlanti, altrimenti lo stesso titolo puo' uscire due volte
          `peso`    somma dei pesi dei suoi semi, col peso gia' calcolato da `pesi_semi`
          `bolla`   bolla che porta piu' peso nel cluster (di cosa parla la riga)
          `ancora`  bolla piu' bassa del cluster: l'identita' STABILE della riga (`cluster_id`)
        """
        if len(righe) == 0:
            return []
        max_cluster = int(P.MICRO_CLUSTER_MAX if max_cluster is None else max_cluster)
        righe = np.asarray(righe, np.int64)

        # I semi possono arrivare doppi (lo stesso titolo da due sorgenti): un nodo solo, pesi sommati.
        nodi, inversa = np.unique(righe, return_inverse=True)
        pesi_nodo = np.zeros(len(nodi), np.float64)
        np.add.at(pesi_nodo, inversa, np.asarray(w_semi, np.float64))
        peso_totale = float(pesi_nodo.sum())
        if len(nodi) == 0 or peso_totale <= 0.0:
            return []

        bolle = self.MEM[nodi]
        n = len(nodi)
        # Lo stesso filone = stessa bolla, oppure bolle vicine, oppure un arco diretto in Tr.
        vicino = (bolle[:, None] == bolle[None, :])
        for b in np.unique(bolle):
            if int(b) >= len(self.VICINI):
                continue
            nei = [int(x) for x in self.VICINI[int(b)] if x >= 0]
            if nei:
                vicino[np.ix_(bolle == b, np.isin(bolle, nei))] = True
        archi = (self.Tr[nodi][:, nodi] > 0).toarray()
        adiacenza = vicino | archi
        adiacenza |= adiacenza.T

        _, etichetta = cg.connected_components(sp.csr_matrix(adiacenza), directed=False)
        componenti = [np.nonzero(etichetta == k)[0] for k in range(int(etichetta.max()) + 1)]

        min_semi = int(P.MICRO_CLUSTER_MIN_SEMI)
        min_peso = float(P.MICRO_CLUSTER_MIN_PESO) * peso_totale

        tenuti = []
        for membri in componenti:
            peso = float(pesi_nodo[membri].sum())
            if len(membri) < min_semi and peso < min_peso:
                print(f"  [micro_cluster] filone scartato: {len(membri)} semi, "
                      f"{100.0 * peso / peso_totale:.1f}% del peso (minimo {min_semi} semi o "
                      f"{100.0 * float(P.MICRO_CLUSTER_MIN_PESO):.0f}%)", file=sys.stderr)
                continue
            bolla = int(np.bincount(bolle[membri], weights=pesi_nodo[membri]).argmax())
            tenuti.append({
                "nodi": nodi[membri],
                "pesi": pesi_nodo[membri],
                "indici": np.nonzero(np.isin(righe, nodi[membri]))[0],
                "peso": peso,
                "bolla": bolla,
                # L'ANCORA dell'identita': la bolla piu' bassa del filone. La bolla dominante cambia
                # quando i pesi si incrociano (una rivisione basta), e un id che cambia fa comparire e
                # sparire cataloghi; la piu' bassa cambia solo se il filone si allarga verso il basso.
                "ancora": int(bolle[membri].min()),
            })

        tenuti.sort(key=lambda c: (-c["peso"], c["bolla"]))
        if len(tenuti) > max_cluster:
            print(f"  [micro_cluster] {len(tenuti) - max_cluster} filoni oltre il tetto di {max_cluster}: "
                  f"restano i primi per peso", file=sys.stderr)
        return tenuti[:max_cluster]

    def ponte_fra(self, r_a, r_b, cand_a, cand_b, visti, soglia_voti, nome_riga):
        """I PUNTI D'INCONTRO (Ticket 09): `sqrt(r_a[x] * r_b[x])` fra due camminate.

        La MEDIA GEOMETRICA e' la scelta, non un dettaglio: se un titolo e' forte in un filone e assente
        nell'altro il prodotto e' ZERO, quindi sale solo chi riceve massa da entrambi. Con la media
        aritmetica vincerebbe chi e' forte in uno solo, e la riga sarebbe il doppione di un filone.

        Candidati: l'unione dei due bacini (non visti), pavimento `VAVE >= PUNTI_INCONTRO_VAVE_MIN` del
        ticket **piu'** il pavimento voti generale (non si abbassa niente), ordine per ponte decrescente,
        poi i cap anti-monopolio. Restituisce `(titoli, sopravvissuti)`.
        """
        cand = np.union1d(np.asarray(cand_a, np.int64), np.asarray(cand_b, np.int64))
        if len(cand) == 0:
            return [], 0
        # Il pavimento e' quello di sempre, con la soglia VAVE del ticket: `pavimento` esiste apposta.
        cand = self.pavimento(cand, soglia_voti, float(P.PUNTI_INCONTRO_VAVE_MIN))
        if len(cand) == 0:
            return [], 0
        ponte = np.sqrt(np.maximum(r_a[cand], 0.0) * np.maximum(r_b[cand], 0.0))
        # UN PONTE DI MASSA ZERO NON È UN PONTE: chi è assente in una delle due camminate resta fuori,
        # invece di riempire la riga con lo zero (e' la differenza con la media aritmetica, nero su bianco).
        tiene = ponte > 0.0
        cand = cand[tiene]
        ponte = ponte[tiene]
        if len(cand) == 0:
            return [], 0
        ordine = np.argsort(-ponte)
        cand = cand[ordine]
        ponte = ponte[ordine]
        fuori = [(B.KEYS[x], float(p)) for x, p in zip(cand, ponte)]
        div = self.applica_antimonopolio(fuori, visti=visti, cap_posizioni=P.DIVERSITA_SLOT_MAX,
                                         nome_riga=nome_riga)
        return div, len(div)

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
            """La lista piena (post anti-monopolio), NON tagliata a `quanti`: il taglio e' del chiamante.

            Il waterfall del Ticket 11 deve poter ripescare quando toglie i doppioni: se qui si tagliasse
            a `quanti`, una riga perderdebbe titoli senza avere con cosa rimpiazzarli.
            """
            quanti_fetch = max(quanti * 4, quanti + 60)
            fuori = [(B.KEYS[r_], float(r[r_])) for r_ in self.titoli_di(bs, r, visti, quanti_fetch, medium_filtro=medium)]
            if len(bs) > 1:
                fuori = sorted(fuori, key=lambda t: -t[1])
            return self.applica_antimonopolio(fuori, visti=visti, cap_posizioni=P.DIVERSITA_SLOT_MAX, nome_riga=nome_riga)

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
            cand_sopravvissuti = self.pavimento(cand_bacino, soglia_voti, soglia_vave)
        else:
            cand_sopravvissuti = np.array([], dtype=np.int64)

        # 3. Ranking combinato: score(x) = r[x] * (bayesian_vote(x) / 7.0) ** 1.5
        base_bayes = float(getattr(P, "RANKING_BAYES_BASE", 7.0))
        exp_bayes = float(getattr(P, "RANKING_BAYES_EXP", 1.5))
        titoli_uns = self.ordina_per_ranking(cand_sopravvissuti, r, base_bayes, exp_bayes)

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
            score_rip = self.ranking(ripescati_mondo, r, base_bayes, exp_bayes)
            titoli_rip = [(B.KEYS[x], float(sc)) for x, sc in zip(ripescati_mondo, score_rip)]
            cand_tuo_tutti = sorted(titoli_rip + titoli_uns, key=lambda t: -t[1])
        else:
            cand_tuo_tutti = titoli_uns

        titoli_tuo = self.applica_antimonopolio(cand_tuo_tutti, visti=visti,
                                                cap_posizioni=P.DIVERSITA_SLOT_MAX,
                                                nome_riga="il_tuo_mondo")
        liste.append({"tipo": "il_tuo_mondo", "mondo": primo, "titoli": titoli_tuo[:quanti_tuo],
                      "target_dimensione": quanti_tuo, "_pool": titoli_tuo})
        pool_passo = righe_titoli(vicini, quanti=cap_main, nome_riga="un_passo_fuori")
        liste.append({"tipo": "un_passo_fuori", "mondo": None, "titoli": pool_passo[:cap_main],
                      "target_dimensione": cap_main, "_pool": pool_passo})

        # =========================================================================
        # «NUOVE USCITE PER TE» (Ticket 10): la porta d'ingresso, e l'imbuto riparato
        # =========================================================================
        # Due fonti, mai mescolate (i punteggi non sarebbero confrontabili):
        #   · cache delle uscite collocate offline -> score = att_s[bolla] * confidenza * qualita';
        #   · senza cache (CI, o cache non ancora generata) -> canone storico, ma con i VICINI e con la
        #     riga che dichiara il proprio stato.
        # F4: il bacino e' quello appiattito del Ticket 03 (le bolle accese E i loro vicini), non i soli
        # vicini del primo mondo: con 3-4 mondi accesi i vicini degli altri restavano fuori.
        bacino_uscite = set(bacino_bolle_set) | set(bolle)
        cache_uscite = getattr(self, "USCITE", None)   # i Motore sintetici delle sonde non hanno la cache
        if cache_uscite is not None:
            cand_nuove, stato_uscite = U.candidati(cache_uscite, att_s, bacino_uscite, medium, visti)
        else:
            cand_nuove, stato_uscite = U.da_canone(self.ANNO, self.MEM, B.IS_TV, self.VOT, r,
                                                   bacino_uscite, medium, visti)
        div_nuove = self.applica_antimonopolio(cand_nuove, visti=visti,
                                              cap_posizioni=P.DIVERSITA_SLOT_MAX, nome_riga="uscite_nuove")
        riga_un = {
            "tipo": "uscite_nuove",
            "mondo": None,
            "titoli": div_nuove[:cap_main],
            "target_dimensione": cap_main,
            "totale_sopravvissuti": len(div_nuove),
            "_pool": div_nuove,
            "fonte": stato_uscite.get("fonte"),
            "candidati": int(stato_uscite.get("candidati", 0)),
            "nel_bacino": int(stato_uscite.get("nel_bacino", 0)),
            "scartati_pavimento": int(stato_uscite.get("scartati_pavimento", 0)),
            # L'attivazione della riga e' quella dei mondi da cui pesca: i `punteggio` delle uscite
            # collocate (att * confidenza * qualita') e quelli del canone (r[x]) non sono confrontabili
            # fra loro, quindi l'attivazione non si ricava dalla media dei punteggi.
            "attivazione": round(float(np.mean(att_s[sorted(bacino_uscite)])), 4) if bacino_uscite else 0.0,
        }
        riga_un["corta"], motivo_un = self.dichiara_corta(
            len(riga_un["titoli"]), cap_main, "uscite_nuove", prefisso="uscite_nuove"
        )
        if not riga_un["titoli"]:
            riga_un["motivo"] = stato_uscite["motivo"]
            print(f"  [uscite] dichiarata vuota: fonte={riga_un['fonte']} "
                  f"candidati={riga_un['candidati']} nel_bacino={riga_un['nel_bacino']} "
                  f"gia_visti={stato_uscite.get('gia_visti', 0)} "
                  f"senza_attivazione={stato_uscite.get('senza_attivazione', 0)}", file=sys.stderr)
        elif motivo_un:
            riga_un["motivo"] = motivo_un
        if riga_un["fonte"] == "canone":
            # Il prodotto deve saperlo anche quando la riga si riempie col canone storico.
            riga_un["motivo"] = stato_uscite["motivo"]
        print(f"  [uscite] fonte={riga_un['fonte']} candidati={riga_un['candidati']} "
              f"nel_bacino={riga_un['nel_bacino']} scartati_pavimento={riga_un['scartati_pavimento']} "
              f"riga={len(riga_un['titoli'])}", file=sys.stderr)
        liste.append(riga_un)

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
        riga_corta, _motivo = self.dichiara_corta(len(titoli_nic), target_nic, "nicchia")

        liste.append({
            "tipo": "nicchia_di_qualita",
            "mondo": None,
            "titoli": titoli_nic,
            "corta": riga_corta,
            "target_dimensione": target_nic,
            "totale_sopravvissuti": len(div_nic),
            "_pool": div_nic,
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
        riga_corta_cls, _motivo = self.dichiara_corta(len(titoli_cls), target_cls, "classici")

        liste.append({
            "tipo": "classici_imperdibili",
            "mondo": None,
            "titoli": titoli_cls,
            "corta": riga_corta_cls,
            "target_dimensione": target_cls,
            "totale_sopravvissuti": len(div_cls),
            "_pool": div_cls,
            "soglia_relativa": not is_fallback_v_mondo_cls,
            "fallback_v_mondo": is_fallback_v_mondo_cls
        })

        # =========================================================================
        # «SUL FILO DELLE TUE ULTIME VISIONI» (Ticket 07): la recenza come SELEZIONE
        # =========================================================================
        # La misura (parametri.NIENTE_RECENZA / NIENTE_BOOST) dice che la recenza non e' un peso:
        # i soli ultimi 15 titoli fanno lift 47,5x, contro i 18,2x della diffusione completa su tutti
        # i semi (ed e' quel 18,2x che NIENTE_RANGO cita come riferimento), mentre il boost sui
        # punteggi e' vuoto (17,85 -> 17,9-18,1).
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
            surv_rec = self.pavimento(cand_rec, soglia_voti, soglia_vave)
            cand_uv = self.ordina_per_ranking(surv_rec, r_rec, base_bayes, exp_bayes)

            div_uv = self.applica_antimonopolio(cand_uv, visti=visti, cap_posizioni=P.DIVERSITA_SLOT_MAX, nome_riga="ultime_visioni")
            riga_uv["titoli"] = div_uv[:cap_main]
            riga_uv["totale_sopravvissuti"] = len(div_uv)
            riga_uv["_pool"] = div_uv
            riga_uv["corta"], motivo_uv = self.dichiara_corta(
                len(riga_uv["titoli"]), cap_main, "ultime_visioni", prefisso="ultime_visioni"
            )
            if motivo_uv:
                riga_uv["motivo"] = motivo_uv

        liste.append(riga_uv)

        # =========================================================================
        # «MICRO-CLUSTER DEI FILONI» (Ticket 08): una camminata per filone
        # =========================================================================
        # La diffusione unica lascia che il filone piu' pesante decida `r` per tutti. Qui i semi si
        # raggruppano (cluster_di_semi) e ogni filone che conta cammina da solo: la sua massa somma a
        # 1.0 dentro il filone, e la riga parla con i suoi due semi piu' pesanti.
        # Il peso dei semi e' gia' calcolato in w_semi (stessa formula della diffusione principale).
        peso_semi_totale = float(np.sum(w_semi)) if len(w_semi) else 0.0
        cluster = self.cluster_di_semi(righe, w_semi)
        filoni = []
        motivi = []
        if not cluster:
            # Il canale dichiarato (`motivi`) esiste apposta: zero righe e' un fatto, non un silenzio.
            motivi.append(
                "micro_cluster: nessun filone sopra le soglie "
                f"({P.MICRO_CLUSTER_MIN_SEMI} semi o {100.0 * float(P.MICRO_CLUSTER_MIN_PESO):.0f}% del peso)"
            )
            print(f"  [micro_cluster] {motivi[-1]}: nessuna riga", file=sys.stderr)
        for i, cl in enumerate(cluster, start=1):
            idx = cl["indici"]
            pesi_cl = None if pesi is None else [pesi[j] for j in idx]
            att_cl, r_cl = self.diffondi(
                righe[idx], plays[idx],
                tipi=[tipi[j] for j in idx], pesi=pesi_cl,
            )
            _, _, cand_cl = self.bacino_appiattito(
                att_cl, list(np.argsort(-att_cl)), non_visti_mondo,
                max_bolle=int(P.MICRO_CLUSTER_BOLLE_MAX),
            )
            surv_cl = self.pavimento(cand_cl, soglia_voti, soglia_vave)
            cand_titoli = self.ordina_per_ranking(surv_cl, r_cl, base_bayes, exp_bayes)
            div_cl = self.applica_antimonopolio(cand_titoli, visti=visti,
                                                cap_posizioni=P.DIVERSITA_SLOT_MAX,
                                                nome_riga=f"micro_cluster_{i}")
            titoli_cluster = div_cl[:cap_main]

            # Il titolo parlante: i semi piu' pesanti del filone (l'helper deduplica: «X e X» non esce).
            titoli_seme = self.titoli_seme(cl["nodi"], cl["pesi"])

            riga_cl = {
                "tipo": f"micro_cluster_{i}",
                "mondo": int(cl["bolla"]),
                "cluster_id": f"b{int(cl['ancora'])}",
                "titoli_seme": titoli_seme,
                "semi_chiavi": [B.KEYS[int(x)] for x in cl["nodi"]],
                # Quota sul peso TOTALE dei semi: somma a 1 solo se nessun filone resta fuori dal tetto.
                "quota_peso": round(float(cl["peso"]) / peso_semi_totale, 4) if peso_semi_totale > 0 else 0.0,
                "titoli": titoli_cluster,
                "target_dimensione": cap_main,
                "totale_sopravvissuti": len(div_cl),
                "_pool": div_cl,
            }
            riga_cl["corta"], motivo_cl = self.dichiara_corta(
                len(titoli_cluster), cap_main, "micro_cluster", prefisso=f"micro_cluster_{i}"
            )
            if motivo_cl:
                riga_cl["motivo"] = motivo_cl
            # Le camminate dei filoni servono anche ai ponti (Ticket 09): si tengono accanto alla riga,
            # senza ricopiarne i campi (era una seconda fonte di verita').
            filoni.append({
                "riga": riga_cl,
                "r": r_cl,
                "cand": cand_cl,
                # L'attivazione del filone (picco di mondo): serve ai ponti per portare un numero
                # confrontabile con le altre righe, invece della media dei punteggi geometrici (~1e-5).
                "attivazione": float(np.max(att_cl)) if len(att_cl) else 0.0,
            })
            liste.append(riga_cl)

        # =========================================================================
        # «PUNTI D'INCONTRO» (Ticket 09): il ponte fra due filoni
        # =========================================================================
        # ponte(x) = sqrt(r_a[x] * r_b[x]): sale solo chi riceve massa da ENTRAMBI i filoni. Le camminate
        # sono quelle appena fatte per i micro-cluster: **zero** PageRank in piu' nel caso normale.
        nomi_ponti = 0
        for i in range(len(filoni)):
            for j in range(i + 1, len(filoni)):
                nomi_ponti += 1
                a, b = filoni[i]["riga"], filoni[j]["riga"]
                nome_pon = f"punti_incontro_{nomi_ponti}"
                div_pon, tot_pon = self.ponte_fra(filoni[i]["r"], filoni[j]["r"],
                                                  filoni[i]["cand"], filoni[j]["cand"],
                                                  visti, soglia_voti, nome_pon)
                semi_a = a.get("titoli_seme") or []
                semi_b = b.get("titoli_seme") or []
                riga_pon = {
                    "tipo": nome_pon,
                    "mondo": None,
                    "coppia_id": f"{a['cluster_id']}_{b['cluster_id']}",
                    "fallback": False,
                    "titoli_seme": [t for t in (semi_a[0] if semi_a else None,
                                                semi_b[0] if semi_b else None) if t],
                    "semi_chiavi": list(a["semi_chiavi"]) + list(b["semi_chiavi"]),
                    "titoli": div_pon[:cap_main],
                    "target_dimensione": cap_main,
                    "totale_sopravvissuti": tot_pon,
                    "_pool": div_pon,
                    "attivazione": round((filoni[i]["attivazione"] + filoni[j]["attivazione"]) / 2.0, 4),
                }
                riga_pon["corta"], motivo_pon = self.dichiara_corta(
                    len(riga_pon["titoli"]), cap_main, "punti_incontro", prefisso=nome_pon
                )
                if motivo_pon:
                    riga_pon["motivo"] = motivo_pon
                liste.append(riga_pon)

        if nomi_ponti == 0:
            # FALLBACK (Ticket 09): un filone solo -> i due mondi piu' lontani CHE HANNO SEMI. Se i semi
            # stanno tutti in un mondo, un ponte non esiste: la riga lo dichiara, non lo inventa.
            mondi_con_semi = [int(b) for b in np.unique(self.MEM[righe])]
            riga_fb = {
                "tipo": "punti_incontro_1",
                "mondo": None,
                "coppia_id": None,
                "fallback": True,
                "titoli_seme": [],
                "semi_chiavi": [],
                "titoli": [],
                "target_dimensione": cap_main,
                "totale_sopravvissuti": 0,
                "corta": True,
            }
            coppia = []
            if len(mondi_con_semi) >= 2:
                # La coppia piu' LONTANA fra i mondi che hanno semi (due sono le sponde di un ponte).
                coppia = list(max(
                    ((a, b) for i, a in enumerate(sorted(mondi_con_semi)) for b in sorted(mondi_con_semi)[i + 1:]),
                    key=lambda ab: (self.distanza_fra_mondi(*ab), -ab[0], -ab[1]),
                ))
            if len(coppia) >= 2:
                print(f"  [punti_incontro] nessuna coppia di filoni ({len(filoni)}): fallback sui due mondi "
                      f"piu' lontani ({coppia[0]}, {coppia[1]})", file=sys.stderr)
                sponde = []
                for bb in (int(coppia[0]), int(coppia[1])):
                    idx_b = np.nonzero(self.MEM[righe] == bb)[0]
                    pesi_b = None if pesi is None else [pesi[j] for j in idx_b]
                    _att_b, r_b = self.diffondi(
                        righe[idx_b], plays[idx_b],
                        tipi=[tipi[j] for j in idx_b], pesi=pesi_b,
                    )
                    titoli_b = self.titoli_seme(righe[idx_b], w_semi[idx_b], quanti=1)
                    sponde.append({
                        "mondo": bb,
                        "r": r_b,
                        "cand": non_visti_mondo(bb),
                        "att": _att_b,
                        "titolo": titoli_b[0] if titoli_b else None,
                        "semi": [B.KEYS[int(righe[j])] for j in idx_b],
                    })
                div_fb, tot_fb = self.ponte_fra(sponde[0]["r"], sponde[1]["r"],
                                                sponde[0]["cand"], sponde[1]["cand"],
                                                visti, soglia_voti, "punti_incontro_1")
                riga_fb.update({
                    "coppia_id": f"b{sponde[0]['mondo']}_b{sponde[1]['mondo']}",
                    "titoli_seme": [t for t in (sponde[0]["titolo"], sponde[1]["titolo"]) if t],
                    "semi_chiavi": sponde[0]["semi"] + sponde[1]["semi"],
                    "titoli": div_fb[:cap_main],
                    "totale_sopravvissuti": tot_fb,
                    "_pool": div_fb,
                    "attivazione": round((float(np.max(sponde[0]["att"])) + float(np.max(sponde[1]["att"]))) / 2.0, 4),
                })
                riga_fb["corta"], motivo_fb = self.dichiara_corta(
                    len(riga_fb["titoli"]), cap_main, "punti_incontro", prefisso="punti_incontro_1"
                )
                if motivo_fb:
                    riga_fb["motivo"] = motivo_fb
            else:
                riga_fb["motivo"] = ("punti_incontro: i semi stanno in un mondo solo, "
                                     "nessun ponte fra due sponde")
                # Il motivo sta gia' nella riga, e `servizio` lo porta nei `motivi` della risposta: qui
                # basta il log, altrimenti il motivo comparirebbe due volte nel payload.
                print(f"  [punti_incontro] {riga_fb['motivo']}", file=sys.stderr)
            liste.append(riga_fb)

        for b in bolle[1:]:
            pool_mondo = righe_titoli([b], quanti=cap_main, nome_riga=f"mondo_{b}")
            liste.append({"tipo": f"mondo_{b}", "mondo": int(b), "titoli": pool_mondo[:cap_main],
                          "target_dimensione": cap_main, "_pool": pool_mondo})

        # TICKET 11: IL WATERFALL. Ogni titolo in una riga sola, in ordine di specificita'.
        liste = self.waterfall_righe(liste, cap_main)

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
                "motivi": motivi,
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
            motivo = f" — {li['motivo']}" if li.get("motivo") else ""
            print(f"    {li['tipo']:<20} —  (vuota){motivo}")
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
