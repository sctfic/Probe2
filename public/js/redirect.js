// public/js/redirect.js - Gestion des redirections LAN/WAN automatiques
const RedirectManager = {
    LAN_URL: 'http://probe.lan',
    WAN_URL: 'https://probe.lpz.ovh',// redirect.js - Version minimaliste réactive
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

  async isReachable(url) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), this.TEST_TIMEOUT);
    
    try {
      await fetch(`${url}/favicon.ico`, { mode: 'no-cors', signal: ctrl.signal });
      clearTimeout(timeout);
      return true;
    } catch {
      clearTimeout(timeout);
      return false;
    }
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