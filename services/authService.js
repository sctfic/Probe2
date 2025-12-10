// services/authService.js
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const { V } = require('../utils/icons');

const credentialsPath = path.join(__dirname, '..', 'config', 'credential.json');

/**
 * Génère une clé API unique et URL-safe.
 * @param {number} bytes La longueur de la clé en octets avant l'encodage (par défaut 32).
 * @returns {string} La clé API générée (URL-safe).
 */
function generateUrlSafeApiKey(bytes = 32) {
    // 1. Générer des octets aléatoires cryptographiquement sûrs.
    const buffer = crypto.randomBytes(bytes);
    // 2. Encoder les octets en Base64 standard.
    let apiKey = buffer.toString('base64');
    // 3. Convertir en Base64 URL-Safe :
    apiKey = apiKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return apiKey;
}

function getCredentials() {
    if (!fs.existsSync(credentialsPath)) {
        console.log(`${V.write} Création du fichier credential.json par défaut.`);
        const defaultConfig = { login: 'admin', pwd: null };
        fs.writeFileSync(credentialsPath, JSON.stringify(defaultConfig, null, 4), 'utf8');
        return defaultConfig;
    }
    return JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
}

async function verifyPassword(password) {
    const credentials = getCredentials();
    if (!credentials.pwd) {
        return true; 
    }
    return await bcrypt.compare(password, credentials.pwd);
}

async function setPassword(newPassword) {
    const credentials = getCredentials();
    const saltRounds = 10;
    credentials.pwd = await bcrypt.hash(newPassword, saltRounds);
    fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 4), 'utf8');
    console.log(`${V.lock} Le mot de passe a été mis à jour.`);
}

module.exports = {
    getCredentials,
    verifyPassword,
    setPassword
};
