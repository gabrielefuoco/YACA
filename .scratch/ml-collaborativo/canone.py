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
import glob, json, pathlib
import numpy as np
import pandas as pd
import scipy.sparse as sp

ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
GOLD = ROOT / ".scratch" / "ml-collaborativo" / "gold"
TK = ROOT / ".cache" / "trakt" / "users"


# ---------------------------------------------------------------- i titoli
def titoli():
    z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
    tmdb, tipo = z["tmdb"], z["tipo"]
    keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
    row_of = {k: r for r, k in enumerate(keys)}
    is_tv = (tipo == "tv")
    return keys, row_of, len(keys), is_tv


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
    q = np.load(ML / nome)
    return sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n))


class Componenti:
    """i k-NN degli spazi, cachati per k. Gli spazi vettoriali restano disponibili per i teacher."""

    def __init__(self, n):
        self.n = n
        self.CF_v = np.load(ML / "cf-spazio.npz")["Cf"]
        self.CFst_v = np.load(ML / "cf-studente.npz")["P"]
        self.Kc_v = np.load(ML / "spazio-pulito.npz")["P"]
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
        h_oss = float(np.asarray(pred, bool).mean())
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

def voti():
    """La popolarita' del catalogo (vote_count TMDB), nella riga dei titoli."""
    return np.load(ML / "spazi-trakt.npz")["votes"].astype(np.float64)


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
