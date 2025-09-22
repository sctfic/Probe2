// middleware/authMiddleware.js
const { V } = require('../utils/icons');

exports.isAuthenticated = (req, res, next) => {
    if (req.session.isAuthenticated) {
        return next();
    }
    console.warn(`${V.Warn || 'WARN:'} Tentative d'accès non autorisé à ${req.method} ${req.originalUrl}`);
    res.status(401).json({ success: false, error: 'Authentification requise.' });
};
