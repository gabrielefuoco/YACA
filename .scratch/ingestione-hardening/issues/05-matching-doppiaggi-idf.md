Status: resolved
Type: task
Priorità: P2 (quarta onda: cambia quanti badge ITA compaiono)
Blocked by: 00 (baseline dei motivi di match)

# 05 — Doppiaggi: scoring IDF-Dice e anno ±1 con margine

**Riferimento**: [`../risposta-senior.md`](../risposta-senior.md) — sezione **Q2** (diagnosi, codice completo di `match.js` con `scoreTokenMatch` e `resolveByYearWithMargin`, test, metrica, rollback). Originale temporaneo: `C:\Users\gabri\AppData\Local\Temp\yaca-handoff-2026-11-15\risdp.md`.

## Contesto

La cascata attuale (`services/doppiaggi-source/src/match.js`) è: chiave esatta unica → anno esatto →
anno+tipo → tipo → altrimenti `null`; con zero candidati, fuzzy per **containment di token** (≥2 token
condivisi, oppure 1 token se `df ≤ 3`).

Due difetti strutturali secondo il revisore:

1. **Falsi negativi legittimi**: l'anno AG (distribuzione italiana) e quello TMDB (uscita originale)
   differiscono di **±1 anno** sui film che escono a dicembre e arrivano in Italia a gennaio. Oggi quel
   `+1` non è ammesso, quindi si perde il `true` **anche quando nel catalogo non esiste alcun altro
   omonimo vicino**: il `null` non protegge da niente, costa solo un badge.
2. **Falsi positivi**: il containment puro accoppia titoli corti con titoli lunghi che contengono per caso
   quei token (es. "Lei" ⊂ "Lei è mia"; "6 Teen" ⊂ "Teen Wolf Saga…"), perché non c'è né penalità di
   lunghezza né peso IDF.

## Cosa fare (versione minima)

Due modifiche, entrambe dentro il fuzzy esistente. **Nessun nuovo algoritmo di scoring.**

1. **Guardia di lunghezza** in `isStrictContainment`:
   ```js
   // containment già richiesto (A⊆B o B⊆A). In più:
   const min = Math.min(setA.size, setB.size);
   const max = Math.max(setA.size, setB.size);
   if (min / max < 0.5) return false;            // "Lei" non matcha "Lei è mia e altro ancora"
   if (inter.length === 1) {
       const t = inter[0];
       if (t.length < 4 || dfFn(t) > 3 || max > 2) return false;   // vite contro titoli lunghi
   }
   return true;
   ```
   È la stessa funzione che tutti i chiamanti usano oggi: un fix nel punto condiviso, non un ramo nuovo.
2. **`resolveByYearWithMargin`** in R2: anno esatto ha priorità assoluta; **±1 anno** ammesso solo se il
   tipo coincide, c'è **un solo** candidato a distanza 1 e **nessun** candidato a distanza 2-4 anni.
   Motivo riportato: `R2_year_margin_1yr`.
3. Firma esportate invariate. Aggiungere i motivi nuovi al riepilogo del dry-run.

> `ponytail:` guardia di lunghezza invece dello score IDF-Dice. Il ceiling è che due titoli di lunghezza
> simile con 2 token comuni restano un match (raro). Upgrade path: se il campione mostra falsi positivi
> residui, allora si aggiunge il peso IDF — non prima.

## Perché `needs-info` è stato chiuso

Il gate del dry-run è **dentro** il ticket (punto 4 dei test): la decisione sulle soglie è presa, il numero
si misura. Non serve un'altra domanda: serve il campione.

## Vincolo che protegge da soli

`services/doppiaggi-source/src/writer.js` ha la guardia sul calo dei `true` > **2%**: se il nuovo scoring
riduce troppo i match, il file **non** viene sovrascritto e il servizio esce 2. Quindi il rilascio è
reversibile senza toccare la produzione — ma va verificato **in dry-run** prima, non scoperto in timer.

## Test (il gate)

In `services/doppiaggi-source/tests/match.test.js`:

1. `isStrictContainment`: `['up']` vs `['up','in','the','air']` → `false`; `['la','casa']` vs
   `['la','casa','stregata']` → `true`; token singolo con `df > 3` → `false`; token singolo lungo 3 → `false`.
2. `resolveByYearWithMargin`: esatto unico → hit; esatto multiplo → `null`; ±1 unico senza altri entro ±4 →
   hit `R2_year_margin_1yr`; ±1 ma con un altro candidato a 3 anni → `null`.
3. Regressione: le fixture `fixture-film|telefilm|soap.htm` producono lo stesso numero di match **certe**.
4. **Gate manuale**: `--dry-run` → delta per motivo; campione di **20 casi** (10 nuovi `true`, 10 nuovi
   `null`) verificati a mano contro il sito AG. Se il campione non regge, il ticket non si mergia e si
   annota in `ricerche/05-campione.md`.

## Fatto quando

1. Test verdi, `npm test` dei due servizi verde.
2. `--dry-run` mostra il delta per motivo, e il numero di `true` **non cala** (target: +150-300 da
   `R2_year_margin_1yr`, come stima il revisore — il numero vero è quello misurato).
3. Giro reale del timer: `ita_annotations.meta.json` ha `counts.true` in crescita o stabile, guardia non
   scattata.

## Rischi e rollback

- **Rischio**: badge sbagliati (falsi positivi) e poster sbagliati in cache. Mitigazione: soglie
  conservative + campione manuale di 20 casi prima del rilascio.
- **Rollback**: la guardia del writer protegge il file; per tornare indietro basta l'immagine precedente
  (nessun dato da migrare: il file si rigenera al giro dopo).
