// script.js

document.addEventListener('DOMContentLoaded', () => {
    const mainContainer = document.getElementById('main-content-container');
    const sections = document.querySelectorAll('.page-section');
    const navList = document.getElementById('section-nav-list');
    
    // --- Configuration des sections ---
    // Correspondance entre le LI du slider et l'ID de la section.
    // Les ID (section-1 à section-5) correspondent aux sections ajoutées dans l'HTML.
    const sectionMap = [
        { name: 'K', id: 'section-1' },
        { name: 'X', id: 'section-2' },
        { name: 'Y', id: 'section-3' },
        { name: 'Z', id: 'section-4' },
        { name: 'A', id: 'section-5' },
    ];
    
    // --- 1. Génération du menu de navigation (Slider) ---
    sectionMap.forEach((section, index) => {
        const listItem = document.createElement('li');
        listItem.textContent = section.name;
        listItem.dataset.index = index;
        listItem.dataset.target = section.id;
        
        // La première section est active par défaut
        if (index === 0) {
            listItem.classList.add('active');
        }
        
        // Ajout de l'événement de clic
        listItem.addEventListener('click', () => {
            scrollToSection(index);
        });
        
        navList.appendChild(listItem);
    });

    // --- 2. Fonction de changement de section (Slider) ---
    function scrollToSection(index) {
        // Déplacement du conteneur principal (MAIN) horizontalement
        const offset = -index * 100; // Calcule le pourcentage de translation (0%, -100%, -200%, etc.)
        mainContainer.style.transform = `translateX(${offset}%)`;

        // Mise à jour de la classe active sur le menu (Slider)
        document.querySelector('#section-nav-list li.active')?.classList.remove('active');
        navList.querySelector(`[data-index="${index}"]`).classList.add('active');
        
        // Défilement automatique du LI actif au centre du slider (UX mobile)
        navList.querySelector(`[data-index="${index}"]`).scrollIntoView({
            behavior: 'smooth',
            inline: 'center'
        });
    }

    // --- 3. Détection de glissement (Swipe) sur le MAIN pour changer de section ---
    let touchStartX = 0;
    let touchEndX = 0;
    let currentSectionIndex = 0;

    // Fonction pour déterminer la section active
    const updateActiveSectionIndex = () => {
        const activeNav = navList.querySelector('li.active');
        if (activeNav) {
            currentSectionIndex = parseInt(activeNav.dataset.index);
        }
    };
    updateActiveSectionIndex();

    mainContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        updateActiveSectionIndex(); 
    });

    mainContainer.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].clientX;
        const diffX = touchEndX - touchStartX;
        
        // Seuil pour considérer le mouvement comme un swipe
        const swipeThreshold = 50; 

        if (Math.abs(diffX) > swipeThreshold) {
            if (diffX > 0) {
                // Swipe vers la droite (section précédente)
                if (currentSectionIndex > 0) {
                    scrollToSection(currentSectionIndex - 1);
                }
            } else {
                // Swipe vers la gauche (section suivante)
                if (currentSectionIndex < sectionMap.length - 1) {
                    scrollToSection(currentSectionIndex + 1);
                }
            }
        }
    });
    
    // --- 4. Initialisation ---
    scrollToSection(0);
});