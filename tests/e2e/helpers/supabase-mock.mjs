/**
 * Supabase mock helper for Playwright E2E tests
 *
 * Intercepts the supabase-client.js network request and replaces it with a
 * mock implementation that simulates authenticated state — no real Supabase
 * connection required.
 */

const MOCK_USER = {
  id: 'mock-user-id-123',
  email: 'test@example.com',
  user_metadata: {
    full_name: 'Test User',
    avatar_url: null,
  },
};

/**
 * Sets up a mock authenticated Supabase client by intercepting the
 * supabase-client.js request before page navigation.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} [options]
 * @param {Array<{service_id: string, last_checked_version: string, last_checked_at: string}>} [options.checkins=[]]
 *   Pre-existing checkins. Empty array = all versions are "unseen" (new).
 */
export async function setupAuthMock(page, { checkins = [] } = {}) {
  await page.route('**/assets/supabase-client.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: buildMockScript(MOCK_USER, checkins),
    });
  });
}

/**
 * Sets up an unauthenticated mock (SupabaseClient reports not logged in).
 * @param {import('@playwright/test').Page} page
 */
export async function setupUnauthMock(page) {
  await page.route('**/assets/supabase-client.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `(function () {
  'use strict';
  window.SupabaseClient = {
    init: async () => false,
    isConfigured: () => false,
    signInWithGoogle: async () => {},
    signInWithGitHub: async () => {},
    signOut: async () => {},
    getCurrentUser: () => null,
    isAuthenticated: () => false,
    onAuthStateChange: () => () => {},
    getCheckins: async () => [],
    getCheckin: async () => null,
    checkin: async () => true,
    batchCheckin: async () => true,
  };
})();`,
    });
  });
}

function buildMockScript(user, checkins) {
  return `(function () {
  'use strict';

  const MOCK_USER = ${JSON.stringify(user)};
  const MOCK_CHECKINS = ${JSON.stringify(checkins)};
  let authListeners = [];

  window.SupabaseClient = {
    init: async () => true,
    isConfigured: () => true,

    signInWithGoogle: async () => {},
    signInWithGitHub: async () => {},
    signOut: async () => {
      const prevId = MOCK_USER.id;
      authListeners.forEach(cb => {
        try { cb('SIGNED_OUT', null, prevId); } catch (_) {}
      });
    },

    getCurrentUser: () => MOCK_USER,
    isAuthenticated: () => true,

    onAuthStateChange: (cb) => {
      authListeners.push(cb);
      return () => { authListeners = authListeners.filter(l => l !== cb); };
    },

    getCheckins: async () => MOCK_CHECKINS,
    getCheckin: async () => null,

    checkin: async (serviceId, version) => {
      window.__mockLastCheckin = { serviceId, version, ts: Date.now() };
      return true;
    },

    batchCheckin: async (items) => {
      window.__mockLastBatchCheckin = items;
      return true;
    },
  };

  console.log('[MockSupabase] initialized — checkins:', MOCK_CHECKINS.length);
})();`;
}
