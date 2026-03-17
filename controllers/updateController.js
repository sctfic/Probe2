const { spawn } = require('child_process');
const path = require('path');
const { V } = require('../utils/icons');

const ROOT_DIR = path.join(__dirname, '..');

exports.applyUpdate = async (req, res) => {
    console.log(`${V.receive} Lancement du processus de mise à jour via Git...`);
    res.status(202).json({ success: true, message: 'Mise à jour lancée. Le serveur va synchroniser avec Git et redémarrer.' });

    const runCommand = (command, args) => {
        return new Promise((resolve, reject) => {
            console.log(`${V.gear} Exécution : ${command} ${args.join(' ')}`);
            const child = spawn(command, args, { cwd: ROOT_DIR, shell: true });

            child.stdout.on('data', (data) => {
                console.log(`${V.info} [stdout] ${data.toString().trim()}`);
            });

            child.stderr.on('data', (data) => {
                console.error(`${V.Warn} [stderr] ${data.toString().trim()}`);
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`La commande ${command} a échoué avec le code ${code}`));
                }
            });
        });
    };

    try {
        // 1. Git Fetch
        console.log(`${V.receive} Récupération des mises à jour (git fetch)...`);
        await runCommand('git', ['fetch', 'origin']);

        // 2. Git Reset
        console.log(`${V.write} Synchronisation des fichiers (git reset --hard origin/main)...`);
        await runCommand('git', ['reset', '--hard', 'origin/main']);

        // 3. Npm Install
        console.log(`${V.package} Installation des dépendances (npm install)...`);
        await runCommand('npm', ['install', '--production']);

        // 4. PM2 Restart
        console.log(`${V.cpu} Redémarrage de l'application via PM2...`);
        // On ne peut pas wait sur le restart car PM2 va tuer le processus actuel
        spawn('pm2', ['restart', 'ecosystem.config.js'], { cwd: ROOT_DIR, shell: true, detached: true, stdio: 'ignore' }).unref();
        
        console.log(`${V.Check} Processus de mise à jour orchestré avec succès.`);
    } catch (error) {
        console.error(`${V.error} Le processus de mise à jour a échoué :`, error.message);
    }
};