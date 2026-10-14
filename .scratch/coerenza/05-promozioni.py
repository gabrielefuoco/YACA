"""05-promozioni.py — TICKET 05: promozioni semantiche o errori veri.

§3.2 del senior: sui casi in cui `bolla_predetta != bolla_vera`, calcolare la sovrapposizione di
**generi e keyword pure** (`ge:` + `kw:`, esclusi cast, case e registi) del titolo con la bolla
predetta e con quella vera.

Se la bolla predetta e' tematicamente piu' pura di quella vera, non e' un errore del collocatore: e'
una bolla comportamentale eterogenea che il collocatore ha evitato. Contare separatamente
`propria bolla + bolla tematicamente piu' pura` **toglie il falso trade-off fra V1 e V3**.

Ed e' la risposta GRATIS alla domanda del §3.1: non serve nessun embedding delle trame, perche' la
domanda vera e' «la bolla scelta assomiglia di piu' al titolo di quella che il banco chiama giusta?»,
e quella si misura coi token che abbiamo gia'.

Misura:
    sim(i, b) = coseno fra i token `ge:`+`kw:` del titolo i e il centroide `ge:`+`kw:` della bolla b

Solo generi e keyword, apposta: escludendo cast e case si toglie la parte che il ticket 05 di
`mappa-pesata` ha dimostrato essere rumore (Dakota Johnson che porta Verity verso Cinquanta sfumature).
"""
import json
import pathlib
import sys
import time

import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

T0 = time.time()
ML = K.ML
print("=" * 100)
print("TICKET 05 — PROMOZIONI SEMANTICHE O ERRORI VERI")
print("=" * 100, flush=True)

TF = sp.load_npz(ML / "05-tfidf.npz").tocsr()
vocab = json.load(open(ML / "05-vocab.json", encoding="utf-8"))
mem = np.load(ML / "bolle-nitrile-V8.npy")
N = len(mem)
NB = int(mem.max()) + 1
sz = np.bincount(mem)
IS_TV = B.IS_TV

# solo i token tematici
col_tem = np.array([vocab[t] for t in vocab if t[:3] in ("ge:", "kw:")])
TEM = TF[:, col_tem].tocsr()
print(f"  token tematici: {len(col_tem):,} su {len(vocab):,} · matrice {TEM.shape} · "
      f"{TEM.nnz:,} valori ({time.time()-T0:.0f}s)", flush=True)

ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]
r_, c_, v_ = [], [], []
for b in range(NB):
    s = np.asarray(TEM[MEMBRI[b]].sum(0)).ravel() / max(len(MEMBRI[b]), 1)
    nz = np.nonzero(s)[0]
    r_.extend([b] * len(nz))
    c_.extend(nz.tolist())
    v_.extend(s[nz].tolist())
MU = sp.csr_matrix((v_, (r_, c_)), shape=(NB, len(col_tem)), dtype=np.float32)
NO = np.sqrt(np.asarray(MU.multiply(MU).sum(1)).ravel()) + 1e-9
print(f"  centroidi tematici: {MU.shape} ({time.time()-T0:.0f}s)", flush=True)

# il banco
Bcsr = K.carica_csr("boot-B.npz", N)
serie = np.where(IS_TV & (np.asarray((Bcsr > 0).sum(1)).ravel() > 0))[0]
rng = np.random.default_rng(13)
tolti = rng.choice(serie, 600, replace=False)
vere = np.array([int(mem[i]) for i in tolti])
print(f"  banco: 600 serie (seed 13)", flush=True)

# le predizioni delle due varianti, gia' calcolate
V3 = np.load(ML / "06c-voto.npz", allow_pickle=True)
pred_v3 = np.asarray(V3["previste"])
# V1: si ricalcola, e' un coseno su una matrice che non abbiamo salvato
# V1: nel file del ticket 04 i centroidi sono DENSI (matrici numpy), non sparsi — quelli sparsi
# sono `05-centroidi.npz`. Copiare l'uno per l'altro e' l'errore che ho appena fatto.
TF1 = sp.load_npz(ML / "04-tfidf.npz").tocsr()
C4 = np.load(ML / "04-centroidi.npz")
CENT1 = C4["uniforme"]                                  # (336 x 122.314)
NORM1 = np.linalg.norm(CENT1, axis=1, keepdims=True) + 1e-9
bolle_serie1 = C4["bolle_serie"]
# LEAVE-ONE-OUT ESATTO — e questa volta e' il contratto del ticket 01 a imporlo, non la buona
# volonta'. La prima esecuzione di questo script dava a V1 il **69,2%**: la serie in esame e' membro
# della sua bolla, quindi il suo contributo al centroide si regalava `1/n` di coseno, e con 30 membri
# sono +0,033 su una scala dove i coseni veri stanno fra 0,02 e 0,2. Bastava a ribaltare l'argmax.
# E' il QUARTO leak della sessione (63,7% · 58,27% · 55,8% · 69,2%), ed e' lo stesso errore che il
# contratto `assert_loo_esatto` ferma. Non l'avevo applicato qui.
V = np.asarray(TF1[tolti] @ CENT1.T)                  # (600, 336) = mean_b · v_i
COS1 = V / NORM1.T
for k, i in enumerate(tolti):
    b = int(mem[i])
    if b not in set(int(x) for x in bolle_serie1):
        continue
    j = int(np.where(bolle_serie1 == b)[0][0])
    n_b = len(np.where(mem == b)[0])
    nj = float(np.asarray(NORM1[j]).ravel()[0])       # numpy 2 non converte un (1,) con float()
    S_dot = float(COS1[k, j]) * n_b * nj               # S_b · v_i
    S_norm2 = (n_b * nj) ** 2
    nl = np.sqrt(max(S_norm2 - 2 * S_dot + 1.0, 1e-12))
    COS1[k, j] = (S_dot - 1.0) / max(nl, 1e-9)
pred_v1 = np.array([int(bolle_serie1[int(np.argmax(COS1[k]))]) for k in range(600)])
print(f"  V1 con leave-one-out esatto ({time.time()-T0:.0f}s)", flush=True)

# la similarita' tematica titolo -> bolla
S = np.asarray((TEM[tolti] @ MU.T).todense())
S = S / (NO[None, :] + 1e-9)

print("\n" + "=" * 100)
print("IL CONTO")
print("=" * 100)
print(f"  {'variante':<26} {'propria bolla':>14} {'+ promotion':>13} {'errori veri':>12}")
RIS = {}
for nome, pred in (("V1 (pesi grezzi)", pred_v1), ("V3 (pesi per tipo)", pred_v3)):
    ok = pred == vere
    prom = np.zeros(600, bool)
    for k in range(600):
        if ok[k]:
            continue
        b_pred, b_vera = int(pred[k]), int(vere[k])
        if S[k, b_pred] > S[k, b_vera]:
            prom[k] = True
    veri = ~ok & ~prom
    RIS[nome] = (ok.sum(), prom.sum(), veri.sum())
    print(f"  {nome:<26} {int(ok.sum()):>10} ({100*ok.mean():4.1f}%) "
          f"{int(prom.sum()):>9} ({100*prom.mean():4.1f}%) {int(veri.sum()):>8} ({100*veri.mean():4.1f}%)")

print(f"\n  e il conto che rimuove il falso trade-off:")
for nome in RIS:
    ok, prom, veri = RIS[nome]
    print(f"    {nome:<26} propria {100*ok/600:5.1f}% + promosse {100*prom/600:5.1f}% = "
          f"{100*(ok+prom)/600:5.1f}% «non e' un errore del collocatore»")

d = (RIS["V3 (pesi per tipo)"][0] + RIS["V3 (pesi per tipo)"][1]) - \
    (RIS["V1 (pesi grezzi)"][0] + RIS["V1 (pesi grezzi)"][1])
print(f"\n  differenza V3 - V1 sul conto corretto: {d:+d} casi ({100*d/600:+.1f} punti)")
if d > 0:
    print("  -> col conto corretto V3 BATTE V1: il trade-off del banco era falso.")
elif d == 0:
    print("  -> pari: il banco non era ingiusto, semplicemente V3 non porta niente in piu'.")
else:
    print("  -> V1 resta avanti anche col conto corretto: il banco aveva ragione.")

# qualche esempio letto
print("\n" + "=" * 100)
print("QUALCHE PROMOZIONE, LETTA")
print("=" * 100)
TIT, _ = B.titoli_leggibili()
conta = 0
for k in range(600):
    if pred_v3[k] == vere[k]:
        continue
    if S[k, int(pred_v3[k])] > S[k, int(vere[k])]:
        print(f"  {TIT[tolti[k]][:34]:<36} vera bolla {int(vere[k]):>4} "
              f"(sim {S[k, int(vere[k])]:.3f}) -> predetta {int(pred_v3[k]):>4} "
              f"(sim {S[k, int(pred_v3[k])]:.3f})")
        print(f"     nella vera: {[TIT[x][:20] for x in MEMBRI[int(vere[k])][:3]]}")
        print(f"     nella predetta: {[TIT[x][:20] for x in MEMBRI[int(pred_v3[k])][:3]]}")
        conta += 1
        if conta >= 8:
            break
print(f"\nFINE ({time.time()-T0:.0f}s)")
