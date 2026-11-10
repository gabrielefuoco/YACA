"""espandi.py — Espansione dei semi keyword per la modalità Bambini.

Legge gli embedding esistenti in repo (kwsem-qwen3-0.6b.npz / kw-emb.txt)
e calcola per ogni candidato la distanza coseno dal seme più vicino
e il numero di titoli del canone che lo portano (da kw-tfidf/tfidf.npz).
Genera:
  - .scratch/profili-e-identita/keyword-bambini/elenco-da-approvare.md
  - .scratch/profili-e-identita/keyword-bambini/casi-di-scuola.md
"""
import json
import time
from pathlib import Path
import numpy as np
import scipy.sparse as sp

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = Path(__file__).resolve().parent

# --- 1. I 62 SEMI STRETTI ---
SEEDS = [
    # GORE & MUTILAZIONI
    'gore', 'extreme gore', 'blood and gore', 'splatter', 'splatter horror',
    'dismemberment', 'body mutilation', 'mutilation', 'decapitation', 'beheading',
    'cannibalism', 'self mutilation',
    # TORTURA & SADISMO
    'torture', 'torture chamber', 'sadistic torture', 'sexual torture',
    'waterboarding', 'extreme sadism', 'tortured to death',
    # VIOLENZA SESSUALE & ABUSI
    'rape', 'gang rape', 'attempted rape', 'date rape', 'sexual assault',
    'sexual abuse', 'molestation', 'incest rape', 'prison rape', 'male rape',
    # ABUSO SU MINORI & PEDOFILIA
    'child abuse', 'child sexual abuse', 'child molestation', 'child exploitation',
    'child pornography', 'pedophilia', 'pedophile', 'pedophile priest', 'child prostitution',
    # DROGA & DIPENDENZE PESANTI
    'drug abuse', 'drug addiction', 'drug overdose', 'substance abuse',
    'heroin', 'heroin addict', 'heroin addiction', 'cocaine', 'crack cocaine', 'methamphetamine',
    # SUICIDIO & AUTOLESIONISMO
    'suicide', 'suicidal', 'suicide attempt', 'suicidal thoughts',
    'assisted suicide', 'mass suicide', 'murder-suicide', 'self-harm',
    # PORNOGRAFIA & CONTENUTI ESPLICITI
    'pornography', 'porno', 'pornographic video', 'erotica', 'snuff', 'snuff film'
]

# Regole di classificazione per i candidati dell'espansione (soglia dist <= 0.20, sim >= 0.80)
C_KEYWORDS = {
    # Violenza generica, sangue, morte, omicidio, paura (esclusi per specifica e per preservare LoTR/Stranger Things)
    'violence', 'violent', 'brutal violence', 'gang violence',
    'blood', 'bloody', 'bloody death', 'bloodbath', 'bloodthirsty', 'bloodthirstiness', 'bloody fight', 'blood lust', 'blood bath', 'dripping blood',
    'death', 'deaths', 'deadly', 'violent death', 'brutal death', 'brutal deaths', 'killed', 'dying', 'dead', 'kill', 'deathbed', 'mortality',
    'death sentence', 'death by hanging', 'death by poisoning', 'death incarnate', 'accidental death',
    'murder', 'murdered', 'brutal murder', 'meurtre', 'matricide', 'patricide', 'vicious killings', 'thrill kill', 'homicidal', 'carnage',
    'murder of husband', 'murdered wife', 'murderer', 'mass murder', 'ritual murder', 'sexual murder',
    'horror', 'horor', 'supernatural horror', 'action horror', 'teen horror', 'scare', 'fear', 'terror', 'danger', 'evil', 'monster',
    'dread', 'menace', 'scary stories', 'hell', 'macabre', 'chilling', 'grim', 'aggression', 'thrilling',
    'crime horror', 'slasher horror', 'erotic horror', 'horror fans', 'sci-fi horror', 'horror western', 'body horror', 'zombie horror', 'survival horror',
    'stabbing', 'stabbed', 'stabbed to death', 'beaten to death', 'lynching', 'forced to kill', 'slaughter', 'assassination', 'assassination attempt',
    # Benigni, falsi positivi semantici, riabilitazione, protezione
    'breakdown', 'breakup', 'broke', 'broken', 'separation', 'disintegration', 'dissection',
    'heroine', 'dark heroine', 'escape attempt', 'attempted robbery',
    'child protection', 'child welfare', 'child abandonment', 'unwanted child', 'traumatized child', 'disturbed child', 'childhood trauma',
    'child labour', 'child labor', 'illegitimate child',
    'recovering addict', 'addiction recovery', 'drug rehabilitation', 'drug trial',
    'suicide mission', 'suicide prevention', 'suicide investigation',
    'catholic priest', 'drugstore', 'scalpel', 'nicotine', 'mass evacuation', 'mass destruction',
    'explosive', 'explosive action', 'corpse', 'crucifixion', 'martyrdom',
    'gang', 'criminal gang', 'gang warfare', 'prison', 'imprisonment',
    'intense', 'cruel', 'aggressive', 'demon', 'seducer', 'aphrodisiac', 'indecent proposal', 'vulgar', 'provocative', 'broken heart',
    'extreme violence', 'sadistic horror'
}

A_KEYWORDS = {
    # Gore / smembramenti / mutilazioni corporee viscerali / cannibalismo
    'beheaded', 'cannibal', 'cannibal cult', 'decapitated head', 'decapitations', 'mutilated body', 'mutilated',
    'dismembered', 'severed head', 'severed limb', 'throat slitting', 'slit throat', 'disembowelment', 'evisceration',
    'self-cannibalism', 'auto-cannibalism', 'scalping', 'castration', 'corpse mutilation', 'head cut off',
    'eye gouging', 'skinning', 'flesh eating', 'eaten alive', 'shocksploitation',
    # Tortura / sevizie sadiche
    'torture victim', 'torturing police', 'electrical torture', 'torture porn', 'tortured', 'torturing', 'sadistic torture',
    # Violenza sessuale non consensuale
    'sex abuse', 'rape attempt', 'rape of a male', 'rape victim', 'rape accusation', 'rape and murder',
    'rape and revenge', 'rape revenge', 'attempted rape', 'attempted sexual assault', 'sexual violence',
    'sexual abuse', 'sexual assault', 'sexual molestation', 'molestation', 'sexual predator', 'statutory rape',
    'teenage rape', 'forced sex', 'sexual humiliation', 'sexual oppression', 'sexual blackmail', 'groping',
    'sexual harassment', 'sex crime', 'sexual exploitation', 'forced prostitution',
    # Abuso su minori / pedofilia / sfruttamento minorile
    'childhood sexual abuse', 'paedophilia', 'abused child', 'child sex trade', 'child sex trafficking',
    'child molester', 'child abuser', 'female child abuser', 'pedophile', 'pedophile ring', 'clerical sexual abuse',
    'underage prostitution ring', 'young prostitute', 'teenage prostitute', 'underage sex', 'child trafficking',
    'baby trafficking', 'child slavery', 'child grooming', 'child endangerment', 'child neglect', 'abusive parent',
    'child mistreatment', 'parental abuse',
    # Droga pesante / overdose / grave tossicodipendenza
    'drug addict', 'overdose', 'drug overdose', 'crack addict', 'crystal meth', 'illegal drugs',
    'heroin addict', 'heroin addiction', 'heroin user', 'crack cocaine', 'snorting cocaine', 'injecting drugs',
    'opioid addiction', 'opioid crisis', 'opioid use disorder', 'meth addict', 'meth lab', 'freebase', 'drugging someone',
    'prescription drug abuse',
    # Suicidio / autolesionismo
    'suicide thoughts', 'suicide note', 'contemplating suicide', 'suicide jumping', 'driven to suicide',
    'suicide by hanging', 'suicide by gun', 'suicide by cop', 'suicide by gas', 'suicide pact', 'suicide attempt',
    'teen suicide', 'commit suicide', 'attempted suicide', 'ritual suicide', 'suicide bomber', 'suicide of mother',
    'suicide of husband', 'harakiri', 'seppuku', 'self immolation', 'self-mutilation', 'self-harm', 'self-inflicted injury',
    'fake suicide',
    # Pornografia esplicita / perversioni estreme
    'hentai', 'sex video', 'pornography addiction', 'hardcore sex', 'internet porn', 'sexploitation',
    'peep show', 'erotic video', 'porno film', 'hardcore porn', 'pornstar', 'porn actor', 'porn director',
    'porn industry', 'porn star', 'pornographer', 'gay pornography', 'roman porno', 'soft porn', 'sex tape',
    'necrophilia', 'bestiality', 'zoophilia', 'auto-erotic asphyxiation', 'dildo', 'public sex',
    'brother sister incest', 'mother son incest', 'father daughter incest', 'incest rape'
}


def main():
    t0 = time.time()
    print("1. Caricamento embedding e vocabolario keyword...")
    emb_path = REPO_ROOT / 'services/graph_dense/data/embeddings/kwsem-qwen3-0.6b.npz'
    kw_txt_path = REPO_ROOT / 'services/graph_dense/data/kw-emb.txt'
    
    with np.load(emb_path) as z:
        E = z['E'].astype(np.float32)
    kw_list = kw_txt_path.read_text(encoding='utf-8').splitlines()
    kw2idx = {k: i for i, k in enumerate(kw_list)}
    
    # Normalizzazione per similarità coseno
    E /= (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
    
    print(f"   Caricate {len(kw_list):,} keyword con embedding di dimensione {E.shape[1]}.")
    
    # TFIDF e canone
    print("2. Caricamento matrice tfidf del canone...")
    v_path = REPO_ROOT / 'services/graph/data/kw-tfidf/vocab.json'
    t_path = REPO_ROOT / 'services/graph/data/kw-tfidf/tfidf.npz'
    titles_path = REPO_ROOT / 'services/graph/data/titoli-canone.txt'
    
    vocab = json.loads(v_path.read_text(encoding='utf-8'))
    t_matrix = sp.load_npz(t_path).tocsc()
    col_counts = np.diff(t_matrix.indptr)
    titles = [line.strip() for line in titles_path.read_text(encoding='utf-8').splitlines()]
    
    print(f"   Matrice tfidf: {t_matrix.shape[0]:,} titoli, {t_matrix.shape[1]:,} token.")
    
    # Espansione dei semi
    print("3. Espansione dei semi nello spazio di embedding...")
    seed_indices = [kw2idx[s] for s in SEEDS if s in kw2idx]
    seed_present = [s for s in SEEDS if s in kw2idx]
    assert len(seed_indices) == len(SEEDS), f"Mancano dei semi: {set(SEEDS) - set(seed_present)}"
    
    E_seeds = E[seed_indices]  # (n_seeds, 1024)
    sims = E @ E_seeds.T       # (16944, n_seeds)
    max_sim = np.max(sims, axis=1)
    best_seed_idx = np.argmax(sims, axis=1)
    cos_dist = 1.0 - max_sim
    
    # Seleziona candidati con dist <= 0.20 (sim >= 0.80) non appartenenti ai semi
    cands_idx = [i for i in range(len(kw_list)) if i not in seed_indices and cos_dist[i] <= 0.20]
    cands_idx.sort(key=lambda i: cos_dist[i])
    print(f"   Trovati {len(cands_idx)} candidati con distanza coseno <= 0.20 (coseno >= 0.80).")
    
    classified_records = []
    group_counts = {'A': 0, 'B': 0, 'C': 0}
    
    for idx in cands_idx:
        k = kw_list[idx]
        s = SEEDS[best_seed_idx[idx]]
        d = float(cos_dist[idx])
        sim = float(max_sim[idx])
        token_col = vocab.get(f'kw:{k}')
        cnt = int(col_counts[token_col]) if token_col is not None else 0
        
        if k in A_KEYWORDS:
            grp = 'A'
        elif k in C_KEYWORDS:
            grp = 'C'
        else:
            if any(w in k for w in ['rape', 'pedophil', 'paedophil', 'dismember', 'decapitat', 'suicide', 'mutilat', 'overdose']):
                grp = 'A'
            elif any(w in k for w in ['violence', 'violent', 'blood', 'death', 'dead', 'murder', 'horror', 'fear', 'terror']):
                grp = 'C'
            else:
                grp = 'B'
                
        group_counts[grp] += 1
        classified_records.append({
            'keyword': k,
            'nearest_seed': s,
            'distance': round(d, 4),
            'cosine_similarity': round(sim, 4),
            'titles_count': cnt,
            'group': grp
        })
        
    print(f"   Ripartizione: (A) SICURE={group_counts['A']}, (B) DUBBIE={group_counts['B']}, (C) DA SCARTARE={group_counts['C']}")
    
    # 4. Scrittura elenco-da-approvare.md
    print("4. Generazione .scratch/profili-e-identita/keyword-bambini/elenco-da-approvare.md...")
    out_table = DATA_DIR / 'elenco-da-approvare.md'
    
    md_lines = [
        "# Elenco Keyword per la Modalità Bambini — Da Revisionare e Approvare",
        "",
        "Questo documento contiene tutti i candidati generati dall'espansione dei 62 semi nello spazio di embedding Qwen3 (distanza coseno $\\le 0.20$, similarità coseno $\\ge 0.80$), ripartiti in tre gruppi:",
        "- **Gruppo (A) SICURE da mettere in lista nera**: termini espliciti e inequivocabili di violenza grafica estrema, mutilazioni, violenza sessuale, abuso su minori, droghe pesanti/overdose, suicidio, pornografia.",
        "- **Gruppo (B) DUBBIE**: termini sfumati, droghe leggere, elementi per adulti o tropi crime/horror che richiedono una decisione umana sul bilanciamento tra protezione e ampiezza del catalogo.",
        "- **Gruppo (C) DA SCARTARE**: parole escluse per decisione di modello (violenza generica, sangue, morte, omicidio, paura/horror) o falsi positivi semantici, essenziali per non bloccare film adatti come *Il Signore degli Anelli* e *Stranger Things*.",
        "",
        f"**Statistiche Generali**:",
        f"- Semi di partenza: **{len(SEEDS)}** (descritti in `semi.md`)",
        f"- Candidati espansi (dist $\\le 0.20$): **{len(classified_records)}**",
        f"- **Gruppo (A) SICURE**: **{group_counts['A']}**",
        f"- **Gruppo (B) DUBBIE**: **{group_counts['B']}**",
        f"- **Gruppo (C) DA SCARTARE**: **{group_counts['C']}**",
        "",
        "---",
        ""
    ]
    
    groups_meta = [
        ('A', 'Gruppo (A) — SICURE da mettere in lista nera', 'Termini inequivocabilmente inadatti ai bambini. Includerli nella lista nera è imperativo.'),
        ('B', 'Gruppo (B) — DUBBIE (Richiedono decisione umana)', 'Termini ambigui, contestuali o intermedi. L\'umano può approvarne alcuni o lasciarli fuori.'),
        ('C', 'Gruppo (C) — DA SCARTARE', 'Termini che NON devono entrare nella lista nera (violenza generica, morte, paura, o falsi positivi semantici).')
    ]
    
    for grp_code, grp_title, grp_desc in groups_meta:
        grp_rows = [r for r in classified_records if r['group'] == grp_code]
        grp_rows.sort(key=lambda r: r['distance'])
        
        md_lines.append(f"## {grp_title} ({len(grp_rows)} keyword)")
        md_lines.append(f"*{grp_desc}*")
        md_lines.append("")
        md_lines.append("| # | Keyword | Seme più vicino | Distanza Coseno | Similarità Coseno | Titoli nel canone |")
        md_lines.append("|---|---|---|---|---|---|")
        for num, r in enumerate(grp_rows, 1):
            md_lines.append(f"| {num} | `{r['keyword']}` | `{r['nearest_seed']}` | {r['distance']:.4f} | {r['cosine_similarity']:.4f} | {r['titles_count']} |")
        md_lines.append("")
        md_lines.append("---")
        md_lines.append("")
        
    out_table.write_text('\n'.join(md_lines), encoding='utf-8')
    print(f"   Tabella scritta con successo ({out_table}).")
    
    # 5. Verifica dei casi di scuola
    print("5. Verifica diretta dei 5 casi di scuola contro la matrice tfidf...")
    school_cases = {
        'Inside Out': 11,
        'Shrek': 85,
        'Invincible': 50168,
        'Stranger Things': 49806,
        'The Lord of the Rings: The Fellowship of the Ring': 16,
        'The Lord of the Rings: The Return of the King': 23,
        'The Lord of the Rings: The Two Towers': 77,
    }
    
    proposed_blacklist = set(SEEDS + [r['keyword'] for r in classified_records if r['group'] == 'A'])
    
    inv_v = {idx: tok for tok, idx in vocab.items()}
    casi_lines = [
        "# Verifica dei 5 Casi di Scuola contro la Matrice TF-IDF",
        "",
        "Verifica formale della lista nera proposta (Semi + Gruppo A, per un totale di "
        f"**{len(proposed_blacklist)} keyword vietate**) sui 5 titoli di controllo stabiliti da spec e ticket.",
        "",
        "### Risultato atteso:",
        "- **Invincible**: ESCLUSO (violenza grafica estrema / *gore*)",
        "- **Inside Out**: AMMESSO",
        "- **Shrek**: AMMESSO",
        "- **Stranger Things**: AMMESSO (horror / teen drama non gore)",
        "- **Il Signore degli Anelli**: AMMESSO (battaglia epica / dark fantasy non gore)",
        "",
        "---",
        ""
    ]
    
    for name, row_id in school_cases.items():
        title = titles[row_id]
        row = t_matrix.getrow(row_id)
        kws = [inv_v[c][3:] for c in row.indices if inv_v[c].startswith('kw:')]
        hits = [k for k in kws if k in proposed_blacklist]
        verdict = "ESCLUSO (✗)" if hits else "AMMESSO (✓)"
        
        casi_lines.append(f"## [{row_id}] {title} ({name})")
        casi_lines.append(f"- **Verdetto**: **{verdict}**")
        casi_lines.append(f"- **Keyword determinanti per il blocco**: `{hits}`" if hits else "- **Keyword determinanti per il blocco**: Nessuna (passa pulito)")
        casi_lines.append(f"- **Tutte le keyword ({len(kws)})**: {', '.join([f'`{k}`' for k in kws])}")
        
        # Keyword nei gruppi B e C
        kws_b = [k for k in kws if k in {r['keyword'] for r in classified_records if r['group'] == 'B'}]
        kws_c = [k for k in kws if k in {r['keyword'] for r in classified_records if r['group'] == 'C'}]
        if kws_b:
            casi_lines.append(f"- *Keyword presenti nel Gruppo B (Dubbie)*: `{kws_b}`")
        if kws_c:
            casi_lines.append(f"- *Keyword presenti nel Gruppo C (Scartate)*: `{kws_c}`")
        casi_lines.append("")
        
    casi_path = DATA_DIR / 'casi-di-scuola.md'
    casi_path.write_text('\n'.join(casi_lines), encoding='utf-8')
    print(f"   Casi di scuola scritti con successo ({casi_path}).")
    print(f"Completato in {time.time()-t0:.2f}s.")


if __name__ == '__main__':
    main()
