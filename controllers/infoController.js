// controllers/infoController.js
const path = require('path');

const getAppInfo = (req, res) => {
  try {
    const packageJson = require(path.resolve(__dirname, '../package.json'));

    if (packageJson && packageJson.name) {
      res.json({
        name: packageJson.name,
        version: packageJson.version
      });
    }
  } catch (error) {
    console.error(`Erreur lors de la récupération des informations de l'application: ${error.message}`);
    res.status(500).json({
      error: 'Impossible de récupérer les informations de l\'application.'
    });
  }
};

module.exports = {
  getAppInfo
};