Status: resolved
Type: bug

# `colloca`: se tutti i coseni sono zero, `argmax` restituisce la bolla 0
**Prova** (`collocator.py:201-213`): se i token di un titolo nuovo sono nel vocabolario ma nessuno compare
nelle bolle compatibili per voti, `cos` vale `0.0` su tutte, `np.argmax` restituisce il **primo indice**
(artefatto dell'ordine di indice) e la regola del medium `0.0 <= 0.0 * (1 + margine)` e' `True`, quindi il
titolo atterra in una bolla arbitraria con confidenza `0.0`.
**Fix**: subito dopo `j = int(np.argmax(cos_f))`, `if cos[j] <= 0.0: return None, 0.0, len(tok),
len(tok) - n_dentro` — che e' gia' il modo in cui la funzione segnala «non lo so».

---

FATTO il 16/10/2026: subito dopo `j = int(np.argmax(cos_f))`, `if float(cos[j]) <= 0.0: return None, 0.0, ...` — che e' il modo in cui la funzione dice gia' «non lo so». **NON ESERCITATO da un test**: il caso richiede un titolo coi token nel vocabolario ma in nessuna bolla compatibile per voti, e non l'ho costruito. Dichiarato.
