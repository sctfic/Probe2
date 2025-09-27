// controllers/updateController.js
const axios = require('axios');
const AdmZip = require('adm-zip');
const fs = require('fs-extra');
const path = require('path');
const { V } = require('../utils/icons');

const UPDATE_URL = 'https://github.com/sctfic/Probe2/archive/refs/heads/main.zip';
const ROOT_DIR = path.join(__dirname, '..');
const TEMP_DIR = path.join(ROOT_DIR, 'update_temp');

const ITEMS_TO_UPDATE = [
    'controllers',
    'docs',
    'middleware',
    'public',
    'routes',
    'services',
    'utils',
    'app.js',
    'ecosystem.config.js',
    'package.json',
    'README.md'
];

exports.applyUpdate = async (req, res) => {
    console.log(`${V.download} Lancement du processus de mise à jour...`);
    res.status(202).json({ success: true, message: 'Mise à jour lancée. Le serveur va redémarrer si des changements sont appliqués.' });

    try {
        // 1. Nettoyer le répertoire temporaire s'il existe
        await fs.remove(TEMP_DIR);
        await fs.ensureDir(TEMP_DIR);
        console.log(`${V.info} Répertoire temporaire créé : ${TEMP_DIR}`);

        // 2. Télécharger le zip
        console.log(`${V.download} Téléchargement de la mise à jour depuis ${UPDATE_URL}`);
        const response = await axios({
            url: UPDATE_URL,
            method: 'GET',
            responseType: 'arraybuffer'
        });

        // 3. Décompresser le zip
        console.log(`${V.package} Décompression de l'archive...`);
        const zip = new AdmZip(response.data);
        const zipEntries = zip.getEntries();
        const rootFolderName = zipEntries[0].entryName.split('/')[0];
        zip.extractAllTo(TEMP_DIR, true);
        const sourceDir = path.join(TEMP_DIR, rootFolderName);
        console.log(`${V.info} Source de la mise à jour : ${sourceDir}`);

        // 4. Remplacer les fichiers et dossiers
        console.log(`${V.write} Remplacement des fichiers de l'application...`);
        for (const item of ITEMS_TO_UPDATE) {
            const sourcePath = path.join(sourceDir, item);
            const destPath = path.join(ROOT_DIR, item);

            if (await fs.pathExists(sourcePath)) {
                try {
                    await fs.copy(sourcePath, destPath, { overwrite: true });
                    console.log(`${V.Check}  - ${item} mis à jour.`);
                } catch (copyError) {
                    console.error(`${V.error} Erreur lors de la copie de ${item}:`, copyError);
                }
            } else {
                console.warn(`${V.Warn}  - ${item} non trouvé dans l'archive, ignoré.`);
            }
        }

        // 5. Nettoyer
        console.log(`${V.trash} Nettoyage du répertoire temporaire...`);
        await fs.remove(TEMP_DIR);

        console.log(`${V.StartFlag} Mise à jour terminée. PM2 devrait redémarrer l'application.`);
        
        // Le serveur sera redémarré par PM2, donc pas de réponse à envoyer ici.
        // Si PM2 n'est pas utilisé, il faudrait le redémarrer manuellement.
        // Par exemple : process.exit(1);

    } catch (error) {
        console.error(`${V.error} Le processus de mise à jour a échoué :`, error.message);
        // En cas d'erreur, on essaie de nettoyer
        try {
            await fs.remove(TEMP_DIR);
        } catch (cleanupError) {
            console.error(`${V.error} Erreur lors du nettoyage après échec:`, cleanupError);
        }
    }
};