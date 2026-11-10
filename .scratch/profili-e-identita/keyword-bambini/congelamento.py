"""congelamento.py — Congela l'artefatto della blacklist Bambini con provenienza.

COMANDO DA ESEGUIRE DOPO L'APPROVAZIONE UMANA:
  py .scratch/profili-e-identita/keyword-bambini/congelamento.py --conferma

NOTA: NON ESEGUIRE QUESTO SCRIPT PRIMA CHE L'UTENTE ABBIA REVISIONATO
E APPROVATO L'ELENCO IN `elenco-da-approvare.md`.
"""
import argparse
import datetime
import hashlib
import json
import sys
from pathlib import Path
import numpy as np

# ==============================================================================
# CONFIGURAZIONE APPROVAZIONE (Modifica di una sola riga):
# Cambiare o estendere la lista per includere i gruppi o keyword approvati:
# Esempio per includere tutto il gruppo B: GRUPPI_APPROVATI = ['A', 'B']
# ==============================================================================
GRUPPI_APPROVATI = ['A', 'B']

# Per approvare puntualmente singole keyword da Gruppo B senza approvarlo in blocco:
KEYWORD_PUNTUALI_APPROVATE = []
# ==============================================================================

REPO_ROOT = Path(__file__).resolve().parents[3]
CURR_DIR = Path(__file__).resolve().parent
TARGET_DIR = REPO_ROOT / 'services/graph/data/keyword-bambini'
sys.path.insert(0, str(CURR_DIR))


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description="Congela la blacklist per la modalità Bambini.")
    parser.add_argument('--conferma', action='store_true',
                        help="Conferma l'esecuzione e scrive l'artefatto in services/graph/data/keyword-bambini/")
    args = parser.parse_args()

    if not args.conferma:
        print("ATTENZIONE: Lo script è in modalità simulazione (dry-run).")
        print("L'artefatto NON è stato congelato perché l'umano deve prima approvare l'elenco.")
        print("\nPer congelare l'artefatto dopo l'approvazione:")
        print("  py .scratch/profili-e-identita/keyword-bambini/congelamento.py --conferma")
        sys.exit(0)

    print("Procedo con il congelamento dell'artefatto approvato...")
    
    # 1. Carica i semi
    from espandi import SEEDS
    
    # 2. Carica i candidati classificati
    classified_path = CURR_DIR / 'classified_candidates.json'
    if not classified_path.exists():
        print(f"Errore: {classified_path} non trovato. Eseguire prima `espandi.py`.")
        sys.exit(1)
        
    candidates = json.loads(classified_path.read_text(encoding='utf-8'))
    
    # Seleziona keyword approvate
    approved_expanded = [
        c['keyword'] for c in candidates
        if c['group'] in GRUPPI_APPROVATI or c['keyword'] in KEYWORD_PUNTUALI_APPROVATE
    ]
    
    blacklist_totale = sorted(list(set(SEEDS + approved_expanded)))
    
    # 3. Provenienza e metadati
    emb_path = REPO_ROOT / 'services/graph_dense/data/embeddings/kwsem-qwen3-0.6b.npz'
    kw_txt_path = REPO_ROOT / 'services/graph_dense/data/kw-emb.txt'
    v_path = REPO_ROOT / 'services/graph/data/kw-tfidf/vocab.json'
    t_path = REPO_ROOT / 'services/graph/data/kw-tfidf/tfidf.npz'
    semi_doc = CURR_DIR / 'semi.md'
    
    inputs_sha = {
        'semi.md': sha256_file(semi_doc) if semi_doc.exists() else 'none',
        'kwsem-qwen3-0.6b.npz': sha256_file(emb_path),
        'kw-emb.txt': sha256_file(kw_txt_path),
        'vocab.json': sha256_file(v_path),
        'tfidf.npz': sha256_file(t_path)
    }
    
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    meta = {
        "step": "keyword_bambini_blacklist",
        "date": now_iso,
        "embedding_version": "Qwen/Qwen3-Embedding-0.6B (kwsem-qwen3-0.6b.npz)",
        "canon_size": 76497,
        "seeds": SEEDS,
        "groups": GRUPPI_APPROVATI,
        "counts": {
            "seeds": len(SEEDS),
            "group_a": len([c for c in candidates if c['group'] == 'A']),
            "group_b": len([c for c in candidates if c['group'] == 'B']),
            "approved_expanded": len(approved_expanded),
            "total_blacklist": len(blacklist_totale)
        },
        "comment": (
            "ATTENZIONE / RISCHIO GRUPPO B: L'inclusione in blocco del Gruppo B introduce "
            "esclusioni collaterali su film per bambini e famiglie. Ad esempio: 'drugs' "
            "esclude la commedia per famiglie 'Un piedipiatti e mezzo' (PG), 'cruelty' esclude "
            "'Cenerentola' (2015, T/PG), 'child kidnapping' esclude 'Labyrinth' e 'Baby Birba', "
            "'prisoner' esclude 'Il mago di Oz'. Valutare una rifinitura manuale se necessario."
        ),
        "inputs": inputs_sha
    }
    
    # Calcolo impronta complessiva dei metadati
    meta_str = json.dumps(meta, sort_keys=True, ensure_ascii=False)
    meta_sha = hashlib.sha256(meta_str.encode('utf-8')).hexdigest()
    meta["sha256"] = meta_sha
    
    artifact = {
        "meta": meta,
        "_provenance": meta,
        "blacklist": blacklist_totale
    }
    
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    out_json = TARGET_DIR / 'blacklist.json'
    out_json.write_text(json.dumps(artifact, indent=2, ensure_ascii=False), encoding='utf-8')
    
    print(f"Artefatto congelato con successo:")
    print(f"  Percorso: {out_json}")
    print(f"  Totale keyword vietate: {len(blacklist_totale)} (semi: {len(SEEDS)}, espanse: {len(approved_expanded)})")
    print(f"  Impronta SHA256: {meta_sha}")


if __name__ == '__main__':
    main()
