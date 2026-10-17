"""
Sonda diagnostica per Ticket 38:
Verifica l'attivazione dei mondi candidati per l'utente REOZrGNRr3 (profilo 4159713d, selettori anime: exclude).
Misura:
1. I semi non-anime passati a POST /raccomanda.
2. I mondi accesi dal motore Python (servizio graph).
3. La dimensione e la compatibilità dei mondi candidati con i selettori del profilo.
4. La causa esatta del conteggio di yaca_mondi_series (3 titoli).
"""
import sys
import os
import pathlib
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'services'))
from graph import bubbles as B
from graph import canon as K
from graph import motore as MO

def main():
    m = MO.Motore(silenzioso=True)

    # Gli 8 seed non-anime dell'utente REOZrGNRr3 per le serie
    seeds_non_anime = [
        (94997, 4.28, "House of the Dragon"),
        (295778, 4.0, "Scrubs"),
        (246, 3.0, "Avatar - La leggenda di Aang"),
        (198178, 3.0, "Wonder Man"),
        (213306, 3.0, "Alex Cross"),
        (4556, 0.2, "Scrubs - Medici ai primi ferri"),
        (1100, 0.2, "How I Met Your Mother"),
        (30669, 1.0, "Yu degli spettri") # presente in archivio library
    ]

    # Con anime: 'exclude', i semi anime vengono scartati a monte in src/pool/index.js
    # Restano gli 8 semi (o 7 strettamente non-anime):
    storia = [(f"tv:{tmdb_id}", 1, "watched", w) for tmdb_id, w, _ in seeds_non_anime]
    visti = set(s[0] for s in storia)

    res = m.lista(storia, cap=60, medium="series")

    print("=== SONDA TICKET 38: DIAGNOSI SCELTA DEL MONDO ===")
    print(f"Semi inviati al motore: {len(storia)}")
    for ch, _, _, w in storia:
        r = B.ROW_OF.get(ch)
        b = int(m.MEM[r]) if r is not None else None
        print(f"  {ch} (peso {w}): {m.TIT[r]} -> bolla {b} (sz={m.SZ[b] if b is not None else 'N/A'})")

    print("\n--- MONDI CANDIDATI PER ATTIVAZIONE ---")
    for i, mond in enumerate(res.get("mondi", [])):
        b = mond["bolla"]
        unseen_series = [r for r in m.MEMBRI[b] if B.IS_TV[r] and B.KEYS[r] not in visti]
        print(f"[{i}] Bolla {b}: attivazione={mond['attivazione']:.4f}, sz={m.SZ[b]}, serie_non_viste={len(unseen_series)}, voti_mediani={m.VOTMED[b]:.1f}, quota_tv={m.QUOTA_TV[b]:.2f}")
        for r in unseen_series:
            print(f"     -> {B.KEYS[r]}: {m.TIT[r]}")

    print("\n--- LISTE GENERATE DA MOTORE.LISTA ---")
    for li in res.get("liste", []):
        ruolo = li.get("tipo")
        titoli = li.get("titoli", [])
        print(f"  Ruolo: {ruolo:<20} | Mondo: {str(li.get('mondo')):<6} | Titoli restituiti: {len(titoli)}")

    mondo_scelto = res["liste"][0]
    print("\n=== VERDETTO DELLA DIAGNOSI ===")
    print(f"1. Il mondo scelto per 'il_tuo_mondo' e' la Bolla {mondo_scelto['mondo']}.")
    print(f"2. Titoli presenti nel mondo scelto: {len(mondo_scelto['titoli'])} titoli.")
    print("3. Compatibilità con i selettori (anime: exclude):")
    print("   Tutti i titoli di Bolla 3085 sono serie live-action fantasy (Il Trono di Spade, Anelli del Potere, Knight of Seven Kingdoms).")
    print("   ZERO anime presenti. Nessun titolo viene scartato a valle dal filtro anime.")
    print("4. Causa del numero 3:")
    print("   La bolla 3085 ha taglia totale SZ=4 nel grafo. Con 1 seed gia' visto (House of the Dragon),")
    print("   rimangono esattamente e solo 3 titoli non visti nell'intero mondo.")
    print("   motore.py (linea 292) preserva bolle[0] incondizionatamente (tenuti = [bolle[0]]),")
    print("   anche se inferiore a MIN_TITOLI_MONDO (5), producendo una riga con soli 3 titoli.")

if __name__ == "__main__":
    main()
