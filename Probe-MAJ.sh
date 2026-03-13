#!/bin/bash

# Configuration
APP_NAME="Probe"
REPO_URL="https://github.com/sctfic/Probe2.git"
BRANCH="main"
PROJECT_DIR="www/Probe2"

echo "🚀 Déploiement démarré..."

# 1. Aller dans le répertoire du projet
cd "$PROJECT_DIR" || exit 1

# 2. Arrêter PM2
echo "⏹️  Arrêt de PM2..."
pm2 stop "$APP_NAME" 2>/dev/null || true

# 3. Sauvegarder les fichiers de conf/credentials
echo "💾 Sauvegarde des fichiers sensibles..."

# Fichiers individuels
cp config/compositeProbes.json config/compositeProbes.json.backup 2>/dev/null || true
cp config/credential.json config/credential.json.backup 2>/dev/null || true
cp config/integratorProbes.json config/integratorProbes.json.backup 2>/dev/null || true

# Dossier stations complet (récursif)
if [ -d "config/stations" ]; then
    rm -rf config/stations.backup 2>/dev/null || true  # Supprime l'ancienne backup
    cp -r config/stations/ config/stations.backup/      # Copie récursive
    echo "   ✓ Dossier config/stations/ sauvegardé"
fi

# 4. Récupérer la dernière version
echo "📥 Récupération de la dernière version..."
git fetch origin
git reset --hard "origin/$BRANCH"

# 5. Réinstaller les dépendances
echo "📦 Installation des dépendances..."
npm install --production

# 6. Restaurer les backups
echo "🔄 Restauration des fichiers sensibles..."
mv config/compositeProbes.json.backup config/compositeProbes.json 2>/dev/null || true
mv config/credential.json.backup config/credential.json 2>/dev/null || true
mv config/integratorProbes.json.backup config/integratorProbes.json 2>/dev/null || true

# Restaurer le dossier stations complet
if [ -d "config/stations.backup" ]; then
    rm -rf config/stations 2>/dev/null || true           # Supprime le dossier fraîchement cloné (vide ou par défaut)
    mv config/stations.backup config/stations            # Restaure la backup
    echo "   ✓ Dossier config/stations/ restauré"
fi

# 7. Redémarrer PM2
echo "▶️  Redémarrage de PM2..."
pm2 start ecosystem.config.js --env production 2>/dev/null || pm2 start "$APP_NAME"

echo "✅ Déploiement terminé !"