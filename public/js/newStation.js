class StationManager {
    constructor() {
        this.modal = document.getElementById('station-modal');
        this.addBtn = document.getElementById('add-station-btn');
        this.closeBtn = document.querySelector('.close');
        this.cancelBtn = document.getElementById('cancel-btn');
        this.form = document.getElementById('station-form');
        this.submitBtn = document.getElementById('submit-btn');
        this.spinner = document.getElementById('spinner');
        this.successMsg = document.getElementById('success-msg');
        this.stationSelect = document.getElementById('global-station-select');

        this.initEventListeners();
    }

    initEventListeners() {
        // Ouvrir la modale
        this.addBtn.addEventListener('click', () => this.openModal());

        // Fermer la modale
        this.closeBtn.addEventListener('click', () => this.closeModal());
        this.cancelBtn.addEventListener('click', () => this.closeModal());

        // Fermer en cliquant à l'extérieur
        window.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
            }
        });

        // Fermer avec Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('show')) {
                this.closeModal();
            }
        });

        // Soumettre le formulaire
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));

        // Validation en temps réel
        document.getElementById('station-name').addEventListener('blur', () => this.validateName());
        document.getElementById('station-host').addEventListener('blur', () => this.validateHost());
        document.getElementById('station-port').addEventListener('blur', () => this.validatePort());
    }

    openModal() {
        this.resetForm();
        this.modal.classList.add('show');
        document.getElementById('station-name').focus();
    }

    closeModal() {
        this.modal.classList.remove('show');
    }

    resetForm() {
        this.form.reset();
        this.hideAllErrors();
        this.successMsg.style.display = 'none';
        this.setLoading(false);
    }

    hideAllErrors() {
        const errorMessages = document.querySelectorAll('.error-message');
        errorMessages.forEach(msg => msg.style.display = 'none');
    }

    showError(fieldId, message) {
        const errorElement = document.getElementById(fieldId + '-error');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
    }

    validateName() {
        const name = document.getElementById('station-name').value.trim();
        if (!name) {
            this.showError('name', 'Le nom de la station est requis');
            return false;
        }
        if (name.length < 2) {
            this.showError('name', 'Le nom doit contenir au moins 2 caractères');
            return false;
        }
        document.getElementById('name-error').style.display = 'none';
        return true;
    }

    validateHost() {
        const host = document.getElementById('station-host').value.trim();
        if (!host) {
            this.showError('host', 'L\'hôte est requis');
            return false;
        }
        // Validation basique de l'hôte (IP ou nom de domaine)
        const hostPattern = /^(?:[a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$|^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
        if (!hostPattern.test(host)) {
            this.showError('host', 'Format d\'hôte invalide');
            return false;
        }
        document.getElementById('host-error').style.display = 'none';
        return true;
    }

    validatePort() {
        const port = document.getElementById('station-port').value;
        if (!port) {
            this.showError('port', 'Le port est requis');
            return false;
        }
        const portNum = parseInt(port);
        if (portNum < 1 || portNum > 65535) {
            this.showError('port', 'Le port doit être entre 1 et 65535');
            return false;
        }
        document.getElementById('port-error').style.display = 'none';
        return true;
    }

    validateForm() {
        const nameValid = this.validateName();
        const hostValid = this.validateHost();
        const portValid = this.validatePort();
        
        return nameValid && hostValid && portValid;
    }

    setLoading(isLoading) {
        if (isLoading) {
            this.spinner.style.display = 'inline-block';
            this.submitBtn.disabled = true;
            this.submitBtn.textContent = 'Ajout en cours...';
        } else {
            this.spinner.style.display = 'none';
            this.submitBtn.disabled = false;
            this.submitBtn.innerHTML = '<div class="spinner" id="spinner"></div>Ajouter la station';
            this.spinner = document.getElementById('spinner'); // Re-référencer le spinner
        }
    }

    async handleSubmit(e) {
        e.preventDefault();

        // Validation complète du formulaire
        if (!this.validateForm()) {
            return;
        }

        // Récupération des données
        const formData = {
            name: document.getElementById('station-name').value.trim(),
            host: document.getElementById('station-host').value.trim(),
            port: parseInt(document.getElementById('station-port').value),
            comment: document.getElementById('station-comment').value.trim()
        };

        // Affichage du loading
        this.setLoading(true);

        try {
            // Appel à l'API
            const response = await fetch('/api/new', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Erreur ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            // Succès
            this.showSuccess('Station ajoutée avec succès !');
            
            // Ajouter la nouvelle station au select (si elle a un ID)
            if (result.id) {
                this.addStationToSelect(result.id, formData.name);
            }

            // Fermer la modale après un délai
            setTimeout(() => {
                this.closeModal();
            }, 1500);

        } catch (error) {
            console.error('Erreur lors de l\'ajout de la station:', error);
            this.showError('submit', error.message || 'Erreur lors de l\'ajout de la station');
        } finally {
            this.setLoading(false);
        }
    }

    showSuccess(message) {
        this.successMsg.textContent = message;
        this.successMsg.style.display = 'block';
        this.hideAllErrors();
    }

    addStationToSelect(id, name) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = name;
        this.stationSelect.appendChild(option);
        this.stationSelect.value = id; // Sélectionner la nouvelle station
    }
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    new StationManager();
});