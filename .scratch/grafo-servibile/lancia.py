"""lancia.py — avvia uno script STACCATO dalla shell, cosi' non muore con la chiamata.

Perche' esiste: `nohup ... &` dentro lo strumento di shell non basta — il processo viene ucciso
quando la chiamata finisce (verificato: il ticket 01 e' morto senza traceback a meta' camminata).
Su Windows il modo giusto e' DETACHED_PROCESS + un gruppo di processo nuovo.

Uso:  python .scratch/grafo-servibile/lancia.py <script.py> [argomenti...]
      il log finisce in .scratch/grafo-servibile/log/<script>.log
"""
import pathlib, subprocess, sys

QUI = pathlib.Path(__file__).resolve().parent
PY = pathlib.Path("offline_graph_builder/venv/Scripts/python.exe").resolve()
LOG = QUI / "log"
LOG.mkdir(exist_ok=True)

script = pathlib.Path(sys.argv[1])
nome = script.stem + (("-" + "-".join(sys.argv[2:])) if len(sys.argv) > 2 else "")
log = LOG / f"{nome}.log"

DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_NO_WINDOW = 0x08000000

with open(log, "w", encoding="utf-8") as f:
    p = subprocess.Popen([str(PY), str(script)] + sys.argv[2:],
                         stdout=f, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                         cwd=str(pathlib.Path.cwd()),
                         creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW,
                         close_fds=True)
print(f"avviato pid {p.pid} -> {log}")
