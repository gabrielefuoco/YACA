"""Genera una pagina leggibile degli scaffali prodotti dal modulo di prodotto.

Uso:  PYTHONPATH=services py .scratch/v45-raccomandazioni-yaca/mostra_scaffali.py

Non decide niente: chiama `graph.interessi.scaffali()` con la ricetta congelata e
scrive quello che esce. Se un profilo rende meno di 6 scaffali, lo scrive.
"""
from __future__ import annotations

import time
from pathlib import Path

from graph import canon as K
from graph.interessi import scaffali
from graph.runtime import Engine

PROFILI = [
    ("warnok", "storia lunga · 476 titoli"),
    ("castoffcrown", "storia lunga · 412 titoli"),
    ("moppierhead", "storia media · 38 titoli"),
    ("carverclan", "storia minima · 7 titoli"),
]

USCITA = Path(__file__).with_name("scaffali-vivi.md")


def main() -> None:
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    md = K.metadati()
    anno_arr, tit_arr = md["ANNO"], md["TIT"]

    def nome_chiave(key: str) -> str:
        r = engine.row_of.get(key)
        if r is None:
            return key
        a = anno_arr[r]
        return f"{tit_arr[r]} ({int(a)})" if a else str(tit_arr[r])
    righe_out = [
        "# Gli scaffali che il motore produce oggi",
        "",
        "Generato da `services/graph/interessi.py` — ricetta congelata, budget 6 righe.",
        "Ogni riga mostra: nome, quanti titoli della storia la sostengono, i 3 titoli più",
        "rappresentativi e i 5 candidati che ne escono.",
        "",
    ]

    for profilo, descrizione in PROFILI:
        chiavi, righe, plays, eta = K.storia_trakt(profilo, ordine="recente")
        semi = [
            {"key": k, "play": float(p), "eta": float(e)}
            for k, p, e in zip(chiavi, plays, eta)
        ]
        t0 = time.time()
        sh = scaffali(engine, semi)
        dt = time.time() - t0
        coperti = sum(s.size for s in sh)
        righe_out += [
            f"## `{profilo}` — {descrizione}",
            "",
            f"{len(sh)} scaffali · {coperti} titoli coperti su {len(chiavi)} · {dt:.1f} s",
            "",
        ]
        if not sh:
            righe_out += ["_Nessuno scaffale: il profilo non ha abbastanza titoli collegati._", ""]
            continue
        for s in sh:
            semi_txt = " · ".join(
                f"{m['titolo']} ({m['anno']})" for m in s.semi_rappresentativi[:3]
            )
            cand_txt = " · ".join(nome_chiave(c["key"]) for c in s.titoli[:5])
            righe_out += [
                f"**{s.slot_position}. {s.nome}**  ",
                f"<sub>{s.size} titoli · {s.medium} · {s.nome_fonte} · "
                f"freschezza {int(s.min_eta)} g · consistenza {s.consistenza:.2f}</sub>",
                "",
                f"- sostengono questa riga: {semi_txt}",
                f"- candidati: {cand_txt}",
                "",
            ]

    USCITA.write_text("\n".join(righe_out), encoding="utf-8")
    print(f"scritto {USCITA}")


if __name__ == "__main__":
    main()
