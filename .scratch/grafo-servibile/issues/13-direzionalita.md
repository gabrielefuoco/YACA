# 13 — La direzionalità pedagogica

**Status**: `ready-for-agent` · **Type**: `task` · **Blocked by**: 12

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
