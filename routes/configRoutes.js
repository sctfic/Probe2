const express = require('express');
const router = express.Router();
const configManager = require('../services/configManager');

/**
 * @swagger
 * /api/config/vp2:
 *   get:
 *     summary: Récupère la configuration complète des stations (VP2.json)
 *     tags: [Configuration]
 *     description: Retourne le contenu complet du fichier de configuration `VP2.json`.
 *     responses:
 *       200:
 *         description: Le contenu du fichier de configuration VP2.json.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Un objet contenant la configuration de toutes les stations.
 *       500:
 *         description: Erreur serveur lors de la lecture du fichier de configuration.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Erreur interne du serveur.
 */

router.get('/vp2', (req, res) => {
    try {
        const allConfigs = configManager.loadAllConfigs(); // Recharge toutes les configs à chaque appel pour détecter les changements externes
        res.json(allConfigs);
    } catch (error) {
        console.error("Erreur API configuration VP2:", error);
        res.status(500).json({ message: "Erreur serveur" });
    }
});

module.exports = router;