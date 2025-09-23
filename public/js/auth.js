// public/js/auth.js

let isAuthenticated = false;
let isPasswordSet = false;

// DOM Elements
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const changePasswordBtn = document.getElementById('change-password-btn');
const authModal = document.getElementById('auth-modal');
const passwordModal = document.getElementById('password-modal');
const loginForm = document.getElementById('login-form');
const passwordForm = document.getElementById('password-form');

function showLoginModal() {
    authModal.style.display = 'flex';
    document.getElementById('auth-password').focus();
}

function hideLoginModal() {
    authModal.style.display = 'none';
    loginForm.reset();
    document.getElementById('auth-error-msg').style.display = 'none';
}

function showPasswordModal(isInitialSetup = false) {
    const title = document.getElementById('password-modal-title');
    const oldPasswordGroup = document.getElementById('old-password-group');
    
    if (isInitialSetup) {
        title.textContent = 'Veuillez définir un mot de passe';
        oldPasswordGroup.style.display = 'none';
    } else {
        title.textContent = 'Changer le mot de passe';
        oldPasswordGroup.style.display = 'block';
    }
    
    passwordModal.style.display = 'flex';
    document.getElementById('new-password').focus();
}

function hidePasswordModal() {
    passwordModal.style.display = 'none';
    passwordForm.reset();
    document.getElementById('password-error-msg').style.display = 'none';
}

function updateAuthUI() {
    const accessIcons = document.querySelectorAll('.access-control-icon');
    if (isAuthenticated) {
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-block';
        changePasswordBtn.style.display = 'inline-block';
        accessIcons.forEach(icon => icon.style.display = 'none');
    } else {
        loginBtn.style.display = 'inline-block';
        logoutBtn.style.display = 'none';
        changePasswordBtn.style.display = 'none';
        accessIcons.forEach(icon => icon.style.display = 'inline-block');
    }
}

function toggleAccessIcons(show) {
    document.querySelectorAll('.access-control-icon').forEach(icon => {
        icon.style.display = show ? 'inline-block' : 'none';
    });
}

async function checkAuthStatus() {
    try {
        const response = await originalFetch('/api/auth/status'); // Utilise originalFetch pour éviter la boucle 401
        const data = await response.json();
        isAuthenticated = data.isAuthenticated;
        isPasswordSet = data.isPasswordSet;

        updateAuthUI();

        if (isAuthenticated && !isPasswordSet) {
            showGlobalStatus('Veuillez définir un mot de passe pour sécuriser votre application.', 'warning');
            showPasswordModal(true);
        }
    } catch (error) {
        console.error('Erreur lors de la vérification du statut d\'authentification:', error);
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const password = document.getElementById('auth-password').value;
    const errorMsg = document.getElementById('auth-error-msg');

    try {
        const response = await originalFetch('/api/login', { // Utilise originalFetch
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: 'admin', password })
        });

        const result = await response.json();

        if (response.ok) {
            isAuthenticated = true;
            showGlobalStatus(result.message, 'success');
            hideLoginModal();
            updateAuthUI();
            if (result.mustChangePassword) {
                isPasswordSet = false;
                showPasswordModal(true);
            } else {
                isPasswordSet = true;
            }
        } else {
            errorMsg.textContent = result.error || 'Erreur de connexion';
            errorMsg.style.display = 'block';
        }
    } catch (error) {
        errorMsg.textContent = 'Erreur réseau. Impossible de se connecter.';
        errorMsg.style.display = 'block';
    }
}

async function handleLogout() {
    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        const result = await response.json();
        if (result.success) {
            isAuthenticated = false;
            showGlobalStatus('Déconnexion réussie.', 'success');
            updateAuthUI();
        }
    } catch (error) {
        console.error('La déconnexion a échoué:', error);
    }
}

async function handleChangePassword(event) {
    event.preventDefault();
    const oldPassword = document.getElementById('old-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorMsg = document.getElementById('password-error-msg');

    if (newPassword !== confirmPassword) {
        errorMsg.textContent = 'Les nouveaux mots de passe ne correspondent pas.';
        errorMsg.style.display = 'block';
        return;
    }

    const body = { newPassword };
    if (isPasswordSet) {
        body.oldPassword = oldPassword;
    }

    try {
        const response = await fetch('/api/password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const result = await response.json();

        if (response.ok) {
            isPasswordSet = true;
            showGlobalStatus('Mot de passe mis à jour avec succès.', 'success');
            hidePasswordModal();
        } else {
            errorMsg.textContent = result.error || 'Erreur lors de la mise à jour.';
            errorMsg.style.display = 'block';
        }
    } catch (error) {
        errorMsg.textContent = 'Erreur réseau.';
        errorMsg.style.display = 'block';
    }
}

// Event Listeners
loginBtn.addEventListener('click', () => {
    showLoginModal();
});
logoutBtn.addEventListener('click', () => {
    if (confirm("Voulez-vous vous déconnecter ?")) {
        handleLogout();
    }
});
changePasswordBtn.addEventListener('click', () => {
    showPasswordModal();
});
loginForm.addEventListener('submit', handleLogin);
passwordForm.addEventListener('submit', handleChangePassword);

// Fermer les modales en cliquant à l'extérieur
window.addEventListener('click', (event) => {
    if (event.target === authModal) {
        hideLoginModal();
    }
    if (event.target === passwordModal) {
        hidePasswordModal();
    }
});
