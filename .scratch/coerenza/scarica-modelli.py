"""scarica-modelli.py — i due candidati per l'embedding multilingue, via Ollama.

Il duello: `qwen3-embedding:0.6b` (596M, 1024 dim, 32k contesto, instruction-aware: e' il modello
migliore della sua classe sul multilingue) contro `bge-m3` (568M, 1024 dim, 8k contesto, 100+ lingue,
e fa dense+sparse+ColBERT).

Si scaricano entrambi e si MISURANO sulle coppie a risposta nota: la trama italiana e' il caso di
prova, e la domanda e' se separano dove `bge-small-en` comprimeva tutto in 0,74 ± 0,01.
"""
import subprocess, sys, time
for m in ("qwen3-embedding:0.6b", "bge-m3"):
    t = time.time()
    print(f"[{time.strftime('%H:%M:%S')}] pull {m}", flush=True)
    r = subprocess.run(["ollama", "pull", m], capture_output=True, text=True)
    print(f"  esito {r.returncode} in {time.time()-t:.0f}s", flush=True)
    if r.returncode != 0:
        print(f"  stderr: {r.stderr[-400:]}", flush=True)
    else:
        print(f"  {r.stdout.strip().splitlines()[-1][:120] if r.stdout.strip() else ''}", flush=True)
print("FINE", flush=True)
