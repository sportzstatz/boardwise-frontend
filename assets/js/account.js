(function () {
  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function featureLabel(key) {
    return String(key || '')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  window.BoardWiseAuth.loadAuthState({ force: true }).then((state) => {
    const status = document.getElementById('account-status');
    const actions = document.getElementById('account-actions');
    const list = document.getElementById('feature-list');

    if (!state.authenticated) {
      status.textContent = 'You are browsing as a guest.';
      actions.innerHTML = '<a class="button primary" href="/login/">Sign in</a><a class="button" href="/pricing/">Join beta</a>';
    } else {
      const name = window.BoardWiseAuth.displayName(state);
      status.textContent = `Signed in as ${name}. Plan: ${state.plan}.`;
      actions.innerHTML = '<a class="button" href="/performance/">Open performance</a><button id="logout-button" class="button" type="button">Sign out</button>';
      const logout = document.getElementById('logout-button');
      if (logout) {
        logout.addEventListener('click', async () => {
          try {
            await fetch(`${window.BOARDWISE_API_BASE || 'https://api.useboardwise.com'}/api/v1/auth/logout`, {
              method: 'POST',
              credentials: 'include',
            });
          } finally {
            window.location.reload();
          }
        });
      }
    }

    list.innerHTML = Object.entries(state.features || {})
      .map(([key, enabled]) => `<li><span>${esc(featureLabel(key))}</span><span class="feature-badge ${enabled ? 'available' : ''}">${enabled ? 'Available' : 'Locked'}</span></li>`)
      .join('');

    window.BoardWiseGates && window.BoardWiseGates.applyFeatureGates();
  });
})();
