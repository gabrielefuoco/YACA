"""measure_v45_server.py — Misura peak RSS e p50/p95 su 30 richieste sequenziali per /scaffali e /raccomanda."""
import http.client
import json
import os
import sys
import threading
import time
from pathlib import Path

import numpy as np
import psutil

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services"))

from graph import canon as K
from graph import servizio

def main():
    proc = psutil.Process()
    rss_start = proc.memory_info().rss / (1024 * 1024)
    print(f"RSS iniziale (processo vuoto): {rss_start:.2f} MiB")

    # Avvia server HTTP servizio.py
    server, _ = servizio.crea_server(host="127.0.0.1", port=0)
    port = server.server_address[1]
    th = threading.Thread(target=server.serve_forever, daemon=True)
    th.start()

    rss_after_server = proc.memory_info().rss / (1024 * 1024)
    print(f"RSS dopo avvio server (V45 engine precaricato): {rss_after_server:.2f} MiB")

    # Prepariamo i semi di warnok
    chiavi, _, plays, eta = K.storia_trakt("warnok", ordine="recente")
    warnok_semi = [
        {"key": str(k), "plays": float(pl), "eta_giorni": float(et)}
        for k, pl, et in zip(chiavi, plays, eta)
    ]
    payload_scaffali = json.dumps({"semi": warnok_semi, "n": 8}).encode("utf-8")
    payload_raccomanda = json.dumps({
        "semi": [{"key": str(k), "tipo": "watched", "peso": float(pl)} for k, pl in zip(chiavi[:30], plays[:30])],
        "cap": 30
    }).encode("utf-8")

    # 1. Warm-up scaffali
    print("\n--- Warm-up /scaffali ---")
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
    t0 = time.perf_counter()
    conn.request("POST", "/scaffali", body=payload_scaffali, headers={"Content-Type": "application/json"})
    resp = conn.getresponse()
    data = json.loads(resp.read().decode("utf-8"))
    elapsed_warmup = time.perf_counter() - t0
    conn.close()
    assert resp.status == 200, f"Status errato: {resp.status}"
    print(f"Warm-up /scaffali completato in {elapsed_warmup:.3f} s (scaffali: {len(data['scaffali'])})")

    rss_after_warmup = proc.memory_info().rss / (1024 * 1024)
    print(f"RSS dopo warm-up (artefatto vicini-top100 caricato): {rss_after_warmup:.2f} MiB")

    # 2. 30 richieste sequenziali /scaffali
    print("\n--- Esecuzione 30 richieste /scaffali su warnok ---")
    latencies_scaffali = []
    for i in range(30):
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
        t0 = time.perf_counter()
        conn.request("POST", "/scaffali", body=payload_scaffali, headers={"Content-Type": "application/json"})
        resp = conn.getresponse()
        d = json.loads(resp.read().decode("utf-8"))
        lat = time.perf_counter() - t0
        conn.close()
        assert resp.status == 200
        latencies_scaffali.append(lat)
        if (i + 1) % 5 == 0:
            print(f"  Req {i+1:2d}/30: {lat:.3f} s")

    p50_scaffali = float(np.percentile(latencies_scaffali, 50))
    p95_scaffali = float(np.percentile(latencies_scaffali, 95))
    p99_scaffali = float(np.percentile(latencies_scaffali, 99))
    print(f"\nRisultati /scaffali (30 run): p50={p50_scaffali:.3f} s, p95={p95_scaffali:.3f} s, p99={p99_scaffali:.3f} s")

    mem = proc.memory_info()
    peak_rss_scaffali = getattr(mem, "peak_wset", mem.rss) / (1024 * 1024)
    rss_curr_scaffali = mem.rss / (1024 * 1024)
    print(f"RSS corrente: {rss_curr_scaffali:.2f} MiB | Peak RSS (working set): {peak_rss_scaffali:.2f} MiB")

    # 3. 30 richieste sequenziali /raccomanda
    print("\n--- Esecuzione 30 richieste /raccomanda ---")
    latencies_raccomanda = []
    for i in range(30):
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=30)
        t0 = time.perf_counter()
        conn.request("POST", "/raccomanda", body=payload_raccomanda, headers={"Content-Type": "application/json"})
        resp = conn.getresponse()
        d = json.loads(resp.read().decode("utf-8"))
        lat = time.perf_counter() - t0
        conn.close()
        assert resp.status == 200
        latencies_raccomanda.append(lat)
        if (i + 1) % 10 == 0:
            print(f"  Req {i+1:2d}/30: {lat*1000:.1f} ms")

    p50_raccomanda = float(np.percentile(latencies_raccomanda, 50))
    p95_raccomanda = float(np.percentile(latencies_raccomanda, 95))
    print(f"\nRisultati /raccomanda (30 run): p50={p50_raccomanda*1000:.1f} ms, p95={p95_raccomanda*1000:.1f} ms")

    mem_final = proc.memory_info()
    peak_final = getattr(mem_final, "peak_wset", mem_final.rss) / (1024 * 1024)
    rss_final = mem_final.rss / (1024 * 1024)
    print(f"\nRSS finale: {rss_final:.2f} MiB | Peak RSS finale: {peak_final:.2f} MiB")

    server.shutdown()
    server.server_close()

    print("\n=== RIEPILOGO MISURE STANDALONE V45 ===")
    print(f"Peak RSS finale:             {peak_final:.2f} MiB (confronto dual engine precedente: 353.6 MiB)")
    print(f"Headroom in 512 MiB:         {512.0 - peak_final:.2f} MiB")
    print(f"Headroom sotto guardia 400M: {400.0 - peak_final:.2f} MiB")
    print(f"/scaffali:   p50 = {p50_scaffali:.3f} s, p95 = {p95_scaffali:.3f} s")
    print(f"/raccomanda: p50 = {p50_raccomanda*1000:.1f} ms, p95 = {p95_raccomanda*1000:.1f} ms")

if __name__ == "__main__":
    main()
