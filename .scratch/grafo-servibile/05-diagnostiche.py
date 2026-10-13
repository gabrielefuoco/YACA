"""05-diagnostiche.py — TICKET 05: le tre diagnostiche sulle bolle di OGGI.

Sono diagnostiche, non il build: servono a decidere se il ticket 09 (sparsificazione) e il
ticket 10 (canali tipizzati) hanno un problema da risolvere, e quanto e' grande.

  1. TEST DEI TESTIMONI DISGIUNTI — quanti dei vicini mediani di una bolla sopravvivono se si
     chiede che l'arco sia portato da almeno 3 titoli distinti da una parte e dall'altra, pesati
     per la purezza interna degli estremi.
  2. CACCIA ALLE CHIMERE — le 50 bolle grandi con la connettivita' algebrica piu' bassa: sono le
     candidate allo split del ticket 08. Controcroce: quante stanno fra le bolle che la lettura
     umana ha giudicato minestrone?
  3. ESTRAZIONE DEI PONTI *VIBE* — per le 100 bolle gia' lette, i 2 vicini che massimizzano il
     contrasto fra l'asse comportamentale e quello strutturale: i salti «stesso pubblico, mondi
     diversi». Se non sono plausibili, la tassonomia del ticket 10 va ripensata PRIMA.

Uso:  python .scratch/grafo-servibile/05-diagnostiche.py
"""
import json, pathlib, sys, time
import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
PQ = K.ML.parent / "tmdb"
PART = K.ML / "bolle2-E.npy"          # la partizione letta nel report 74

# le keyword, per l'indizio nelle stampe (non entrano nel giudizio)
KWt = [set() for _ in range(n)]
TIT = {}
for f, col in (("movies.parquet", "title"), ("tv.parquet", "name")):
    d = pd.read_parquet(PQ / f, columns=["id", col, "keywords"])
    for i, t, kw in zip(d["id"], d[col], d["keywords"]):
        r = row_of.get(("movie" if f.startswith("m") else "tv") + ":" + str(int(i)))
        if r is None:
            continue
        TIT[r] = str(t)
        try:
            g = json.loads(kw) if isinstance(kw, str) else (kw or [])
            KWt[r] = {x.get("name", "").lower() for x in g if isinstance(x, dict)}
        except Exception:
            pass
print(f"titoli e keyword caricati ({time.time()-t0:.0f}s)", flush=True)

mem = np.load(PART)
nb = int(mem.max()) + 1
sz = np.bincount(mem, minlength=nb)
P = sp.csr_matrix((np.ones(n, np.float32), (np.arange(n), mem)), shape=(n, nb)).tocsr()
print(f"partizione: {nb:,} bolle · {int((sz>=15).sum()):,} con >=15 titoli · "
      f"mediana taglia {int(np.median(sz))} · max {int(sz.max())}")

C = K.Componenti(n)
Cc = C(30)
for nome in ("KW", "CAST", "DIR", "COLL", "TV"):
    Cc[nome] = K.carica_csr(f"nuovo-{nome}.npz", n)

# --- i due assi, ognuno normalizzato per componente PRIMA di mescolare (canonica) ---
def asse(pesi):
    """I due assi: ogni componente corretta e normalizzata PRIMA di mescolare (canonica)."""
    tot = sum(pesi.values())
    M = None
    for nome, w in pesi.items():
        A = K.correggi_hub(Cc[nome], 0.25)
        pezzo = A * (w / tot)
        M = pezzo if M is None else M + pezzo
    return K.normalizza(M.tocsr())


M_behav = asse({"CF": 1, "B": 1, "TV": 1})             # stesso pubblico
M_struct = asse({"KW": 1, "CAST": 1, "DIR": 1, "COLL": 1})   # stessa forma
M_tot = K.normalizza((M_behav + M_struct).tocsr())
print(f"assi pronti: comportamentale {M_behav.nnz:,} · strutturale {M_struct.nnz:,} "
      f"({time.time()-t0:.0f}s)", flush=True)

# purezza interna: quanta parte del peso di un titolo cade DENTRO la sua bolla
dentro = np.asarray((M_tot.multiply(P[:, mem])).sum(1)).ravel()
tutto = np.asarray(M_tot.sum(1)).ravel()
purezza = dentro / np.maximum(tutto, 1e-9)

# --- le keyword di una bolla: le piu' FREQUENTI ------------------------------------------
# Non un `set` (Python randomizza l'hash delle stringhe: l'ordine cambia a OGNI esecuzione, e un
# diagnostico le cui etichette cambiano non e' confrontabile fra due giri) e non le prime in
# ordine alfabetico (riproducibili ma arbitrarie): le piu' condivise dai membri, come in bolle-100.
vocab, _r, _c = {}, [], []
for _i, _s in enumerate(KWt):
    for _x in _s:
        if _x not in vocab:
            vocab[_x] = len(vocab)
        _r.append(_i)
        _c.append(vocab[_x])
AK = sp.csr_matrix((np.ones(len(_r), np.float32), (_r, _c)), shape=(n, len(vocab))).tocsr()
TB = (P.T @ AK).tocsr()
_inv = {v: k for k, v in vocab.items()}


def kw_bolla(b, quanti=3):
    riga = TB.getrow(b)
    if riga.nnz == 0:
        return "—"
    idx = np.argsort(-riga.data)[:quanti]
    return " · ".join(_inv[riga.indices[i]] for i in idx)


# =============================================================== 1. TESTIMONI DISGIUNTI
print("")
print("=" * 100)
print("1. TEST DEI TESTIMONI DISGIUNTI")
print("=" * 100)
print("  (il vicino sopravvive solo se almeno 3 titoli DISTINTI di A hanno un arco verso B e viceversa)")
pesato = M_tot.multiply(purezza[:, None]).multiply(purezza[None, :])
G = (P.T @ pesato @ P).tocsr()
G.setdiag(0)
G.eliminate_zeros()
gradi = np.asarray((G > 0).sum(1)).ravel()
med_prima = int(np.median(gradi))
print(f"  prima:  {G.nnz:>10,} collegamenti · mediana vicini {med_prima:>6,} · "
      f"bolle isolate {int((gradi==0).sum()):,}")

# quanti titoli DISTINTI di A portano almeno un arco verso B
Q = (M_tot > 0).astype(np.float32) @ P          # titolo x bolla: i titoli raggiunti in ogni bolla
Qs = (Q > 0).astype(np.float32)
Ns = (P.T @ Qs).tocsr()                          # bolla A x bolla B: quanti titoli distinti di A toccano B
Ns = Ns.tocsr()
Ns.data = Ns.data.astype(np.float32)
Ns.setdiag(0)
Ns.eliminate_zeros()

soglia = np.maximum(3, np.ceil(0.25 * np.maximum(sz, 1))).astype(np.float32)
soglia = np.minimum(soglia, 3.0)                 # min(3, ceil(0.25|A|)) -> con |A|>=12 vale 3
print(f"  soglia di testimoni: {int(soglia.min())} (le bolle del campione hanno tutte >12 titoli)")

ok_src = (Ns >= 3.0)
ok_dst = (Ns.T.tocsr() >= 3.0)
tiene = ok_src.multiply(ok_dst).tocsr()
tiene.setdiag(0)
tiene.eliminate_zeros()
Gs = G.multiply(tiene).tocsr()
Gs.eliminate_zeros()
gradi_s = np.asarray((Gs > 0).sum(1)).ravel()
print(f"  dopo:   {Gs.nnz:>10,} collegamenti · mediana vicini {int(np.median(gradi_s)):>6,} · "
      f"bolle isolate {int((gradi_s==0).sum()):,}")
print(f"  >>> la mediana passa da {med_prima:,} a {int(np.median(gradi_s)):,} vicini "
      f"({med_prima/max(np.median(gradi_s),1):.0f}x meno) · "
      f"cade il {100*(1-Gs.nnz/max(G.nnz,1)):.1f}% dei collegamenti")

# il rumore: dei vicini FORTI (i primi 5 per peso), quanti sopravvivono? Se cadono i deboli e
# restano i forti, il test toglie rumore; se cadono anche i forti, toglie informazione.
forti = forti_ok = 0
for b in range(nb):
    riga = G.getrow(b)
    if riga.nnz == 0:
        continue
    for t in riga.indices[np.argsort(-riga.data)][:5]:
        forti += 1
        if Gs[t, b] > 0:
            forti_ok += 1
print(f"  >>> dei vicini piu' forti (primi 5 per peso) sopravvive il "
      f"{100*forti_ok/max(forti,1):.1f}% ({forti_ok:,}/{forti:,}): il test toglie cio' che cade "
      f"fuori dai forti, non i forti")

# controcroce con la lettura umana
MINESTRONE = [217, 1270, 1267, 1215, 1288]
print("")
print(f"  le 5 bolle che la lettura umana ha giudicato minestrone (report 74): {MINESTRONE}")
for b in MINESTRONE:
    print(f"    [{b}] taglia {sz[b]:>3} · vicini prima {int(gradi[b]):>5,} · dopo {int(gradi_s[b]):>4} · "
          f"ne cadono il {100*(1-gradi_s[b]/max(gradi[b],1)):.1f}%")
print(f"  >>> mediana della caduta sui minestrone {np.median([100*(1-gradi_s[b]/max(gradi[b],1)) for b in MINESTRONE]):.1f}% "
      f"contro {100*(1-np.median(gradi_s)/max(np.median(gradi),1)):.1f}% di tutte le bolle")

# =============================================================== 2. CACCIA ALLE CHIMERE
print("")
print("=" * 100)
print("2. CACCIA ALLE CHIMERE — le bolle grandi con la connettivita' algebrica piu' bassa")
print("=" * 100)
grandi = np.where(sz > 35)[0]
print(f"  bolle con piu' di 35 titoli: {len(grandi):,} ({100*len(grandi)/nb:.1f}% delle bolle)")
righe = []
for b in grandi:
    m = np.where(mem == b)[0]
    sub = M_tot[m][:, m].toarray()
    # M_tot NON e' simmetrica (la correzione d'hub scala le colonne e poi normalizza le righe),
    # e il Laplaciano normalizzato vuole una matrice simmetrica: senza questo passo gli
    # autovalori escono NEGATIVI e la classifica e' rumore (verificato: -0,29 sulla prima bolla).
    sub = (sub + sub.T) * 0.5
    d = sub.sum(1)
    if (d <= 0).any():
        continue
    Dm = 1.0 / np.sqrt(d)
    L = np.eye(len(m)) - (sub * Dm[:, None]) * Dm[None, :]
    ev = np.linalg.eigvalsh(L)
    lam2 = float(ev[1]) if len(ev) > 1 else 0.0
    grado_medio = float(d.sum() / len(m))
    righe.append((b, len(m), lam2, grado_medio, lam2 / max(grado_medio, 1e-9),
                  float(purezza[m].mean())))
righe.sort(key=lambda x: x[4])
per_purezza = sorted(righe, key=lambda x: x[5])
print(f"  calcolate per {len(righe):,} bolle ({time.time()-t0:.0f}s)")
print("")
print(f"  {'bolla':>6} {'taglia':>7} {'lambda2':>9} {'grado int':>10} {'rapporto':>9} {'purezza':>8}   keyword")
for b, msz, l2, gm, rap, pur in righe[:50]:
    print(f"  {b:>6} {msz:>7} {l2:>9.4f} {gm:>10.2f} {rap:>9.4f} {pur:>8.3f}   {kw_bolla(b, 3)[:44]}")
print("")
print("  --- le 20 con la PUREZZA media piu' bassa (il criterio interpretabile, come controprova) ---")
print(f"  {'bolla':>6} {'taglia':>7} {'purezza':>8} {'lambda2':>9}   keyword")
for b, msz, l2, gm, rap, pur in per_purezza[:20]:
    print(f"  {b:>6} {msz:>7} {pur:>8.3f} {l2:>9.4f}   {kw_bolla(b, 3)[:44]}")
accordo = len(set([x[0] for x in righe[:50]]) & set([x[0] for x in per_purezza[:50]]))
print(f"  >>> accordo fra le due classifiche (50 candidate): {accordo}/50 in comune")
print(f"      mediana purezza: bolle grandi {np.median([x[5] for x in righe]):.3f} · "
      f"tutte le bolle {np.median(purezza):.3f}")

in50 = [b for b, *_ in righe[:50]]
in100 = [b for b, *_ in righe[:100]]
pos = {b: i + 1 for i, (b, *_) in enumerate(righe)}

# --- le 5 minestrone: dove stanno DAVVERO, su TUTTE le bolle? ---
# Il controcroce chiesto dal ticket e' per costruzione impossibile con la sola caccia alle chimere:
# quella guarda le bolle con >35 titoli, le minestrone ne hanno 15-35. Qui si misura lo stesso.
pur_bolla = np.bincount(mem, weights=purezza, minlength=nb) / np.maximum(sz, 1)
class_pur = np.argsort(np.argsort(pur_bolla))          # 0 = la piu' pura
print("")
print("  --- le 5 minestrone, misurate su TUTTE le bolle (non solo le grandi) ---")
for b in MINESTRONE:
    m = np.where(mem == b)[0]
    sub = M_tot[m][:, m].toarray()
    sub = (sub + sub.T) * 0.5
    d = sub.sum(1)
    l2 = float("nan")
    if len(m) > 1 and (d > 0).all():
        Dm = 1.0 / np.sqrt(d)
        L = np.eye(len(m)) - (sub * Dm[:, None]) * Dm[None, :]
        ev = np.linalg.eigvalsh(L)
        l2 = float(ev[1])
    print(f"    [{b}] taglia {sz[b]:>3} · purezza {pur_bolla[b]:.3f} "
          f"(la {class_pur[b]+1}a su {nb:,}, mediana {np.median(pur_bolla):.3f}) · lambda2 {l2:.4f}")
print(f"  >>> purezza mediana di TUTTE le bolle: {np.median(pur_bolla):.3f} · "
      f"delle 5 minestrone: {np.median([pur_bolla[b] for b in MINESTRONE]):.3f}")
print(f"  >>> il criterio del ticket (le minestrone nelle 50 chimere) e' IMPOSSIBILE per costruzione:"
      f" la caccia alle chimere guarda le bolle con >35 titoli, 4 delle 5 minestrone ne hanno 15")
print("")
pos = {b: i + 1 for i, (b, *_) in enumerate(righe)}
print("")
print(f"  >>> CONTROCROCE: delle 5 minestrone, quante stanno nelle 50 candidate? "
      f"{len(set(MINESTRONE)&set(in50))}/5 · nelle prime 100? {len(set(MINESTRONE)&set(in100))}/5")
print("      posizione delle minestrone nella classifica delle chimere: "
      + ", ".join(f"[{b}] {pos.get(b, 'assente (taglia <=35 o grado nullo)')}" for b in MINESTRONE))
print("      (limite dichiarato: la lettura umana ha registrato per bolla SOLO le 5 minestrone:"
      " le ~7 «filo largo» non sono state annotate una per una, quindi il controcroce e' parziale)")

# =============================================================== 3. I PONTI *VIBE*
print("")
print("=" * 100)
print("3. ESTRAZIONE DEI PONTI *VIBE* — alto comportamentale, basso strutturale")
print("=" * 100)


def pmi_assi(M):
    Gb = (P.T @ M @ P).tocsr()
    Gb.setdiag(0)
    Gb.eliminate_zeros()
    r, c, v = sp.find(Gb)
    sa = np.asarray(Gb.sum(1)).ravel()
    tot = v.sum()
    with np.errstate(divide="ignore", invalid="ignore"):
        p = np.log((v * tot) / np.maximum(sa[r] * sa[c], 1e-12))
    p = np.maximum(p, 0.0)
    return sp.csr_matrix((p, (r, c)), shape=(nb, nb))


Gb = pmi_assi(M_behav)
Gs_ = pmi_assi(M_struct)
print(f"  PMI positiva calcolata sui due assi ({time.time()-t0:.0f}s)")
# le stesse 100 bolle del report 74: campione fra 15 e 60 titoli, seme 11
ids = [i for i in range(nb) if 15 <= sz[i] <= 60]
lett = [ids[i] for i in np.random.default_rng(11).choice(len(ids), size=min(100, len(ids)), replace=False)]
print(f"  bolle lette: {len(lett)}")
print("")
# --- quanto sono distinti i due assi? E' la premessa del ticket 10 ---
r_b, c_b, v_b = sp.find(Gb)
r_s, c_s, v_s = sp.find(Gs_)
chiave_s = {(int(x), int(y)): float(v) for x, y, v in zip(r_s, c_s, v_s)}
forti = np.argsort(-v_b)[:200_000]
acc_b, acc_s = [], []
for i in forti:
    a, b_ = int(r_b[i]), int(c_b[i])
    acc_b.append(float(v_b[i]))
    acc_s.append(chiave_s.get((a, b_), 0.0))
acc_b, acc_s = np.array(acc_b), np.array(acc_s)
zero_s = float((acc_s == 0).mean())
corr = float(np.corrcoef(acc_b, acc_s)[0, 1]) if acc_b.std() > 0 and acc_s.std() > 0 else float("nan")
print(f"  I DUE ASSI SONO DISTINTI? sui 200.000 collegamenti comportamentali piu' forti:")
print(f"    PMI strutturale ZERO nel {100*zero_s:.1f}% dei casi · correlazione fra i due assi {corr:+.3f}")
print(f"    (se la correlazione fosse alta i due assi sarebbero ridondanti, e la tassonomia del"
      f" ticket 10 non avrebbe tre tipi ma uno)")
print("")
for b in lett[:100]:
    bh = Gb.getrow(b).toarray().ravel()
    if bh.max() <= 0:
        continue
    # i candidati vengono dall'ASSE COMPORTAMENTALE (non dal grafo sommato: restringersi a quello
    # rendeva la PMI strutturale zero per costruzione, e il "contrasto" era solo l'asse singolo)
    forti_b = [x for x in np.argsort(-bh)[:20] if bh[x] > 0 and sz[x] >= 3]
    if not forti_b:
        continue
    st_row = Gs_.getrow(b).toarray().ravel()          # sparse[b, x] avvisa e va piano: riga intera
    sl = np.array([bh[x] - st_row[x] for x in forti_b])
    cand = [forti_b[i] for i in np.argsort(-sl)[:2]]
    m = np.where(mem == b)[0]
    print(f"  [{b}] ({sz[b]} titoli · {kw_bolla(b, 3)})")
    for t in cand:
        print(f"      -> [{t}] ({sz[t]} titoli · {kw_bolla(t, 3)})  comportamentale {bh[t]:.2f} · "
              f"strutturale {st_row[t]:.2f} · contrasto {bh[t]-st_row[t]:+.2f}")
print(f"\nFINE ({time.time()-t0:.0f}s)")
