// TRANSITIONAL SHIM: Legacy User model has been deleted (clean-slate, no old users).
// All new code should import UserAccount or AddonConfig directly from src/db/models/.
// This shim re-exports UserAccount so existing code that still does
// require('../models/User') won't crash at import time during the transition.
module.exports = require('../db/models/UserAccount');
