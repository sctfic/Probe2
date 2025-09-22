// services/authService.js
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const { V } = require('../utils/icons');

const credentialsPath = path.join(__dirname, '..', 'config', 'credential.json');

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
