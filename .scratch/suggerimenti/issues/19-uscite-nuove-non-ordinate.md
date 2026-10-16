Status: resolved
Type: bug

# `uscite_nuove` non e' ordinata: prende i primi 10 per INDICE DI CATALOGO
**Prova** (`motore.py:237-240`):
```python
nuove = [x for x in np.where(self.ANNO >= P.USCITE_NUOVE_DAL)[0] ...]
liste.append({"tipo": "uscite_nuove", ..., "titoli": [(B.KEYS[x], float(r[x])) for x in nuove[:10]]})
```
`np.where(...)[0]` e' in ordine **crescente di riga del canone**, e `nuove` non viene mai ordinata. Il
tuple porta `float(r[x])`, che da' l'illusione di un ordine per attivazione: **non c'e'**. E' lo stesso
artefatto dell'ordine di indice gia' combattuto nei report precedenti.
**Fix**: ordinare prima del taglio, e usare lo stesso criterio del resto del motore:
`nuove.sort(key=lambda x: (-r[x], -self.VOT[x]))`.

---

RISOLTO il 16/10/2026: `nuove.sort(key=lambda x: (-r[x], -VOT[x]))` prima del taglio. Verificato: i punteggi della lista ora sono non crescenti.
