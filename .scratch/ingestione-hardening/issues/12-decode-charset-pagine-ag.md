Status: ready-for-agent
Type: task
Priorità: P0 (hotfix: la freschezza del ticket 01 ha esposto un bug che costa badge veri)
Blocked by: nessuno

# 12 — Decode delle pagine AG: sniffare il charset invece di cablare windows-1252

**Riferimento**: [`../risposta-senior.md`](../risposta-senior.md) — non c'è una sezione: anomalia **nuova**, emersa in produzione il 2026-11-15 alle 19:05, primo giro con l'indice fresco (ticket 01). Originale temporaneo: `C:\Users\gabri\AppData\Local\Temp\yaca-handoff-2026-11-15\risdp.md`.

## Contesto (misurato, non ipotizzato)

Primo giro con le 21 pagine della zona film riscaricate dopo 44 giorni:

- schede estratte 25.165 → **25.249** (+84)
- match `true` 19.371 → **19.139** (−232); `non trovate nel DB` 3.652 → **3.952** (+300)
- diff: **385 cambi**, di cui **310 film "non più doppiati"** (badge ITA rimossi in produzione)
- la guardia `writer.js` non è scattata: −1,2%, sotto il tetto del 2%

Diagnosi, verificata sul server:

| Prova | Esito |
|---|---|
| `curl -I .../film-18.htm` | `content-type: text/html; charset=UTF-8` |
| byte `0xC3` in `film-18.htm` (riscaricata) | **23** |
| byte `0xC3` in `anim-10.htm` (cache del 2/10) | **0** (era windows-1252) |
| `parseIndexPage` su `film-18.htm` | `"Qualcuno volÃ² sul nido del cuculo"` → `normBase` = `questo... vola ...` |

Cioè: **il sito è passato a UTF-8** fra il 2 ottobre e oggi. Il nostro decode è cablato su
`windows-1252` (`readHtmlFile` e il ramo download di `indici.js`), quindi ogni titolo accentato
(`Léon`, `Casinò`, `Qualcuno volò…`, `La mala educación`) produce una chiave sbagliata → nessun
candidato in catalogo → badge perso. Non è una regressione del ticket 01: è un bug che **solo** la
freschezza poteva esporre (la cache ferma lo nascondeva).

## Cosa fare

Un solo punto di decode, con sniff:

```js
// ponytail: il sito è passato a UTF-8 (header `charset=UTF-8`) mentre le pagine ancora in cache
// sono windows-1252. Si prova UTF-8 e si ripiega solo se compaiono caratteri di sostituzione.
// Ceiling: un file cp1252 valido anche come UTF-8 è solo-ASCII e decodifica uguale (caso innocuo).
function decodeHtml(buf) {
    const utf8 = new TextDecoder('utf-8').decode(buf);
    if (!utf8.includes('\uFFFD')) return utf8;
    return new TextDecoder('windows-1252').decode(buf);
}
```

- `readHtmlFile(path)` usa `decodeHtml` (copre le 60 pagine ancora in cache, che sono cp1252).
- Il ramo download usa `decodeHtml(buf)` invece del `TextDecoder('windows-1252')` cablato.
- Esportare `decodeHtml` per il test.
- **Nient'altro**: non toccare `parse.js`, `match.js`, la guardia del writer, i TTL.

## Test

In `services/doppiaggi-source/tests/indici.test.js`, un caso:

- buffer UTF-8 con `"Qualcuno volò"` → `decodeHtml` restituisce `"Qualcuno volò"` (nessun `Ã`);
- buffer cp1252 con `0xF2` al posto di `ò` → `decodeHtml` restituisce `"Qualcuno volò"`;
- buffer solo ASCII → identico in entrambi i casi.

E una verifica end-to-end sul dato reale (non un test automatico): dopo il fix, `--dry-run` deve
mostrare `non trovate nel DB` tornare vicino a 3.652 e i 310 film del diff devono tornare `true`.

## Fatto quando

1. Test verdi (`node --test services/doppiaggi-source/tests/`).
2. Sul server: giro dei doppiaggi → `true` tornato a ≥ 19.400 e diff con `nonPiuDoppiati` ≈ 0
   (i 310 recuperati).
3. `ita_annotations.jsonl` con i titoli accentati di nuovo presenti.

## Rischi e rollback

- **Rischio**: un file cp1252 che supera il test UTF-8 senza `U+FFFD` è solo-ASCII (nessun accentato),
  quindi non cambia nulla. Il contrario non è possibile.
- **Rollback**: revert della funzione, si torna al decode cablato.

## Nota operativa (emersa nello stesso giro)

Il job doppiaggi gira **sull'host** da `/srv/yaca` (`ops/yaca-doppiaggi.sh`), non nell'immagine: il
deploy dei container via Watchtower **non** aggiorna quel codice. Serve `git pull` in `/srv/yaca`.
Scritto anche in `log/onda-1.md`.
