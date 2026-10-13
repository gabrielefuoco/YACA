# 22 — Il micro-banco nativo di YACA

**Status**: `wontfix` · **Type**: `research` · **Blocked by**: nessuno · **Chiuso**: 13/10/2026

## Deciso: non si fa

Nessuno dei due banchi è YACA, e uno snapshot anonimo delle librerie reali direbbe quale dei due ha il
diritto di decidere la ricetta. Ma l'utente ha dichiarato che **gli utenti attuali di YACA «sono test
casuali miei»**: un banco costruito su di loro non misurerebbe YACA, misurerebbe le prove di chi l'ha
costruita — sarebbe **il terzo banco rotto** di questa sessione, dopo quello curato (due popolazioni) e
quello con lo split casuale (gonfiato di 2-3×).

La decisione, presa il 13/10/2026: **non si costruisce**. Le conseguenze sono registrate qui sotto e nel
[ticket 21](21-decisione-ricetta.md).

## Le conseguenze

- Il [ticket 21](21-decisione-ricetta.md) decide **senza** un banco nativo, e lo **dichiara** nel suo esito.
- La specifica (`spec.md`, Out of Scope) porta la decisione come esclusione netta, non come «salvo decisione».
- La mappa non tiene più questa voce fra le cose non specificate.

## Cosa servirebbe perché la decisione si riapra

Una soglia, dichiarata adesso: **un numero di profili reali con storia sufficiente a fare uno split
temporale** (non tre). Se un giorno in produzione ci saranno abbastanza utenti reali, il banco si riapre —
e a quel punto la domanda sulla privacy va posta **prima** di esportare, non dopo: cosa si esporta, come si
anonimizza, dove vive il file (fuori dal repo), chi lo vede. In nessun caso dati di utenti reali entrano
nel repo o in `.scratch/`.
