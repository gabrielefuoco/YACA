import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".scratch"))

from compute_census_table import theme_stats

sorted_themes = sorted(theme_stats.items(), key=lambda x: -x[1]["total_mass"])

print("| Tema ricorrente | Semi totali | Massa totale | Nuova voce tassonomica? | Profili coinvolti |")
print("| :--- | :---: | :---: | :--- | :--- |")
for th, st in sorted_themes:
    if th == "Altro non classificato":
        entry_status = "No (coda non coerente)"
    elif th in ("Teen sitcom & Disney/Nickelodeon", "Documentari di scoperta & Ingegneria", "Anime mecha & robot"):
        entry_status = "No (< 15 semi)"
    else:
        entry_status = "**Sì** (regola stretta)"
    profs = ", ".join(sorted(st["profiles"]))
    print(f"| {th} | {st['total_seeds']} | {st['total_mass']:.1f} | {entry_status} | {profs} |")
