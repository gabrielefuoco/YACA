"""bolle.py — il costruttore nuovo delle bolle. `canone.py` NON si tocca: le funzioni vivono accanto.

I difetti che ripara (ticket 02-09), tutti verificati sul codice il 14/10/2026:

  D1  Leiden con `n_iterations` non specificato -> 2 passate (leidenalg 0.12.0, default).
  D2  `msk = Mc.row < Mc.col` su una matrice ASIMMETRICA (`07-componenti.py:309`): un arco da
      riga 5000 a colonna 100 sparisce, da 100 a 5000 resta col peso della riga 100. I pesi
      dipendevano dall'indice numerico dei titoli.
  D3  coseno L2 senza shrinkage (`07-componenti.py:46`): un titolo con UNA keyword prende
      coseno 1,000 esatto con un altro che ha la stessa, e scavalca coppie vere.
  D4  la doppia normalizzazione: `correggi_hub` chiama `normalizza` dentro, quindi ogni
      componente e' normalizzato a somma-riga 1 PRIMA della somma -> un arco solitario in DIR
      vale 30x un arco vero di CF (e' l'intruso Star Trek Into Darkness nella bolla Star Wars).
  D5  l'effetto catena di Leiden: A-regista-B, B-attore-C, C-keyword-D finiscono tutti insieme.

Le funzioni sono parametriche cosi' che il ticket 02-09 possa accendere un intervento alla volta.
"""
import glob
import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

KEYS, ROW_OF, N, IS_TV = K.titoli()
ML = K.ML
TOPK = 30


# ============================================================ lettura dei titoli
def titoli_leggibili():
    """row -> (nome, voti). Serve al banco sonda e a ogni lettura."""
    PQ = K.ROOT / ".cache" / "tmdb"
    TIT = np.array([""] * N, dtype=object)
    VOT = np.zeros(N, np.float32)
    mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "vote_count"])
    tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "vote_count"])
    for typ, df, col in (("movie", mv, "title"), ("tv", tv, "name")):
        for i, t, vc in zip(df["id"], df[col], df["vote_count"]):
            r = ROW_OF.get(f"{typ}:{int(i)}")
            if r is not None:
                TIT[r] = str(t)
                VOT[r] = float(vc or 0)
    return TIT, VOT


# ============================================================ D3: shrinkage L2 e k-NN
def matrice_idf(insiemi, pesi_extra=None):
    """titolo x vocabolo, pesata IDF. Copiata da `componenti-nuovi.py`/`07-componenti.py`."""
    vocab = {}
    for s in insiemi:
        for x in s:
            vocab[x] = vocab.get(x, 0) + 1
    idx = {x: i for i, x in enumerate(vocab)}
    r_, c_, v_ = [], [], []
    for i, s in enumerate(insiemi):
        ex = pesi_extra[i] if pesi_extra is not None else {}
        for x in s:
            r_.append(i)
            c_.append(idx[x])
            v_.append(float(np.log(N / (1 + vocab[x]))) * float(ex.get(x, 1.0)))
    return sp.csr_matrix((v_, (r_, c_)), shape=(N, len(idx)), dtype=np.float32)


def topk_shrink(A, k=TOPK, min_sim=0.02, shrinkage=True, tau_rel=1.0, B=512, etichetta=""):
    """Come `topk_da_sparsa` ma con lo SHRINKAGE BAYESIANO sulla norma L2 (D3).

    Con `shrinkage=False` riproduce l'originale: `nor = sqrt(sum A^2) + 1e-9`.
    Con `shrinkage=True`: `nor_i = sqrt(sum_f A_if^2 + tau^2)` con tau = `tau_rel` volte la mediana
    delle norme di riga. Un titolo con una sola keyword non puo' piu' raggiungere coseno 1,0.
    """
    A = A.tocsr().astype(np.float32)
    q = np.sqrt(np.asarray(A.multiply(A).sum(1)).ravel())
    tau = float(np.median(q[q > 0])) * tau_rel if shrinkage else 0.0
    nor = np.sqrt(q ** 2 + tau ** 2) + 1e-9
    An = sp.diags(1.0 / nor).dot(A).tocsr()
    r, c, v = [], [], []
    for i in range(0, N, B):
        S = (An[i:i + B] @ An.T).tocsr()
        S.setdiag(0)
        S.eliminate_zeros()
        for j in range(S.shape[0]):
            row = S.getrow(j)
            if row.nnz == 0:
                continue
            d, idx = row.data, row.indices
            if len(d) > k:
                sel = np.argpartition(-d, k)[:k]
                d, idx = d[sel], idx[sel]
            m = d > min_sim
            r.extend([i + j] * int(m.sum()))
            c.extend(idx[m].tolist())
            v.extend(d[m].tolist())
        if (i // B) % 80 == 0 and i:
            print(f"    {etichetta} {i:,}/{N:,} ({time.time()-T0:.0f}s)", flush=True)
    return sp.csr_matrix((v, (r, c)), shape=(N, N), dtype=np.float32)


# ============================================================ D4: correzione d'hub SENZA normalizzazione dura
def correggi_hub_2(A, beta):
    """Il grado BINARIO come `canone.correggi_hub`, ma SENZA `normalizza` finale.

    La normalizzazione di riga passa in `shrink_riga`, che usa `d + tau` invece di `max(d, 1e-9)`.
    """
    if beta <= 0:
        return A.tocsr()
    ind = np.asarray((A > 0).sum(0)).ravel().astype(np.float64)
    return sp.csr_matrix(A.multiply((1.0 / np.maximum(ind, 1.0) ** beta)[None, :])).tocsr()


def shrink_riga(A, tau_rel=1.0, tau_min=1e-6):
    """D4: divide ogni riga per (somma_riga + tau), non per la somma.

    tau = `tau_rel` volte la mediana delle somme di riga non nulle (pavimento: 5 "vicini
    equivalenti" se la mediana e' piu' piccola di cosi').
    """
    A = A.tocsr().astype(np.float32)
    d = np.asarray(A.sum(1)).ravel()
    pos = d[d > 0]
    tau = float(np.median(pos)) * tau_rel if pos.size else tau_min
    tau = max(tau, tau_min)
    return sp.diags(1.0 / (d + tau)).dot(A).tocsr()


def controlla_dimensioni(A, nome=""):
    d = np.asarray((A > 0).sum(1)).ravel()
    return d


def maschera_freddi(C, caldi_sopra=5):
    """D4-ter: i nodi con >= `caldi_sopra` archi in CF+B+TV sono CALDI: CFst non li tocca.

    CFst e' uno studente progettato come salvagente per i titoli ciechi. Sui titoli caldi e' una
    nebbia densa di somiglianze generiche, e pesa 1 su tutti i 66.259 titoli.
    """
    caldo = np.zeros(N, bool)
    for nome in ("CF", "B", "TV"):
        if nome in C:
            caldo |= (np.asarray((C[nome] > 0).sum(1)).ravel() >= caldi_sopra)
    return caldo


def costruisci_2(C, pesi, beta, tau_rel=1.0, caldi_sopra=5, azzera_cfst=True):
    """La miscela con lo shrinkage di riga (D4) invece della normalizzazione dura."""
    if azzera_cfst and "CFst" in pesi and caldi_sopra is not None and caldi_sopra > 0:
        caldo = maschera_freddi(C, caldi_sopra)
        pesi = dict(pesi)

    tot = sum(pesi.values())
    M = None
    for nome, w in pesi.items():
        A = correggi_hub_2(C[nome], beta)
        if nome == "CFst" and azzera_cfst and caldi_sopra:
            A = A.tolil()
            A[caldo, :] = 0
            A[:, caldo] = 0
            A = A.tocsr()
            A.eliminate_zeros()
        pezzo = A * (w / tot)
        M = pezzo if M is None else M + pezzo
    return shrink_riga(M.tocsr(), tau_rel)


# ============================================================ D2: simmetrizzazione vera
def simmetrizza(M, bonus_mutuo=2.0):
    """Sostituisce `msk = Mc.row < Mc.col` su una matrice asimmetrica (D2).

    `(M + M^T)/2` piu' il bonus di reciprocita' `sqrt(M .* M^T)` (media geometrica): un arco conta
    davvero solo se vale nei due versi. Dopo questo passo, prendere il triangolo superiore e'
    LEGITTIMO: la matrice e' simmetrica per costruzione.

    `archi_leiden` fa lo stesso calcolo **solo sul triangolo superiore**, senza mai costruire la
    matrice simmetrica intera: il primo giro e' morto senza traceback (kill duro) e il picco stava
    qui. Usare quella quando si va a Leiden.
    """
    Ms = ((M + M.T) * 0.5).tocsr()
    Mm = M.multiply(M.T).sqrt().tocsr()
    return (Ms + bonus_mutuo * Mm).tocsr()


def archi_leiden(M, bonus_mutuo=2.0, etichetta=""):
    """Il triangolo superiore di `(M+M^T)/2 + bonus*sqrt(M.*M^T)`, senza materializzare la simmetrica.

    Le due parti si prendono entrambe su i<j e si sommano per coordinate: il risultato ha meta' degli
    archi della matrice simmetrica, e il picco di memoria si dimezza.
    """
    S = ((M + M.T) * 0.5).tocsr()
    rs, cs, vs = triangolo(S)
    del S
    Mm = M.multiply(M.T).sqrt().tocsr()
    rm, cm, vm = triangolo(Mm)
    del Mm
    r = np.concatenate([rs, rm])
    c = np.concatenate([cs, cm])
    v = np.concatenate([vs, bonus_mutuo * vm])
    W = sp.csr_matrix((v, (r, c)), shape=(N, N), dtype=np.float32)
    W.setdiag(0)
    W.eliminate_zeros()
    if etichetta:
        print(f"    {etichetta}: {W.nnz:,} archi nel triangolo ({time.time()-T0:.0f}s)", flush=True)
    return W


def triangolo(M):
    Mc = M.tocoo()
    msk = Mc.row < Mc.col
    return Mc.row[msk], Mc.col[msk], Mc.data[msk]


# ============================================================ 04: chiusura triangolare
def chiusura_triangolare(M, alpha0=0.1, B=2048, etichetta=""):
    """`S <- S .* (alpha0 + S S^T)`: i triangoli non mentono mai.

    Un arco isolato fra due mondi senza vicini in comune viene abbattuto a `alpha0`; un arco vero,
    dove i membri si rimpallano gli stessi vicini, viene moltiplicato. A blocchi per riga, perche'
    `S @ S.T` intero non sta in memoria.
    """
    S = M.tocsr()
    Sb = (S > 0).astype(np.float32).tocsr()
    out = []
    for i in range(0, N, B):
        O = (Sb[i:i + B] @ Sb.T).tocsr()
        blocco = (S[i:i + B].multiply(O) + alpha0 * S[i:i + B]).tocsr()
        out.append(blocco)
        if (i // B) % 32 == 0 and i:
            print(f"    triangolare {i:,}/{N:,} ({time.time()-T0:.0f}s)", flush=True)
    M2 = sp.vstack(out).tocsr()
    M2.setdiag(0)
    M2.eliminate_zeros()
    return M2


# ============================================================ 06: maschera di genere, COLL, consenso
def maschera_genere(M, GEN, KW, stretto=0.15, etichetta=""):
    """Un arco DIR/CAST crolla se i due titoli non hanno NULLA in comune oltre al mestiere.

    Se condividono almeno un genere specifico (drama e' un ombrello e si esclude) o almeno una
    keyword, l'arco resta 1.0; se hanno generi e keyword completamente disgiunti, scende a
    `stretto`. Cosi' un autore con due filoni opposti produce due bolle pulite invece di un
    minestrone.
    """
    M = M.tocoo()
    GENF = [frozenset(g) - {"drama"} for g in GEN]
    KWF = [frozenset(k) for k in KW]
    fatt = np.ones(len(M.data), np.float32)
    for k in range(len(M.data)):
        i, j = int(M.row[k]), int(M.col[k])
        if not ((GENF[i] & GENF[j]) or (KWF[i] & KWF[j])):
            fatt[k] = stretto
    fuori = float((fatt < 1).mean()) if len(fatt) else 0.0
    print(f"    {etichetta}: archi abbattuti {int((fatt<1).sum()):,}/{len(fatt):,} ({100*fuori:.1f}%)",
          flush=True)
    return sp.csr_matrix((M.data * fatt, (M.row, M.col)), shape=(N, N)).tocsr()


def _valori(insieme, r, c, n):
    """I valori di `insieme` nelle coordinate (r, c), dove non c'e' -> 0. Vettoriale.

    Serve perche' una singola vista NON copre tutti gli archi di M (KW e' un sottoinsieme), quindi
    `M.multiply(vista)` non ha la struttura di M e i `.data` non si possono leggere in parallelo.
    """
    A = insieme.tocoo()
    A.sum_duplicates()
    chiave = A.row.astype(np.int64) * int(n) + A.col
    ordine = np.argsort(chiave, kind="stable")
    chiave_ord = chiave[ordine]
    val_ord = A.data[ordine]
    q = r.astype(np.int64) * int(n) + c
    pos = np.clip(np.searchsorted(chiave_ord, q), 0, max(len(chiave_ord) - 1, 0))
    ok = (chiave_ord[pos] == q) if len(chiave_ord) else np.zeros(len(q), bool)
    fuori = np.zeros(len(q), np.float32)
    fuori[ok] = val_ord[pos[ok]]
    return fuori


def consenso_multivista(M, C, pesi, debole=("KW", "CAST"), penalita=0.5):
    """Premia gli archi confermati da >=2 viste indipendenti (ticket 07).

    Fattore `0.5 + 0.5 * N_ij` (N=1 -> 1.0, N=2 -> 1.5, N=3 -> 2.0); se `N_ij = 1` E l'unica vista
    e' solo KW o solo CAST, il fattore scende a `penalita`. `N_ij` si legge con `_valori`, arco per
    arco: un `multiply` fra matrici con strutture diverse non si puo' leggere in parallelo, ed e'
    quello che ha fatto fallire la prima versione (`NotImplementedError` sulla sottrazione).
    """
    Mc = M.tocoo()
    r, c = Mc.row, Mc.col
    nvie = np.zeros(len(Mc.data), np.float32)
    for nome in pesi:
        nvie += (_valori((C[nome] > 0).astype(np.float32).tocsr(), r, c, N) > 0)
    sola = np.zeros(len(Mc.data), bool)
    for nome in debole:
        if nome in pesi:
            sola |= (_valori((C[nome] > 0).astype(np.float32).tocsr(), r, c, N) > 0)
    F = 0.5 + 0.5 * nvie
    F[(nvie <= 1) & sola] = penalita
    F = np.maximum(F, 0.05).astype(np.float32)
    out = sp.csr_matrix((Mc.data * F, (r, c)), shape=(N, N), dtype=np.float32).tocsr()
    print(f"    consenso: fattore medio {float(F.mean()):.3f} · "
          f"archi con N>=2 {100*float((nvie >= 2).mean()):.1f}% · "
          f"penalizzati {int(((nvie <= 1) & sola).sum()):,}", flush=True)
    return out


# ============================================================ 05: potatura al nucleo
def potatura_nucleo(mem, M, quanti_nucleo=4, etichetta=""):
    """Espelle chi e' entrato per effetto catena, senza dissolvere nessuna bolla (ticket 05).

    Per ogni bolla: il Nucleo sono i `quanti_nucleo` titoli con la massima somma di pesi interni.
    Un membro con affinita' ZERO verso il Nucleo viene riassegnato alla bolla il cui Nucleo ha la
    massima affinita' diretta con lui. Se non ha affinita' con nessun Nucleo, resta dov'e'.
    """
    Mc = M.tocoo()
    peso = sp.csr_matrix((Mc.data, (Mc.row, Mc.col)), shape=(N, N)).tocsr()
    del Mc

    def versus(righe, colonne):
        """Peso righe->colonne piu' colonne->righe: `M` puo' essere il solo triangolo."""
        return (np.asarray(peso[righe][:, colonne].sum(1)).ravel()
                + np.asarray(peso[colonne][:, righe].sum(0)).ravel())

    bolle = {}
    for r in range(N):
        b = int(mem[r])
        if b >= 0:
            bolle.setdefault(b, []).append(r)
    nuclei = {}
    for b, membri in bolle.items():
        sub = peso[membri][:, membri]
        # somma dei pesi INTERNI di ogni membro, nelle due direzioni, in un colpo solo
        interno = (np.asarray(sub.sum(1)).ravel() + np.asarray(sub.sum(0)).ravel())
        ordine = np.argsort(-interno)
        nuclei[b] = [membri[k] for k in ordine[:min(quanti_nucleo, len(membri))]]
    nuova = mem.copy()
    espulsi = riassegnati = 0
    fuori = peso.tocsr()
    for b, membri in bolle.items():
        if len(membri) <= quanti_nucleo:
            continue
        nucleo = nuclei[b]
        aff = versus(membri, nucleo)
        for k, r in enumerate(membri):
            if aff[k] > 0:
                continue
            vicini = fuori.getrow(r)
            if vicini.nnz == 0:
                espulsi += 1
                continue
            conta = {}
            for j in vicini.indices:
                b2 = int(mem[j])
                if b2 != b:
                    conta[b2] = conta.get(b2, 0) + 1
            if not conta:
                espulsi += 1
                continue
            b2 = max(conta, key=conta.get)
            nuova[r] = b2
            espulsi += 1
            riassegnati += 1
    print(f"    {etichetta}: espulsi {espulsi:,} · riassegnati {riassegnati:,} "
          f"({100*riassegnati/max(espulsi,1):.1f}%)", flush=True)
    return nuova


# ============================================================ la partizione
def partizione(M, res, tipo="RB", seed=42, n_iterations=-1, etichetta="", gia_triangolo=True):
    """Partiziona. `M` puo' essere gia' il triangolo (`archi_leiden`) o una matrice completa.

    `tipo` in {'RB','CPM'}; `n_iterations=-1` = fino a convergenza.
    """
    import igraph as ig
    import leidenalg as la
    if gia_triangolo:
        W = M.tocoo()
        r, c, v = W.row, W.col, W.data
        del W
    else:
        r, c, v = triangolo(M)
    g = ig.Graph(n=N, edges=np.column_stack((r, c)), directed=False)
    del r, c
    g.es["weight"] = v.astype(float).tolist()
    del v
    print(f"    {etichetta}: grafo con {g.ecount():,} archi ({time.time()-T0:.0f}s)", flush=True)
    mem(f"{etichetta} grafo")
    parte = la.RBConfigurationVertexPartition if tipo == "RB" else la.CPMVertexPartition
    p = la.find_partition(g, parte, weights="weight", resolution_parameter=res, seed=seed,
                          n_iterations=n_iterations)
    part = np.array(p.membership)
    sz = np.bincount(part)
    print(f"    {etichetta}: {len(sz):,} bolle · {int((sz>=15).sum()):,} con >=15 · "
          f"mediana {int(np.median(sz))} · modularita' {p.modularity:.4f} ({time.time()-T0:.0f}s)",
          flush=True)
    del g
    return part


# ============================================================ i componenti
def mem(etichetta=""):
    """Memoria del processo: il run e' morto una volta SENZA traceback, quindi un kill duro."""
    import ctypes
    from ctypes import wintypes

    class PMC(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                    ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t)]
    pmc = PMC()
    pmc.cb = ctypes.sizeof(PMC)
    try:
        ctypes.windll.psapi.GetProcessMemoryInfo(ctypes.windll.kernel32.GetCurrentProcess(),
                                                 ctypes.byref(pmc), pmc.cb)
        print(f"    [mem] {etichetta}: {pmc.WorkingSetSize/2**30:.2f} GB ora, "
              f"picco {pmc.PeakWorkingSetSize/2**30:.2f} GB ({time.time()-T0:.0f}s)", flush=True)
    except Exception:
        pass


def carica_componenti(con_shrinkage=True, min_sim_kw=0.02, min_sim_cast=0.02, ricostruisci=True,
                      insiemi=None):
    """I componenti della miscela. Con `ricostruisci` rifa' KW, CAST, DIR, PROD con lo shrinkage.

    CF, CFst, B, T, K, TV e LIST si riusano: vengono da vettori DENSE (o da misure booleane), dove
    il difetto D3 non esiste.
    """
    C = {}
    CMP = K.Componenti(N)
    base = CMP(TOPK)
    for nome in ("CF", "CFst", "B", "T", "K"):
        C[nome] = base[nome]
    for nome in ("TV", "LIST", "COLL"):
        f = K.ML / f"nuovo-{nome}.npz"
        if f.exists():
            C[nome] = K.carica_csr(f"nuovo-{nome}.npz", N)
    if not ricostruisci:
        for nome in ("KW", "CAST", "DIR"):
            C[nome] = K.carica_csr(f"nuovo-{nome}.npz", N)
        C["KW"] = C["KW"].astype(np.float32)
        return C
    if insiemi is None:
        insiemi = costruisci_insiemi()
    for nome, chiave, ms in (("KW", "KW", min_sim_kw), ("CAST", "CA", min_sim_cast),
                             ("DIR", "DI", 0.02), ("PROD", "SIG", 0.02)):
        cache = ML / f"bolle-nitrile-{nome}.npz"
        if cache.exists() and ricostruisci == "cache":
            C[nome] = K.carica_csr(f"bolle-nitrile-{nome}.npz", N)
            g = np.asarray((C[nome] > 0).sum(1)).ravel()
            print(f"  -> {nome}: dalla cache · {C[nome].nnz:,} archi · mediana {int(np.median(g))}",
                  flush=True)
            continue
        A = matrice_idf(insiemi[chiave], insiemi.get(chiave + "_extra"))
        C[nome] = topk_shrink(A, min_sim=ms, shrinkage=con_shrinkage, etichetta=nome)
        g = np.asarray((C[nome] > 0).sum(1)).ravel()
        print(f"  -> {nome}: {C[nome].nnz:,} archi · mediana grado {int(np.median(g))} "
              f"· titoli con archi {int((g>0).sum()):,}", flush=True)
        M = ((C[nome] + C[nome].T) * 0.5).tocsr()
        M.setdiag(0)
        M.eliminate_zeros()
        np.savez_compressed(ML / f"bolle-nitrile-{nome}.npz", data=M.data,
                            indices=M.indices, indptr=M.indptr)
    return C


def costruisci_insiemi():
    """KW, CAST, DIR, PROD dai metadati TMDB. Copiata da `componenti-nuovi.py` + `07-componenti.py`."""
    PQ = K.ROOT / ".cache" / "tmdb"
    COLS_M = ["id", "keywords", "cast", "directors", "runtime", "release_date",
              "production_companies", "production_countries", "collection_id"]
    COLS_T = ["id", "keywords", "cast", "created_by", "runtime", "first_air_date",
              "production_companies", "production_countries", "networks"]
    KW = [set() for _ in range(N)]
    CA = [set() for _ in range(N)]
    DI = [set() for _ in range(N)]
    GEN = [set() for _ in range(N)]
    PAE = [set() for _ in range(N)]
    COMP = [set() for _ in range(N)]
    RETE = [set() for _ in range(N)]
    DEC = np.full(N, -1, np.int16)
    CO = [set() for _ in range(N)]

    def leggi(s):
        try:
            v = json.loads(s) if isinstance(s, str) else (s or [])
            return [x for x in v if isinstance(x, dict)]
        except Exception:
            return []

    for f, typ, cols in ((PQ / "movies.parquet", "movie", COLS_M),
                         (PQ / "tv.parquet", "tv", COLS_T)):
        d = pd.read_parquet(f, columns=cols)
        for riga in d.itertuples(index=False):
            dd = dict(zip(cols, riga))
            r = ROW_OF.get(f"{typ}:{int(dd['id'])}")
            if r is None:
                continue
            for x in leggi(dd.get("keywords")):
                KW[r].add(str(x.get("name", "")).lower())
            for x in leggi(dd.get("cast"))[:10]:
                if x.get("name"):
                    CA[r].add(str(x["name"]))
            di = dd.get("directors") if "directors" in dd else dd.get("created_by")
            for x in leggi(di):
                DI[r].add(str(x.get("name", "")))
            for x in leggi(dd.get("genres")):
                GEN[r].add(str(x.get("name", "")).lower())
            for x in leggi(dd.get("production_countries")):
                PAE[r].add(str(x.get("iso_3166_1") or x.get("name") or "").upper())
            for x in leggi(dd.get("production_companies")):
                nm = str(x.get("name", "")).strip()
                if len(nm) > 2:
                    COMP[r].add(nm)
            for x in leggi(dd.get("networks")):
                nm = str(x.get("name", "")).strip()
                if len(nm) > 2:
                    RETE[r].add(nm)
            dt = dd.get("release_date") if typ == "movie" else dd.get("first_air_date")
            if dt:
                try:
                    DEC[r] = int(str(dt)[:4]) // 10 * 10
                except Exception:
                    pass
            co = dd.get("collection_id")
            if co is not None and not (isinstance(co, float) and np.isnan(co)):
                CO[r].add(int(co))
    print(f"  metadati: keyword {sum(len(s) for s in KW):,} · cast {sum(len(s) for s in CA):,} "
          f"· registi {sum(len(s) for s in DI):,} · collezioni {sum(len(s) for s in CO):,}",
          flush=True)
    # PROD: firma produttiva (studio di nicchia / rete di nicchia / paese+decennio+genere)
    n_comp, n_rete = {}, {}
    for r in range(N):
        for c in COMP[r]:
            n_comp[c] = n_comp.get(c, 0) + 1
        for c in RETE[r]:
            n_rete[c] = n_rete.get(c, 0) + 1
    SIG = [set() for _ in range(N)]
    for r in range(N):
        for c in COMP[r]:
            if n_comp[c] <= 40:
                SIG[r].add(f"co:{c}")
        for c in RETE[r]:
            if n_rete[c] <= 60:
                SIG[r].add(f"rt:{c}")
        if DEC[r] > 0:
            non_us = {p for p in PAE[r] if p and p not in ("US", "USA", "GB", "UK")}
            if non_us:
                for p in non_us:
                    for g in GEN[r]:
                        SIG[r].add(f"pg:{p}|{DEC[r]}|{g}")
    print(f"  PROD: firme distinte {len({x for s in SIG for x in s}):,} · titoli con firma "
          f"{sum(1 for s in SIG if s):,}", flush=True)
    return {"KW": KW, "CA": CA, "DI": DI, "SIG": SIG, "CO": CO, "GEN": GEN}


T0 = time.time()
