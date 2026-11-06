"""engine.py — Runtime sparso per il grafo congelato V45.

PERCHÉ ESISTE.
Il motore storico di YACA (`motore.py` / `servizio.py`) è nato per servire raccomandazioni basate
sulle 3.497 partizioni in bolle (V10), con complessi waterfall per riga hero, micro-cluster e
ripescaggi.
Con la congelazione di V45 a 76.497 nodi (50.660.592 archi in `bolle-eterogeneo-V45-p1.0-triangolo.npz`),
questo modulo realizza il runtime puro per la camminata sparsa (Personalized PageRank):
  - carica l'artefatto V45 con provenance canonica;
  - simmetrizza preliminarmente `(W + W.T)` come fa `camminata.transizione_pronta()`, garantendo che
    sia la configurazione non potata (`pota=None`) sia quella potata (`pota=k`) abbiano supporto
    simmetrico e differiscano unicamente per la potatura (risolvendo il bug delle camminate a fondo cieco);
  - supporta la potatura top-k per riga (riducendo da ~50,6M a ~1,9M archi con pota=16);
  - supporta il caricamento diretto di transizioni già potate (`carica_transizione`) per evitare il burst
    di memoria di 50,6M archi all'avvio e rientrare stabilmente nel limite di 512 MiB del container;
  - calcola la transizione riga-stocastica e diffonde il PPR riusando le funzioni canoniche di
    `camminata.py` senza duplicazione di logica numerica;
  - applica la regola del repository "dichiarare, non ingoiare": errori espliciti su pesi invalidi,
    RuntimeError se il grafo non è caricato, e tracciamento in `ultimo_scarto` dei titoli fuori canone;
  - filtra per medium ("movie", "series", None) ed esclusi PRIMA di applicare il cap richiesto;
  - garantisce determinismo assoluto, zero I/O di rete, nessun download e nessuna scrittura su disco.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable

import numpy as np
import scipy.sparse as sp

from graph import camminata as _cam
from graph import canon as K
from graph import parametri as P
from graph import provenance as _PV

DEFAULT_CAP: int = 60
"""Cap di default per il numero massimo di raccomandazioni restituite da `raccomanda`.

PERCHÉ È UNA COSTANTE DI MODULO.
Non appartiene a `parametri.py` perché quella tabella è riservata ai parametri numerici
misurati/congelati di prodotto (es. ALPHA, ITER, POTA_PER_RIGA) e modificarla richiederebbe
una decisione di prodotto formale. Trattandosi di un valore di default dichiarativo per l'API
di runtime, è definito qui come costante di modulo visibile ed esplicita.
"""


class Engine:
    """Motore di raccomandazione sparso basato su camminata PageRank personalizzata."""

    def __init__(self) -> None:
        self.Tr: sp.csr_matrix | None = None
        self.prov: dict | None = None
        self.n: int = 0
        self.percorso: str | None = None
        self.artefatto: str | None = None
        self.pota: int | None = None
        self.keys: list[str] = []
        self.row_of: dict[str, int] = {}
        self.is_tv: np.ndarray = np.zeros(0, dtype=bool)
        self.tmdb_ids: np.ndarray = np.zeros(0, dtype=np.int64)
        self.mediums: np.ndarray = np.empty(0, dtype=object)
        self.tmdb_to_indices: dict[int, list[int]] = {}
        self.ultimo_scarto: dict[str, int] = {
            "semi_fuori_canone": 0,
            "esclusi_fuori_canone": 0,
        }

    def _init_canone(self, n: int) -> None:
        """Inizializza le strutture del canone titoli e mappature TMDB per N nodi."""
        canon_keys, canon_row_of, canon_n, canon_is_tv = K.titoli()

        if n == canon_n:
            self.keys = list(canon_keys)
            self.row_of = dict(canon_row_of)
            self.is_tv = np.asarray(canon_is_tv, dtype=bool)
        else:
            # Consente fixture o sottomatrici di test con dimensione diversa
            self.keys = [f"item:{i}" for i in range(n)]
            self.row_of = {k: i for i, k in enumerate(self.keys)}
            self.is_tv = np.zeros(n, dtype=bool)

        self.tmdb_ids = np.zeros(n, dtype=np.int64)
        self.mediums = np.empty(n, dtype=object)
        for i, k in enumerate(self.keys):
            parti = k.split(":", 1)
            self.tmdb_ids[i] = int(parti[1]) if len(parti) > 1 and parti[1].isdigit() else i
            self.mediums[i] = "series" if self.is_tv[i] else "movie"

        self.tmdb_to_indices = {}
        for idx, tid in enumerate(self.tmdb_ids):
            self.tmdb_to_indices.setdefault(int(tid), []).append(idx)

    @classmethod
    def carica(
        cls,
        path: str | Path | None = None,
        pota: int | None = None,
    ) -> Engine:
        """Carica l'artefatto V45 con simmetrizzazione e potatura opzionale per riga.

        Args:
            path: Percorso al file `.npz` di V45. Se None, carica il default congelato:
                  `services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz`.
            pota: Numero di archi massimi da tenere per riga (es. 16, 32, 64).
                  Se None, conserva tutti gli archi del grafo senza potatura.

        Returns:
            Istanza di `Engine` configurata e pronta all'uso.
        """
        if path is None:
            path = (
                Path(__file__).resolve().parents[1]
                / "data"
                / "v45"
                / "bolle-eterogeneo-V45-p1.0-triangolo.npz"
            )
        path = Path(path)
        if not path.is_file():
            raise FileNotFoundError(f"Artefatto non trovato: {path}")

        M, prov = _PV.leggi(path)
        n = M.shape[0]

        # SIMMETRIZZAZIONE PREVENTIVA: il triangolo V45 su disco è asimmetrico.
        # Come fa canonicamente `camminata.transizione_pronta()` con `(W + W.T)`, simmetrizziamo
        # in ENTRAMBI i percorsi (sia pota=None che pota=k) in modo che le due configurazioni
        # differiscano unicamente per la potatura e non per la topologia del grafo sottostante.
        M = (M + M.T).tocsr()

        if pota is not None:
            # Riuso della potatura canonica: top-k archi per riga e simmetrizzazione
            M = _cam.pota(M, k=int(pota))

        Tr = _cam.transizione(M)
        del M  # Rilascia immediatamente la matrice per contenere il picco di memoria

        inst = cls()
        inst.Tr = Tr
        inst.prov = prov
        inst.n = n
        inst.percorso = str(path)
        inst.artefatto = _PV.chiave_cache(path, pota=pota)
        inst.pota = pota
        inst._init_canone(n)

        return inst

    @classmethod
    def carica_transizione(
        cls,
        path: str | Path | None = None,
        pota: int | None = None,
    ) -> Engine:
        """Carica una matrice di transizione o adiacenza già potata e precalcolata.

        PERCHÉ ESISTE.
        In un ambiente vincolato a 512 MiB (es. container Docker di produzione), caricare
        l'artefatto grezzo V45 da 50,6 milioni di archi produce un picco transitorio di RSS
        (~627 MiB) anche se poi la matrice viene potata a 1,9M archi.
        Questo metodo carica direttamente l'artefatto pre-potato (scritto da `prepara.py`
        o da `camminata.transizione_pronta`), eliminando il picco di avvio e consentendo
        all'Engine di avviarsi stabilmente in meno di 100 MiB di memoria totale.

        Args:
            path: Percorso al file `.npz` pre-potato. Se None, cerca nel percorso predefinito
                  `services/graph/data/v45-transizione/`.
            pota: Valore di potatura atteso o dichiarato. Se None, viene dedotto dai parametri
                  della provenienza inclusa nel file `.npz`.

        Returns:
            Istanza di `Engine` configurata e pronta all'uso.
        """
        if path is None:
            cartella = Path(__file__).resolve().parents[1] / "data" / "v45-transizione"
            if pota is not None:
                candidato = cartella / f"transizione-pota{pota}.npz"
            else:
                candidato = cartella / "transizione-pota16.npz"
            if not candidato.is_file():
                files = sorted(cartella.glob("*.npz")) if cartella.is_dir() else []
                if files:
                    candidato = files[0]
                else:
                    raise FileNotFoundError(
                        f"Nessun artefatto di transizione precalcolato trovato in {cartella}. "
                        "Eseguire prima 'py -m graph.runtime.prepara --pota 16 --out services/graph/data/v45-transizione/'."
                    )
            path = candidato

        path = Path(path)
        if not path.is_file():
            raise FileNotFoundError(f"Artefatto di transizione non trovato: {path}")

        M, prov = _PV.leggi(path)
        n = M.shape[0]

        if pota is None and prov and "params" in prov:
            pota = prov["params"].get("pota")

        # Verifica se la matrice è già riga-stocastica: se le righe con grado > 0 sommano già
        # a ~1.0, non serve alcuna ri-normalizzazione.
        deg = np.asarray(M.sum(1)).ravel()
        vive = deg > 0
        if vive.any() and np.allclose(deg[vive], 1.0, atol=1e-4):
            Tr = M.tocsr()
        else:
            Tr = _cam.transizione(M)
        del M

        inst = cls()
        inst.Tr = Tr
        inst.prov = prov
        inst.n = n
        inst.percorso = str(path)
        inst.artefatto = _PV.chiave_cache(path, pota=pota)
        inst.pota = pota
        inst._init_canone(n)

        return inst

    def _parse_seme(self, item: Any) -> tuple[int, float] | None:
        """Estrae l'indice di riga e il peso numerico da una specifica di seme.

        Accetta tuple/liste `(key, peso, tipo)`, `(key, peso)`, `(key,)`, stringhe pure,
        o dizionari con chiavi `tmdbId`, `medium`, `tipo`, `peso` (o `key`).

        DICHIARARE, NON INGOIARE:
        Se `peso` è specificato (non None) ma non è un numero valido o è negativo/NaN,
        solleva esplicitamente `ValueError` invece di ripiegare silenziosamente su 1.0.
        Se `key` o il titolo TMDB non appartiene al canone, restituisce None per consentire
        il conteggio in `Engine.ultimo_scarto`.
        """
        key = None
        peso = None
        tipo = None

        if isinstance(item, dict):
            key = item.get("key")
            peso = item.get("peso")
            tipo = item.get("tipo")
            if not key:
                tmdb_id = item.get("tmdbId") if "tmdbId" in item else (item.get("tmdb_id") or item.get("tmdb"))
                medium = item.get("medium")
                if tmdb_id is not None:
                    try:
                        tid_int = int(tmdb_id)
                    except (ValueError, TypeError) as exc:
                        raise ValueError(f"tmdbId non valido: {tmdb_id!r}") from exc
                    pref = "tv" if medium in ("tv", "series", "show") else "movie"
                    key = f"{pref}:{tid_int}"
        elif isinstance(item, (tuple, list)):
            if len(item) == 1:
                key = item[0]
            elif len(item) == 2:
                key, peso = item
            elif len(item) >= 3:
                key, peso, tipo = item[0], item[1], item[2]
        elif isinstance(item, str):
            key = item

        # Validazione esplicita del peso: nessun fallback silenzioso
        if peso is not None:
            try:
                w = float(peso)
            except (ValueError, TypeError) as exc:
                raise ValueError(
                    f"peso non valido: {peso!r} (deve essere un numero float/int >= 0)"
                ) from exc
            if np.isnan(w) or w < 0.0:
                raise ValueError(
                    f"peso non valido: {peso!r} (deve essere un numero finito >= 0)"
                )
        elif tipo is not None and str(tipo) in P.PESO_TIPO:
            w = float(P.PESO_TIPO[str(tipo)])
        else:
            w = 1.0

        if not key or key not in self.row_of:
            return None

        return self.row_of[key], w

    def _parse_esclusi(self, esclusi: Iterable[Any]) -> tuple[set[int], int]:
        """Converte elementi esclusi in indici di riga, contando quelli fuori canone.

        Returns:
            Tupla `(indici_trovati, conteggio_fuori_canone)`.
        """
        indici: set[int] = set()
        fuori_canone: int = 0

        for item in esclusi:
            trovato = False
            if isinstance(item, str):
                if item in self.row_of:
                    indici.add(self.row_of[item])
                    trovato = True
                elif item.isdigit():
                    tid = int(item)
                    righe = self.tmdb_to_indices.get(tid, ())
                    if righe:
                        indici.update(righe)
                        trovato = True
            elif isinstance(item, (int, np.integer)):
                righe = self.tmdb_to_indices.get(int(item), ())
                if righe:
                    indici.update(righe)
                    trovato = True
            elif isinstance(item, dict):
                k = item.get("key")
                if not k and "tmdbId" in item and "medium" in item:
                    pref = "tv" if item["medium"] in ("tv", "series", "show") else "movie"
                    k = f"{pref}:{item['tmdbId']}"
                if k and k in self.row_of:
                    indici.add(self.row_of[k])
                    trovato = True
                elif "tmdbId" in item:
                    try:
                        tid = int(item["tmdbId"])
                        righe = self.tmdb_to_indices.get(tid, ())
                        if righe:
                            indici.update(righe)
                            trovato = True
                    except (ValueError, TypeError):
                        pass
            elif isinstance(item, (tuple, list)) and len(item) == 2:
                m, tid = item
                pref = "tv" if m in ("tv", "series", "show") else "movie"
                k = f"{pref}:{tid}"
                if k in self.row_of:
                    indici.add(self.row_of[k])
                    trovato = True

            if not trovato:
                fuori_canone += 1

        return indici, fuori_canone

    def raccomanda(
        self,
        semi: list | tuple,
        cap: int = DEFAULT_CAP,
        medium: str | None = None,
        esclusi: Iterable[Any] = (),
    ) -> list[dict]:
        """Esegue Personalized PageRank e restituisce i top raccomandati ordinati per punteggio.

        DICHIARARE, NON INGOIARE:
        - Se invocato senza grafo caricato (Tr is None), solleva RuntimeError.
        - Se peso nei semi è invalido, solleva ValueError.
        - Se i semi o gli esclusi sono fuori dal canone, vengono saltati ma il loro conteggio
          è registrato in `self.ultimo_scarto` per trasparenza del chiamante.

        Args:
            semi: Lista di tuple `(key, peso, tipo)` o dizionari con tmdbId, medium, tipo, peso.
            cap: Numero massimo di risultati da restituire (default `DEFAULT_CAP` = 60).
            medium: Filtro medium in ("movie", "series", None). "tv" è ammesso come sinonimo di "series".
            esclusi: Collezione di chiavi, tmdbId o dizionari da escludere prima del cap.

        Returns:
            Lista di dizionari `[{key, tmdbId, medium, punteggio}]` ordinati per punteggio decrescente.
        """
        if self.Tr is None:
            raise RuntimeError(
                "Nessun grafo caricato nell'Engine: invocare prima 'Engine.carica()' "
                "o 'Engine.carica_transizione()'."
            )

        if medium is not None:
            if medium not in ("movie", "series", "tv"):
                raise ValueError(
                    f"medium non valido: {medium!r} (ammessi 'movie', 'series', None)"
                )

        seme_idx: list[int] = []
        seme_pesi: list[float] = []
        semi_fuori_canone = 0

        for s in semi:
            parsed = self._parse_seme(s)
            if parsed is not None:
                idx, w = parsed
                seme_idx.append(idx)
                seme_pesi.append(w)
            else:
                semi_fuori_canone += 1

        escl_indici, esclusi_fuori_canone = self._parse_esclusi(esclusi)

        self.ultimo_scarto = {
            "semi_fuori_canone": semi_fuori_canone,
            "esclusi_fuori_canone": esclusi_fuori_canone,
        }

        if cap <= 0 or not seme_idx:
            return []

        # Camminata PPR riga-stocastica: riuso di camminata.ppr senza duplicare la logica numerica
        r = _cam.ppr(
            self.Tr,
            seme=seme_idx,
            pesi=seme_pesi,
            alpha=P.ALPHA,
            iters=P.ITER,
            normalizza=True,
        )

        cand = r.copy()

        # Applicazione filtro medium prima del cap
        if medium == "movie":
            cand[self.is_tv] = -np.inf
        elif medium in ("series", "tv"):
            cand[~self.is_tv] = -np.inf

        # Applicazione esclusione prima del cap
        if escl_indici:
            cand[list(escl_indici)] = -np.inf

        valid_idx = np.flatnonzero(cand > -np.inf)
        if len(valid_idx) == 0:
            return []

        k = min(cap, len(valid_idx))
        if k < len(valid_idx):
            # argpartition individua i migliori k in tempo O(N)
            rel_top = np.argpartition(-cand[valid_idx], k - 1)[:k]
            top_idx = valid_idx[rel_top]
        else:
            top_idx = valid_idx

        # Ordina stabilmente per punteggio decrescente garantendo determinismo
        top_idx = top_idx[np.argsort(-cand[top_idx], kind="stable")]

        risultati: list[dict] = []
        for idx in top_idx:
            risultati.append({
                "key": self.keys[idx],
                "tmdbId": int(self.tmdb_ids[idx]),
                "medium": self.mediums[idx],
                "punteggio": float(r[idx]),
            })

        return risultati
