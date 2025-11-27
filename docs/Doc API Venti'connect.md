�� Documentation API – Serveur Venti’Connect
Cette documentation décrit les routes HTTP servies par le Venti’Connect

�� GET /ChartX.json (X = 1 à 7) — Données graphiques
Renvoie le fichier JSON avec les données de températures/hygrométrie s’il existe, ou
un 404.
Chart1.json correspond au fichier du jour
Chart2.json correspond à hier

�� GET /JsonConf.json — Configuration JSON
Renvoie la configuration

�� GET /LogFileX.json (X = 1 à 3) — Fichiers log
Renvoie les journaux de fonctionnement.

�� Routes de gestion (actions système)
�� GET /off — Désactivation totale
Coupe la ventilation quelque soit les températures et hygrométrie
�� GET /auto — Mode hiver
Active le mode automatique “Hiver”.
�� GET /ete — Mode été
Active le mode “Été”.
�� GET /restart — Redémarre l’ESP32
Redémarre le système
�� GET /Silence — Mode silence
Désactive Boost / active Silence.
�� GET /Normal — Retour mode normal
Enlève le mode Boost ou Silence

�� GET /Boost — Mode boost
Active le mode intensif.

�� POST /Consigne — Mise à jour des paramètres
Endpoint principal pour modifier la configuration.
Paramètres possibles :
��️ ConsigneDegre
Définit la température de consigne (15–30 °C). Envoyer un Entier
�� ConsigneDegreElec
Consigne chauffage électrique (1–25 °C). Envoyer un Entier
�� ipPC
Adresse local (adresse à laquelle est connecté le boitier sur le wifi)
⚙️ NumberGain
Paramètre de gain : {2, 3, 4, 5}.
�� ChoixGaine
Sélection d’une durée de ventilation pour récupérer l’air depuis le collecteur. Sert à
ventiler à intervalle et durée déterminée. Valeur : {0,1,2,3}

�� ChoixForce — Fait tourner le ventilateur quel que soit la température. Valeur : {0,1,2,3}
Exemple de consigne javascript :
``` JS
$(document).ready(
function(){
    $("#appliquerElec").click(
    function(){
        var valeur = $("#ChoixConsigneElec").val();
        $.post("Consigne",
            {
                ConsigneDegreElec: valeur
            }
        );
    });
});
```
�� GET /RecupInfo — Informations en temps réelRenvoie un string CSV contenant :  Températures  États système (Hiver/Ete/Silence/Boost)  Vitesse moteur  RPM  Tension batterie  Données SHT / thermistance  Dernière réception radio  Version firmware  États internes(Une trame d’état complète pour front-end)�� Page 404 Toute route inconnue est envoyée vers HandleNotfound.