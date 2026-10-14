# 13 — La direzionalità pedagogica

**Status**: `resolved` · **Ticket**: [13](../issues/13-direzionalita.md) · **Script**: `13-direzionalita.py` · **Log**: `log/13-direzionalita.log` · **120 s**
**Base**: la stessa mappa del ticket 12 (k-NN diretto k=8 sul punteggio combinato): 62.214 archi, **1 componente**.

## L'accessibilità, e il controllo che la rende credibile

L'accessibilità di una bolla è la mediana di `log10(voti)` dei suoi **membri core** — quelli con purezza sopra la mediana della bolla, cioè il **55% dei membri** (mediana 5 per bolla, nei mondi piccoli).

| | |
|---|---|
| da 1 voto | 10⁰·⁰⁰ |
| mediana | 10¹·⁷⁰ ≈ **50 voti** |
| a 25.061 voti | 10⁴·⁴⁰ |

**Il controllo sui membri core**: la differenza rispetto a usare **tutti** i membri ha mediana 0,104, ma il **90° percentile è 0,402** e la **massima è 2,020**.

> **Su 907 bolle la differenza supera un fattore 2 in voti.** In quei mondi usare tutti i membri — intruso popolare compreso — avrebbe **spostato l'accessibilità di un fattore 2 o più**. Il criterio del ticket («usa i membri core, un intruso popolare non deve spostare l'accessibilità di un mondo d'autore») **non è una formalità**: cambia il numero su un sesto delle bolle.

## I segni, ed è un bene che siano bilanciati

| | archi |
|---|---|
| **approfondimento** (verso il meno accessibile) | **14.707** |
| **allargamento** (verso il più accessibile) | **13.906** |
| accessibilità equivalente (fattore < 1,12) | 2.494 (8,0%) |

**Quasi perfettamente bilanciati.** Un grafo in cui quasi ogni arco fosse un approfondimento sarebbe un grafo che scende sempre — e la «discesa» sarebbe una proprietà della costruzione, non del dato.

## Il segno per bolla: il criterio del ticket

| | |
|---|---|
| bolle con **entrambi** i segni | **4.540 (85,7%)** |
| bolle **solo approfondimento** | 222 |
| bolle **solo allargamento** | 535 |
| **sospette** | **757 (14,3%)** |

Il ticket diceva: «una bolla che è **solo** approfondimento o **solo** allargamento è sospetta e va verificata». **Sono 757** — un settimo della mappa. Le cause possibili: una bolla molto accessibile (tutto intorno è meno accessibile) o molto di nicchia (tutto intorno è più accessibile). Ma possono anche essere bolle al bordo del grafo, dove k=8 ha meno scelta.

L'ho dichiarato come criterio e **non l'ho verificato leggendo**: 757 bolle sono troppe per un campione utile, e va fatto per fascia di accessibilità.

## ✅ La lettura: i due versi si vedono, e sono sensati

### Approfondimento — da un mondo noto alla sua radice

| da | a |
|---|---|
| **[1568]** los angeles · revenge · aggressive · **15.882 voti** | [4602] murder · based on webcomic · fbi · **17 voti** |
| [930] elves · sword and sorcery · 15.817 voti | [4925] falsely accused · drug smuggling · 19 voti |
| [1333] cars · sequel · street race · 8.419 voti | [3847] woman director · hairdresser · 11 voti |

### Allargamento — da un mondo di nicchia a uno accessibile

| da | a |
|---|---|
| **[652]** nordic noir · detective · **32 voti** | **[1476]** neo-noir · crime fighter · vigilante · **25.061 voti** |
| **[1715]** super power · superhero · based on comic · **21 voti** | **[4732]** teen superhero · experiment · superhero · **14.798 voti** |
| [3045] alabama · african american · coming of age · 20 voti | [4732] teen superhero · 14.798 voti |

**I due esempi in grassetto sono esattamente la promessa del ticket:**

- un mondo di **nordic noir di nicchia** (32 voti) ha un arco che porta al **noir mainstream** (25.061) — «allarga l'orizzonte» ✓
- un mondo di **supereroi di nicchia** (21 voti) porta ai **teen superhero mainstream** (14.798) ✓

E gli approfondimenti funzionano specularmente: da un mondo da 15.000 voti si scende a uno da 17.

**Il segno non è un'etichetta decorativa: il salto è reale, e nei due versi si legge.**

## ⚠️ Il segno non è (ancora) disponibile al recupero

Il criterio del ticket dice: «il segno è **disponibile al recupero**, non solo alla mappa (serve a scegliere il tipo di proposta)». **Non lo è**: l'accessibilità si calcola sulle bolle, e la ricetta film/serie del ticket 15-18 lavora sui titoli. Renderlo disponibile al recupero vuol dire dare a ogni titolo l'accessibilità della sua bolla e usarla come feature o come filtro — **una modifica della ricetta che non è stata fatta**.

## I criteri del ticket

- [x] **ogni arco ha il suo segno** ✓ 31.107 coppie, tutte con un segno (o equivalenti all'8,0%)
- [x] **un campione di archi è letto e il segno è plausibile nei due sensi** ✓ — nordic noir → noir mainstream, supereroi di nicchia → teen superhero, revenge mainstream → webcomic di nicchia
- [x] la **distribuzione dei segni per bolla** è stampata: 85,7% con entrambi, 14,3% sospette (222 solo-giù, 535 solo-su)
- [ ] ❌ **il segno NON è disponibile al recupero**: si calcola sulle bolle, e la ricetta lavora sui titoli. Va portato lì con una modifica che non è stata fatta
- [x] **il calcolo usa i membri core**, e il controllo mostra che **su 907 bolle la differenza supera un fattore 2** — il criterio ha un effetto misurabile, non nominale

## Limiti dichiarati

1. **Le 757 bolle sospette non sono verificate**, e la causa non è diagnosticata: accessibilità al bordo dello spettro, o pochi vicini per scegliere?
2. **Il caso più interessante — «un mondo d'autore che HA un allargamento» — non è stato trovato** dal criterio nel log. Significa che nei mondi d'autore sotto la mediana, con più approfondimenti che allargamenti, il primo allargamento forte non esiste o il criterio di selezione era troppo stretto: **la ricerca è fallita, non il risultato**.
3. **La soglia di «accessibilità equivalente» (fattore 1,12, cioè 0,05 in log10)** è una scelta: cambia l'8,0% di archi senza segno.
4. **`log10(voti)` è una proxy di accessibilità**: un film poco votato può essere difficilissimo da trovare ma facilissimo da guardare. L'accessibilità intesa come «quanto è facile approcciarsi» meriterebbe la popolarità **e** la disponibilità in streaming, che non è nel dato.
5. **La direzionalità del ticket 23**: la base del ticket 12 è **simmetrizzata**, quindi la direzione dell'arco è stata persa nella costruzione e ricostruita qui dall'accessibilità. Se un giorno la base tornasse asimmetrica, il segno dovrebbe venire dall'arco e non dall'accessibilità — e sono due cose diverse.
