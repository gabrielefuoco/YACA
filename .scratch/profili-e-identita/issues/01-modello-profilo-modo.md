# Il profilo diventa modalità: che forma ha il modello?

Status: resolved
Type: grilling
Blocked by: —

## Question

Oggi il profilo è identità + configurazione + segnale insieme. Deve diventare una **modalità** dell'account: cinque, precreate, mutuamente esclusive, col tipo immutabile. Serve decidere la forma esatta del modello, perché ogni altro ticket la eredita.

Da chiudere:

1. **Dove vive il tipo** — campo esplicito `tipo: generale|film|serie|anime|bambini` sul profilo, oppure derivato dai `typeSelectors` già esistenti (`film`, `serie`, `anime: only|exclude`) più `kidsMode`? Il derivato non aggiunge verità ma rende il tipo una funzione di tre booleani che possono contraddirsi (film+serie entrambi falsi = che modalità è?); l'esplicito è una seconda fonte di verità da tenere allineata. Scegliere, e dire quale delle due vince quando divergono.
2. **Le cinque caselle precreate** — create alla registrazione, o alla prima apertura della dashboard? Cosa contiene una modalità mai attivata: nessun catalogo attivo, cursori a zero, DNA vuoto?
3. **Cosa eredita un profilo esistente** — i due account reali hanno profili con cursori e cataloghi salvati per profilo. Regola di vittoria quando due profili convergono in una configurazione d'account: vince il profilo attivo al momento della migrazione, oppure si prende l'unione dei cataloghi attivi, oppure si azzera e si riparte? Nessuna delle tre è gratis: la prima perde dati, la seconda può attivare cataloghi incompatibili con la modalità, la terza è onesta ma sgradevole.
4. **Cosa si può ancora avere per profilo** — resta qualcosa? Il nome della modalità è fisso (Generale, Film, …) o l'utente può sovrascriverlo con un'emoji? La lingua e la regione sono dell'account o della modalità?
5. **Il profilo attivo** — `config.activeProfileId` sopravvive come "modalità attiva". Chi la cambia: solo la dashboard, o anche Stremio (che non ha un modo per farlo)? Cosa vede il client nel frattempo.

La decisione va scritta qui, con la forma del documento `AddonConfig` risultante (campi aggiunti, rimossi, spostati) e la regola di migrazione.

## Risoluzione

### 1. Dove vive il tipo: campo esplicito, leve derivate

Il profilo porta `modo: 'generale' | 'film' | 'serie' | 'anime' | 'bambini'`, **immutabile**. Le leve tecniche sono *uscite* di una funzione unica e **non scrivibili dall'esterno**:

```
derivaLeve('film')
  -> { medium: 'movie', anime: 'exclude', kids: false }
```

Nessun consumatore deduce il modo dai booleani, e i booleani non possono contraddire il modo perché nessuno li scrive a mano. `typeSelectors` e `kidsMode` sopravvivono solo come campi derivati in memoria, mai persistiti come verità.

Motivo: il modo decide anche **quali cataloghi esistono** e **cosa dichiara il manifest**. Un fatto con quel peso non si deduce da tre valori combinabili a caso.

### 2. Le cinque caselle

Materializzate pigramente alla prima lettura dell'account (idempotente, non un job di migrazione): se mancano, si creano le cinque. Un modo mai attivato ha: nessun catalogo attivo, emoji vuota, nessun DNA proprio (il DNA è dell'account, vedi ticket 02). Nome **fisso**, emoji **scelta dall'utente**.

### 3. Migrazione: tabula rasa

I profili esistenti vengono **scartati**, non mappati. L'account riparte con cinque modi vuoti e riattiva i cataloghi da Esplora.

Costo accettato consapevolmente: si perdono **settantasette attivazioni** sui cinque profili attuali dell'account reale (`Generale (Tutto)` 21, `Solo Serie TV` 22, `Otaku Hardcore (Anime)` 16, `Horror Night` 14, `Generale` 0). Beneficio: nessuna logica di fusione, che è la parte che sbaglia in silenzio. `customCatalogs` è vuoto su entrambi gli account, quindi nessuna creazione va salvata.

### 4. Cosa resta per profilo

Solo l'**emoji**. Tutto il resto sale all'account: `language`, `region`, `includeAdult`, `tmdbKey`, `fastPresetRefresh`, `erdbConfig`, `kidsMode`, `typeSelectors`.

### 5. Chi cambia il modo

Solo la dashboard: Stremio non ha un modo per farlo. Il cambio è un'azione esplicita con un ritardo di propagazione **non misurabile in secondi** (vedi ticket 04): il client rilegge la collection all'avvio o al cambio di vista. L'interfaccia deve dirlo:

> «Modalità attivata. I cataloghi su Stremio si aggiorneranno alla prossima apertura dell'app; se Stremio è già aperta, ricarica la pagina o riavviala.»

### Forma risultante di `AddonConfig`

```
config {
  activeModo: 'film'            // era activeProfileId
  sliders: { tonalita, notorieta }
  cataloghi: {                  // era profiles[].catalogs
    generale: [{id, ordine}], film: [...], serie: [...], anime: [...], bambini: [...]
  }
}
customCatalogs[]                // invariato, dell'account, con tipo
profiles[]                      // ridotto: { modo, emoji }  (cinque, uno per modo)
```

Rimosso: `config.activeProfileId`, `profiles[].name`, `profiles[].catalogs`, `profiles[].settings.*` (tranne l'emoji). Aggiunto: `profiles[].modo`, `config.activeModo`, `config.sliders`, `config.cataloghi`.

### Decisioni collaterali chiuse nella stessa sessione

- **Semi per modo**: solo Bambini isola i semi (storia filtrata ai contenuti per bambini). Generale, Film, Serie e Anime usano **tutta la storia** e filtrano soltanto l'uscita. Un principio più un'eccezione motivata da sicurezza, non da gusto. (Conseguenza: oggi in modalità Anime i semi non-anime vengono **cancellati** — `src/pool/index.js:254-258` — e questo va rimosso; vedi ticket 11.)
- **Cataloghi attivi per modo**, non per account: ogni modo ha il suo elenco e il suo ordine. Così un catalogo incompatibile non può esistere, e non serve alcun avviso di «cataloghi non disponibili». I **cursori** restano unici per account.
- **Suggerimenti in dashboard**: solo il modo attivo (una chiamata al grafo, una verità).
- **Bambini**: lista nera di keyword, nessun lasciapassare obbligatorio; curatela nei cataloghi. Vedi ticket 11.
