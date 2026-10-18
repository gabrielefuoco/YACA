const adminAuth = (req, res, next) => {
    const adminPass = process.env.ADMIN_PASS;
    
    // Se non è configurata la password nel .env, la sezione admin è disabilitata
    if (!adminPass) {
        return res.status(503).json({ error: 'Sezione Admin non configurata sul server (ADMIN_PASS mancante).' });
    }

    const clientPass = req.headers['x-admin-pass'];

    if (!clientPass || clientPass !== adminPass) {
        return res.status(401).json({ error: 'Non autorizzato. Password errata o mancante.' });
    }

    next();
};

module.exports = adminAuth;
