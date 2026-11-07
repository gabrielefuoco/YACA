"""assi.py — Assi di Tono e Complessità sul Canone YACA (Ticket Tono/Complessità).

PERCHÉ ESISTE.
Il vecchio slider «Tonalità» spostava il peso tra contenitori di genere (documentari/storia vs
commedia/famiglia/animazione). Questo approccio grossolano non riusciva a distinguere:
  - Barry Lyndon da The Transporter (entrambi catalogati drama/action/adventure, ma Barry Lyndon è
    esigente e autoriale mentre The Transporter è puro popcorn lineare);
  - Parasite da Love Actually (entrambi con sfumature comedy/drama, ma con tono diametralmente opposto).

Questo modulo costruisce due assi continui per ciascuno dei titoli del canone (76.497 nodi):
  1. `tono`: leggero (-1.0) ↔ cupo (+1.0);
  2. `complessita`: lineare (-1.0) ↔ esigente (+1.0).

FONTI DI EVIDENZA:
  - TMDB keywords: liste polarizzate a mano e pesate, divise per gruppi tematici commentati;
  - Testo overview: scansione di radici lessicali ad alta polarità;
  - Rating (vote_average): consenso critico/pubblico come prior di complessità;
  - Runtime: durata metrica (film lunghi >140 min tendono a esigere maggiore impegno; <85 min sono più lineari);
  - Numero di episodi e stagioni (per serie tv).

Gli array vengono salvati come artefatto preparato con provenance canonica in
`services/graph/data/assi-canone.npz`, così che il servizio HTTP non debba mai ricalcolarli a runtime.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from graph import canon as K
from graph import parametri as P
from graph import provenance as _PV


ARTEFATTO_NOME: str = "assi-canone.npz"
GAMMA_DEFAULT: float = getattr(P, "PENALITA_ASSE_RETRIEVAL", 0.75)


# ==============================================================================
# POLARITÀ KEYWORDS: TONO (leggero -1.0 <-> cupo +1.0)
# ==============================================================================

# Gruppo 1: Lutto profondo, suicidio, mortalità e perdita affettiva straziante
_TONO_LUTTO_E_MORTE = {
    'suicide': 3.0,
    'suicide attempt': 2.5,
    'mass suicide': 3.0,
    'teen suicide': 2.5,
    'grief': 2.5,
    'mourning': 2.0,
    'coping with grief': 2.0,
    'death of a loved one': 2.0,
    'death of child': 2.8,
    'death of mother': 1.8,
    'death of father': 1.8,
    'death of brother': 2.0,
    'death of wife': 1.8,
    'funeral': 1.2,
    'funeral home': 1.0,
    'terminal illness': 2.5,
    'cancer': 2.0,
    'fatal disease': 2.0,
    'dying and death': 1.8,
    'fear of death': 1.5,
    'violent death': 2.2,
}

# Gruppo 2: Sofferenza mentale, depressione, disperazione, trauma e paranoia
_TONO_TRAUMA_E_DISPERAZIONE = {
    'depression': 2.5,
    'depressing': 2.5,
    'depressed': 2.0,
    'manic depression': 2.5,
    'postpartum depression': 2.0,
    'melancholy': 1.8,
    'sadness': 1.5,
    'despair': 2.5,
    'hopeless': 2.5,
    'nihilism': 2.5,
    'existential dread': 2.5,
    'panic attack': 2.2,
    'mental breakdown': 2.2,
    'psychosis': 2.2,
    'trauma': 2.2,
    'post-traumatic stress disorder (ptsd)': 2.5,
    'childhood trauma': 2.5,
    'war trauma': 2.2,
    'traumatic childhood': 2.0,
    'traumatized woman': 2.0,
    'paranoia': 1.5,
    'paranoid': 1.5,
    'angst': 1.5,
}

# Gruppo 3: Violenza brutale, crudeltà, sadismo, omicidi seriali e gore
_TONO_CRUDELTA_E_SANGUE = {
    'torture': 2.8,
    'torture chamber': 2.5,
    'torture porn': 3.0,
    'sadistic torture': 3.0,
    'sadism': 2.5,
    'sadistic': 2.5,
    'sadist': 2.5,
    'sadistic horror': 2.8,
    'brutality': 2.5,
    'police brutality': 2.2,
    'brutal violence': 2.8,
    'prison brutality': 2.2,
    'gore': 2.5,
    'splatter': 2.2,
    'body horror': 2.5,
    'visceral': 2.0,
    'serial killer': 2.5,
    'mass murder': 2.8,
    'killing spree': 2.5,
    'psycho killer': 2.2,
    'massacre': 2.8,
    'slaughter': 2.5,
    'slaughterhouse': 2.0,
    'mutilation': 2.8,
    'decapitation': 2.5,
    'cannibalism': 2.5,
    'graphic violence': 2.5,
    'murder': 1.2,
    'murderer': 1.5,
}

# Gruppo 4: Orrore viscerale, angoscia esistenziale, oscurità e incubi
_TONO_ORRORE_E_INCUBO = {
    'psychological horror': 2.2,
    'supernatural horror': 1.8,
    'horror': 1.5,
    'survival horror': 1.8,
    'nightmare': 2.0,
    'dystopian nightmare': 2.5,
    'bleak': 2.8,
    'grim': 2.2,
    'grimdark': 2.5,
    'darkness': 1.8,
    'dark': 1.2,
    'dark secret': 1.5,
    'dark past': 1.5,
    'dread': 2.2,
}

# Gruppo 5: Atrocità storiche, genocidi, schiavitù e abusi sistemici
_TONO_ATROCITA_E_ABUSI = {
    'holocaust': 3.0,
    'concentration camp': 3.0,
    'war crimes': 2.8,
    'genocide': 3.0,
    'caste violence': 2.5,
    'human trafficking': 2.5,
    'sex trafficking': 2.8,
    'sexual violence': 2.8,
    'sexual abuse': 2.8,
    'rape': 3.0,
    'child abuse': 3.0,
    'domestic violence': 2.2,
    'domestic abuse': 2.2,
    'slavery': 2.2,
}

# Gruppo 6: Degrado sociale, distopia opprimente e cinismo
_TONO_DISTOPIA_E_DEGRADO = {
    'dystopia': 1.8,
    'dystopian': 1.8,
    'post-apocalyptic': 1.8,
    'cynical': 1.5,
    'bleak future': 2.2,
    'poverty': 1.2,
    'slum': 1.2,
}

TONO_CUPO_KEYWORDS: dict[str, float] = {
    **_TONO_LUTTO_E_MORTE,
    **_TONO_TRAUMA_E_DISPERAZIONE,
    **_TONO_CRUDELTA_E_SANGUE,
    **_TONO_ORRORE_E_INCUBO,
    **_TONO_ATROCITA_E_ABUSI,
    **_TONO_DISTOPIA_E_DEGRADO,
}

# Gruppo 7: Gioia di vivere, spensieratezza, ottimismo e conforto emotivo
_TONO_GIOIA_E_OTTIMISMO = {
    'lighthearted': 2.5,
    'cheerful': 2.5,
    'optimistic': 2.2,
    'optimism': 2.2,
    'wholesome': 2.5,
    'wholesome comedy': 2.5,
    'feel-good': 2.5,
    'comforting': 2.0,
    'heartwarming': 2.5,
    'happy ending': 2.0,
}

# Gruppo 8: Comicità brillante, slapstick, commedia romantica e parodia
_TONO_COMMEDIA_E_UMORISMO = {
    'slapstick comedy': 2.2,
    'slapstick humor': 2.0,
    'romantic comedy': 2.2,
    'romcom': 2.0,
    'sitcom': 2.0,
    'spoof': 1.8,
    'parody': 1.5,
    'buddy comedy': 2.0,
    'teen comedy': 1.8,
    'screwball comedy': 2.2,
    'humor': 1.2,
    'amusing': 1.5,
    'playful': 1.8,
    'action comedy': 1.2,
    'sex comedy': 1.5,
    'workplace comedy': 1.5,
    'stand-up comedy': 1.5,
}

# Gruppo 9: Amicizia sincera, calore di famiglia e amore positivo
_TONO_AMICIZIA_E_FAMIGLIA = {
    'friendship': 1.5,
    'unlikely friendship': 1.5,
    'childhood friends': 1.5,
    'female friendship': 1.5,
    'male friendship': 1.5,
    'bromance': 1.8,
    'family vacation': 1.8,
    'love': 1.0,
    'love of one\'s life': 1.2,
    'slice of life': 1.2,
    'first love': 1.2,
}

# Gruppo 10: Feste, Natale, vacanze estive e cerimonie felici
_TONO_FESTE_E_VACANZE = {
    'christmas': 1.5,
    'christmas eve': 1.5,
    'christmas tree': 1.5,
    'christmas party': 1.8,
    'holiday': 1.2,
    'holiday season': 1.5,
    'vacation': 1.2,
    'summer vacation': 1.5,
    'wedding': 1.2,
    'birthday': 1.2,
}

# Gruppo 11: Fiabe, magia, parchi a tema e animazione rassicurante
_TONO_FIABE_E_ANIMAZIONE = {
    'fairytale': 1.5,
    'magic': 0.8,
    'amusement park': 1.5,
    'anthropomorphism': 1.5,
    '3d animation': 0.8,
    'musical': 1.0,
    'sports victory': 1.2,
    'road trip': 0.8,
    'cute': 1.8,
}

TONO_LEGGERO_KEYWORDS: dict[str, float] = {
    **_TONO_GIOIA_E_OTTIMISMO,
    **_TONO_COMMEDIA_E_UMORISMO,
    **_TONO_AMICIZIA_E_FAMIGLIA,
    **_TONO_FESTE_E_VACANZE,
    **_TONO_FIABE_E_ANIMAZIONE,
}


# ==============================================================================
# POLARITÀ KEYWORDS: COMPLESSITÀ (lineare -1.0 <-> esigente +1.0)
# ==============================================================================

# Gruppo 12: Tematiche filosofiche, etiche, teologiche ed esistenzialismo
_COMP_FILOSOFIA_ED_ESISTENZA = {
    'philosophical': 2.5,
    'philosophy': 2.2,
    'philosopher': 2.0,
    'existentialism': 2.5,
    'existential crisis': 2.2,
    'existentialist': 2.2,
    'meaningless existence': 2.0,
    'morality': 1.8,
    'moral ambiguity': 2.5,
    'ethics': 1.8,
    'theology': 2.0,
    'allegory': 2.0,
}

# Gruppo 13: Narrativa sperimentale, slow cinema, surrealismo e avanguardia
_COMP_AVANGUARDIA_E_SLOW_CINEMA = {
    'slow cinema': 3.0,
    'slow burn': 2.0,
    'meditative': 2.5,
    'non-linear narrative': 2.8,
    'unreliable narrator': 2.8,
    'stream of consciousness': 3.0,
    'avant-garde': 2.8,
    'avant garde': 2.8,
    'experimental cinema': 2.8,
    'experimental film': 2.8,
    'experimental': 2.2,
    'surrealism': 2.2,
    'surreal': 1.8,
    'metafiction': 2.5,
    'symbolism': 2.0,
    'art house': 2.5,
    'arthouse': 2.5,
    'poetic cinema': 2.8,
    'poetic documentary': 2.2,
}

# Gruppo 14: Dramma psicologico complesso, satira sociale e intrigo politico
_COMP_PSICOLOGIA_E_SOCIETA = {
    'psychological': 1.5,
    'psychological drama': 2.0,
    'psychological thriller': 1.5,
    'cerebral': 2.5,
    'complex': 1.8,
    'complex relationship': 1.8,
    'social commentary': 2.0,
    'political intrigue': 2.0,
    'political conspiracy': 1.8,
    'conspiracy': 1.2,
    'investigative journalism': 1.8,
    'courtroom drama': 1.8,
    'courtroom': 1.5,
    'anti-capitalist': 1.8,
    'class differences': 1.8,
    'satire': 1.2,
    'social satire': 1.8,
    'political satire': 1.8,
}

# Gruppo 15: Grandi affreschi storici rigorosi, drammi in costume e settecento/ottocento
_COMP_STORICO_E_COSTUME = {
    'costume drama': 1.5,
    'period drama': 1.5,
    'historical drama': 1.5,
    '18th century': 1.5,
    '19th century': 1.2,
    'historical fiction': 1.2,
    'historical epic': 1.8,
}

COMPLESSITA_ESIGENTE_KEYWORDS: dict[str, float] = {
    **_COMP_FILOSOFIA_ED_ESISTENZA,
    **_COMP_AVANGUARDIA_E_SLOW_CINEMA,
    **_COMP_PSICOLOGIA_E_SOCIETA,
    **_COMP_STORICO_E_COSTUME,
}

# Gruppo 16: Azione pura, adrenalina, inseguimenti, esplosioni e supereroi
_COMP_AZIONE_E_POPCORN = {
    'action hero': 2.2,
    'explosion': 2.0,
    'explosions': 2.0,
    'car chase': 2.2,
    'chase': 1.5,
    'police chase': 1.8,
    'gunfight': 1.8,
    'shootout': 1.8,
    'martial arts': 1.5,
    'kung fu': 1.8,
    'sword fight': 1.2,
    'superhero': 1.8,
    'superhero team': 1.8,
    'super power': 1.8,
    'masked vigilante': 1.5,
    'rescue mission': 1.5,
    'car race': 1.5,
}

# Gruppo 17: Intrattenimento immediato a formula, B-movie e disaster
_COMP_FORMULE_SEMPLICI = {
    'popcorn': 2.5,
    'b movie': 2.2,
    'monster movie': 1.8,
    'kaiju': 1.8,
    'creature feature': 1.8,
    'disaster movie': 1.8,
    'slapstick comedy': 2.0,
    'slapstick humor': 2.0,
    'teen comedy': 1.5,
    'spoof': 1.8,
    'buddy cop': 1.8,
    'formulaic': 2.5,
    'pop culture': 1.2,
}

# Gruppo 18: Format televisivi procedurali e serialità episodica semplice
_COMP_PROCEDURALI_E_FORMAT = {
    'police procedural': 1.5,
    'game show': 2.5,
    'reality show': 2.5,
    'talk show': 2.0,
    'late-night show': 2.0,
}

COMPLESSITA_LINEARE_KEYWORDS: dict[str, float] = {
    **_COMP_AZIONE_E_POPCORN,
    **_COMP_FORMULE_SEMPLICI,
    **_COMP_PROCEDURALI_E_FORMAT,
}


# ==============================================================================
# CALCOLO E COSTRUZIONE DELL'ARTEFATTO PREPARATO
# ==============================================================================

def percorso_artefatto(percorso: str | Path | None = None) -> Path:
    """Ritorna il percorso su disco dell'artefatto preparato degli assi."""
    if percorso is not None:
        return Path(percorso)
    env_p = os.environ.get("ASSI_CANONE_PATH")
    if env_p:
        return Path(env_p)
    return K.DATA / ARTEFATTO_NOME


def sha256_file(path: Path) -> str:
    """Calcola SHA-256 di un file per provenance verificata."""
    if not path.exists():
        return ""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def costruisci_assi(
    percorso_out: str | Path | None = None,
    p_movies: str | Path | None = None,
    p_tv: str | Path | None = None,
) -> tuple[np.ndarray, np.ndarray, dict]:
    """Costruisce i due assi continui (tono e complessità) su tutto il canone (N nodi).

    Salva l'artefatto compresso con provenance canonica su disco.
    """
    keys, row_of, N, is_tv = K.titoli()
    path_m = Path(p_movies) if p_movies else K.ROOT / ".cache" / "tmdb" / "movies.parquet"
    path_tv = Path(p_tv) if p_tv else K.ROOT / ".cache" / "tmdb" / "tv.parquet"

    if not path_m.exists() or not path_tv.exists():
        raise FileNotFoundError(
            f"File parquet mancanti per costruire gli assi: {path_m} o {path_tv}"
        )

    cols_m = ["id", "title", "keywords", "overview", "runtime", "vote_average", "vote_count"]
    cols_tv = ["id", "name", "keywords", "overview", "runtime", "vote_average", "vote_count", "number_of_episodes"]

    df_m = pd.read_parquet(path_m, columns=cols_m)
    df_tv = pd.read_parquet(path_tv, columns=cols_tv)

    m_data: dict[int, dict] = {}
    for _, row in df_m.iterrows():
        try:
            kw_list = [x["name"].lower().strip() for x in json.loads(row["keywords"])] if row["keywords"] else []
        except Exception:
            kw_list = []
        m_data[int(row["id"])] = {
            "keywords": kw_list,
            "overview": str(row["overview"] or ""),
            "runtime": float(row["runtime"]) if pd.notna(row["runtime"]) else 100.0,
            "vote_average": float(row["vote_average"]) if pd.notna(row["vote_average"]) else 6.5,
        }

    tv_data: dict[int, dict] = {}
    for _, row in df_tv.iterrows():
        try:
            kw_list = [x["name"].lower().strip() for x in json.loads(row["keywords"])] if row["keywords"] else []
        except Exception:
            kw_list = []
        tv_data[int(row["id"])] = {
            "keywords": kw_list,
            "overview": str(row["overview"] or ""),
            "runtime": float(row["runtime"]) if pd.notna(row["runtime"]) else 45.0,
            "episodes": float(row["number_of_episodes"]) if pd.notna(row["number_of_episodes"]) else 10.0,
            "vote_average": float(row["vote_average"]) if pd.notna(row["vote_average"]) else 7.0,
        }

    tono_arr = np.zeros(N, dtype=np.float32)
    comp_arr = np.zeros(N, dtype=np.float32)

    for i, k in enumerate(keys):
        is_series = bool(is_tv[i])
        tid = int(k.split(":")[1])
        item = tv_data.get(tid) if is_series else m_data.get(tid)
        if not item:
            continue

        kws = item["keywords"]
        ov = item["overview"].lower()

        # 1. TONO: keywords + overview polarity
        c_score = sum(TONO_CUPO_KEYWORDS.get(w, 0.0) for w in kws)
        l_score = sum(TONO_LEGGERO_KEYWORDS.get(w, 0.0) for w in kws)

        # Scansione overview per radici ad altissima polarità emotiva
        if any(term in ov for term in ('suicid', 'depress', 'traged', 'lutto', 'tortur', 'mourn')):
            c_score += 1.0
        if any(term in ov for term in ('allegro', 'spensierat', 'divertente', 'commedia', 'cheerful', 'lighthearted')):
            l_score += 1.0

        diff_tono = c_score - l_score
        tono_arr[i] = float(np.tanh(diff_tono / 3.0))

        # 2. COMPLESSITÀ: keywords + runtime + rating
        esig_score = sum(COMPLESSITA_ESIGENTE_KEYWORDS.get(w, 0.0) for w in kws)
        lin_score = sum(COMPLESSITA_LINEARE_KEYWORDS.get(w, 0.0) for w in kws)

        if not is_series:
            rt = item["runtime"]
            if rt >= 160:
                esig_score += 1.5
            elif rt >= 135:
                esig_score += 0.8
            elif rt < 85:
                lin_score += 1.0
        else:
            ep = item.get("episodes", 10.0)
            if ep >= 30:
                esig_score += 0.8

        va = item["vote_average"]
        if va >= 8.2:
            esig_score += 0.5
        elif va < 5.8:
            lin_score += 0.5

        diff_comp = esig_score - lin_score
        comp_arr[i] = float(np.tanh(diff_comp / 3.0))

    dest = percorso_artefatto(percorso_out)
    dest.parent.mkdir(parents=True, exist_ok=True)

    inputs_sha = {
        "movies.parquet": sha256_file(path_m),
        "tv.parquet": sha256_file(path_tv),
        "titoli-canone.txt": sha256_file(K.DATA / "titoli-canone.txt"),
    }
    params_dict = {
        "n_tono_cupo": len(TONO_CUPO_KEYWORDS),
        "n_tono_leggero": len(TONO_LEGGERO_KEYWORDS),
        "n_comp_esigente": len(COMPLESSITA_ESIGENTE_KEYWORDS),
        "n_comp_lineare": len(COMPLESSITA_LINEARE_KEYWORDS),
        "scale": 3.0,
    }

    prov = {
        "step": "assi",
        "params": params_dict,
        "params_sha": _PV.sha256_obj(params_dict),
        "inputs": inputs_sha,
        "canon_len": N,
    }
    prov["sha256"] = _PV.impronta({k: v for k, v in prov.items() if k != "sha256"})

    np.savez_compressed(
        dest,
        tono=tono_arr,
        complessita=comp_arr,
        _provenance=np.array(json.dumps(prov, sort_keys=True, ensure_ascii=False)),
    )
    print(f"  assi-canone: {N:,} titoli salvati in {dest} ({dest.stat().st_size / 1e3:.1f} KB)", flush=True)
    return tono_arr, comp_arr, prov


# ==============================================================================
# CARICAMENTO LAZY DELL'ARTEFATTO A RUNTIME
# ==============================================================================

_CACHED_TONO: np.ndarray | None = None
_CACHED_COMPLESSITA: np.ndarray | None = None
_CACHED_PATH: str | None = None


def carica_assi(percorso: str | Path | None = None, consenti_costruzione: bool = False) -> tuple[np.ndarray, np.ndarray]:
    """Carica gli array precalcolati di tono e complessità per i nodi del canone.

    Restituisce:
        `(tono, complessita)` come array float32 1D di lunghezza N nodi.
    """
    global _CACHED_TONO, _CACHED_COMPLESSITA, _CACHED_PATH
    dest = percorso_artefatto(percorso)

    if _CACHED_TONO is not None and _CACHED_COMPLESSITA is not None and _CACHED_PATH == str(dest):
        return _CACHED_TONO, _CACHED_COMPLESSITA

    if not dest.is_file():
        if consenti_costruzione:
            costruisci_assi(dest)
        else:
            raise FileNotFoundError(
                "Artefatto assi mancante: assi-canone.npz. "
                "Rigenerare con: PYTHONPATH=services python -m graph.assi --build"
            )

    z = np.load(dest, allow_pickle=False)
    if "tono" not in z.files or "complessita" not in z.files:
        raise ValueError(f"{dest}: formato non valido, chiavi 'tono' e 'complessita' attese")

    tono = np.asarray(z["tono"], dtype=np.float32)
    comp = np.asarray(z["complessita"], dtype=np.float32)

    _, _, N, _ = K.titoli()
    if len(tono) != N or len(comp) != N:
        raise ValueError(
            f"{dest}: lunghezza assi ({len(tono)}) non corrisponde al canone ({N})"
        )

    _CACHED_TONO = tono
    _CACHED_COMPLESSITA = comp
    _CACHED_PATH = str(dest)
    return _CACHED_TONO, _CACHED_COMPLESSITA


def reset_cache_assi() -> None:
    """Reset del singleton in memoria per i test."""
    global _CACHED_TONO, _CACHED_COMPLESSITA, _CACHED_PATH
    _CACHED_TONO = None
    _CACHED_COMPLESSITA = None
    _CACHED_PATH = None


# ==============================================================================
# APPLICAZIONE DEL FILTRO DI RETRIEVAL
# ==============================================================================

def calcola_penalita(
    indices: np.ndarray,
    tono_req: float = 0.0,
    comp_req: float = 0.0,
    gamma: float = GAMMA_DEFAULT,
    tono_arr: np.ndarray | None = None,
    comp_arr: np.ndarray | None = None,
) -> np.ndarray:
    """Calcola il fattore moltiplicativo di penalità in [0, 1] per gli indici dati.

    Se tono_req == 0.0 e comp_req == 0.0, ritorna np.ones (nessuna penalità).
    Altrimenti applica:
        penalita = exp( - gamma * ( |tono_req| * |tono - tono_req| + |comp_req| * |comp - comp_req| ) )
    """
    if len(indices) == 0 or (abs(tono_req) < 1e-6 and abs(comp_req) < 1e-6):
        return np.ones(len(indices), dtype=np.float64)

    if tono_arr is None or comp_arr is None:
        tono_arr, comp_arr = carica_assi()

    t_sub = tono_arr[indices]
    c_sub = comp_arr[indices]

    costo_tono = abs(tono_req) * np.abs(t_sub - tono_req) if abs(tono_req) >= 1e-6 else 0.0
    costo_comp = abs(comp_req) * np.abs(c_sub - comp_req) if abs(comp_req) >= 1e-6 else 0.0

    return np.exp(-gamma * (costo_tono + costo_comp))


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Gestione assi Tono/Complessità")
    ap.add_argument("--build", action="store_true", help="Rigenera l'artefatto su disco")
    args = ap.parse_args()

    if args.build or not percorso_artefatto().exists():
        t, c, prov = costruisci_assi()
    else:
        t, c = carica_assi()
        print(f"Assi caricati: {len(t):,} titoli. Min/Max Tono: {t.min():.2f}/{t.max():.2f}, Comp: {c.min():.2f}/{c.max():.2f}")
