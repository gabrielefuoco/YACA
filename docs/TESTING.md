# 🧪 Testing e Qualità Codebase

YACA adotta una strategia di testing rigorosa per garantire che le raccomandazioni siano accurate e che il sistema sia resiliente ai fallimenti delle API esterne.

## 1. Suite di Test (Jest)

La cartella `tests/` contiene oltre 35 file di test che coprono test unitari, di integrazione e di logica complessa.

### Aree Critiche Testate
- **`phase1Math.test.js`**: Verifica la correttezza matematica delle formule di scoring e del Bayesian rating.
- **`robustness.test.js`**: Simula i fallimenti di TMDB e Trakt per verificare che l'addon continui a servire contenuti (graceful degradation).
- **`hybridRecommendations.test.js`**: Testa l'intersezione tra i gusti utente e i filtri AI, garantendo che non ci siano sovrapposizioni o risultati vuoti.
- **`security.test.js`**: Verifica che i prompt AI non siano vulnerabili a injection e che le API Key non vengano esposte.

---

## 2. Testing della Logica di Scoring

I test verificano scenari specifici come:
1.  **Binge Detection**: Se guardo 4 episodi di fila, lo score del genere aumenta del fattore atteso?
2.  **Time Decay**: Dopo 30 giorni di inattività, quanto diminuisce l'influenza di un vecchio film preferito?
3.  **Bayesian Threshold**: Un film con 10/10 e 5 voti deve apparire sotto un film con 8.5/10 e 10.000 voti.

---

## 3. Script di Diagnostica (`scripts/`)

Oltre ai test automatizzati, sono disponibili script per il debug manuale:
- **`test-badges.js`**: Genera anteprime dei badge ImageKit per verificare l'allineamento visivo.
- **`test_ai_keywords.js`**: Testa il mapping tra concetti italiani e keyword TMDB senza avviare l'intero server.
- **`sandbox_profile.js`**: Permette di "giocare" con un profilo di test per vedere come cambiano i suggerimenti in tempo reale.

---

## 4. Pipeline di Validazione

Ogni rilascio segue questo flusso:
1. **Linting**: Controllo formale del codice (ESLint).
2. **Unit Tests**: Validazione delle utility e dei componenti isolati.
3. **Integration Tests**: Simulazione completa di un ciclo di richiesta catalogo.
4. **Build Check**: Verifica che il frontend Next.js sia compilabile correttamente.
