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

  function renderBilling(state) {
    const body = document.getElementById('account-billing-body');
    if (!body) return;
    const plan = String(state.plan || '').toLowerCase();

    if (plan === 'founder') {
      // Self-serve billing (Stripe Customer Portal) is not wired yet — there is
      // no portal/session endpoint on the API. Until paid checkout ships, the
      // real cancellation path is BoardWise support, so the action and copy
      // point there rather than bouncing the user to a policy page. When the
      // billing backend lands, swap this href to the portal session URL and
      // restore the "Manage billing" / Customer Portal copy.
      body.innerHTML = `
        <dl class="account-billing__rows">
          <div><dt>Plan</dt><dd>BoardWise Founder</dd></div>
          <div><dt>Price</dt><dd>$24.99/month plus applicable taxes</dd></div>
          <div><dt>Renewal</dt><dd>Monthly until canceled</dd></div>
          <div><dt>Cancellation</dt><dd>Contact BoardWise support to cancel or change billing</dd></div>
        </dl>
        <a id="account-manage-billing" class="bw-button bw-button--secondary" href="mailto:support@useboardwise.com?subject=BoardWise%20billing%20request">Contact billing support</a>
        <p class="account-billing__note">Self-serve billing management (the Stripe Customer Portal) opens when paid checkout launches. Until then, contact <a href="mailto:support@useboardwise.com">support@useboardwise.com</a> to cancel or update billing before your next renewal.</p>
      `;
      return;
    }

    if (plan === 'admin') {
      body.innerHTML = '<p class="account-billing__note">Administrative access is internal and is not a paid BoardWise Founder subscription.</p>';
      return;
    }

    body.innerHTML = `
      <p class="account-billing__note">You do not have an active BoardWise Founder subscription. BoardWise Founder is $24.99/month plus applicable taxes and renews monthly until canceled.</p>
      <a class="bw-button bw-button--gold" href="/pricing/">View Founder access</a>
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

  window.BoardWiseAuth.loadAuthState({ force: true }).then(renderAccount);
})();
