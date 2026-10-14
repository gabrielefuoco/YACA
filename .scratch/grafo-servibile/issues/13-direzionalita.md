# 13 — La direzionalità pedagogica

**Status**: `resolved` · **Type**: `task` · **Blocked by**: 12 · **Chiuso**: 13/10/2026

**Esito**: [report](../ricerche/13-direzionalita.md) · ✅ l'accessibilità è calcolata sui **membri core** (il 55% dei membri) e il controllo lo giustifica: **su 907 bolle** usare tutti i membri avrebbe spostato l'accessibilità di **un fattore 2 o più**. ✅ I segni sono **quasi bilanciati** (14.707 approfondimenti contro 13.906 allargamenti) e l'85,7% delle bolle li ha entrambi. ✅ La lettura conferma i due versi: un mondo di **nordic noir da 32 voti** ha un arco verso il **noir mainstream da 25.061 voti** (*allargamento*), un mondo di **supereroi di nicchia da 21 voti** verso i **teen superhero da 14.798**, e gli approfondimenti scendono da 15.000 voti a 17. ⚠️ **757 bolle (14,3%) hanno un segno solo** e non sono state verificate. ❌ **Il segno NON è disponibile al recupero** (si calcola sulle bolle, la ricetta lavora sui titoli): il criterio va ancora soddisfatto.

## What to build

Ogni bolla ha la sua **accessibilità**: la mediana del logaritmo dei voti dei suoi membri core. Ogni arco
fra due bolle acquista così un **segno**:

- verso una bolla **meno** accessibile → **approfondimento**: porta da un mondo noto alla sua radice
  d'autore o di culto (da *Thriller psicologici mainstream* a *Giallo all'italiana*).
- verso una bolla **più** accessibile → **allargamento**: porta verso qualcosa di più facile da
  affrontare.

Serve a rispondere a una domanda che l'utente si fa davvero: *stasera voglio scendere in profondità o
allargare l'orizzonte?*

## Acceptance criteria

- [ ] ogni arco ha il suo segno
- [ ] un campione di archi è **letto** e il segno è plausibile nei due sensi
- [ ] la distribuzione dei segni è stampata: una bolla che è **solo** approfondimento o **solo** allargamento è sospetta e va verificata
- [ ] il segno è **disponibile al recupero**, non solo alla mappa (serve a scegliere il tipo di proposta)
- [ ] il calcolo usa i voti dei membri **core** (purezza alta), non di tutti i membri: un intruso popolare non deve spostare l'accessibilità di un mondo d'autore
