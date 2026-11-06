"""maschera.py — togliere il titolo e i nomi propri dal testo che va in embedding (ticket 05).

PERCHE' ESISTE. `embed-trama2.py` costruisce il payload come `f'{t}. {o.strip()}'`: il **titolo e'
dentro** il testo che il modello legge. E anche togliendo il prefisso, le sinossi contengono "Barbie",
"Ken", "Barbie Land", "Gotham": lo spazio TRAMA misura l'omonimia lessicale, non la storia. E' per
questo che *Barbie* finisce sui 40 cartoni Mattel invece che su *The Truman Show*.

COSA SI MASCHERA
  · i token significativi di title / title_en / original_title / collection_name (>= MIN_LEN caratteri:
    "up", "it", "the" non identificano niente e mascherarli romperebbe il testo);
  · le varianti con apostrofo o trattino spezzate ("Barbie's" -> "Barbie").
NON si maschera
  · il nome del personaggio: i Parquet salvano `cast` con id/nome/ordine e **non** il campo
    `character`, quindi la lista dei personaggi non e' disponibile a costo zero. Lo dichiariamo qui
    invece di fingere di averlo fatto.

La sostituzione e' `"the protagonist"` quando il token e' il soggetto della frase (primo token
significativo dopo inizio frase o dopo punteggiatura), altrimenti il token sparisce.
"""
from __future__ import annotations

import re

MIN_LEN = 4
PROTAGONISTA = 'the protagonist'

_SPLIT = re.compile(r"[^\wàèéìòù']+", re.UNICODE)
_FRASE = re.compile(r"(^|[.!?]\s+)(\w+)", re.UNICODE)


def _token(s: str) -> list[str]:
    return [w for w in _SPLIT.split(str(s).lower()) if len(w) >= MIN_LEN]


def chiavi(titolo='', titolo_en='', titolo_orig='', collezione='') -> set[str]:
    """I token che identificano il film per nome proprio (titolo, titolo originale, saga)."""
    out = set()
    for campo in (titolo, titolo_en, titolo_orig, collezione):
        if isinstance(campo, str) and campo.strip():
            out.update(_token(campo))
    return out


def maschera(overview: str, keys: set[str], max_maschere: int = 6) -> str:
    """Toglie i token di `keys` dalla sinossi. Il primo della frase diventa `the protagonist`.

    `max_maschere` limita quante parole si toccano: una sinossi in cui spariscono venti parole non e'
    piu' una sinossi, e' un buco. Oltre la soglia si smette e si lascia il testo com'era.
    """
    if not isinstance(overview, str) or not overview.strip() or not keys:
        return overview if isinstance(overview, str) else ''
    # il soggetto della frase: si annotano i token che iniziano una frase
    soggetti = set()
    for m in _FRASE.finditer(overview):
        w = m.group(2).lower()
        if w in keys:
            soggetti.add(w)
    toccate = 0
    out_words = []
    for parola in overview.split():
        nudo = parola.strip(".,;:!?()[]\"'").lower()
        if nudo in keys and toccate < max_maschere:
            toccate += 1
            out_words.append(PROTAGONISTA if nudo in soggetti else '')
        else:
            out_words.append(parola)
    testo = ' '.join(w for w in out_words if w)
    testo = re.sub(r'\s+', ' ', testo).strip()
    return testo[:1].upper() + testo[1:] if testo else testo
