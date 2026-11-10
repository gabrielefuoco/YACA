import os, sys, psutil, time, gc
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

def get_rss_mb():
    gc.collect()
    return psutil.Process().memory_info().rss / (1024 * 1024)

rss_start = get_rss_mb()
print(f"1. RSS Iniziale (processo nudo): {rss_start:.2f} MB")

# Carica Canone
from graph import canon as K
keys, row_of, N, is_tv = K.titoli()
meta = K.metadati()
rss_canon = get_rss_mb()
print(f"2. RSS dopo metadati canone ({N:,} nodi): {rss_canon:.2f} MB (delta: +{rss_canon - rss_start:.2f} MB)")

# Carica Transizione
from graph.runtime import Engine
t0 = time.perf_counter()
engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
rss_trans = get_rss_mb()
print(f"3. RSS dopo transizione (Tr {engine.Tr.nnz:,} archi, {time.perf_counter()-t0:.2f}s): {rss_trans:.2f} MB (delta: +{rss_trans - rss_canon:.2f} MB)")

# Carica Vicini
from graph.interessi import carica_matrice_affinita, scaffali
t0 = time.perf_counter()
W_aff = carica_matrice_affinita("services/graph/data/v45-vicini100/vicini-top100.npz")
rss_vicini = get_rss_mb()
print(f"4. RSS dopo vicini-top100 (W {W_aff.nnz:,} archi, {time.perf_counter()-t0:.2f}s): {rss_vicini:.2f} MB (delta: +{rss_vicini - rss_trans:.2f} MB)")

# Carica Assi
from graph import assi as _assi
t0 = time.perf_counter()
tono, comp = _assi.carica_assi("services/graph/data/assi-canone.npz")
rss_assi = get_rss_mb()
print(f"5. RSS dopo assi-canone ({len(tono):,} nodi, {time.perf_counter()-t0:.3f}s): {rss_assi:.2f} MB (delta: +{rss_assi - rss_vicini:.2f} MB)")

# Chiamata /scaffali su warnok (476 semi)
chiavi, _, plays, eta = K.storia_trakt("warnok", ordine="recente")
semi = [{"key": str(k), "plays": float(pl), "eta_giorni": float(et)} for k, pl, et in zip(chiavi, plays, eta)]
print(f"\nCaricati {len(semi)} semi per warnok.")

rss_before_call = get_rss_mb()
t0 = time.perf_counter()
shs = scaffali(engine=engine, semi=semi, n=8, W_aff=W_aff, tono=0.2, complessita=0.1)
t_elapsed = time.perf_counter() - t0
rss_after_call = get_rss_mb()

# Picco massimo durante 5 iterazioni
peak_rss = rss_after_call
for it in range(5):
    shs = scaffali(engine=engine, semi=semi, n=8, W_aff=W_aff, tono=0.2, complessita=0.1)
    cur = psutil.Process().memory_info().rss / (1024 * 1024)
    if cur > peak_rss: peak_rss = cur

print(f"\n=== RISULTATI MISURAZIONE RSS CON 3 ARTEFATTI ===")
print(f"Righe restituite: {len(shs)}")
print(f"Tempo esecuzione scaffali(): {t_elapsed:.2f}s")
print(f"RSS a riposo (server pronto con 3 artefatti): {rss_assi:.2f} MB")
print(f"RSS dopo prima richiesta: {rss_after_call:.2f} MB")
print(f"Peak RSS misurato: {peak_rss:.2f} MB")
print(f"Distanza dalla soglia 400 MB: {400.0 - peak_rss:.2f} MB di margine")
print(f"Distanza dal limite container 512 MB: {512.0 - peak_rss:.2f} MB di headroom")
