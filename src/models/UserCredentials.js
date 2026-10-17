const mongoose = require('mongoose');

/**
 * UserCredentials: Documento di autenticazione per le credenziali (Ticket 26, Decisione 1).
 * Possiede il segreto che prova l'identità dell'utente (passwordHash), separato da UserAccount.
 * Gestito e interrogato esclusivamente dal modulo di autenticazione (`src/api/auth/`).
 *
 * Primary Key: userId (collegato per userId a UserAccount).
 */
const userCredentialsSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true }
}, {
    timestamps: true
});

module.exports = mongoose.models.UserCredentials || mongoose.model('UserCredentials', userCredentialsSchema);
