"""contrastivo.py — L'ENCODER CONTRASTIVO AL POSTO DEL RIDGE (idea dell'utente).

IL DIFETTO DA CORREGGERE. Le keyword sono l'unico aggancio per un titolo senza comportamento,
ma l'aggancio e' spuntato: lo stesso film, nativo, fa 45,95% @500; fatto nascere, 3,92% —
fattore 12. La causa sta in COME sono mappate sul comportamento:

    Pc = Ridge(alpha=30).fit(FX, Zs).predict(FX)

Il Ridge minimizza l'errore QUADRATICO, e il minimizzatore e' la MEDIA CONDIZIONALE: per ogni
configurazione di keyword predice il baricentro dei comportamenti compatibili. E' un lisciatore
— e infatti la correlazione con le keyword pure e' 0,169.

COSA CAMBIA CON InfoNCE. Non si chiede di riprodurre le coordinate: si chiede che il bersaglio
giusto stia SOPRA quelli sbagliati. Nessuna media da indovinare, un ORDINE da rispettare, quindi
si conservano le direzioni che discriminano.

    encoder f : TF-IDF(7934) -> 512 -> 128
    positivi  : il vettore CF del film + i suoi 5 vicini di comportamento
    negativi  : gli altri film con comportamento nel lotto
    perdita   : InfoNCE multi-positivo

Poi f si applica a TUTTE le keyword: le 16.550 serie ricevono una posizione in quello spazio,
che e' l'unica cosa che possono avere. Salva `.cache/movielens/spazio-contrastivo.npz`.
"""
import pathlib, os, time
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from scipy.sparse import load_npz

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
DIM, KPOS, TAU = 128, 5, 0.10
EPOCHE, BATCH, SEED = 60, 512, 0
torch.manual_seed(SEED)
np.random.seed(SEED)
# HOLDOUT=1: l'encoder NON vede in training i 5.000 film che il banco fa nascere.
# Senza questo, i numeri di E2 sono ottimistici: l'encoder puo' averli memorizzati.
HOLDOUT = os.environ.get("YACA_HOLDOUT", "") == "1"
OUT = os.environ.get("YACA_OUT_SPAZIO", "spazio-contrastivo.npz")

Ftf = load_npz(ML / "spazi-trakt-tfidf.npz").tocsr().astype(np.float32)
n, d_in = Ftf.shape
Cf = np.load(ML / "cf-spazio.npz")["Cf"]
Cfn = (Cf / (np.linalg.norm(Cf, axis=1, keepdims=True) + 1e-9)).astype(np.float32)
ha = np.linalg.norm(Cf, axis=1) > 1e-6
idx_ha = np.where(ha)[0]
if HOLDOUT:
    tutti = idx_ha.copy()
    escl = np.random.default_rng(41).choice(tutti, size=5000, replace=False)
    idx_ha = np.setdiff1d(tutti, escl)
    print(f"HOLDOUT: l'encoder allena su {len(idx_ha):,} film, ne esclude {len(escl):,} "
          f"(quelli che il banco fa nascere)")
loc = np.full(n, -1, np.int64)
loc[idx_ha] = np.arange(len(idx_ha))
print(f"TF-IDF {Ftf.shape} · nnz {Ftf.nnz:,} · film con comportamento {len(idx_ha):,} ({time.time()-t0:.0f}s)")

CACHE = ML / ("cf-vicini-holdout.npz" if HOLDOUT else "cf-vicini.npz")
if CACHE.exists():
    NBL = np.load(CACHE)["NBL"]
    print(f"vicini di comportamento da cache: {NBL.shape}")
else:
    Csub = Cfn[idx_ha].astype(np.float64)
    NBg = np.empty((len(idx_ha), KPOS), np.int32)
    for i in range(0, len(idx_ha), 2000):
        sim = Csub[i:i + 2000] @ Csub.T
        for r in range(sim.shape[0]):
            sim[r, i + r] = -9
        NBg[i:i + 2000] = idx_ha[np.argpartition(-sim, KPOS, axis=1)[:, :KPOS]]
    NBL = loc[NBg].astype(np.int64)
    np.savez_compressed(CACHE, NBL=NBL)
    print(f"vicini di comportamento calcolati ({time.time()-t0:.0f}s)")

Tgt = torch.from_numpy(Cfn[idx_ha])          # (M, 128) solo chi ha comportamento


def densifica(righe):
    return torch.from_numpy(Ftf[righe].toarray())


class Enc(nn.Module):
    def __init__(self):
        super().__init__()
        self.l1 = nn.Linear(d_in, 512)
        self.l2 = nn.Linear(512, DIM)
        self.do = nn.Dropout(0.10)

    def forward(self, x):
        return self.l2(self.do(F.relu(self.l1(x))))


enc = Enc()
opt = torch.optim.AdamW(enc.parameters(), lr=2e-3, weight_decay=1e-4)
sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=EPOCHE)
print(f"parametri: {sum(p.numel() for p in enc.parameters()):,} · negativi per lotto {len(idx_ha):,} "
      f"({time.time()-t0:.0f}s)")

rng = np.random.default_rng(SEED)
for ep in range(1, EPOCHE + 1):
    ordine = rng.permutation(len(idx_ha))
    tot = nb = 0
    for a in range(0, len(ordine), BATCH):
        sel_l = ordine[a:a + BATCH]
        x = densifica(idx_ha[sel_l])
        z = F.normalize(enc(x), dim=1)
        pos_l = np.concatenate([sel_l[:, None], NBL[sel_l]], axis=1)      # (B, 1+K)
        pos = Tgt[torch.from_numpy(pos_l.reshape(-1))].reshape(len(sel_l), 1 + KPOS, DIM)
        logits = z @ Tgt.T / TAU                                          # (B, M)
        perdita = (torch.logsumexp(logits, dim=1)
                   - torch.logsumexp((pos @ z.unsqueeze(-1)).squeeze(-1) / TAU, dim=1)).mean()
        opt.zero_grad()
        perdita.backward()
        opt.step()
        tot += float(perdita)
        nb += 1
    sched.step()
    if ep % 5 == 0 or ep == 1:
        print(f"  epoca {ep:>3}/{EPOCHE} · perdita {tot/nb:.4f} · ({time.time()-t0:.0f}s)", flush=True)

enc.eval()
Z = np.zeros((n, DIM), np.float32)
with torch.no_grad():
    for a in range(0, n, 4096):
        Z[a:a + 4096] = enc(densifica(np.arange(a, min(a + 4096, n)))).numpy()
Zn = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
np.savez_compressed(ML / OUT, P=Zn)
print(f"\nspazio contrastivo salvato: {ML/OUT} {Zn.shape} ({time.time()-t0:.0f}s)")

# --- controlli ---
z2 = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
is_tv = z2["tipo"] == "tv"
print("")
print("CONTROLLO 1 — copertura: nessun titolo resta a zero?")
print(f"  vettori nulli: {int((np.linalg.norm(Zn,axis=1)<1e-6).sum()):,}/{n:,} "
      f"· serie con vettore {int((np.linalg.norm(Zn[is_tv],axis=1)>1e-6).sum()):,}/{int(is_tv.sum()):,}")

print("")
print("CONTROLLO 2 — le keyword contrastive 'vedono' il comportamento? (sui film che ce l'hanno)")
camp = rng.choice(idx_ha, 1000, replace=False)
zu = Zn[camp].astype(np.float64)
cf = Cfn[idx_ha].astype(np.float64)
sim = zu @ cf.T
for i, c in enumerate(camp):
    sim[i, loc[c]] = -9
top = np.argmax(sim, axis=1)
vero = np.array([loc[c] for c in camp])
print(f"  il vicino piu' forte del vettore-keyword e' il film col comportamento piu' simile: "
      f"{100*float(np.mean([np.dot(cf[top[i]], cf[vero[i]]) > 0.5 for i in range(len(camp))])):.1f}%")

print("")
print("CONTROLLO 3 — e soprattutto: una SERIE finisce vicina ai FILM giusti?")
nf = np.where(~is_tv)[0]
sub = Zn[is_tv][:500].astype(np.float64)
s = sub @ Zn[nf].T
print(f"  per 500 serie: similarita' mediana col FILM piu' vicino {np.median(s.max(1)):.3f}")
print(f"  mediana con un film a caso {np.median(s):.3f}  -> lift {np.median(s.max(1))/max(np.median(s),1e-9):.1f}x")
print(f"\n({time.time()-t0:.0f}s)")
