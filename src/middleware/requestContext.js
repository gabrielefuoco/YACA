const { resolveHostUrl } = require('../utils/helpers');

function attachRequestContext(req, _res, next) {
    req.context = req.context || {};
    req.context.hostUrl = resolveHostUrl(req);
    return next();
}

module.exports = { attachRequestContext };
