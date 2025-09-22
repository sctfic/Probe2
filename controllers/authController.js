// controllers/authController.js
const authService = require('../services/authService');
const { V } = require('../utils/icons');

exports.login = async (req, res) => {
    const { login, password } = req.body;
    const credentials = authService.getCredentials();

    if (login !== credentials.login) {
        return res.status(401).json({ success: false, error: 'Login incorrect.' });
    }

    // Si aucun mot de passe n'est défini, la première connexion est réussie, mais il faut forcer la création d'un mdp.
    if (!credentials.pwd) {
        req.session.isAuthenticated = true;
        req.session.user = login;
        // On sauvegarde explicitement la session pour s'assurer qu'elle est persistée
        // avant la prochaine requête du client (pour changer le mot de passe).
        return req.session.save(err => {
            if (err) {
                console.error(`${V.error || 'ERROR:'} Erreur de sauvegarde de la session:`, err);
                return res.status(500).json({ success: false, error: 'Erreur de session.' });
            }
            res.json({ success: true, message: 'Connexion réussie. Veuillez définir un mot de passe.', mustChangePassword: true });
        });
    }

    const isMatch = await authService.verifyPassword(password);
    if (isMatch) {
        req.session.isAuthenticated = true;
        req.session.user = login;
        console.log(` User '${login}' authenticated successfully.`);
        res.json({ success: true, message: 'Connexion réussie.' });
    } else {
        console.warn(`${V.Warn} Failed authentication attempt for user '${login}'.`);
        res.status(401).json({ success: false, error: 'Mot de passe incorrect.' });
    }
};

exports.logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Impossible de se déconnecter.' });
        }
        console.log(`${V.unlock} User logged out.`);
        res.clearCookie('connect.sid'); // Nom du cookie de session par défaut
        res.json({ success: true, message: 'Déconnexion réussie.' });
    });
};

exports.changePassword = async (req, res) => {
    const { newPassword, oldPassword } = req.body;
    const credentials = authService.getCredentials();

    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ success: false, error: 'Le nouveau mot de passe doit faire au moins 4 caractères.' });
    }

    // Si un mot de passe existe, il faut vérifier l'ancien.
    if (credentials.pwd) {
        const isMatch = await authService.verifyPassword(oldPassword);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Ancien mot de passe incorrect.' });
        }
    }

    try {
        await authService.setPassword(newPassword);
        res.json({ success: true, message: 'Mot de passe mis à jour avec succès.' });
    } catch (error) {
        console.error(`${V.error} Erreur lors du changement de mot de passe:`, error);
        res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour du mot de passe.' });
    }
};

exports.getAuthStatus = (req, res) => {
    const credentials = authService.getCredentials();
    res.json({
        isAuthenticated: !!req.session.isAuthenticated,
        user: req.session.user || null,
        isPasswordSet: !!credentials.pwd
    });
};
