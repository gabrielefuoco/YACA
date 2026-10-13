# 53 — Le keyword, i due casi, e la cosa che li sovrasta entrambi

**Le domande**: le keyword vengono usate lo stesso? Distinguere il caso di chi *sta* nei suggerimenti da chi non ci sta. Mostrare esempi.

**Le risposte**: sì, le keyword sono sempre nel grafo (peso 0,10). Film per film fanno **entrare 819 titoli e uscire 1.931** — saldo negativo per chi ha comportamento, decisivo per chi non ce l'ha. **Ma il fatto che domina la testa è un altro**: nel top-10 l'**85,5%** delle voci sono **serie**, per utenti il cui film d'oro sono **tutti film**. Una serie non può mai essere colpita.

Script: `keyword-esempi.py` (615 s) · `medio-quota.py` (53 s) · artefatto `.cache/movielens/keyword-esempi.npz`.

---

## 1. Le keyword nella ricetta: sempre, con peso 0,10

```
CF  comportamento dichiarato  0,10
Kc  metadati puliti           0,10   <- le keyword
B   co-visione Trakt          0,10
T   temi                      0,10
K   curatela                  0,60
```
Non c'è nessun caso in cui vengono spente. Cambia **cosa fanno**, e dipende dalla popolazione.

## 2. Film per film: chi entra, chi esce

Stesso grafo due volte, identico tranne il componente dei metadati. Per ogni film d'oro si guarda il rango nelle due versioni.

| | top-100 | top-2000 |
|---|---|---|
| **ENTRANO** per merito loro (fuori senza, dentro con) | **819** (1,31%) | **1.109** (1,77%) |
| **ESCONO** per colpa loro (dentro senza, fuori con) | **1.931** (3,08%) | **2.578** (4,11%) |
| dentro in entrambi | 9.441 | 47.291 |
| fuori in entrambi | 50.565 | 11.778 |
| **saldo netto** | **−1.112** | **−1.469** |

Rango mediano del film d'oro: **513 con le keyword, 435 senza**. E il divario è di *due volte e mezzo* in uscita rispetto all'entrata.

**Esempi di chi entra** (il rango migliora di più):
```
Lost Christmas            senza 63.958 -> con  2.144
Oh, Ramona!               senza 61.206 -> con  4.030
Shredder                  senza 61.418 -> con  4.951   <- NESSUN comportamento
Kevin Smith: Too Fat For 40  senza 61.128 -> con  5.038
Naufragio                 senza 56.365 -> con  1.620
Bo Burnham: Make Happy    senza 60.374 -> con 10.732
Un anno senza Babbo Natale  senza 49.186 -> con    604
```
**Esempi di chi esce** (il rango peggiora di più):
```
The Comedians of Comedy   senza 21.466 -> con 37.420
The Gate of Heavenly Peace senza 17.988 -> con 33.324
Žižek!                    senza 24.541 -> con 39.617
Buena Vista Social Club   senza 29.923 -> con 44.311
Wyrm                      senza 12.008 -> con 25.030
I dilettanti              senza 12.524 -> con 25.391
```
Guardando le due liste si vede il motivo: **i metadati spingono documentari, film di nicchia e concerti verso il fondo**, e tirano su commedie e titoli più "riconoscibili". Non è rumore: è il segnale dei metadati che, quando c'è comportamento, dice la cosa sbagliata.

## 3. I due casi

### Chi **ha** comportamento (62.744 dei 62.756 film d'oro)

Sono il 99,98% della valutazione. Per loro le keyword **tolgono più di quanto diano**: il saldo è −1.469 al top-2000. Il motivo è nella sezione 2: quando il comportamento c'è, è lui a sapere la risposta, e i metadati sono un secondo parere più debole che sposta la classifica nel verso sbagliato.

### Chi **non ha** comportamento (12 film d'oro — sì, dodici)

**Questa è la scoperta metodologica**: la valutazione **non può** misurare il caso che interessa all'utente, perché il gold di MovieLens è fatto di film che MovieLens conosce, quindi ha comportamento per costruzione. Sui 12 casi disponibili: rango mediano **27.767 con le keyword, 38.614 senza** — le keyword li tengono su. Ma 12 è niente.

Per quel caso serve l'altro banco (`titoli-nuovi.py`, report 50): si fanno nascere 5.000 film togliendo loro comportamento, co-visione e curatela. Lì le keyword sono **l'unico aggancio** e senza di esse il recupero **dimezza** (3,92% → 1,92% al top-500). E l'esempio qui sopra, `Shredder`, è uno di quei casi: **61.418 → 4.951 grazie ai soli metadati**.

**In una riga**: per chi ha comportamento le keyword sono zavorra, per chi non ce l'ha sono la vita. Sono sempre accese perché il secondo caso non ha alternative — non perché convengano al primo.

## 4. La cosa che sovrasta tutto: la testa è invasa dall'altro medium

| | serie nel catalogo | nel top-10 | nel top-100 | nel top-2000 |
|---|---|---|---|---|
| quota di serie | **25,0%** | **85,5%** | 27,8% | 11,0% |

**Per utenti il cui gold è al 100% film.** La posizione mediana del **primo film** nella lista è **15**. Il top-10 è occupato per l'85% da serie, che il metro non può premiare.

Questo spiega, in un colpo, tutto quello che la sessione aveva chiamato "testa rotta":
- il tasso di colpi **1,69% al top-10 e 9,67% a 50-100** — i film cominciano dopo la quindicesima posizione;
- il @10 dello **0,59%** contro un oracolo del **14,86%**;
- perché le foglie coerenti e piccole sembravano irraggiungibili.

**Quanto di quel divario è l'invasione e quanto è ordinamento?** Lo stesso cesto, togliendo le serie:

| ordinamento | come sta ora @10 / @100 | **solo film @10 / @100** |
|---|---|---|
| attivazione | 0,59% / 16,19% | **5,21% / 24,57%** |
| attivazione sul comportamento | 5,84% / 28,75% | 5,84% / 28,75% *(identico)* |
| GBM | 6,99% / 34,62% | 7,00% / 34,62% *(identico)* |

**Il guadagno dell'ordinamento era in gran parte questo.** Al @10, da 0,59% a 6,99%: **5,21 dei 6,4 punti (l'80%) sono "smettere di mettere serie in cima a chi guarda film"**. Al @100 è il 45%.

E si capisce perché: `att_cf` e il GBM si appoggiano al comportamento, che esiste **solo per i film** — quindi declassano le serie per costruzione. Non hanno imparato a ordinare meglio: hanno imparato a mettere i film davanti.

**La quota di medio** (per un motore che vuole restare agnostico) non aiuta su questo metro e lo peggiora, come deve:

| | @10 | @100 | @500 |
|---|---|---|---|
| attivazione come sta ora | 0,59% | 16,19% | 49,37% |
| attivazione, quota serie 15% | 4,75% | 22,42% | 49,68% |
| GBM, quota serie 15% | 6,38% | 31,64% | 63,42% |

**Il punto delicato, detto senza girarci intorno**: il metro premia "togli le serie", ma il requisito di prodotto è l'agnosticismo. **Il metro non può decidere il mix giusto** — servono cronologie di serie. Fino ad allora la quota è una decisione di prodotto, non una misura, e il numero che ho misurato (2,14× al @100) va letto come **"con un bersaglio che contiene solo film, e mettendo i film davanti"**.

## 5. Il ponte cross-medium, letto a occhio (le serie)

Le 8 cose più vicine a 4 serie, per **comportamento previsto** e per **metadati puri**:

| serie | per comportamento previsto | per metadati puri |
|---|---|---|
| **Arcane** | I bambini che inseguono le stelle · Trollhunters · I racconti di Terramare · Il mostro dei mari · Miraculous World · Earwig e la strega · Over the Moon · The Witcher: Nightmare of the Wolf | Agenzia Segreta Controllo Magia · Johnny il paladino · Presto · Ultramarines: A Warhammer 40.000 Movie · **Tè di sangue e filo rosso** · Kirikou · The Daydreamer · Alma |
| **S.O.Z: Soldados o Zombies** | El Incidente · Pelle · Eva · Toc Toc · Proyecto Lázaro · Il corpo di Anna Fritz · Flashback · PLAN 75 | Solos · Émesis · Animales racionales · **La maledizione del cannibale** · The Video Dead · The Clearing · Yummy · Infection |
| **Master of None** | Dude · Swiped · Someone Great · Z-O-M-B-I-E-S · Amy Schumer · Non è romantico? · Expelled · Be Somebody | Ciao America! · Someone Marry Barry · Discontinued · **Il ruggito del topo** · Una bugia per amore · **For Y'ur Height Only** · Avventura a mezzanotte · Una borsa piena di guai |
| **The Serpent** | River · The Eye of the Storm · Una preghiera prima dell'alba · Australia Day · Sold · Till We Meet Again · Last Ride · Charlie's Country | **The Furnace** · The Eye of the Storm · **Operation Cobra** · Shame · The Boys · Goldstone · Sweet Country · **India's Daughter** |

**Il comportamento previsto è visibilmente meglio.** *Arcane* → solo animazione e fantasy; *S.O.Z* (serie spagnola) → **film spagnoli**; *Master of None* → **commedie americane**; *The Serpent* → **cinema australiano**. I metadati puri danno liste plausibili ma più larghe, con intrusioni che si vedono a occhio (*Ultramarines*, *Kirikou*, *La maledizione del cannibale*, *India's Daughter*, *For Y'ur Height Only*).

**E questo ribalta una conclusione del report 49.** Lo studente `CFst` era stato **bocciato** perché "diluisce" (47,97% contro 50,40% al @500). Ma quella misura è **film contro film**: non poteva vedere il ponte, che è esattamente il suo mestiere. Guardato a occhio, **il ponte cross-medium prodotto dallo studente è migliore di quello dei metadati** — cioè `CFst` merita di stare nel grafo per l'uso cross-medium, anche se peggiora il numero sul lato film.

## 6. Cosa fare adesso

1. **Tenere `CFst` nel grafo**, con un peso suo, per il ponte cross-medium: la bocciatura del report 49 era su un metro cieco a quel compito.
2. **Decidere la quota di medio come scelta di prodotto**, non dedurla da questa metrica (85% di serie nel top-10 per un utente di film è probabilmente troppo; il 15-30% è la forchetta ragionevole).
3. **Misurare con un bersaglio che contenga le serie.** Finché non c'è, ogni numero sulla testa va letta come "lato film", e il 2,14× al @100 come "lato film, con i film davanti".
4. **Le keyword restano accese**, ma sapendo cosa fanno: zavorra per chi ha comportamento, unico aggancio per chi non ce l'ha.
