# 12 — Rubrica: rumore del giudice e promessa tematica

**Stato**: `ready-for-agent` · **Causa**: metodo della campagna · **Fonte**: [report §5](../ricerche/01-report-qc-cataloghi.md)

## Problema

La rubrica a 5 dimensioni ha funzionato (582 righe di errore, tutte verificabili), ma ha due difetti misurati che
vanno corretti **prima** di un secondo giro, altrimenti il ranking sembra più preciso di quanto sia.

1. **Rumore del giudice**: su 4 cataloghi ri-giudicati alla cieca, Δ medio assoluto **12,8 punti**, Δ massimo **34**
   con verdetto ribaltato (`preset_anime_shonen`: N 57 vs P 91; `preset_pop_series`: B 78 vs P 85).
   La radice non è aritmetica: la rubrica non distingue **promessa letterale** («rispetta i filtri dichiarati») da
   **promessa tematica** («mantiene ciò che il nome fa credere»), e i due giudici hanno scelto scale diverse.
2. **Precisione illusoria**: 40 verdetti su 160 (25%) stanno entro ±3 punti da una soglia; 7 cataloghi sono P con
   6-8 righe di errore (il cap a 8 satura il conteggio).

## Approccio

1. **Separare le due letture della pertinenza** in due dimensioni o in due ancore dichiarate: *aderenza ai filtri*
   (verificabile a macchina) e *aderenza alla promessa del nome* (giudizio). Il caso `anime_shonen` diventa
   riproducibile: 10/15 titoli in genere → 62-67, non 25 e non 100.
2. **Doppio giudice obbligatorio su N e B** (o su tutti i verdetti a ±5 dalla soglia), con adjudication
   dell'orchestratore e correzione registrata — il meccanismo esiste già (`review/correzioni.json`,
   `qc-aggregate.js`).
3. **Pubblicare a bande**: P ≥ 80, B 60-79, N < 60 sono già bande; il report deve dire esplicitamente che
   differenze sotto i 10 punti non sono un fatto. Il flag `borderline` è già calcolato.
4. **Depurare il cap degli errori**: dire ai giudici di non fermarsi a 8 righe quando il difetto è sistematico
   (indicare «8+ e il difetto è diffuso» con la quota stimata).

## Criteri di accettazione

- Un ri-giudizio cieco di 10 cataloghi con Δ medio ≤ 10 e nessun verdetto ribaltato.
- L'adjudication è un artefatto (`correzioni.json`) e non una nota a mano nel report.
- Nel briefing del secondo giro, le ancore contengono un esempio per la promessa tematica e uno per quella letterale.

## Fuori ambito

L'automazione del giudizio (un modello che assegna i punteggi da solo): la campagna vale perché qualcuno legge i titoli.
