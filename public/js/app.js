// public/js/app.js
document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.navbar nav ul li');
    const contentContainer = document.getElementById('content-container');
    const sections = document.querySelectorAll('.content-section');
    let currentIndex = 0; // Index de la section active

    // Fonction pour mettre à jour la vue
    const updateView = () => {
        // Déplace le conteneur pour afficher la section courante
        contentContainer.style.transform = `translateX(-${currentIndex * 100}vw)`;

        // Met à jour la classe 'active' pour la navigation
        navItems.forEach((item, index) => {
            if (index === currentIndex) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    };

    // Gestion du clic sur les éléments de la barre de navigation
    navItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            currentIndex = index;
            updateView();
        });
    });

    // --- Gestion du glissement latéral (swipe) ---
    let startX = 0;
    let endX = 0;
    let isSwiping = false;

    contentContainer.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isSwiping = true;
    });

    contentContainer.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        // Empêche le défilement vertical pendant le swipe horizontal
        e.preventDefault();
        endX = e.touches[0].clientX;
        const diffX = startX - endX;
        // Applique une translation temporaire pour suivre le doigt
        contentContainer.style.transform = `translateX(calc(-${currentIndex * 100}vw - ${diffX}px))`;
    });

    contentContainer.addEventListener('touchend', () => {
        if (!isSwiping) return;
        isSwiping = false;
        const diffX = startX - endX;

        // Détermine si le swipe est suffisant pour changer de section (seuil de 50px)
        if (diffX > 50 && currentIndex < sections.length - 1) {
            // Swipe vers la gauche (prochaine section)
            currentIndex++;
        } else if (diffX < -50 && currentIndex > 0) {
            // Swipe vers la droite (section précédente)
            currentIndex--;
        }
        // Réinitialise la transition pour un mouvement fluide vers la position finale
        contentContainer.style.transition = 'transform 0.3s ease-out';
        updateView();

        // Réinitialise la transition après un court délai pour permettre le nouveau swipe
        setTimeout(() => {
            contentContainer.style.transition = ''; // Retire la transition pour le mouvement du doigt
        }, 300);
    });

    // Initialisation de la vue au chargement
    updateView();
});