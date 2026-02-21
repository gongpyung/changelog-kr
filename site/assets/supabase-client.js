/**
 * Supabase Client Module for ChangeLog.kr
 * Handles authentication and user check-in features
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  // These will be injected at build time from environment variables
  const SUPABASE_URL = window.SUPABASE_CONFIG?.url || '';
  const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.anonKey || '';

  let supabase = null;
  let currentUser = null;
  let authStateListeners = [];

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  function isConfigured() {
    return SUPABASE_URL && SUPABASE_ANON_KEY &&
           SUPABASE_URL !== 'https://your-project-id.supabase.co' &&
           SUPABASE_ANON_KEY !== 'your-anon-key-here';
  }

  async function initSupabase() {
    if (!isConfigured()) {
      console.warn('[Supabase] Not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
      return false;
    }

    if (typeof window.supabase === 'undefined') {
      console.error('[Supabase] Supabase JS library not loaded.');
      return false;
    }

    try {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

      // Check initial auth state
      const { data: { session } } = await supabase.auth.getSession();
      currentUser = session?.user || null;

      // Listen for auth changes
      supabase.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        notifyAuthStateListeners(event, currentUser);
      });

      console.log('[Supabase] Client initialized successfully');
      return true;
    } catch (error) {
      console.error('[Supabase] Failed to initialize:', error);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  async function signInWithGoogle() {
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });

    if (error) throw error;
    return data;
  }

  async function signInWithGitHub() {
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });

    if (error) throw error;
    return data;
  }

  async function signOut() {
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    currentUser = null;
  }

  function getCurrentUser() {
    return currentUser;
  }

  function isAuthenticated() {
    return currentUser !== null;
  }

  function onAuthStateChange(callback) {
    authStateListeners.push(callback);
    // Return unsubscribe function
    return () => {
      authStateListeners = authStateListeners.filter(cb => cb !== callback);
    };
  }

  function notifyAuthStateListeners(event, user) {
    authStateListeners.forEach(callback => {
      try {
        callback(event, user);
      } catch (e) {
        console.error('[Supabase] Auth listener error:', e);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Check-in Operations
  // ---------------------------------------------------------------------------

  async function getCheckins() {
    if (!supabase || !currentUser) {
      return [];
    }

    const { data, error } = await supabase
      .from('user_checkins')
      .select('service_id, last_checked_version, last_checked_at')
      .eq('user_id', currentUser.id);

    if (error) {
      console.error('[Supabase] Failed to get checkins:', error);
      return [];
    }

    return data || [];
  }

  async function checkin(serviceId, version) {
    if (!supabase || !currentUser) {
      throw new Error('Not authenticated');
    }

    const { error } = await supabase
      .from('user_checkins')
      .upsert({
        user_id: currentUser.id,
        service_id: serviceId,
        last_checked_version: version,
        last_checked_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,service_id'
      });

    if (error) {
      console.error('[Supabase] Failed to checkin:', error);
      throw error;
    }

    return true;
  }

  async function batchCheckin(checkins) {
    if (!supabase || !currentUser) {
      throw new Error('Not authenticated');
    }

    const records = checkins.map(c => ({
      user_id: currentUser.id,
      service_id: c.serviceId,
      last_checked_version: c.version,
      last_checked_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('user_checkins')
      .upsert(records, {
        onConflict: 'user_id,service_id'
      });

    if (error) {
      console.error('[Supabase] Failed to batch checkin:', error);
      throw error;
    }

    return true;
  }

  async function getCheckin(serviceId) {
    if (!supabase || !currentUser) {
      return null;
    }

    const { data, error } = await supabase
      .from('user_checkins')
      .select('last_checked_version, last_checked_at')
      .eq('user_id', currentUser.id)
      .eq('service_id', serviceId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[Supabase] Failed to get checkin:', error);
      return null;
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // Exports
  // ---------------------------------------------------------------------------

  window.SupabaseClient = {
    // Initialization
    init: initSupabase,
    isConfigured: isConfigured,

    // Auth
    signInWithGoogle,
    signInWithGitHub,
    signOut,
    getCurrentUser,
    isAuthenticated,
    onAuthStateChange,

    // Check-in
    getCheckins,
    getCheckin,
    checkin,
    batchCheckin
  };

})();
