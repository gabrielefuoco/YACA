# 10 - Gestione Profili e Account

Rendere YACA una piattaforma altamente modulabile e social per le reti di amici e familiari.

## 1. Sincronizzazione Profili Multi-User (es. Coppie)
**Azioni Dettagliate:**
- Implementare un collegamento "Link Account" tra l'Utente A e l'Utente B.
- Sviluppare un algoritmo per la "Fusione delle Raccomandazioni": se entrambi guardano Fantascienza, creare cataloghi con film di fantascienza che **nessuno dei due ha ancora visto**.

## 2. Condivisione e Spostamento Cataloghi
**Azioni Dettagliate:**
- **Share Link:** Creare un link pubblico unico associato a un catalogo curato (es. "La lista Horror di Marco").
- Permettere agli amici (con account YACA) di cliccare il link e aggiungere quel catalogo al proprio profilo.
- Permettere agli utenti di muovere cataloghi liberamente tra i loro profili (es. dal profilo "Generale" al profilo "Bambini").

## 3. Clonazione (Duplicazione Account / Profilo)
**Azioni Dettagliate:**
- **Duplica Profilo:** Utile se un utente vuole creare un profilo simile ma con leggere variazioni (crea una copia identica dei cataloghi nel DB e genera un nuovo ID Profilo).
- **Clona Account:** Funzionalità di backup o trasferimento. Copia integrale (Deep Copy) di tutte le preferenze, configurazioni Trakt/Debrid e cataloghi su un nuovo utente pulito. Necessario script di migrazione.
