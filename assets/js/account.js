(function () {
  const PRODUCTS = [
    {
      key: 'mlb',
      title: 'MLB Board',
      icon: 'hex',
      href: '/mlb/',
      feature: 'mlb_board_basic',
      advancedFeature: 'mlb_board_advanced',
      lockedBody: 'Sign in or become a Founder to unlock MLB board access.',
      statusAvailable: 'Preview access',
      statusAdvanced: 'Full access',
    },
    {
      key: 'performance',
      title: 'Performance & ROI',
      icon: 'arrow',
      href: '/performance/',
      feature: 'performance_summary',
      lockedBody: 'Available for accounts with performance reporting.',
      statusAvailable: 'Available',
    },
    {
      key: 'nhl',
      title: 'NHL Board',
      icon: 'hex',
      href: '',
      feature: 'nhl_board_basic',
      retired: true,
      lockedBody: 'Off-season · returns Oct 2026',
      statusAvailable: 'Off-season',
    },
  ];

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

  function humanizePlan(plan) {
    return featureLabel(plan || 'guest');
  }

  function accountPlanLabel(state) {
    if (!state.authenticated) return 'Guest access';
    const plan = String(state.plan || '').toLowerCase();
    if (plan === 'admin') return 'Admin access';
    return humanizePlan(state.plan);
  }

  function memberLabel(state) {
    const user = state.authenticated && state.user ? state.user : null;
    const memberSince = user && (
      user.member_since ||
      user.memberSince ||
      user.created_at ||
      user.createdAt
    );
    if (!memberSince) return state.authenticated ? 'Signed in' : 'Guest mode';

    const yearMatch = String(memberSince).match(/\b(20\d{2}|19\d{2})\b/);
    return yearMatch ? `Member since ${yearMatch[1]}` : `Member since ${memberSince}`;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function hasFeature(state, featureKey) {
    return window.BoardWiseAuth.hasFeature(state, featureKey);
  }

  function loginReturnTo(path) {
    return `/login/?return_to=${encodeURIComponent(path)}`;
  }

  function productAccess(product, state) {
    if (product.retired) {
      return {
        available: false,
        ctaHref: '',
        ctaText: '',
        status: product.lockedBody,
        statusClass: 'is-locked',
      };
    }

    const available = hasFeature(state, product.feature);
    const advanced = product.advancedFeature ? hasFeature(state, product.advancedFeature) : false;
    const authenticated = Boolean(state.authenticated);

    if (available) {
      return {
        available: true,
        ctaHref: product.href,
        ctaText: 'Open →',
        status: advanced ? product.statusAdvanced : product.statusAvailable,
        statusClass: 'is-positive',
      };
    }

    return {
      available: false,
      ctaHref: authenticated ? '/pricing/' : loginReturnTo(product.href),
      ctaText: authenticated ? '' : 'Sign in →',
      status: authenticated ? 'Locked · upgrade to unlock' : product.lockedBody,
      statusClass: 'is-locked',
    };
  }

  function renderAccessCard(product, state) {
    const access = productAccess(product, state);
    const availabilityClass = access.available ? 'is-available' : 'is-locked';

    return `
      <article class="account-access-card ${availabilityClass}" data-access-card="${esc(product.key)}">
        <span class="account-access-icon account-access-icon--${esc(product.icon)}" aria-hidden="true"></span>
        <div class="account-access-main">
          <h3>${esc(product.title)}</h3>
          <p class="account-access-status ${esc(access.statusClass)}">${esc(access.status)}</p>
        </div>
        ${access.ctaText
          ? `<a class="account-access-action" href="${esc(access.ctaHref)}">${esc(access.ctaText)}</a>`
          : '<span class="account-lock-mark" aria-hidden="true"></span><span class="sr-only">Locked</span>'}
      </article>
    `;
  }

  function renderProfile(state) {
    const name = window.BoardWiseAuth.displayName(state);
    const initials = typeof window.BoardWiseAuth.initials === 'function'
      ? window.BoardWiseAuth.initials(state)
      : 'A';
    const email = state.authenticated && state.user && state.user.email
      ? state.user.email
      : 'Sign in to manage BoardWise access.';

    setText('account-name', name);
    setText('account-avatar', initials);
    setText('account-email', email);
    setText('account-plan', accountPlanLabel(state));
    setText('account-auth-state', memberLabel(state));
  }

  function renderActions(state) {
    const actions = document.getElementById('account-actions');
    if (!actions) return;

    if (!state.authenticated) {
      actions.innerHTML = [
        '<a class="bw-button bw-button--gold" href="/login/">Sign in</a>',
        '<a class="bw-button bw-button--ghost-dark" href="/pricing/">View Founder access</a>',
      ].join('');
      return;
    }

    actions.innerHTML = '<button id="logout-button" class="bw-button bw-button--ghost-dark" type="button">Sign out</button>';

    const logout = document.getElementById('logout-button');
    if (logout) {
      logout.addEventListener('click', async () => {
        logout.setAttribute('aria-busy', 'true');
        try {
          await window.BoardWiseApi.logout();
        } finally {
          window.location.reload();
        }
      });
    }
  }

  // Test seam: jsdom cannot spy on window.location.assign, so tests inject
  // window.BoardWiseNavigate instead.
  function navigateTo(url) {
    if (typeof window.BoardWiseNavigate === 'function') {
      window.BoardWiseNavigate(url);
      return;
    }
    window.location.assign(url);
  }

  function showBillingNotice(message) {
    const notice = document.getElementById('account-billing-notice');
    if (!notice) return;
    notice.textContent = message;
    notice.removeAttribute('hidden');
  }

  function renderBilling(state) {
    const body = document.getElementById('account-billing-body');
    if (!body) return;
    const plan = String(state.plan || '').toLowerCase();

    if (plan === 'founder') {
      body.innerHTML = `
        <dl class="account-billing__rows">
          <div><dt>Plan</dt><dd>BoardWise Founder</dd></div>
          <div><dt>Price</dt><dd>$24.99/month plus applicable taxes</dd></div>
          <div><dt>Renewal</dt><dd>Monthly until canceled</dd></div>
          <div><dt>Cancellation</dt><dd>Cancel anytime in the billing portal; access normally stays active through the end of the current paid period</dd></div>
        </dl>
        <button id="account-manage-billing" class="bw-button bw-button--secondary" type="button">Manage billing</button>
        <p class="account-billing__note">Manage billing opens the secure Stripe Customer Portal to update your payment method, view invoices, or cancel. Questions? Contact <a href="mailto:support@useboardwise.com">support@useboardwise.com</a>.</p>
      `;

      const manage = document.getElementById('account-manage-billing');
      if (manage) {
        manage.addEventListener('click', async () => {
          manage.setAttribute('aria-busy', 'true');
          try {
            const result = await window.BoardWiseApi.createBillingPortal();
            const url = result && typeof result.portal_url === 'string' ? result.portal_url : '';
            if (!url) throw new Error('missing portal_url');
            navigateTo(url);
          } catch (_err) {
            manage.removeAttribute('aria-busy');
            showBillingNotice('The billing portal is unavailable right now. Try again shortly or contact support@useboardwise.com to cancel or update billing.');
          }
        });
      }
      return;
    }

    if (plan === 'admin') {
      body.innerHTML = '<p class="account-billing__note">Administrative access is internal and is not a paid BoardWise Founder subscription.</p>';
      return;
    }

    body.innerHTML = `
      <p class="account-billing__note">You do not currently have an active BoardWise Founder subscription. If you subscribed before, that subscription has ended or its last payment did not go through — resubscribing restores full access right away. BoardWise Founder is $24.99/month plus applicable taxes and renews monthly until canceled.</p>
      <a class="bw-button bw-button--gold" href="/pricing/">View Founder access</a>
      <p class="account-billing__note">Questions about a past subscription or charge? Contact <a href="mailto:support@useboardwise.com">support@useboardwise.com</a>.</p>
    `;
  }

  function renderStatus(state) {
    if (!state.authenticated) {
      setText(
        'account-status',
        'You are browsing as a guest. Sign in to see your BoardWise account access.'
      );
      return;
    }

    const name = window.BoardWiseAuth.displayName(state);
    const hasMlbBasic = hasFeature(state, 'mlb_board_basic');
    const hasMlbAdvanced = hasFeature(state, 'mlb_board_advanced');
    const mlbAccess = hasMlbAdvanced ? 'full MLB board' : hasMlbBasic ? 'MLB preview' : 'no MLB board access';
    setText(
      'account-status',
      `Signed in as ${name}. Plan: ${humanizePlan(state.plan)}. Access: ${mlbAccess}.`
    );
  }

  function renderAccount(state) {
    renderProfile(state);
    renderStatus(state);
    renderActions(state);
    renderBilling(state);

    const accessList = document.getElementById('account-access-list');
    if (accessList) {
      // Performance is concealed Admin-only: never render, name, or link the
      // performance card to a non-admin. Only an account with performance_summary
      // (admin) sees it.
      accessList.innerHTML = PRODUCTS
        .filter((product) => product.key !== 'performance' || hasFeature(state, 'performance_summary'))
        .map((product) => renderAccessCard(product, state))
        .join('');
    }

    if (window.BoardWiseGates) {
      window.BoardWiseGates.applyFeatureGates();
    }
  }

  const CHECKOUT_POLL_INTERVAL_MS = 1500;
  const CHECKOUT_POLL_ATTEMPTS = 10; // 10 × 1.5s = the documented 15s budget

  function delay(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function checkoutSuccessRequested() {
    try {
      return new URLSearchParams(window.location.search).get('checkout') === 'success';
    } catch (_err) {
      return false;
    }
  }

  // The redirect back from Stripe is never proof of payment: access appears
  // only after webhook reconciliation grants it server-side, so poll billing
  // status and re-render from a fresh /me — never set plan/features locally.
  async function finalizeCheckout(state) {
    if (!checkoutSuccessRequested()) return;
    if (!state.authenticated) return;
    if (String(state.plan || '').toLowerCase() === 'founder') return;

    showBillingNotice('Finalizing Founder access…');

    for (let attempt = 0; attempt < CHECKOUT_POLL_ATTEMPTS; attempt += 1) {
      await delay(CHECKOUT_POLL_INTERVAL_MS);
      let status = null;
      try {
        status = await window.BoardWiseApi.getBillingStatus();
      } catch (_err) {
        continue;
      }
      if (status && String(status.plan || '').toLowerCase() === 'founder') {
        const fresh = await window.BoardWiseAuth.loadAuthState({ force: true });
        renderAccount(fresh);
        showBillingNotice('Your BoardWise Founder access is active.');
        return;
      }
    }

    showBillingNotice('Payment received. Access is still syncing. Refresh shortly or contact support@useboardwise.com.');
  }

  window.BoardWiseAuth.loadAuthState({ force: true }).then(async (state) => {
    renderAccount(state);
    await finalizeCheckout(state);
  });
})();
