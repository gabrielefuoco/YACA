"""cambia-coda.py — riscrive la coda di ottimizza-1.py per leggere le configurazioni da JSON."""
import json, pathlib, sys

p = pathlib.Path(".scratch/ml-collaborativo/ottimizza-1.py")
s = p.read_text(encoding="utf-8")
i = s.index('EQ = {"CF": 1, "CFst": 1, "Kc": 1, "B": 1, "T": 1}')
nuovo = '''import json as _j, sys as _s
CONF = _j.loads(pathlib.Path(_s.argv[1]).read_text(encoding="utf-8"))
for c in CONF:
    valuta_tutto(c["pesi"], c["wc"], c["beta"], c["k"], c["nome"])
print(f"\\nFINE ({time.time()-t0:.0f}s)")
'''
p.write_text(s[:i] + nuovo, encoding="utf-8")
print("coda riscritta: le configurazioni arrivano da", sys.argv[1] if len(sys.argv) > 1 else "argv[1]")
