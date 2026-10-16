"""parametri-nei-file.py — gli step leggono i parametri da `parametri.py` (ticket 13).

Due cose che fa e che una modifica a mano non garantirebbe:
  1. ogni rimpiazzo e' verificato (un'ancora sbagliata lascerebbe un numero cablato vivo, e il ticket e'
     chiuso solo se non ne resta nessuno);
  2. aggiunge l'import di `parametri` SOLO dove manca, e controlla che il file compili ancora.

E una cosa che NON fa: non cambia nessun VALORE. I default che finiscono nell'import sono quelli con cui
gli artefatti attuali sono stati costruiti — se sotto i valori cambiano, il refactor ha sbagliato.
"""
import pathlib
import re
import sys

BASE = pathlib.Path(__file__).resolve().parent.parent.parent
IMPORT = "from graph import parametri as P"

# (file, vecchio, nuovo) — il vecchio deve comparire esattamente una volta
CASI = [
("graph/steps/00_embedding_trame.py",
 'MOD = "qwen3-embedding:0.6b"', "MOD = P.MOD_EMBEDDING"),
("graph/steps/01_componente_trama.py", "TOPK = 30", "TOPK = P.TRAMA_TOPK"),
("graph/steps/01_componente_trama.py", "SOGLIA = 0.30", "SOGLIA = P.TRAMA_SOGLIA"),
("graph/steps/01_componente_trama.py", "BLOCCO = 2000", "BLOCCO = P.TRAMA_BLOCCO"),
("graph/steps/02_partizione.py",
 'RES = int(__import__("os").environ.get("RES", "100"))',
 'RES = int(__import__("os").environ.get("RES", str(P.PARTIZIONE_RES)))'),
("graph/steps/02_partizione.py",
 'PESI = [float(x) for x in (sys.argv[1:] or ["1.0"])]',
 "PESI = [float(x) for x in (sys.argv[1:] or [str(_p) for _p in P.PARTIZIONE_PESI])]"),
("graph/steps/02_partizione.py",
 "C = B.carica_componenti(con_shrinkage=True, min_sim_kw=0.12, min_sim_cast=0.02,",
 "C = B.carica_componenti(con_shrinkage=True, min_sim_kw=P.PARTIZIONE_MIN_SIM_KW,\n"
 "                        min_sim_cast=P.PARTIZIONE_MIN_SIM_CAST,"),
("graph/steps/03_divisione_voti.py",
 "SPREAD_MIN = float(sys.argv[1]) if len(sys.argv) > 1 else 10.0",
 "SPREAD_MIN = float(sys.argv[1]) if len(sys.argv) > 1 else P.VOTI_SPREAD_MIN"),
("graph/steps/03_divisione_voti.py",
 "MIN_MEMBRI = int(sys.argv[2]) if len(sys.argv) > 2 else 15",
 "MIN_MEMBRI = int(sys.argv[2]) if len(sys.argv) > 2 else P.VOTI_MIN_MEMBRI"),
("graph/steps/03_divisione_voti.py",
 "RISOLUZIONI = (0.05, 0.1, 0.2, 0.4, 0.8)", "RISOLUZIONI = tuple(P.VOTI_RISOLUZIONI)"),
("graph/steps/04_centroidi.py", "MIN_MEMBRI = 5", "MIN_MEMBRI = P.CENTROIDI_MIN_MEMBRI"),
("graph/steps/05_centroidi_v3.py", "DF_MIN = 3", "DF_MIN = P.V3_DF_MIN"),
("graph/steps/05_centroidi_v3.py", "TETTO = 20.0", "TETTO = P.V3_TETTO_IDF"),
("graph/steps/05_centroidi_v3.py",
 'PESI = {"ge:": 1.5, "rt:": 1.5, "co:": 0.4, "ca:": 0.4, "di:": 0.8}',
 "PESI = dict(P.PESI_TOKEN)          # LA FONTE E' UNA: era il ticket 13"),
("graph/steps/06_mappa.py", "K_INTRA, K_CROSS = 6, 2", "K_INTRA, K_CROSS = P.MAPPA_INTRA, P.MAPPA_CROSS"),
("graph/collocator.py",
 'PESI_TIPO = {"ge:": 1.5, "rt:": 1.5, "co:": 0.4, "ca:": 0.4, "di:": 0.8}   # V3, ticket 05',
 "PESI_TIPO = dict(P.PESI_TOKEN)     # LA FONTE E' UNA: era scritto anche in steps/05"),
("graph/collocator.py",
 "MARGINE = 1.0          # il film deve battere il migliore serie di questo fattore (ticket 03)",
 "MARGINE = P.COLLOCA_MARGINE        # il film deve battere la migliore serie di questo fattore"),
("graph/collocator.py",
 "FATTORE_VOTI = 10.0    # la regola dei voti: [V/10, V*10] — il ticket 09 di `eterogeneo`",
 "FATTORE_VOTI = P.COLLOCA_FATTORE_VOTI   # la regola dei voti: mediana in [V/10, V*10]"),
]

if __name__ == "__main__":
    fatti, toccati = 0, set()
    for nome, vecchio, nuovo in CASI:
        p = BASE / nome
        t = p.read_text(encoding="utf-8")
        n = t.count(vecchio)
        if n != 1:
            print(f"  !! {nome}: l'ancora compare {n} volte (atteso 1) — salto")
            continue
        t = t.replace(vecchio, nuovo, 1)
        if IMPORT not in t:
            # l'import va DOPO l'ultimo `from graph import ...`, per non spezzare il blocco
            righe = t.split("\n")
            pos = max((i for i, r in enumerate(righe) if r.startswith("from graph import")), default=None)
            if pos is None:
                print(f"  !! {nome}: non trovo dove mettere l'import — salto")
                continue
            righe.insert(pos + 1, IMPORT)
            t = "\n".join(righe)
        p.write_text(t, encoding="utf-8")
        try:
            import py_compile
            py_compile.compile(str(p), doraise=True)
        except Exception as e:
            print(f"  !! {nome}: non compila — RIMETTO A POSTO ({str(e)[:60]})")
            p.write_text(p.read_text(encoding="utf-8").replace(nuovo, vecchio, 1), encoding="utf-8")
            continue
        toccati.add(nome)
        fatti += 1
    # l'import puo' essere stato inserito piu' volte se un file ha piu' rimpiazzi: si controlla
    for nome in sorted(toccati):
        p = BASE / nome
        t = p.read_text(encoding="utf-8")
        if t.count(IMPORT) > 1:
            p.write_text(t.replace(IMPORT + "\n", "", t.count(IMPORT) - 1), encoding="utf-8")
            print(f"  {nome}: import ripetuto {t.count(IMPORT)}x, ridotto a 1")
    print(f"\n  rimpiazzi: {fatti}/{len(CASI)} · file toccati: {len(toccati)}")
    if fatti != len(CASI):
        sys.exit(1)
