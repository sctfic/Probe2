// public/js/redirect.js
// Author: LOPEZ Alban
// License: AGPL
// Project: https://probe.lpz.ovh/
// - Gestion des redirections LAN/WAN automatiques


const RedirectManager = {
    LAN_URL: 'http://probe.lan',
    WAN_URL: 'https://probe.lpz.ovh',
    TEST_TIMEOUT: 2000,        // 2s max pour tester
    INTERVAL_DELAY: 30000,     // 30s entre vérif. (mode interval)
    COOLDOWN_DURATION: 15000,  // 15s anti-boucle après redirect

  init(mode = 'onload') {
    // Si on vient d'être redirigé, on active le cooldown
    if (new URLSearchParams(location.search).get('redirected')) {
      sessionStorage.setItem('redirect_cooldown', Date.now());
      return;
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.start(mode));
    } else {
      this.start(mode);
    }
  },

  start(mode) {
    this.check(); // Vérification immédiate
    
    if (mode === 'interval') {
      setInterval(() => this.check(), this.INTERVAL_DELAY);
    }
  },

  check() {
    // Si on est en cooldown, on ne teste pas
    if (this.isCooldownActive()) return;

    const isLAN = location.origin.includes('.lan');
    const otherURL = isLAN ? this.WAN_URL : this.LAN_URL;

    this.isReachable(otherURL).then(reachable => {
      // Logique simple : toujours vers l'instance optimale
      if (reachable && !isLAN) this.redirect(this.LAN_URL);
      else if (!reachable && isLAN) this.redirect(this.WAN_URL);
    });
  },

  /**
   * Vérifie l'accessibilité d'une URL.
   * Utilise l'objet Image au lieu de fetch pour contourner (partiellement)
   * les blocages "Mixed Content" (HTTPS -> HTTP).
   */
  async isReachable(url) {
    return new Promise(resolve => {
      const img = new Image();
      const timer = setTimeout(() => {
        img.src = ''; // Annule la requête en cas de timeout
        resolve(false);
      }, this.TEST_TIMEOUT);

      img.onload = () => {
        clearTimeout(timer);
        resolve(true);
      };

      img.onerror = () => {
        clearTimeout(timer);
        // Si l'image ne charge pas (ou est bloquée strict par le navigateur), on considère hors ligne
        resolve(false);
      };

      // Ajout d'un timestamp pour éviter le cache du navigateur
      img.src = `${url}/favicon.ico?_=${Date.now()}`;
    });
  },

  redirect(url) {
    const target = new URL(url);
    target.searchParams.set('redirected', '1');
    location.replace(target.href);
  },

  isCooldownActive() {
    const last = sessionStorage.getItem('redirect_cooldown');
    if (!last) return false;
    
    const elapsed = Date.now() - parseInt(last);
    return elapsed < this.COOLDOWN_DURATION;
  }
};

// Lancement automatique
RedirectManager.init('onload');