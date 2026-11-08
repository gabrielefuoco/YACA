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
  - calcola i pesi dei semi riusando canonicamente `camminata.pesi_semi(righe, plays, nep, tipi)`:
    rispetta il cap di ri-visioni per i film (min(plays, PESO_FILM_MAX=3)) e la proporzione degli
    episodi visti per le serie (1 + 2 x min(plays/nep, 1.0)), moltiplicati per il tipo di segnale;
  - espone `Engine.nep` (conteggio episodi per titolo) e accetta `frazione` (0..1) oltre a `plays`;
  - espone l'helper read-only `Engine.profilo_freddo(n_semi)` basato sulla soglia dichiarata
    `parametri.FREDDO_SOTTO` (3);
  - applica la regola del repository "dichiarare, non ingoiare": errori espliciti su pesi/frazioni invalidi,
    RuntimeError se il grafo non è caricato, e tracciamento in `ultimo_scarto` dei titoli fuori canone;
  - filtra per medium ("movie", "series", None) ed esclusi PRIMA di applicare il cap richiesto;
  - garantisce determinismo assoluto, zero I/O di rete, nessun download e nessuna scrittura su disco.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import scipy.sparse as sp

from graph import assi as _assi
from graph import camminata as _cam
from graph import canon as K
from graph import kids as _kids
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

    FREDDO_SOTTO: int = P.FREDDO_SOTTO
    """Soglia dichiarata di prodotto (pari a 3) sotto cui un profilo utente è considerato 'freddo'."""

    def __init__(self) -> None:
        self.Tr: sp.csr_matrix | None = None
        self._TrT: sp.csr_matrix | None = None
        self.prov: dict | None = None
        self.n: int = 0
        self.percorso: str | None = None
        self.artefatto: str | None = None
        self.pota: int | None = None
        self.keys: list[str] = []
        self.row_of: dict[str, int] = {}
        self.is_tv: np.ndarray = np.zeros(0, dtype=bool)
        self.nep: np.ndarray = np.ones(0, dtype=np.float64)
        self.tmdb_ids: np.ndarray = np.zeros(0, dtype=np.int64)
        self.mediums: np.ndarray = np.empty(0, dtype=object)
        self.tono: np.ndarray | None = None
        self.complessita: np.ndarray | None = None
        self.kids_ok: np.ndarray | None = None
        self.kids_errore: str | None = None
        self.tmdb_to_indices: dict[int, list[int]] = {}
        self.ultimo_scarto: dict[str, int] = {
            "semi_fuori_canone": 0,
            "esclusi_fuori_canone": 0,
        }

    @staticmethod
    def profilo_freddo(n_semi: int) -> bool:
        """Determina se un profilo utente è 'freddo' in base al numero di semi forniti.

        PERCHÉ ESISTE.
        Usa la soglia dichiarata di prodotto `parametri.FREDDO_SOTTO` (pari a 3).
        Sotto 3 titoli, il profilo è considerato 'freddo' e richiede strategie di arricchimento
        da catalogo (ticket cold-start).
        """
        return int(n_semi) < P.FREDDO_SOTTO

    @property
    def TrT(self) -> sp.csr_matrix | None:
        """Matrice trasposta CSR del grafo di transizione, cachata per batched PPR."""
        if self._TrT is None and self.Tr is not None:
            self._TrT = self.Tr.T.tocsr()
        return self._TrT

    def _init_canone(self, n: int) -> None:
        """Inizializza le strutture del canone titoli, mappature TMDB e nep per N nodi."""
        canon_keys, canon_row_of, canon_n, canon_is_tv = K.titoli()

        if n == canon_n:
            self.keys = list(canon_keys)
            self.row_of = dict(canon_row_of)
            self.is_tv = np.asarray(canon_is_tv, dtype=bool)
            meta = K.metadati()
            self.nep = np.asarray(meta["NEP"], dtype=np.float64)
            self.anime = np.asarray(meta["ANIME"], dtype=bool) if ("ANIME" in meta and meta["ANIME"] is not None) else np.zeros(n, dtype=bool)
            try:
                self.tono, self.complessita = _assi.carica_assi()
                self.assi_errore = None
            except Exception as exc:
                self.tono = np.zeros(n, dtype=np.float32)
                self.complessita = np.zeros(n, dtype=np.float32)
                self.assi_errore = str(exc)
            kok, kerr = _kids.carica_kids_ok(n)
            self.kids_ok = kok
            self.kids_errore = kerr
        else:
            # Consente fixture o sottomatrici di test con dimensione diversa
            self.keys = [f"item:{i}" for i in range(n)]
            self.row_of = {k: i for i, k in enumerate(self.keys)}
            self.is_tv = np.zeros(n, dtype=bool)
            self.nep = np.ones(n, dtype=np.float64)
            self.anime = np.zeros(n, dtype=bool)
            self.tono = np.zeros(n, dtype=np.float32)
            self.complessita = np.zeros(n, dtype=np.float32)
            self.kids_ok = np.ones(n, dtype=bool)
            self.kids_errore = None

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
                        "Artefatto transizione mancante: transizione-pota16.npz. "
                        "Rigenerare con: PYTHONPATH=services python -m graph.runtime.prepara --pota 16"
                    )
            path = candidato

        path = Path(path)
        if not path.is_file():
            raise FileNotFoundError(
                "Artefatto transizione mancante: transizione-pota16.npz. "
                "Rigenerare con: PYTHONPATH=services python -m graph.runtime.prepara --pota 16"
            )

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

    def _parse_seme(self, item: Any) -> dict | None:
        """Estrae i parametri di un seme validandone i campi.

        Supporta:
        - tuple o liste: `(key, peso, tipo)`, `(key, peso)`, `(key,)`, o con plays/frazione;
        - stringhe pure: `"movie:603"`;
        - dizionari con chiavi: `key`, `tmdbId`, `medium`, `peso`, `tipo`, `plays`, `frazione`, `nep`.

        DICHIARARE, NON INGOIARE:
        - `peso`: se specificato, ha precedenza assoluta sulla formula di pesatura. Se non valido
          (stringa non numerica, negativo o NaN), solleva `ValueError`.
        - `plays`: se non valido, solleva `ValueError` (default: 1.0).
        - `frazione`: float in [0.0, 1.0]; se non valida solleva `ValueError`.
        - `nep`: conteggio episodi esplicito; se sconosciuto o <= 1, per le serie si calcola
          `plays = PESO_SERIE_BASE + PESO_SERIE_FASCIA * frazione` impostando nep=1.0, garantendo
          che il tetto del ramo film in camminata.pesi_semi (min(plays, 3)) sia una no-op e preservi
          esattamente la formula dichiarata [1, 3] senza numeri arbitrari.

        Returns:
            Dizionario con parametri del seme validato o None se fuori dal canone.
        """
        key = None
        peso = None
        tipo = None
        signals = None
        plays = None
        frazione = None
        nep = None
        watched = None
        library_only = None

        if isinstance(item, dict):
            key = item.get("key")
            peso = item.get("peso")
            tipo = item.get("tipo")
            signals = item.get("signals")
            plays = item.get("plays")
            frazione = item.get("frazione")
            nep = item.get("nep")
            watched = item.get("watched")
            library_only = item.get("library_only")
            if library_only is True:
                watched = False
                if not tipo and not signals:
                    tipo = "library"
            elif watched is False:
                if not tipo and not signals:
                    tipo = "library"
            elif tipo == "library":
                if watched is None:
                    watched = False
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
                key, peso = item[0], item[1]
            elif len(item) == 3:
                key, peso, tipo = item[0], item[1], item[2]
            elif len(item) == 4:
                key, peso, tipo, plays = item[0], item[1], item[2], item[3]
            elif len(item) >= 5:
                key, peso, tipo, plays, frazione = item[0], item[1], item[2], item[3], item[4]
            if tipo == "library":
                watched = False
        elif isinstance(item, str):
            key = item

        # Validazione esplicita del peso (se fornito come override numerico)
        explicit_peso = None
        if peso is not None:
            try:
                explicit_peso = float(peso)
            except (ValueError, TypeError) as exc:
                raise ValueError(
                    f"peso non valido: {peso!r} (deve essere un numero float/int >= 0)"
                ) from exc
            if np.isnan(explicit_peso) or explicit_peso < 0.0:
                raise ValueError(
                    f"peso non valido: {peso!r} (deve essere un numero finito >= 0)"
                )

        # Validazione plays
        pl = None
        if plays is not None:
            try:
                pl = float(plays)
            except (ValueError, TypeError) as exc:
                raise ValueError(
                    f"plays non valido: {plays!r} (deve essere un numero float/int >= 0)"
                ) from exc
            if np.isnan(pl) or pl < 0.0:
                raise ValueError(
                    f"plays non valido: {plays!r} (deve essere un numero finito >= 0)"
                )

        # Validazione frazione (0..1)
        fr = None
        if frazione is not None:
            try:
                fr = float(frazione)
            except (ValueError, TypeError) as exc:
                raise ValueError(
                    f"frazione non valida: {frazione!r} (deve essere compresa tra 0.0 e 1.0)"
                ) from exc
            if np.isnan(fr) or fr < 0.0 or fr > 1.0:
                raise ValueError(
                    f"frazione non valida: {frazione!r} (deve essere compresa tra 0.0 e 1.0)"
                )

        # Validazione nep esplicito
        np_val = None
        if nep is not None:
            try:
                np_val = float(nep)
            except (ValueError, TypeError) as exc:
                raise ValueError(
                    f"nep non valido: {nep!r} (deve essere un numero float/int >= 0)"
                ) from exc
            if np.isnan(np_val) or np_val < 0.0:
                raise ValueError(
                    f"nep non valido: {nep!r} (deve essere un numero finito >= 0)"
                )

        if not key or key not in self.row_of:
            return None

        row_idx = self.row_of[key]
        is_series = bool(self.is_tv[row_idx]) if len(self.is_tv) > row_idx else key.startswith("tv:")

        # Determinazione nep effettivo
        if np_val is not None:
            nep_effettivo = np_val
        elif len(self.nep) > row_idx:
            nep_effettivo = float(self.nep[row_idx])
        else:
            nep_effettivo = 1.0

        # Quando nep è sconosciuto o 0, si ripiega sulla regola del film (min(plays, 3))
        # impostando nep_effettivo = 1.0 per attivare il ramo film in camminata.pesi_semi
        if nep_effettivo <= 0.0:
            nep_effettivo = 1.0

        # Determinazione plays effettivo
        if is_series:
            if fr is not None:
                if nep_effettivo > 1.0:
                    plays_effettivo = fr * nep_effettivo
                else:
                    # Quando nep <= 1.0 (episodi sconosciuti o singoli), pesi_semi applica il ramo film
                    # min(plays, PESO_FILM_MAX=3). Applicando la formula canonica delle serie:
                    # plays = PESO_SERIE_BASE + PESO_SERIE_FASCIA * fr (compreso in [1, 3]),
                    # min(plays, 3) risulta una no-op e il peso finale è esattamente quello dichiarato.
                    plays_effettivo = float(P.PESO_SERIE_BASE + P.PESO_SERIE_FASCIA * fr)
            elif pl is not None:
                plays_effettivo = pl
            else:
                plays_effettivo = 1.0
        else:
            # Per i film nep_effettivo resta 1.0 e plays conta le ri-visioni
            nep_effettivo = 1.0
            plays_effettivo = pl if pl is not None else 1.0

        return {
            "row": row_idx,
            "explicit_peso": explicit_peso,
            "tipo": tipo,
            "signals": signals,
            "plays": plays_effettivo,
            "nep": nep_effettivo,
            "watched": watched,
            "library_only": library_only,
        }

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

    def _prepara_semi_vettore(self, semi: list | tuple) -> tuple[list[int], list[float], int]:
        """Converte una specifica semi in vettori di righe e pesi, applicando le regole di segnale e libreria.

        Returns:
            Tupla (final_rows, final_pesi, semi_fuori_canone).
        """
        parsed_seeds: list[dict] = []
        semi_fuori_canone = 0

        for s in semi:
            parsed = self._parse_seme(s)
            if parsed is not None:
                parsed_seeds.append(parsed)
            else:
                semi_fuori_canone += 1

        if not parsed_seeds:
            return [], [], semi_fuori_canone

        # Raggruppamento per titolo (riga di canone):
        grouped_by_row: dict[int, list[dict]] = defaultdict(list)
        for s in parsed_seeds:
            grouped_by_row[s["row"]].append(s)

        final_rows = []
        final_pesi = []

        for r_idx, items in grouped_by_row.items():
            # 1. Override numerico esplicito
            exp_override = next((it["explicit_peso"] for it in items if it["explicit_peso"] is not None), None)
            if exp_override is not None:
                final_rows.append(r_idx)
                final_pesi.append(float(exp_override))
                continue

            # 2. Aggregazione segnali e verifica cronologia vs libreria
            all_signals: set[str] = set()
            history_plays = []
            history_neps = []
            has_history = False
            is_never_watched = False

            for it in items:
                t_val = it.get("tipo")
                sigs = it.get("signals")
                w_flag = it.get("watched")
                lib_only = it.get("library_only")

                if lib_only is True or w_flag is False:
                    is_never_watched = True

                if sigs:
                    if isinstance(sigs, (list, tuple, set)):
                        for s_ in sigs:
                            all_signals.add(str(s_.get("type", s_.get("tipo")) if isinstance(s_, dict) else s_).lower())
                    else:
                        all_signals.add(str(sigs).lower())
                if t_val:
                    all_signals.add(str(t_val).lower())

                if t_val == "watched" or "watched" in all_signals or w_flag is True:
                    has_history = True
                    history_plays.append(it["plays"])
                    history_neps.append(it["nep"])
                elif it["plays"] is not None and it["plays"] > 1.0 and not is_never_watched:
                    has_history = True
                    history_plays.append(it["plays"])
                    history_neps.append(it["nep"])

            other_signals = all_signals - {"library"}
            if has_history or other_signals:
                eff_signals = list(other_signals) if other_signals else ["watched"]
                eff_plays = max(history_plays) if history_plays else (items[0]["plays"] if items else 1.0)
                eff_nep = history_neps[0] if history_neps else (items[0]["nep"] if items else 1.0)
                base_calc = _cam.pesi_semi(np.array([0]), np.array([eff_plays]), np.array([eff_nep]))[0]
                w_calc = _cam.calcola_peso_segnale(
                    base_val=base_calc,
                    t=eff_signals,
                )
            else:
                w_calc = 1.0

            final_rows.append(r_idx)
            final_pesi.append(min(5.0, float(w_calc)))

        return final_rows, final_pesi, semi_fuori_canone

    def raccomanda(
        self,
        semi: list | tuple,
        cap: int = DEFAULT_CAP,
        medium: str | None = None,
        esclusi: Iterable[Any] = (),
        tono: float = 0.0,
        complessita: float = 0.0,
        anime: bool | str | None = None,
        kids: bool = False,
    ) -> list[dict]:
        """Esegue Personalized PageRank e restituisce i top raccomandati ordinati per punteggio.

        DICHIARARE, NON INGOIARE:
        - Se invocato senza grafo caricato (Tr is None), solleva RuntimeError.
        - Se peso/plays/frazione nei semi è invalido, solleva ValueError.
        - I pesi dei semi sono calcolati tramite `camminata.pesi_semi(righe, plays, nep, tipi)`,
          tenendo conto delle ri-visioni dei film (tetto a 3) e della frazione di serie vista.
          Un eventuale `peso` numerico esplicito sovrascrive la formula.
        - Se i semi o gli esclusi sono fuori dal canone, vengono saltati ma il loro conteggio
          è registrato in `self.ultimo_scarto` per trasparenza del chiamante.

        Args:
            semi: Lista di tuple o dizionari con specifica semi (key, peso, tipo, plays, frazione, nep).
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

        try:
            tono_val = float(tono) if tono is not None else 0.0
            if np.isnan(tono_val) or tono_val < -1.0 or tono_val > 1.0:
                raise ValueError(f"tono non valido: {tono!r} (deve essere compreso tra -1.0 e 1.0)")
        except (TypeError, ValueError) as exc:
            raise ValueError(f"tono non valido: {tono!r} (deve essere compreso tra -1.0 e 1.0)") from exc

        try:
            comp_val = float(complessita) if complessita is not None else 0.0
            if np.isnan(comp_val) or comp_val < -1.0 or comp_val > 1.0:
                raise ValueError(f"complessita non valida: {complessita!r} (deve essere compresa tra -1.0 e 1.0)")
        except (TypeError, ValueError) as exc:
            raise ValueError(f"complessita non valida: {complessita!r} (deve essere compresa tra -1.0 e 1.0)") from exc

        final_rows, final_pesi, semi_fuori_canone = self._prepara_semi_vettore(semi)
        escl_indici, esclusi_fuori_canone = self._parse_esclusi(esclusi)

        self.ultimo_scarto = {
            "semi_fuori_canone": semi_fuori_canone,
            "esclusi_fuori_canone": esclusi_fuori_canone,
        }

        if cap <= 0 or not final_rows:
            return []

        # Camminata PPR riga-stocastica con early stopping
        r = _cam.ppr(
            self.Tr,
            seme=final_rows,
            pesi=final_pesi,
            alpha=P.ALPHA,
            iters=P.ITER,
            normalizza=True,
            tol=getattr(P, "PPR_TOL", 1e-5),
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

        # Applicazione filtro anime prima del cap (Ticket 11)
        if (anime is True or anime == "only") and getattr(self, "anime", None) is not None:
            cand[~self.anime] = -np.inf
        elif anime == "exclude" and getattr(self, "anime", None) is not None:
            cand[self.anime] = -np.inf

        # Applicazione filtro kids prima del cap (Ticket 11)
        if kids:
            if getattr(self, "kids_ok", None) is None:
                raise RuntimeError(
                    getattr(self, "kids_errore", None)
                    or "Filtro kids non disponibile: artefatto blacklist mancante."
                )
            cand[~self.kids_ok] = -np.inf

        valid_idx = np.flatnonzero(cand > -np.inf)
        if len(valid_idx) == 0:
            return []

        # Applicazione filtro di retrieval su tono e complessità (Ticket Tono/Complessità)
        if (abs(tono_val) >= 1e-6 or abs(comp_val) >= 1e-6) and self.tono is not None and self.complessita is not None:
            penalita = _assi.calcola_penalita(
                valid_idx,
                tono_req=tono_val,
                comp_req=comp_val,
                tono_arr=self.tono,
                comp_arr=self.complessita,
            )
            cand[valid_idx] = cand[valid_idx] * penalita

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
                "punteggio": float(cand[idx]),
            })

        return risultati

    def raccomanda_multi(
        self,
        semi_list: Sequence[Any],
        cap: int = DEFAULT_CAP,
        medium: str | Sequence[str | None] | None = None,
        esclusi: Iterable[Any] = (),
        tono: float | Sequence[float] = 0.0,
        complessita: float | Sequence[float] = 0.0,
        anime: bool | str | Sequence[bool | str | None] | None = None,
        kids: bool | Sequence[bool] = False,
    ) -> list[list[dict]]:
        """Esegue una camminata Personalized PageRank batched per B liste di semi.

        Requisiti garantiti:
        - Risultati identici alla chiamata singola (`max |score_batch - score_single| <= 1e-10`).
        - Normalizzazione per colonna indipendente e somma duplicati con `np.add.at`.
        - Mascheramento per medium e penalità assi applicati per colonna.

        Args:
            semi_list: Sequenza di B liste di semi (ciascuna compatibile con `raccomanda`).
            cap: Numero massimo di risultati (intero broadcast o lista di interi).
            medium: Filtro medium broadcast ("movie", "series", None) o sequenza per colonna.
            esclusi: Insieme comune di chiavi/tmdbId esclusi da tutte le colonne.
            tono: Valore tono broadcast (-1..1) o sequenza per colonna.
            complessita: Valore complessità broadcast (-1..1) o sequenza per colonna.

        Returns:
            Lista di B liste di raccomandazioni ordinate per punteggio decrescente.
        """
        if self.Tr is None:
            raise RuntimeError(
                "Nessun grafo caricato nell'Engine: invocare prima 'Engine.carica()' "
                "o 'Engine.carica_transizione()'."
            )

        if not semi_list:
            return []

        B = len(semi_list)

        # 1. Risoluzione medium per colonna
        if isinstance(medium, (list, tuple)):
            if len(medium) != B:
                raise ValueError(f"Lunghezza lista medium ({len(medium)}) != numero query ({B})")
            med_list = [("series" if m == "tv" else m) for m in medium]
        else:
            m_single = "series" if medium == "tv" else medium
            med_list = [m_single] * B

        for m in med_list:
            if m not in ("movie", "series", None):
                raise ValueError(f"medium non valido: {m!r} (ammessi 'movie', 'series', None)")

        # 2. Risoluzione cap per colonna
        if isinstance(cap, (list, tuple)):
            if len(cap) != B:
                raise ValueError(f"Lunghezza lista cap ({len(cap)}) != numero query ({B})")
            cap_list = [int(c) for c in cap]
        else:
            cap_list = [int(cap)] * B

        # 3. Risoluzione tono per colonna
        if isinstance(tono, (list, tuple, np.ndarray)):
            if len(tono) != B:
                raise ValueError(f"Lunghezza lista tono ({len(tono)}) != numero query ({B})")
            tono_list = [float(t) for t in tono]
        else:
            tono_list = [float(tono)] * B

        for t in tono_list:
            if np.isnan(t) or t < -1.0 or t > 1.0:
                raise ValueError(f"tono non valido: {t!r} (deve essere compreso tra -1.0 e 1.0)")

        # 4. Risoluzione complessità per colonna
        if isinstance(complessita, (list, tuple, np.ndarray)):
            if len(complessita) != B:
                raise ValueError(f"Lunghezza lista complessita ({len(complessita)}) != numero query ({B})")
            comp_list = [float(c) for c in complessita]
        else:
            comp_list = [float(complessita)] * B

        for c in comp_list:
            if np.isnan(c) or c < -1.0 or c > 1.0:
                raise ValueError(f"complessita non valida: {c!r} (deve essere compresa tra -1.0 e 1.0)")

        # 4b. Risoluzione anime per colonna
        if isinstance(anime, (list, tuple, np.ndarray)):
            if len(anime) != B:
                raise ValueError(f"Lunghezza lista anime ({len(anime)}) != numero query ({B})")
            anime_list = [a for a in anime]
        else:
            anime_list = [anime] * B

        # 4c. Risoluzione kids per colonna
        if isinstance(kids, (list, tuple, np.ndarray)):
            if len(kids) != B:
                raise ValueError(f"Lunghezza lista kids ({len(kids)}) != numero query ({B})")
            kids_list = [bool(k) for k in kids]
        else:
            kids_list = [bool(kids)] * B

        if any(kids_list) and getattr(self, "kids_ok", None) is None:
            raise RuntimeError(
                getattr(self, "kids_errore", None)
                or "Filtro kids non disponibile: artefatto blacklist mancante."
            )

        # 5. Esclusioni comuni
        escl_indici, _ = self._parse_esclusi(esclusi)

        # 6. Preparazione matrice restart E (n, U) con deduplicazione configurazioni semi identiche
        n = self.n
        seed_signatures: dict[tuple[tuple[int, ...], tuple[float, ...]], int] = {}
        query_to_unique: list[int] = []
        unique_rows_pesi: list[tuple[list[int], list[float]]] = []
        empty_cols: set[int] = set()

        for j in range(B):
            seeds_j = semi_list[j]
            if not seeds_j or cap_list[j] <= 0:
                empty_cols.add(j)
                query_to_unique.append(-1)
                continue

            f_rows, f_pesi, _ = self._prepara_semi_vettore(seeds_j)
            if not f_rows:
                empty_cols.add(j)
                query_to_unique.append(-1)
                continue

            sig = (tuple(f_rows), tuple(f_pesi))
            if sig in seed_signatures:
                u_idx = seed_signatures[sig]
            else:
                u_idx = len(unique_rows_pesi)
                seed_signatures[sig] = u_idx
                unique_rows_pesi.append((f_rows, f_pesi))
            query_to_unique.append(u_idx)

        U = len(unique_rows_pesi)
        if U == 0:
            return [[] for _ in range(B)]

        dtype = self.Tr.dtype
        E = np.zeros((n, U), dtype=dtype)
        for u in range(U):
            f_rows, f_pesi = unique_rows_pesi[u]
            np.add.at(E[:, u], f_rows, f_pesi)
            c_sum = float(E[:, u].sum())
            if c_sum >= 1e-12:
                E[:, u] /= c_sum

        # 7. PageRank personalizzato batched con early stopping e kernel trasposto
        R = _cam.ppr_multi(
            self.Tr,
            E,
            alpha=P.ALPHA,
            iters=P.ITER,
            normalizza=True,
            tol=getattr(P, "PPR_TOL", 1e-5),
            TrT=self.TrT,
        )

        # 8. Slicing e selezione candidati per ciascuna query
        risultati_batch: list[list[dict]] = []
        for j in range(B):
            u_idx = query_to_unique[j]
            if u_idx < 0:
                risultati_batch.append([])
                continue

            cand = R[:, u_idx].copy()
            med_j = med_list[j]
            if med_j == "movie":
                cand[self.is_tv] = -np.inf
            elif med_j == "series":
                cand[~self.is_tv] = -np.inf

            if escl_indici:
                cand[list(escl_indici)] = -np.inf

            a_j = anime_list[j]
            if (a_j is True or a_j == "only") and getattr(self, "anime", None) is not None:
                cand[~self.anime] = -np.inf
            elif a_j == "exclude" and getattr(self, "anime", None) is not None:
                cand[self.anime] = -np.inf

            if kids_list[j] and getattr(self, "kids_ok", None) is not None:
                cand[~self.kids_ok] = -np.inf

            valid_idx = np.flatnonzero(cand > -np.inf)
            if len(valid_idx) == 0:
                risultati_batch.append([])
                continue

            t_val = tono_list[j]
            c_val = comp_list[j]
            if (abs(t_val) >= 1e-6 or abs(c_val) >= 1e-6) and self.tono is not None and self.complessita is not None:
                penalita = _assi.calcola_penalita(
                    valid_idx,
                    tono_req=t_val,
                    comp_req=c_val,
                    tono_arr=self.tono,
                    comp_arr=self.complessita,
                )
                cand[valid_idx] = cand[valid_idx] * penalita

            k = min(cap_list[j], len(valid_idx))
            if k < len(valid_idx):
                rel_top = np.argpartition(-cand[valid_idx], k - 1)[:k]
                top_idx = valid_idx[rel_top]
            else:
                top_idx = valid_idx

            top_idx = top_idx[np.argsort(-cand[top_idx], kind="stable")]

            out = [
                {
                    "key": self.keys[idx],
                    "tmdbId": int(self.tmdb_ids[idx]),
                    "medium": self.mediums[idx],
                    "punteggio": float(cand[idx]),
                }
                for idx in top_idx
            ]
            risultati_batch.append(out)

        return risultati_batch
