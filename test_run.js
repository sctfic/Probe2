const request = require('supertest');
const app = require('./app');

async function test() {
    console.log("Démarrage du test de la route /query/VP2_Serramoune/forecast...");
    try {
        const res = await request(app)
            .get('/query/VP2_Serramoune/forecast')
            .expect(200);

        console.log("Réponse reçue avec succès :", JSON.stringify(res.body, null, 2));
    } catch (err) {
        console.error("Le test a échoué :", err);
    }
}

test();
