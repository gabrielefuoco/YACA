/**
 * libraryConversionRetry.js
 *
 * Facade e re-export della macchina a stati della conversione (Ticket 16).
 * La dichiarazione formale e la documentazione vivono in ./conversionStateMachine.js.
 */

const {
    MAX_CONVERSION_ATTEMPTS,
    PARKED_REASONS,
    CONVERSION_STATES,
    readConversionAttempts,
    isParked,
    applyConversionAttempt,
    unparkItem,
    summarizeParkedRun
} = require('./conversionStateMachine');

module.exports = {
    MAX_CONVERSION_ATTEMPTS,
    PARKED_REASONS,
    CONVERSION_STATES,
    readConversionAttempts,
    isParked,
    applyConversionAttempt,
    unparkItem,
    summarizeParkedRun
};