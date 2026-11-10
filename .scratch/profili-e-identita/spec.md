# Spec — Profili come modalità e identità di account

Stato: bozza di lavoro. Le decisioni ancora aperte sono marcate **DA DECIDERE** e vivono nei ticket.

## 1. Il problema

Oggi il profilo è insieme *identità* (nome, emoji, impostazioni), *configurazione* (cursori, cataloghi attivi) e *sorgente di segnali* (storia di visione). Da qui tre difetti:

- cinque profili finiscono per essere cinque persone diverse che non esistono: la stessa persona con cursori diversi e cataloghi diversi;
- i cataloghi si attivano in un posto (dashboard), si vedono in un altro (Esplora), si servono in un terzo (Stremio), e i tre elenchi non coincidono mai;
- il tipo di contenuto (film / serie / anime / bambini) è un'impostazione nascosta invece di essere la cosa che si sceglie.

## 2. Il modello

**Account** = la persona. Possiede: storia di visione, watchlist, DNA, cursori, cataloghi creati, cataloghi attivi, ordine dei cataloghi.

**Modalità** = come l'account guarda in questo momento. Cinque, predefinite, **già esistenti alla creazione dell'account**, non rinominabili nel tipo, **attivabili una sola alla volta**:

| Modalità | Segnali usati | Cosa si può consigliare | Cataloghi visibili |
|---|---|---|---|
| **Generale** | tutta la storia | tutto | tutti |
| **Film** | tutta la storia | solo film | solo film |
| **Serie TV** | tutta la storia | solo serie (non anime) | solo serie |
| **Anime** | tutta la storia | solo anime (film e serie) | solo anime |
| **Bambini** | **solo contenuti per bambini** | solo contenuti per bambini | solo per bambini |

Il principio: **il modo restringe l'uscita, non l'ingresso**. L'unica eccezione è Bambini, che isola anche i semi — non è una preferenza di gusto ma un vincolo di sicurezza: la storia horror del genitore non deve guidare le righe del bambino. Un principio e un'eccezione motivata, non cinque regole diverse.

Regole:

- Un tipo per account: non due modalità Film. La pagina profili mostra cinque caselle, una vuota se il tipo non è mai stato attivato.
- Il tipo **non si cambia**: cambiare idea significa usare un'altra modalità.
- **Un solo addon per account.** L'URL è quella di sempre; cambiare modalità cambia ciò che Stremio serve.
- Nessuna modalità è "speciale": Generale non è il default implicito, è una modalità come le altre.

**Nota sul caso Anime** (voluta, non un compromesso): i semi includono titoli non anime — servono a far camminare meglio la propagazione — ma il retrieval restituisce esclusivamente anime. Un utente che guarda tanto cinema e poco anime deve ricevere anime coerenti con il suo cinema, non anime scelti a caso perché sono gli unici presenti. **Oggi questo non succede**: `src/pool/index.js:254-258` cancella i semi non anime quando la politica è `only`. Va rimosso (ticket 11).

**Bambini** è una lista nera di **keyword** (semi + gruppi A e B: gore, tortura, violenza sessuale, abuso su minori, druga, suicidio, pornografia e i loro vicini semantici) **più le certificazioni** (TV-MA, R, NC-17, X, 14+), applicata **prima del taglio**. **Nessun filtro sui generi**: deciso esplicitamente, perché Crime e Thriller come genere secondario taglierebbero cinema per ragazzi, e perché *Il Signore degli Anelli* deve restare ammesso. La curatela la fanno i cataloghi (ticket 10).

Nota onesta sulla severità: le sole keyword escludono l'11,8% del canone; con le certificazioni si sale, ma la modalità resta **permissiva per scelta** — *Il Padrino* non è gore e passa. Chi legge fra sei mesi lo sappia.

## 3. Configurazione a livello account

Saltano all'account e non dipendono dalla modalità:

- **Cursori Tonalità e Notorietà** — una coppia sola per account.
- **DNA** — uno per account, calcolato su tutta la storia. Il modo decide cosa si recupera, non chi sei.
- **Cataloghi creati** (Creator) — a livello account, ciascuno con il proprio tipo.
- **Libreria utente** — a livello account: la watchlist è della persona, non della modalità.

Restano **per modo**:

- **Cataloghi attivi e loro ordine** — ogni modo ha il suo elenco, quindi un catalogo incompatibile non può esistere e non serve alcun avviso.

Conseguenza da accettare: non si può avere "Tonalità cozy in Film e cupa in Serie". È il prezzo della logica unica, ed è il prezzo scelto.

## 4. Esplora

Unico luogo dove i cataloghi si attivano. Gerarchia fissa:

1. **Suggerimenti di visione & Watchlist** — gli scaffali calcolati dal grafo per la modalità attiva, più la watchlist (`I film della mia watchlist`, `Le serie della mia watchlist`, `Gli anime della mia watchlist`) filtrata per modalità.
2. **Le mie creazioni** — i cataloghi del Creator, filtrati per tipo.
3. **Tutti** — i cataloghi rimanenti, raggruppati per tipo.

Requisiti:

- il selettore a pillola per il tipo non deve sembrare contenuto in un blocco (ombra);
- ogni voce ha lo stesso widget di lista dei Cataloghi attivi (vedi §6);
- un catalogo non servibile nella modalità corrente non compare, non compare disabilitato: non esiste in quel mondo.

## 5. Dashboard e gerarchia

Dall'alto: top bar (logo YACA, pillole Dashboard / Esplora / Impostazioni — Esplora è in barra perché è l'unico posto dove i cataloghi si attivano, e un posto così deve stare a un clic di distanza) → **account** (caselle delle cinque modalità, una attiva) → **cursori** (Tonalità, Notorietà, con anteprima) → **cataloghi dei suggerimenti del solo modo attivo** (visibili, con il loro tipo, **non attivabili qui**) → **Creator** → **DNA & AI LAB** (DNA dell'account, uno solo) → **Libreria utente** → **Cataloghi attivi del modo attivo** (in fondo, riordinabili).

Il principio: qui si *guarda e si regola*, in Esplora si *sceglie*. Un catalogo che si può attivare in due posti è un catalogo che si attiva nei posti sbagliati. E i suggerimenti del modo attivo sono una chiamata sola al grafo: una verità, non cinque.

## 6. Cataloghi attivi — correzioni

- Via il pulsante **Copia**.
- Via la dicitura «Catalogo tematico preconfigurato e costantemente aggiornato».
- Via il badge con il numero dei filtri.
- Il badge **film / serie / anime** sale accanto a «preset» e «anime».
- Lo stesso widget di lista vale in **Esplora**.

## 7. Manifest

Il manifest dipende dalla modalità attiva: in modalità Film dichiara solo cataloghi film, in Anime solo anime, in Bambini solo contenuti per bambini. Ne segue:

- l'impronta del reconciler deve includere la modalità attiva, altrimenti il cambio non arriva mai a Stremio;
- i cataloghi non più dichiarati spariscono dal client: un catalogo attivo ma non servibile nella modalità corrente non deve restare appeso con zero elementi;
- nessun alias per gli id vecchi.

## 8. Requisiti visivi

Coerenza con i token esistenti (beige/sabbia, `glass-card`, `bg-white/40`, `text-marrow-deep`). Nessun colore nuovo.

1. Sfondo delle pagine: **animato**, onde o bolle, leggero, minimale, stessi colori. Deve rispettare `prefers-reduced-motion`.
2. Top bar più chiara, per staccare dal fondo; **logo YACA più grande**.
3. Ombre: il selettore a pillola e le pillole Dashboard/Impostazioni non devono delineare il contenitore. Il Creatore non deve mostrare l'ombra bianca del riquadro che contiene «Aggiorna anteprima» e «Crea catalogo».
4. Libreria utente: pulsanti coerenti col resto e gerarchia corretta nella pagina.
5. Impostazioni: da web deve usare lo spazio (oggi troppo stretto); da mobile è già corretto e non va rotto.

## 9. Conseguenze tecniche

- **Cache**: la chiave degli scaffali deve includere la modalità; senza, due modalità diverse si scambiano le righe.
- **Manifest e fingerprint**: la modalità entra nell'impronta; il reconciler rilancia il sync quando cambia.
- **Migrazione**: **tabula rasa**. I profili esistenti vengono scartati, i cinque modi nascono vuoti, i cataloghi si riattivano da Esplora. Si perdono 77 attivazioni sull'account reale; si guadagna l'assenza di qualsiasi logica di fusione.
- **Filtri**: medium, anime e bambini devono agire **prima** del taglio. Oggi bambini e anime agiscono dopo (`src/stremio/catalogHandler.js:157-177`) e il filtro bambini è solo negativo: entrambe le cose vanno corrette (ticket 10 e 11).
- **Banco casi**: la modalità è un filtro, non una taratura. Nessuna nuova misura sul banco.

## 10. Criteri di accettazione

1. Un account nuovo nasce con cinque modalità già presenti; una sola attiva.
2. Passando da Film a Serie, Stremio smette di dichiarare cataloghi film e inizia a dichiarare quelli serie, senza lasciare righe vuote.
3. In modalità Anime ogni riga servita contiene solo anime; in Bambini solo contenuti per bambini.
4. Esplora mostra i tre gruppi nell'ordine dato, e i cataloghi attivabili compaiono solo lì.
5. I cataloghi attivi si riordinano e l'ordine arriva a Stremio.
6. Cursori e cataloghi attivi sono uno per account: cambiarli in una modalità li cambia per tutte.
7. Nessuna delle correzioni visive elencate sopravvive come regressione: ombre, top bar, logo, sfondo, Impostazioni.
