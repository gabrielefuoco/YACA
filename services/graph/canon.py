"""canone.py — L'UNICA IMPLEMENTAZIONE DEL GRAFO E DEI BANCHI.

Perche' esiste: i report 58-60 hanno rivelato che in giro c'erano DUE varianti del grafo —
`ottimizza-1.py`/`verifica-finale.py` normalizzavano ogni componente prima di mescolarla e
usavano il grado binario, gli script `rrf-*.py` mescolavano i pesi grezzi. Differenza sulla
camminata del metro curato: 11,18% contro 9,88%, cioe' piu' dell'errore del banco.

Qui c'e' una sola versione, quella CANONICA (quella che ha prodotto i numeri di testa:
prodotto 29,61/63,35/87,86 · curato 26,45/50,00/70,26), e tutte le misure passano di qui.

Scelte canoniche, dichiarate:
  * `correggi_hub` usa il grado BINARIO (quanti vicini, non quanto pesano) e NORMALIZZA la riga;
  * il mixing avviene fra componenti GIA' normalizzate (senza, un componente a peso 5 domina
    anche dove e' piu' rado);
  * la normalizzazione finale e' una sola, sulla somma.
"""
import functools
import glob, hashlib, json, pathlib
import numpy as np
import pandas as pd
import scipy.sparse as sp

# La radice si ricava dal FILE, non dalla cartella corrente: prima `pathlib.Path(".")`
# significava che il modulo funzionava solo se lanciato dalla radice del repo.
ROOT = pathlib.Path(__file__).resolve().parents[2]
# GLI INPUT: i dati SCARICATI (TMDB, MovieLens, Trakt). Restano in `.cache`, sono una cache: si
# possono riscaricare e non sono il prodotto del nostro lavoro.
ML = ROOT / ".cache" / "movielens"
# I DATI DEL MODULO: le partizioni, i centroidi, gli embedding, i componenti. Vivono in `services/graph/data/`
# perche' sono il risultato del nostro lavoro: se stanno in una cache, la pulizia della cache li
# cancella, e la manutenzione non sa piu' cosa e' prodotto e cosa e' scaricato.
DATA = pathlib.Path(__file__).resolve().parent / "data"
GOLD = ROOT / ".scratch" / "ml-collaborativo" / "gold"
TK = ROOT / ".cache" / "trakt" / "users"


# ---------------------------------------------------------------- i titoli
def A(nome):
    """Un artefatto del modulo: si cerca in `graph/data/`, e SE NON C'E' E' UN ERRORE.

    Fino al 15/10/2026 qui c'era `return p if p.exists() else ML / nome`: un ripiego silenzioso in
    `.cache/movielens/`. Il guasto che produceva non era la lettura del file sbagliato, era **non
    sapere quale file si stava leggendo** — e quindi non sapere piu' se un artefatto era il prodotto
    del nostro lavoro o un residuo di dieci giorni prima che nessuno avrebbe mai rigenerato.

    Il senior (§3.1) ha chiesto di chiudere il ripiego con un `FileNotFoundError` esplicito. E'
    giusto: la regola e' che `graph/data/` e' il prodotto del modulo e `.cache/` e' l'input grezzo
    riscaricabile, e una regola con un'eccezione silenziosa non e' una regola.

    Se questo errore scatta, la domanda giusta non e' «dove lo trovo» ma «chi lo produce»: se lo
    produce un file di `upstream/`, va scritto in `graph/data/`; se non lo produce nessuno, e'
    un artefatto orfano e va dichiarato, non ripescato.
    """
    p = DATA / nome
    if not p.exists():
        raise FileNotFoundError(
            f"artefatto mancante: {p}\n"
            f"  `graph/data/` e' il prodotto del modulo, `.cache/` sono gli input scaricati e non "
            f"c'e' piu' un ripiego fra i due.\n"
            f"  Chi produce {nome}? Se e' un file di `graph/upstream/`, deve scrivere in "
            f"`graph/data/`; se non lo produce nessuno, va dichiarato nel README.")
    return p


def esiste(nome):
    """Se un artefatto c'e', SENZA sollevare. Il compagno di `A()`, e serve piu' di quanto sembri.

    Il 16/10/2026 sei posti facevano `A(nome).exists()`: quando `A()` e' stato reso severo (solleva se
    l'artefatto manca — giusto, era la Trappola 3b), quei sei `if` sono diventati **bombe**: il ramo di
    ripiego che dovevano proteggere non si e' mai piu' eseguito, e lo script moriva sul PRIMO nome che
    non esisteva invece di provare il secondo. `steps/03_divisione_voti.py` cercava il triangolo in tre
    nomi (`-r200`, `-r200`, `-p1.0`): il file giusto c'era, e lo step non partiva lo stesso.
    Il sintomo era chiaro, la causa no: la colpa era di un `if` che sembrava prudente.
    """
    return (DATA / nome).exists()


@functools.lru_cache(maxsize=1)
def titoli():
    """LE 66.259 CHIAVI DEL CANONE, nell'ordine delle righe. Costosa: si legge una volta sola.

    `lru_cache` perche' tutti la chiedono per le stesse quattro cose (`KEYS`, `ROW_OF`, `N`, `IS_TV`) e
    prima era un'esecuzione a tempo di IMPORT di `bubbles.py`: chi importava il modulo — anche solo per
    una costante — pagava la lettura di `spazi-trakt.npz` e 66.259 stringhe.
    """
    z = np.load(A("spazi-trakt.npz"), allow_pickle=True)
    tmdb, tipo = z["tmdb"], z["tipo"]
    keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
    row_of = {k: r for r, k in enumerate(keys)}
    is_tv = (tipo == "tv")
    return keys, row_of, len(keys), is_tv


def storia_trakt(utente, ordine="cronologico"):
    """LA STORIA DI UN UTENTE TRAKT IN CACHE — una funzione sola, per tutti.

    Prima ognuno la leggeva per conto suo — dieci copie, e **non tutte uguali**: `motore.da_trakt` non
    leggeva `last_watched_at` e ciclava film-poi-serie, quindi chi tagliava la storia a meta' credendo
    di separare passato e futuro stava separando **medium** (film come semi, serie come oro). E' la
    classe di bug che questa funzione chiude alla radice: l'ordine si chiede, non si ricostruisce.

    Ritorna quattro liste ALLINEATE (e nella stessa posizione):
      · `chiavi` — `"movie:603"`, `"tv:1396"`
      · `righe`  — l'indice di riga nel canone (`-1` mai: i titoli fuori canone sono scartati)
      · `plays`  — quante volte (per le serie Trakt conta la serie, non le puntate)
      · `eta`    — giorni da quando e' stata vista: **grande = vecchio**, `3650` se la data manca

    `ordine`: "cronologico" = il piu' VECCHIO per primo (il passato semina, il futuro e' l'oro) — e' il
    default, ed e' quello che serve a uno split temporale; "recente" = il piu' nuovo per primo (gli
    «ultimi 15» del prodotto); `None` = l'ordine del file, come sta su Trakt.
    """
    _, row_of, _, _ = titoli()
    chiavi, righe, plays, eta = [], [], [], []
    adesso = pd.Timestamp.now(tz="UTC")            # una volta sola, non dentro il ciclo per riga
    for tipo in ("movie", "show"):
        p = TK / f"{tipo}-{utente}.json"
        if not p.exists():
            continue
        try:
            j = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        for voce in (j["list"] if isinstance(j, dict) else j):
            ids = (voce.get(tipo) or {}).get("ids") or {}
            tmdb = ids.get("tmdb")
            if tmdb is None:
                continue
            ch = f"{'tv' if tipo == 'show' else 'movie'}:{int(tmdb)}"
            r = row_of.get(ch)
            if r is None:
                continue
            try:
                g = (adesso - pd.Timestamp(voce.get("last_watched_at"))).days
            except Exception:
                g = 3650                            # data assente o illeggibile: la piu' vecchia
            chiavi.append(ch)
            righe.append(int(r))
            plays.append(int(voce.get("plays") or 1))
            eta.append(max(int(g), 0))
    o = np.arange(len(chiavi))
    if ordine == "cronologico":
        o = np.argsort(-np.array(eta, dtype=np.int64), kind="stable")
    elif ordine == "recente":
        o = np.argsort(np.array(eta, dtype=np.int64), kind="stable")
    return ([chiavi[i] for i in o], np.array(righe, dtype=np.int64)[o],
            np.array(plays, dtype=np.int64)[o], np.array(eta, dtype=np.int64)[o])


# ---------------------------------------------------------------- gli archi
def normalizza(A):
    A = A.tocsr().astype(np.float32)
    d = np.asarray(A.sum(1)).ravel()
    return sp.diags(1.0 / np.maximum(d, 1e-9)).dot(A).tocsr()


def correggi_hub(A, beta):
    """CANONICA: grado binario (quanti vicini) e normalizzazione della riga."""
    if beta <= 0:
        return A
    ind = np.asarray((A > 0).sum(0)).ravel().astype(np.float64)
    return normalizza(sp.csr_matrix(A.multiply((1.0 / np.maximum(ind, 1.0) ** beta)[None, :])))


def topk_edges(V, k, min_sim=0.05, B=2048):
    Vn = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-9)
    r, c, v = [], [], []
    for i in range(0, Vn.shape[0], B):
        sim = Vn[i:i + B] @ Vn.T
        for j in range(sim.shape[0]):
            s = sim[j]
            s[i + j] = -2
            idx = np.argpartition(-s, k)[:k]
            m = s[idx] > min_sim
            r.extend([i + j] * int(m.sum()))
            c.extend(idx[m].tolist())
            v.extend(s[idx][m].tolist())
    M = sp.csr_matrix((v, (r, c)), shape=(Vn.shape[0], Vn.shape[0]), dtype=np.float32)
    return ((M + M.T) * 0.5).tocsr()


def carica_csr(nome, n):
    """Carica un `.npz` (o un `.npy`) come CSR. Il percorso lo risolve `A()`: gli artefatti del modulo
    stanno in `graph/data/`, gli input scaricati in `.cache/`. Un solo punto di verita'."""
    q = np.load(A(nome))
    return sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


class Componenti:
    """i k-NN degli spazi, cachati per k. Gli spazi vettoriali restano disponibili per i teacher."""

    def __init__(self, n):
        self.n = n
        self.CF_v = np.load(A("cf-spazio.npz"))["Cf"]
        self.CFst_v = np.load(A("cf-studente.npz"))["P"]
        self.Kc_v = np.load(A("spazio-pulito.npz"))["P"]
        self._cache = {}
        self._fissi = None

    def _fissi_(self):
        if self._fissi is None:
            n = self.n
            self._fissi = {"B": carica_csr("boot-B.npz", n),
                           "T": carica_csr("boot-T.npz", n),
                           "K": carica_csr("boot-Kpari.npz", n)}
        return self._fissi

    def __call__(self, k):
        if k not in self._cache:
            C = {nome: topk_edges(V, k) for nome, V in
                 (("CF", self.CF_v), ("CFst", self.CFst_v), ("Kc", self.Kc_v))}
            C.update(self._fissi_())
            self._cache[k] = C
        return self._cache[k]

    def vettori_normalizzati(self):
        out = {}
        for nome, V in (("CF", self.CF_v), ("CFst", self.CFst_v), ("Kc", self.Kc_v)):
            out[nome] = V / (np.linalg.norm(V, axis=1, keepdims=True) + 1e-9)
        return out


def costruisci(C, pesi, wc, beta):
    """CANONICA: ogni componente corretta e normalizzata, poi mescolata, poi una normalizzazione."""
    tot = sum(pesi.values())
    M = None
    for nome, w in pesi.items():
        A = correggi_hub(C[nome], beta)
        pezzo = A * ((1 - wc) * w / tot)
        M = pezzo if M is None else M + pezzo
    return normalizza((M + wc * C["K"]).tocsr())


def rwr(M, E, alpha, iters=20):
    X = E.copy()
    for _ in range(iters):
        X = alpha * (M.T @ X) + (1 - alpha) * E
    return X


# ---------------------------------------------------------------- i contratti RELAZIONALI
# §4 del senior. I contratti di non-degenerazione (sopra) guardano UN array e verificano che non sia
# piatto o vuoto. I due incidenti di questa sessione — il 63,7% del LOO incompleto e il 58,27% di
# tasso base sbagliato — erano errori RELAZIONALI: l'array di output aveva una distribuzione
# bellissima e non degenere, ma violava un'identita' rispetto agli input.

def assert_loo_esatto(X, membri_di, i, b, punteggio_veloce, tolleranza=1e-5, pesi=None, nome=""):
    """CONTRATTO DI INVARIANZA — il brute-force spot check contro il data leakage nel LOO.

    Quando si scrive un leave-one-out vettorizzato su matrici sparse e' facilissimo dimenticare di
    sottrarre il contributo di `i` da una normalizzazione, da un idf o da un denominatore. E' successo
    tre volte in questa sessione, e due volte il numero era **gonfiato e bellissimo**:
      · 63,7% invece di 35,3%, per un LOO incompleto sul centroide;
      · 55,8% invece di 33,2%, perche' l'auto-similarita' di una serie col proprio esemplare (1,0)
        entrava nei top-5 della sua bolla.

    Qui si cancella davvero: si ricalcola il centroide della bolla di `i` SENZA `i`, si normalizza, e
    si confronta col punteggio che il metodo veloce ha prodotto. Costa millisecondi e rende
    impossibile per costruzione qualsiasi LOO parziale.

    `X` matrice densa (titoli x feature) · `membri_di` lista degli indici per bolla ·
    `punteggio_veloce` quello che il metodo rapido ha assegnato a (i, b).
    """
    m_ = np.array([x for x in membri_di[b] if x != i], dtype=int)
    assert len(m_) > 0, f"bolla {b} vuota senza {i}: non c'e' niente da verificare"
    if pesi is None:
        mu = X[m_].mean(axis=0)
    else:
        w = np.asarray(pesi[m_], float)
        mu = (X[m_] * w[:, None]).sum(axis=0) / max(w.sum(), 1e-9)
    mu = mu / (np.linalg.norm(mu) + 1e-9)
    puro = float(np.asarray(X[i] @ mu).ravel()[0])
    assert abs(float(punteggio_veloce) - puro) <= tolleranza, (
        f"LEAKAGE LOO{f' in {nome}' if nome else ''} sulla riga {i}, bolla {b}: "
        f"veloce={float(punteggio_veloce):.5f} vs puro={puro:.5f} "
        f"(differenza {abs(float(punteggio_veloce)-puro):.5f}, tolleranza {tolleranza}). "
        f"Il metodo veloce sta contando qualcosa che dovrebbe aver tolto."
    )
    return puro


def assert_universo(vero, candidati, etichetta="", stampa=True):
    """CONTRATTO DI COPERTURA — il tetto va dichiarato insieme al risultato.

    L'equivoco delle 94 serie nacque qui: `vero` conteneva bolle che `candidati` non conteneva, e
    nessuno stampava il tetto. Un 35,3% su un tetto dell'84,3% e' un'altra cosa da un 35,3% su un
    tetto del 100%.
    """
    vero = np.asarray(vero)
    dentro = np.isin(vero, np.asarray(candidati))
    tetto = float(dentro.mean()) if len(vero) else 0.0
    if stampa:
        print(f"  TETTO{' ' + etichetta if etichetta else ''}: {100*tetto:.1f}% dei bersagli e' fra i "
              f"{len(np.unique(candidati)):,} candidati ({int(dentro.sum())}/{len(vero)}). "
              f"Nessun metodo puo' superarlo.")
    return tetto, dentro


def assert_allineamento_spazi(idf, vocab, impronte, nome="artefatti"):
    """CONTRATTO DI ALLINEAMENTO — l'idf e il vocabolario vanno congelati INSIEME.

    Se `idf` e `vocab` si disallineano (si rigenera uno senza l'altro, o si cambiano i pesi per tipo
    senza rigenerare i centroidi), il prodotto scalare restituisce numeri **finiti e privi di senso**.
    E' successo all'autore di questi contratti mentre scriveva `colloca_finale.carica()`: il file degli
    idf conteneva i valori GREZZI mentre il corpus era pesato per tipo.

    `impronte` = dict con gli sha256 attesi: {'idf': ..., 'vocab': ...}.
    """
    import hashlib
    h_i = hashlib.sha256(np.asarray(idf, np.float32).tobytes()).hexdigest()[:16]
    h_v = hashlib.sha256(repr(sorted(vocab.items())).encode()).hexdigest()[:16]
    for chiave, valore in (("idf", h_i), ("vocab", h_v)):
        atteso = impronte.get(chiave)
        assert atteso is None or atteso == valore, (
            f"DISALLINEAMENTO di {chiave} in {nome}: impronta {valore}, attesa {atteso}. "
            f"Gli artefatti sono stati rigenerati in disordine: i punteggi sarebbero finiti ma "
            f"insensati, senza nessun crash a segnalarlo."
        )
    return {"idf": h_i, "vocab": h_v}


def sha_file(nome):
    """Lo sha256 (primi 16 hex) di un artefatto in `graph/data/`."""
    import hashlib
    p = A(nome)
    if not p.exists():
        return None
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16]


def segna_partizione(nome, percorso_impronte, extra=None):
    """Scrive nelle impronte QUALE partizione hanno usato i centroidi, col suo hash.

    E' la seconda meta' del contratto: chi genera un artefatto registra su cosa l'ha costruito,
    chi lo consuma lo verifica. Senza la prima, la seconda non ha niente da confrontare.
    """
    import json
    d = {}
    p = pathlib.Path(percorso_impronte)
    if p.exists():
        try:
            d = json.load(open(p, encoding="utf-8"))
        except Exception:
            d = {}
    d["partizione"] = nome
    d["partizione_sha256"] = sha_file(nome)
    if extra:
        d.update(extra)
    json.dump(d, open(p, "w", encoding="utf-8"), indent=1)
    return d


def assert_partizione(nome, impronte, nome_artefatto="artefatti"):
    """CONTRATTO DELLA PARTIZIONE — la Trappola 3b, resa un errore invece di un risultato sbagliato.

    I centroidi del collocatore sono indicizzati per bolla, e le bolle **non hanno identita' stabile
    fra partizioni**: la stessa bolla 820 e' un insieme di titoli in V8 e un altro insieme in V10.
    Se la partizione viene rigenerata e i centroidi no (o viceversa), un titolo atterra in una bolla
    il cui centroide descrive un ALTRO insieme di titoli. Non va in errore niente: i numeri sono
    finiti, il coseno e' plausibile, e i consigli sono sbagliati. E' successo davvero — *Deadpool &
    Wolverine* collocato fra *Bayside School* e *Kenan & Kel*, senza un solo avviso.

    Qui l'hash secco del file `.npy` della partizione rende quel silenzio impossibile.
    """
    p = A(nome)
    assert p.exists(), f"{nome_artefatto}: manca la partizione {nome} in graph/data/"
    atteso = (impronte or {}).get("partizione_sha256")
    dichiarata = (impronte or {}).get("partizione")
    if atteso is None:
        print(f"  contratto partizione: {nome} NON e' imprigionata nelle impronte "
              f"({nome_artefatto}) — rigenera i centroidi per registrarla")
        return
    if dichiarata is not None and dichiarata != nome:
        raise AssertionError(
            f"PARTIZIONE DIVERSA in {nome_artefatto}: i centroidi sono costruiti su '{dichiarata}', "
            f"il collocatore sta leggendo '{nome}'. Le bolle non hanno id stabili fra partizioni: "
            f"i consigli sarebbero sbagliati e plausibili insieme.")
    ora = sha_file(nome)
    raise_ = (f"LA PARTIZIONE E' CAMBIATA sotto {nome_artefatto}: '{nome}' ha ora l'hash {ora}, "
              f"ma i centroidi sono stati costruiti su {atteso}. Rigenera i centroidi "
              f"(steps/04_centroidi.py) oppure torna alla partizione di prima.")
    if ora != atteso:
        raise AssertionError(raise_)
    print(f"  contratto partizione: {nome} {ora} · coerente con {nome_artefatto}")


def ranghi(S, filtro=None, controlla=True, pareggi_max=0.5):
    """I ranghi per colonna. `S` e' (titoli x candidati), ogni colonna e' una classifica.

    CONTROLLA=True attiva il contratto anti-pareggio (ticket 03 di `todo-grafo`): `argsort` su una
    colonna COSTANTE non ordina a caso, ordina **per indice di catalogo**, e restituisce una tabella
    di percentuali che sembra un risultato. Cinque dei sei artefatti del progetto sono nati cosi'.
    Si puo' spegnere con `controlla=False` per rigiocare le misure vecchie.
    """
    if filtro is not None:
        S = np.where(filtro[:, None], S, -1e30)
    if controlla and S.shape[0] >= 50:
        # `-inf` sui morti: se una colonna ha meno di 50 candidati vivi il suo top-50 contiene un
        # `-inf`, lo span e' infinito e il contratto la salta — correttamente, non e' un artefatto.
        vivi = S > -1e29
        top = np.partition(np.where(vivi, S, -np.inf), -50, axis=0)[-50:]
        span = np.ptp(top, axis=0)
        cattive = np.where(span <= 1e-7)[0]
        # e il criterio dei PAREGGI IN TESTA: se oltre `pareggi_max` dei primi 50 sono tutti uguali
        # al massimo, il rango e' deciso dall'indice di catalogo anche se lo span non e' zero.
        # E' il caso del report 58 (`Cf` con 16.550 serie a zero): il top-50 e' tutto zero.
        # Falso allarme possibile su classifiche a valori interi (i voti): chi ordina per `vote_count`
        # alzi `pareggi_max` o spenga il controllo, ma lo DICHIARI.
        at = (top >= top.max(axis=0) - 1e-9).sum(axis=0) if pareggi_max is not None else np.zeros(0)
        cattive_ties = np.where(at > pareggi_max * 50)[0] if pareggi_max is not None else []
        assert len(cattive_ties) == 0, (
            f"ERRORE: {len(cattive_ties)} colonne con oltre il {100*pareggi_max:.0f}% dei primi 50 "
            f"tutti uguali al massimo (la prima e' la {cattive_ties[0]}). Il rango di quella colonna "
            f"e' una permutazione fissa degli indici, non una classifica."
        )
        assert len(cattive) == 0, (
            f"ERRORE: colonna con top-50 costante (artefatto di argsort): {len(cattive)} colonne, "
            f"la prima e' la {cattive[0]}, valore {S[np.argmax(S[:, cattive[0]]), cattive[0]]:.6g}. "
            f"Se e' una colonna mascherata, il filtro sta azzerando righe intere; se e' una classifica "
            f"vera, i punteggi non distinguono nulla e `argsort` ordina per indice di catalogo."
        )
        # E anche per RIGA, perche' l'artefatto delle serie in `inserimento` era una riga costante:
        # lo scoring si fa riga per riga (una sorgente contro tutti i candidati), il rango per colonna
        # e' l'altra convenzione, e un contratto che guarda un asse solo ne manca meta'.
        if S.shape[1] >= 50:
            vivi_r = S > -1e29
            top_r = np.partition(np.where(vivi_r, S, -np.inf), -50, axis=1)[:, -50:]
            span_r = np.ptp(top_r, axis=1)
            cattive_r = np.where(span_r <= 1e-7)[0]
            assert len(cattive_r) == 0, (
                f"ERRORE: riga con top-50 costante (artefatto di argsort): {len(cattive_r)} righe, "
                f"la prima e' la {cattive_r[0]}, valore {S[cattive_r[0], np.argmax(S[cattive_r[0]]):][0]:.6g}. "
                f"E' il caso della maschera che azzera una fetta di sorgenti (le serie): il rango di "
                f"quelle righe cade sui pareggi, cioe' sull'ordine degli indici di catalogo."
            )
    R = np.empty(S.shape, np.int32)
    for j in range(S.shape[1]):
        R[np.argsort(-S[:, j]), j] = np.arange(S.shape[0])
    return R


def tasso_base(pred, vero=None, rng=None, n_perm=200):
    """(H_oss, H_caso, lift, kappa) — il contratto di tasso base (ticket 03 di `todo-grafo`).

    Ogni percentuale di successo va stampata **con quella che si otterrebbe a caso**. Il 79,4% di
    adiacenza fra bolle sembrava un risultato: era 1,2 volte il caso.

    `pred` e `vero`: l'accordo e' `pred == vero`, e `H_caso` viene dalla permutazione di `vero`.
    Solo `pred` (esiti booleani gia' calcolati): `H_caso` e' la prevalenza, il caso peggiore noto.
    """
    pred = np.asarray(pred)
    if rng is None:
        rng = np.random.default_rng(7)
    if vero is not None:
        vero = np.asarray(vero)
        h_oss = float((pred == vero).mean())
        h_caso = float(np.mean([(pred == rng.permutation(vero)).mean() for _ in range(n_perm)]))
    else:
        v = np.asarray(pred)
        # GUARDIA D'USO (imparata al ticket 05 di `todo-grafo`): la prevalenza `p²+(1-p)²` vale per
        # un ESITO BINARIO. Con delle etichette (le bolle) non e' il caso, e' solo un numero che
        # sembra un caso: su una misura col caso vero di 0,062% ha stampato 58,27%, con kappa -0,685.
        assert v.dtype == bool or len(np.unique(v)) <= 2, (
            f"ERRORE d'uso di tasso_base: {len(np.unique(v))} valori distinti e nessun riferimento. "
            f"Senza `vero` la formula della prevalenza vale solo per esiti binari: con le etichette "
            f"si passi il riferimento (le etichette vere) e il caso lo calcola la permutazione."
        )
        h_oss = float(v.astype(bool).mean())
        h_caso = h_oss * h_oss + (1 - h_oss) * (1 - h_oss)
    lift = h_oss / h_caso if h_caso > 0 else float("inf")
    kappa = (h_oss - h_caso) / (1 - h_caso) if h_caso < 1 else 0.0
    return h_oss, h_caso, lift, kappa


def stampa_tasso(nome, pred, vero=None, n_perm=200, larghezza=46):
    """La riga che ogni misura di successo deve stampare."""
    h, hc, lift, kap = tasso_base(pred, vero, n_perm=n_perm)
    print(f"  {nome:<{larghezza}} {100*h:6.2f}% · caso {100*hc:5.2f}% · lift {lift:5.1f}x · "
          f"kappa {kap:+.3f}")
    return h, hc, lift, kap


# ---------------------------------------------------------------- i contratti nati dal retro-test
def assert_simmetrica(M, nome="M", tolleranza=0.0, controlla=True):
    """CONTRATTO DI SIMMETRIA. Chiamare prima di `msk = row < col`.

    Nasce dal difetto D2 di `07-componenti.py:309`: `Mc.row < Mc.col` su una matrice ASIMMETRICA
    butta via tutti gli archi che scendono, e tiene quelli che salgono, con il peso sbagliato.
    L'esito e' che i pesi dipendono dall'indice numerico dei titoli, e nessuno dei tre contratti
    di §4 se ne accorge: le classifiche restano distinte e ordinate, sono solo SBAGLIATE.
    """
    if not controlla:
        return 0.0
    a = abs(M - M.T)
    scarto = float(a.max()) if a.nnz else 0.0
    assert scarto <= tolleranza, (
        f"ERRORE: {nome} non e' simmetrica (scarto massimo {scarto:.6g}). Prima di prendere il "
        f"triangolo superiore con `row < col` va simmetrizzata: altrimenti il peso di un arco "
        f"dipende da quale dei due titoli ha l'indice piu' basso, e la misura diventa rumore "
        f"travestito da risultato."
    )
    return scarto


def assert_ordine(ordine, segnale, nome, atteso_positivo=False, controlla=True, min_r=0.2):
    """CONTRATTO DI VERSO. `np.argsort(np.argsort(v))` e' ASCENDENTE.

    Nasce da `verifica-popolare.py`: la baseline archiviata come «popolarita'» era
    `np.argsort(np.argsort(voti))`, cioe' il rango crescente — i titoli MENO votati per primi. Non e'
    un errore di teoria: e' un `argsort` in piu'. Le classifiche restano perfette e ordinate, solo al
    contrario, quindi nessun anti-pareggio le ferma.

    `ordine` e' la SEQUENZA degli indici nell'ordine in cui verranno presentati, `segnale` il valore
    vero (i voti). Con `atteso_positivo=False` si pretende che il segnale DECRESCA lungo la sequenza:
    e' il caso di «prima i piu' votati».

    Attento al primo tentativo, che era sbagliato: misurare la correlazione fra il VETTORE DEI RANGHI
    e il segnale la da' POSITIVA anche col bug, perche' il rango crescente e' una funzione crescente
    dei voti. Il verso va misurato sull'ordine di presentazione, non sul rango.
    """
    if not controlla or len(ordine) < 3:
        return 0.0
    o = np.asarray(ordine)
    s = np.asarray(segnale, float)[o]
    r = float(np.corrcoef(s, np.arange(len(s), dtype=float))[0, 1])
    ok = (r > min_r) if atteso_positivo else (r < -min_r)
    assert ok, (
        f"ERRORE: {nome} e' ordinata al contrario (correlazione {r:+.3f} fra segnale e posizione, "
        f"attesa {'>' if atteso_positivo else '<'} {'+' if atteso_positivo else '-'}{min_r}). "
        f"E' il caso di `argsort(argsort(v))`: il rango crescente mette per primo il valore piu' "
        f"piccolo, e nessun anti-pareggio se ne accorge perche' i valori sono tutti distinti."
    )
    return r


def assert_modello(target, previsione, nome="modello", coef_norma=None, controlla=True,
                   min_r=0.2):
    """CONTRATTO DI SCALA E DI SEGNALE. Una previsione che non correla col target non e' un modello.

    Nasce dal report 41: una correlazione di 0,24 fra due modelli e' stata letta come «lo spazio
    CFst e' rumore». Ma un modello con ||coef|| = 11,39 su ingressi in [0, 1] non puo' trasformare
    un errore di 1e-7 in 0,58: era addestrato sulla matrice sbagliata.

    Il primo tentativo di questo contratto chiedeva solo `|r| > 1e-6`, che non ferma niente: un
    modello che restituisce rumore ha r = 0,02 e passava. La soglia ora e' dichiarata, e una
    previsione circa costante viene segnalata a parte perche' e' il sintomo della matrice nulla.
    """
    if not controlla:
        return 0.0
    t = np.asarray(target, float).ravel()
    p = np.asarray(previsione, float).ravel()
    st, sp_ = float(np.std(t)), float(np.std(p))
    assert st > 1e-12, f"ERRORE {nome}: il target e' costante, non c'e' niente da prevedere."
    if sp_ < 1e-9:
        raise AssertionError(
            f"ERRORE {nome}: la previsione e' COSTANTE (std {sp_:.2e}) — e' il caso della matrice "
            f"nulla del report 58: `argsort` su valori tutti pari restituisce l'ordine degli indici."
        )
    r = float(np.corrcoef(t, p)[0, 1])
    amplificazione = sp_ / st
    if coef_norma is not None:
        assert amplificazione < 100 * max(coef_norma, 1.0), (
            f"ERRORE {nome}: la previsione ha scala {sp_:.4g} contro un target di {st:.4g} "
            f"(amplificazione {amplificazione:.1f}x) con ||coef|| = {coef_norma:.2f}. Un modello cosi' "
            f"non puo' essere quello che si crede di aver addestrato."
        )
    assert abs(r) >= min_r, (
        f"ERRORE {nome}: previsione senza relazione col target (r = {r:+.4f}, soglia {min_r}). "
        f"Se la matrice di addestramento era quella sbagliata, la correlazione e' vicina a zero e la "
        f"conclusione «questo spazio e' rumore» riguarda il modello, non lo spazio. E' il report 41."
    )
    return r


# ---------------------------------------------------------------- i contratti aggiunti il 16/10/2026
def mediana_voti(voti):
    """LA MEDIANA DEI VOTI DI UNA BOLLA, in un posto solo. Uno zero NON e' «nessuno l'ha visto»:
    e' «non lo sappiamo» (un titolo appena uscito ha `vote_count = 0`), e una mediana calcolata su un
    misto di noti e ignoti non descrive ne' gli uni ne' gli altri.

    Perche' esiste, visto che conta 19 titoli su 66.259 e cambia 8 bolle su 3.497 (misurato il
    16/10/2026): perche' **due definizioni della stessa cosa** vivevano nel modulo — `collocator`
    saltava i NaN, l'esportazione e `Motore` contavano gli zeri — e per caso coincidevano al 99,8%.
    Una divergenza silenziosa che oggi costa poco e' la stessa divergenza che domani costa una serata.
    """
    v = np.asarray(voti, float)
    v = v[v > 0]
    return float(np.median(v)) if len(v) else 0.0


def assert_stocastica(P, nome="P", tol=1e-9, controlla=True, auto_anello_sopra=0.10):
    """CONTRATTO DI CONSERVAZIONE DELLA MASSA. Una riga di transizione che non somma a 1 perde massa.

    Nasce da un bug vero: `esporta` arrotondava i pesi a 4 decimali SENZA rinormalizzare, e le righe
    si scostavano da 1 fino a 7e-4 — abbastanza da far divergere il motore Python da quello JavaScript
    di 4,2e-5 e da rendere "sporca" la parità senza che nessuno sapesse perche'. Il mio test se n'era
    accorto e io avevo **allargato la tolleranza**: una tolleranza larga e' il posto dove un bug si
    nasconde, quindi il contratto la tiene stretta e lo dice a voce alta.

    `auto_anello_sopra` e' la seconda meta': nei titoli il 47,8% della massa resta nella bolla a ogni
    passo, quindi la diagonale della mappa non e' un dettaglio — se una rigenerazione la perdesse,
    l'attivazione si svuoterebbe dentro i mondi e nessun numero andrebbe in errore.
    """
    if not controlla:
        return
    S = np.asarray(P.sum(1)).ravel()
    gradi = np.asarray((P != 0).sum(1)).ravel()
    vive = gradi > 0
    if vive.any():
        peggio = float(np.abs(S[vive] - 1.0).max())
        if peggio > tol:
            raise AssertionError(
                f"{nome}: una riga di transizione non somma a 1 (scarto massimo {peggio:.2e}). "
                f"La diffusione perde massa a ogni passo, e i numeri restano finiti e plausibili.")
    diag = np.asarray(P.diagonal()).ravel() if hasattr(P, "diagonal") else np.zeros(0)
    if len(diag) and vive.any():
        med = float(np.median(diag[vive]))
        if med < auto_anello_sopra:
            raise AssertionError(
                f"{nome}: la mediana dell'auto-anello e' {med:.3f}, sotto {auto_anello_sopra}. "
                f"La ritenzione interna delle bolle e' sparita: l'attivazione esce tutta a ogni passo.")


def assert_split_temporale(eta_semi, eta_oro, nome="split", controlla=True):
    """CONTRATTO ANTI-INVERSIONE. `eta` e' in GIORNI DA OGGI: il passato ha eta' PIU' GRANDE.

    Chiude la classe di errore del 16/10/2026, che si e' presentata due volte in due forme diverse:
    in `pesi.py` l'ordine era invertito (il presente seminava per predire il passato remoto) e in
    `intero.py` il taglio separava i MEDIUM (film come semi, serie come oro) perche' `da_trakt` non
    leggeva le date. In entrambi i casi i numeri uscivano, erano plausibili, ed erano sbagliati.
    """
    if not controlla:
        return
    a, b = np.asarray(eta_semi, float), np.asarray(eta_oro, float)
    if len(a) == 0 or len(b) == 0:
        return
    # SI CONTROLLA L'INVERSIONE, NON LA PARITA'. Un'eta' mediana IDENTICA non e' un bug: e' uno split
    # DEGENERE — una storia le cui date sono tutte uguali (un import massivo su Trakt, per esempio)
    # non ha un passato e un futuro da separare. Quel che conta e' che il passato NON sia piu' giovane
    # dell'oro, ed e' il chiamante a decidere se saltare l'utente: qui si accende solo sull'inversione.
    if float(np.median(a)) < float(np.median(b)):
        raise AssertionError(
            f"{nome}: i semi hanno eta' mediana {np.median(a):.0f} giorni, l'oro {np.median(b):.0f}. "
            f"Il passato deve avere eta' PIU' GRANDE: questo split sta seminando dal futuro.")


def assert_lunghezza_canone(arr, nome, atteso=None, controlla=True):
    """CONTRATTO DI ALLINEAMENTO DEI METADATI. Un array slittato di una riga non fa crashare niente.

    Nasce da `titoli-canone.txt`: si scriveva il titolo togliendo `\\n` ma non `\\r`, e un ritorno
    carrello in un titolo qualsiasi — riletto con le newline universali — avrebbe prodotto un array
    piu' lungo di N, facendo scivolare TUTTI i titoli successivi di una riga. Nessuna eccezione, solo
    film che si chiamano come il successivo.
    """
    if not controlla or arr is None:
        return
    a = np.asarray(arr)
    if atteso is not None and len(a) != atteso:
        raise AssertionError(f"{nome}: {len(a):,} elementi invece di {atteso:,}. Allineamento perso.")
    if a.dtype.kind == "f" and np.isnan(a).any():
        raise AssertionError(f"{nome}: {int(np.isnan(a).sum())} NaN. Un array allineato non ne ha.")


def assert_monotonia_lista(titoli, nome, controlla=True):
    """CONTRATTO DI ORDINE DELLE LISTE. Una lista "ordinata per attivazione" deve esserlo davvero.

    Avrebbe fatto scattare subito DUE bug del 16/10/2026: `uscite_nuove`, che usciva ordinata per
    indice di catalogo mentre ogni voce portava la sua attivazione (l'illusione di un ordine), e
    `un_passo_fuori`, che concatenava tre bolle senza riordinarle — ed e' da li' che veniva la
    conclusione di prodotto sbagliata.
    """
    if not controlla or not titoli:
        return
    s = [float(x[1]) for x in titoli]
    for i in range(len(s) - 1):
        if s[i] + 1e-12 < s[i + 1]:
            raise AssertionError(
                f"{nome}: la lista non e' ordinata per attivazione — posizione {i} = {s[i]:.6f}, "
                f"posizione {i+1} = {s[i+1]:.6f}.")


def centra(P, is_tv):
    Q = P.astype(np.float32).copy()
    Q[~is_tv] -= P[~is_tv].mean(0)
    Q[is_tv] -= P[is_tv].mean(0)
    return Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)


# ---------------------------------------------------------------- i banchi
def banco_prodotto(row_of, quanti=500, parte="calibrazione"):
    """MovieLens: utenti con >=20 film, split 60/40 (seed 7). Disgiunti dagli archi CF."""
    links = pd.read_csv(ML / "ml-32m" / "links.csv")
    m2r = {}
    for mid, tid in zip(links["movieId"], links["tmdbId"]):
        if pd.isna(tid):
            continue
        r = row_of.get(f"movie:{int(tid)}")
        if r is not None:
            m2r[int(mid)] = r
    rr = pd.read_parquet(ML / "ratings-puliti.parquet")
    rr["row"] = rr.movieId.map(m2r)
    rr = rr[rr.row.notna()]
    rr["row"] = rr["row"].astype(np.int64)
    cnt = rr.groupby("userId").size()
    buoni = cnt[cnt >= 20].index.values
    SCELTI = np.random.default_rng(9).choice(buoni, size=2000, replace=False)
    utenti = SCELTI[:1000] if parte == "calibrazione" else SCELTI[1000:]
    sub = rr[rr.userId.isin(set(utenti.tolist()))]
    gruppi = {u: g["row"].values for u, g in sub.groupby("userId")}
    prof, oro = {}, {}
    r2 = np.random.default_rng(7)
    for u in utenti:
        righe = np.unique(gruppi[u])
        if len(righe) < 20:
            continue
        perm = r2.permutation(len(righe))
        t = int(0.6 * len(righe))
        prof[u] = righe[perm[:t]]
        oro[u] = set(righe[perm[t:]].tolist())
        if len(prof) >= quanti:
            break
    return prof, oro


def banco_curato(row_of):
    """i 1.002 legami cross-medium delle sorgenti a indice DISPARI (i pari sono nel grafo)."""
    d = json.loads((GOLD / "cross-merged.json").read_text(encoding="utf-8"))
    test = [s for i, s in enumerate(d["sources"]) if i % 2 == 1]
    SOGG, BERS = [], []
    for s in test:
        a = row_of.get(s["id"])
        if a is None:
            continue
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is None or l["type"] == s["id"].split(":")[0]:
                continue
            SOGG.append(a)
            BERS.append(b)
    SOGG, BERS = np.array(SOGG), np.array(BERS)
    US = np.unique(SOGG)
    col_of = {int(u): i for i, u in enumerate(US)}
    COL = np.array([col_of[int(x)] for x in SOGG])
    return SOGG, BERS, US, COL


def banco_curato_split(row_of):
    """Il banco curato diviso nelle sue DUE popolazioni, che non vanno MAI mediate.

    Il banco di giudizio esperto ha 1.002 legami cross-medium da 249 sorgenti a indice dispari.
    Le sorgenti di test sono due popolazioni strutturalmente diverse, e la differenza non e' il
    numero di legami (la mediana e' 4 per entrambe):

      CALDE  (~83)  il titolo compare anche come BERSAGLIO di un legame di una sorgente di
                    TRAINING -> ha archi di curatela in entrata nel grafo (che e' simmetrico),
                    quindi NON e' cold start: e' un titolo che il mondo curato gia' tocca.
      FREDDE (~163) nessun arco: e' cold start vero, ed e' la domanda «un titolo nuovo».

    Mediare le due produce un numero che non descrive nessuna delle due — ed e' come il banco e'
    stato usato finora. Torna anche il numero di legami per popolazione: serve a distinguere
    «la popolazione e' difficile» da «la popolazione ha meno legami».
    """
    d = json.loads((GOLD / "cross-merged.json").read_text(encoding="utf-8"))
    src = d["sources"]
    train = [s for i, s in enumerate(src) if i % 2 == 0]
    test = [s for i, s in enumerate(src) if i % 2 == 1]

    SOGG, BERS = [], []
    for s in test:
        a = row_of.get(s["id"])
        if a is None:
            continue
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is None or l["type"] == s["id"].split(":")[0]:
                continue
            SOGG.append(a)
            BERS.append(b)
    SOGG, BERS = np.array(SOGG), np.array(BERS)
    US = np.unique(SOGG)
    col_of = {int(u): i for i, u in enumerate(US)}
    COL = np.array([col_of[int(x)] for x in SOGG])

    tgt = np.zeros(len(row_of), bool)
    for s in train:
        for l in s["links"]:
            b = row_of.get(l["id"])
            if b is not None:
                tgt[b] = True
    return SOGG, BERS, US, COL, tgt[US]


def _leggi_trakt(percorso, chiave):
    try:
        d = json.loads(pathlib.Path(percorso).read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(d, list):
        return None
    out = []
    for v in d:
        o = v.get(chiave) or {}
        t = (o.get("ids") or {}).get("tmdb")
        if t:
            out.append(int(t))
    return out


def banco_trakt(row_of):
    """356 utenti con >=20 film e >=10 serie, split 60/40 (rng 13), per catalogo."""
    U = {}
    for f in sorted(glob.glob(str(TK / "movie-*.json"))):
        u = pathlib.Path(f).stem[6:]
        U[u] = {"film": _leggi_trakt(f, "movie") or [],
                "serie": _leggi_trakt(TK / f"show-{u}.json", "show") or []}

    def dividi(voci, rng, frazione=0.6):
        righe = np.array([row_of[f"{tp}:{int(tid)}"] for tp, tid in voci
                          if f"{tp}:{int(tid)}" in row_of], dtype=np.int64)
        if len(righe) == 0:
            return None, None
        righe = np.unique(righe)
        perm = rng.permutation(len(righe))
        t = int(frazione * len(righe))
        return righe[perm[:t]], set(righe[perm[t:]].tolist())

    rng = np.random.default_rng(13)
    casi = []
    for u in sorted(U):
        fm, sr = U[u]["film"], U[u]["serie"]
        if len(fm) < 20 or len(sr) < 10:
            continue
        pf, gf = dividi([("movie", t) for t in fm], rng)
        ps, gs = dividi([("tv", t) for t in sr], rng)
        if pf is None or ps is None or not gf or not gs:
            continue
        casi.append({"pf": pf, "gf": gf, "ps": ps, "gs": gs})
    return casi


# ---------------------------------------------------------------- le misure
def recall_curato(R, BERS, COL, NS=(10, 50, 100, 500, 2000)):
    rk = R[BERS, COL]
    return {N: 100 * float((rk < N).mean()) for N in NS}


def recall_film(R, US, PROF, ORO, IDX, NS=(10, 100, 500, 2000)):
    den = sum(len(ORO[u]) for u in US)
    out = {}
    for N in NS:
        hit = 0
        for j, u in enumerate(US):
            scelti = IDX[np.argpartition(R[IDX, j], N)[:N]]
            hit += sum(1 for x in scelti if int(x) in ORO[u])
        out[N] = 100 * hit / den
    return out


def recall_catalogo(R, gold_di, chiavi, filtro, NS=(10, 100, 500)):
    idx = np.where(filtro)[0]
    out = {}
    for N in NS:
        hit = den = 0
        for j, u in enumerate(chiavi):
            g = gold_di.get(u)
            if not g:
                continue
            den += len(g)
            scelti = idx[np.argsort(R[idx, j])[:N]]
            hit += sum(1 for x in scelti if int(x) in g)
        out[N] = 100 * hit / max(den, 1)
    return out


# ==================================================================  LE METRICHE NUOVE
# Ticket 01 della mappa `grafo-servibile`. Si AGGIUNGONO a quelle sopra, non le sostituiscono:
# la recall globale resta come numero di sanita', queste sono lo strumento di decisione.

# ---------------------------------------------------------------- i metadati del canone
def metadati():
    """I METADATI DEL CANONE in array allineati alle righe, costruiti UNA VOLTA.

    Perche' esiste: `Motore.__init__` impiegava **51 secondi** a partire, e non per la matrice sparsa —
    per due passate complete sui Parquet TMDB (`movies.parquet` + `tv.parquet`, ~117.000 righe) iterate
    con `for k in range(len(d)): riga = d.iloc[k]`, cioe' riga per riga in Python. Lo stesso parsing
    stava in dodici file. Qui si fa **vettorizzato** (una `map` sull'indice) e il risultato si salva:
    il caricamento diventa la lettura di un .npz.

    Ritorna un dizionario con `VOT`, `VAVE`, `POP`, `ANNO`, `NEP`, `COZY`, `IMP` (array di N) e `TIT`
    (le stringhe). `COZY` e `IMP` dipendono da DUE PARAMETRI (`ASSE_COZY_GENERI`,
    `ASSE_IMPEGNATIVO_GENERI`): l'artefatto ne porta l'impronta, e se i parametri cambiano si ricostruisce
    da solo invece di servire in silenzio una tassonomia vecchia. E' lo stesso patto di `bolle.json`.
    """
    from . import parametri as P
    z, pt = DATA / "metadati-canone.npz", DATA / "titoli-canone.txt"
    sha_generi = hashlib.sha256(f"{P.ASSE_COZY_GENERI}|{P.ASSE_IMPEGNATIVO_GENERI}"
                                .encode()).hexdigest()[:16]
    if z.exists() and pt.exists():
        g = np.load(z)
        if str(g["generi_sha"]) == sha_generi:
            d = {k: g[k] for k in ("VOT", "VAVE", "POP", "ANNO", "NEP", "COZY", "IMP")}
            # I titoli come TESTO, non come array `<U`: numpy usa 4 byte per carattere e una larghezza
            # fissa pari al titolo piu' lungo (350 caratteri -> 41 MB). Un file di righe e' 2 MB e si
            # legge in 40 ms.
            d["TIT"] = np.array(pt.read_text(encoding="utf-8").split("\n"), dtype=object)
            _, _, _N, _ = titoli()                     # cachata: qui costa una chiamata, non un caricamento
            assert_lunghezza_canone(d["TIT"], "titoli-canone.txt", atteso=_N)
            return d
        print("  metadati-canone: i generi degli assi sono cambiati, ricostruisco", flush=True)
    _, row_of, N, _ = titoli()
    cozy = {int(x) for x in P.ASSE_COZY_GENERI.split(",")}
    imp = {int(x) for x in P.ASSE_IMPEGNATIVO_GENERI.split(",")}
    d = {k: np.zeros(N, np.float64) for k in ("VOT", "VAVE", "POP", "ANNO", "NEP")}
    d["NEP"] += 1.0                                   # 1 = un film: il denominatore del peso serie
    d["COZY"] = np.zeros(N, bool)
    d["IMP"] = np.zeros(N, bool)
    titoli_str = np.array([""] * N, dtype=object)
    for tipo, f, col, dcol, ecol in (("movie", "movies.parquet", "title", "release_date", None),
                                     ("tv", "tv.parquet", "name", "first_air_date",
                                      "number_of_episodes")):
        p = ROOT / ".cache" / "tmdb" / f
        cols = ["id", "vote_count", "vote_average", "popularity", col, dcol, "genres"]
        if ecol:
            cols.append(ecol)
        df = pd.read_parquet(p, columns=cols)
        # DA CHIAVE A RIGA, VETTORIZZATO: una sola espressione al posto di un ciclo Python per riga.
        righe = np.array([row_of.get(f"{tipo}:{int(i)}", -1) if pd.notna(i) else -1
                          for i in df["id"]], dtype=np.int64)
        ok = righe >= 0
        d["VOT"][righe[ok]] = pd.to_numeric(df["vote_count"], errors="coerce").to_numpy()[ok]
        d["VAVE"][righe[ok]] = pd.to_numeric(df["vote_average"], errors="coerce").to_numpy()[ok]
        d["POP"][righe[ok]] = pd.to_numeric(df["popularity"], errors="coerce").to_numpy()[ok]
        anni = df[dcol].astype("string").str.slice(0, 4)
        d["ANNO"][righe[ok]] = pd.to_numeric(anni, errors="coerce").to_numpy()[ok]
        titoli_str[righe[ok]] = df[col].astype(str).to_numpy()[ok]
        if ecol:
            e = pd.to_numeric(df[ecol], errors="coerce").to_numpy()
            buoni = ok & np.isfinite(e) & (e > 0)
            d["NEP"][righe[buoni]] = e[buoni]
        for j, g in enumerate(df["genres"].to_numpy()):
            if not ok[j]:
                continue
            try:
                voci = json.loads(g) if isinstance(g, str) else (g or [])
            except Exception:
                voci = []
            ids = {int(x["id"]) for x in voci if isinstance(x, dict) and "id" in x}
            d["COZY"][righe[j]] = bool(ids & cozy)
            d["IMP"][righe[j]] = bool(ids & imp)
    d["VOT"] = np.nan_to_num(d["VOT"])
    d["VAVE"] = np.nan_to_num(d["VAVE"])
    d["POP"] = np.nan_to_num(d["POP"])
    d["ANNO"] = np.nan_to_num(d["ANNO"])
    np.savez_compressed(z, generi_sha=np.array(sha_generi),
                        **{k: d[k] for k in ("VOT", "VAVE", "POP", "ANNO", "NEP", "COZY", "IMP")})
    pt.write_text("\n".join(str(t).replace("\r", " ").replace("\n", " ") for t in titoli_str),
                  encoding="utf-8")
    print(f"  metadati-canone: costruiti e salvati ({z.stat().st_size/1e6:.1f} MB "
          f"+ {pt.stat().st_size/1e6:.1f} MB)", flush=True)
    d["TIT"] = titoli_str
    return d


def voti():
    """La popolarita' del catalogo (vote_count TMDB), nella riga dei titoli."""
    return np.load(A("spazi-trakt.npz"))["votes"].astype(np.float64)


def fasce(voti_catalogo, quantili=(0.05, 0.25)):
    """Le tre fasce di popolarita' del catalogo SERVITO: 0 = testa (top 5%), 1 = mezzo, 2 = coda.

    Il taglio e' su quantili del catalogo, non dell'oro: e' il catalogo che si serve, ed e' la
    stessa partizione per tutti gli utenti (quindi confrontabile fra ricette).
    """
    v = np.asarray(voti_catalogo, np.float64)
    t1, t2 = np.quantile(v, [1.0 - quantili[0], 1.0 - quantili[1]])
    f = np.full(len(v), 2, np.int8)
    f[v >= t2] = 1
    f[v >= t1] = 0
    return f


def per_fascia(rk, fb, NS):
    """Da coppie (rango, fascia) alle recall per fascia. `mezzo+coda` e' quella che decide."""
    out = {}
    for nome, m in (("testa", fb == 0), ("mezzo", fb == 1), ("coda", fb == 2),
                    ("mezzo+coda", fb >= 1), ("tutto", np.ones(len(fb), bool))):
        out[nome] = {N: (100 * float((rk[m] < N).mean()) if m.sum() else float("nan")) for N in NS}
    return out


def recall_stratificato(R, BERS, COL, fas, NS=(10, 100, 500, 2000)):
    """Recall stratificata (BERS/COL) — per i banchi a legame esplicito."""
    return per_fascia(R[BERS, COL], fas[BERS], NS)


def recall_stratificato_oro(R, gold_di, chiavi, fas, NS=(10, 100, 500, 2000)):
    """Recall stratificata per i banchi «un insieme d'oro per chiave» (cataloghi e prodotto).

    `R` deve avere i ranghi GIA' ristretti al catalogo servito (altrimenti i ranghi non sono
    confrontabili fra banchi diversi — e' la trappola che questa misura deve evitare).
    """
    rk, fb = [], []
    for j, u in enumerate(chiavi):
        g = gold_di.get(u)
        if not g:
            continue
        gg = np.fromiter(g, np.int64, len(g))
        rk.append(R[gg, j])
        fb.append(fas[gg])
    if not rk:
        return {}
    return per_fascia(np.concatenate(rk), np.concatenate(fb), NS)


def auto_informazione(voti_catalogo):
    """L'auto-informazione di ogni titolo: -log2 della sua probabilita' di popolarita' (lisciata).

    +1 al numeratore e al denominatore: un titolo con zero voti non deve esplodere a infinito.
    Indovinare un titolo raro vale molto piu' di indovinare uno famoso, ed e' la definizione
    operativa di «azzeccato non banale».
    """
    v = np.asarray(voti_catalogo, np.float64) + 1.0
    return -np.log2(v / v.sum())


def recall_si(rk, si, gamma=1.0, NS=(10, 100, 500, 2000)):
    """Recall pesata per auto-informazione: i successi rari pesano di piu'. Denominatore pesato."""
    w = np.asarray(si, np.float64) ** gamma
    den = w.sum()
    if den <= 0:
        return {N: float("nan") for N in NS}
    return {N: 100 * float(w[rk < N].sum()) / den for N in NS}


def recall_si_oro(R, gold_di, chiavi, si, gamma=1.0, NS=(10, 100, 500, 2000)):
    rk, w = [], []
    for j, u in enumerate(chiavi):
        g = gold_di.get(u)
        if not g:
            continue
        gg = np.fromiter(g, np.int64, len(g))
        rk.append(R[gg, j])
        w.append(si[gg] ** gamma)
    if not rk:
        return {}
    rk, w = np.concatenate(rk), np.concatenate(w)
    den = w.sum()
    return {N: 100 * float(w[rk < N].sum()) / den for N in NS}


def ranghi_popolare(voti_catalogo, quante, filtro=None):
    """IL CONTROLLO DEL BANALE: un'unica classifica globale di popolarita', uguale per tutti.

    Va stampato accanto a OGNI misura nuova (e' il predittore marginale imbattibile), e con la
    recall stratificata deve fare ~100% dei suoi punti sulla testa e ~0% su mezzo+coda: e' la
    prova che la stratificazione isola il segnale non banale invece di misurarlo.
    """
    v = np.asarray(voti_catalogo, np.float64).copy()
    if filtro is not None:
        v = np.where(filtro, v, -np.inf)
    o = np.argsort(-v).astype(np.int32)
    R = np.empty((len(v), quante), np.int32)
    R[o, :] = np.arange(len(v), dtype=np.int32)[:, None]
    return R


def stampa_strati(nome, d, larghezza=46):
    for fascia in ("tutto", "testa", "mezzo", "coda", "mezzo+coda"):
        if fascia not in d or not d[fascia]:
            continue
        et = nome if fascia == "tutto" else ""
        print(f"  {et:<{larghezza}} {fascia:>11}  "
              + " · ".join(f"@{N} {v:6.2f}%" for N, v in d[fascia].items()), flush=True)


def stampa(nome, d, larghezza=46):
    print(f"  {nome:<{larghezza}} " + " · ".join(f"@{N} {v:6.2f}%" for N, v in d.items()), flush=True)
