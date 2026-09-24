/**
 * Storage Layer for Mind Redemption
 * Connects directly to the local FastAPI companion server at http://127.0.0.1:8000/api
 * Supports dual-partition architecture: Public Decoy Profile & Isolated Admin Vault
 */

const API_BASE = 'http://127.0.0.1:8000/api';

// Canonical In-Memory Data Contract
const CANONICAL_STATE = {
  version: "1.0.0",
  activeWorkspace: {
    currentTab: "mindflow",
    activeBookId: null,
    activePageId: null
  },
  mindFlow: {
    books: []
  },
  notes: {
    items: []
  },
  diary: {
    entries: {}
  },
  trash: []
};

let inMemoryState = JSON.parse(JSON.stringify(CANONICAL_STATE));
let decoyCachedState = null;
let saveDebounceTimer = null;
let isSaving = false;
let hasPendingSave = false;

// Profile & Volatile Session Management (Always defaults to 'default' on refresh)
let currentProfile = 'default';
let adminSessionToken = null;

// Wipe any previous session upon script boot to guarantee cold start in decoy profile
try {
  sessionStorage.removeItem('mind_redemption_admin_token');
} catch (_) {}

/**
 * Returns current active vault profile ('default' | 'admin')
 */
export function getVaultProfile() {
  return currentProfile;
}

/**
 * Sets active admin vault session in volatile memory
 */
export function setAdminSession(token) {
  adminSessionToken = token;
  currentProfile = 'admin';
  try {
    sessionStorage.setItem('mind_redemption_admin_token', token);
  } catch (_) {}
}

/**
 * Clears volatile session token and restores default decoy profile
 */
export function clearAdminSession() {
  adminSessionToken = null;
  currentProfile = 'default';
  try {
    sessionStorage.removeItem('mind_redemption_admin_token');
  } catch (_) {}
}

/**
 * Generates security headers for API requests based on current active profile
 */
export function getVaultHeaders() {
  const headers = {
    'X-Vault-Profile': currentProfile
  };
  if (currentProfile === 'admin' && adminSessionToken) {
    headers['Authorization'] = `Bearer ${adminSessionToken}`;
  }
  return headers;
}

/**
 * Verifies administrative credentials against backend /api/admin/verify
 */
export async function verifyAdminPassword(password) {
  try {
    const res = await fetch(`${API_BASE}/admin/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      return { success: false, message: 'Invalid administrative password' };
    }
    setServerStatus(true);
    return await res.json();
  } catch (err) {
    setServerStatus(false);
    return { success: false, message: 'Companion server offline or unreachable' };
  }
}

/**
 * Revokes admin token on backend companion server
 */
export async function logoutAdminVault() {
  const token = adminSessionToken;
  if (!token) return;
  try {
    await fetch(`${API_BASE}/admin/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Vault-Profile': 'admin'
      }
    });
  } catch (_) {}
}

/**
 * UI Feedback Helper
 * Updates #sync-status (or #app-save-status fallback) text and CSS classes
 */
function updateSyncStatusUI(status, text) {
  const syncStatusEl = document.getElementById('sync-status') || document.getElementById('app-save-status');
  if (!syncStatusEl) return;

  syncStatusEl.classList.remove('saving', 'saved', 'error', 'status-saving', 'status-saved', 'status-error');

  if (status === 'saving') {
    syncStatusEl.classList.add('saving', 'status-saving');
    syncStatusEl.textContent = text || 'Saving...';
  } else if (status === 'saved') {
    syncStatusEl.classList.add('saved', 'status-saved');
    syncStatusEl.textContent = text || 'Saved';
  } else if (status === 'error') {
    syncStatusEl.classList.add('error', 'status-error');
    syncStatusEl.textContent = text || 'Server Offline (Run server.py)';
  } else {
    syncStatusEl.textContent = text || 'Ready';
  }
}

// Server Watchdog State
if (typeof window !== 'undefined') {
  window.isServerOnline = true;
}

/**
 * Updates UI and global state for server connectivity
 */
export function setServerStatus(isOnline) {
  if (typeof window !== 'undefined') {
    window.isServerOnline = !!isOnline;
  }

  const banner = document.getElementById('server-status-banner');
  if (banner) {
    if (isOnline) {
      banner.classList.add('hidden');
    } else {
      banner.classList.remove('hidden');
    }
  }

  if (!isOnline) {
    updateSyncStatusUI('error', 'Server Offline (Run server.py)');
  }
}

/**
 * Health check watchdog for companion server with 2500ms timeout AbortController
 */
export async function checkServerHealth() {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 2500) : null;

  try {
    const res = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      signal: controller ? controller.signal : undefined
    });
    if (timeoutId) clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const isOk = data.status === 'ok';
      setServerStatus(isOk);
      return isOk;
    } else {
      setServerStatus(false);
      return false;
    }
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    setServerStatus(false);
    return false;
  }
}

// Background polling every 5 seconds
let watchdogInterval = null;
export function startServerWatchdog() {
  if (watchdogInterval) clearInterval(watchdogInterval);
  checkServerHealth();
  watchdogInterval = setInterval(checkServerHealth, 5000);
}

// Start watchdog on module boot
if (typeof window !== 'undefined') {
  startServerWatchdog();

  // Retry Connection Button Listener
  const bindRetryButton = () => {
    const retryBtn = document.getElementById('retry-server-btn');
    if (retryBtn && !retryBtn._watchdogBound) {
      retryBtn._watchdogBound = true;
      retryBtn.addEventListener('click', (e) => {
        e.preventDefault();
        retryBtn.textContent = 'Checking...';
        checkServerHealth().finally(() => {
          setTimeout(() => {
            if (retryBtn) retryBtn.textContent = 'Retry Connection';
          }, 600);
        });
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindRetryButton);
  } else {
    bindRetryButton();
  }
}

/**
 * Fetches data from companion server under active vault profile headers,
 * hydrates internal state, updates sync status, and returns state object
 */
export async function loadStorageData() {
  try {
    const res = await fetch(`${API_BASE}/load`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...getVaultHeaders()
      }
    });

    if (!res.ok) {
      throw new Error(`Failed to load data: ${res.statusText}`);
    }

    const payload = await res.json();

    // Hydrate canonical state with incoming payload
    inMemoryState = {
      version: payload.version || CANONICAL_STATE.version,
      activeWorkspace: {
        ...CANONICAL_STATE.activeWorkspace,
        ...(payload.activeWorkspace || {})
      },
      mindFlow: {
        books: payload.mindFlow?.books || payload.mindFlow?.notes || []
      },
      notes: {
        items: payload.notes?.items || payload.notes?.list || []
      },
      diary: {
        entries: payload.diary?.entries || {}
      },
      trash: Array.isArray(payload.trash) ? payload.trash : []
    };

    if (currentProfile === 'default') {
      decoyCachedState = JSON.parse(JSON.stringify(inMemoryState));
    }

    setServerStatus(true);
    updateSyncStatusUI('saved', 'Saved');

    return inMemoryState;
  } catch (err) {
    console.error('loadStorageData error:', err);
    setServerStatus(false);
    updateSyncStatusUI('error', 'Server Offline (Run server.py)');
    return inMemoryState;
  }
}

/**
 * Executes direct POST to /api/save under active vault profile
 */
async function executeSave() {
  if (isSaving) {
    hasPendingSave = true;
    return;
  }

  isSaving = true;
  updateSyncStatusUI('saving', 'Saving...');

  try {
    const res = await fetch(`${API_BASE}/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getVaultHeaders()
      },
      body: JSON.stringify(inMemoryState)
    });

    if (!res.ok) {
      throw new Error(`Save failed with HTTP status ${res.status}`);
    }

    if (currentProfile === 'default') {
      decoyCachedState = JSON.parse(JSON.stringify(inMemoryState));
    }

    setServerStatus(true);
    updateSyncStatusUI('saved', 'Saved');
  } catch (err) {
    console.error('saveStorageData network error:', err);
    setServerStatus(false);
    updateSyncStatusUI('error', 'Server Offline (Run server.py)');
  } finally {
    isSaving = false;
    if (hasPendingSave) {
      hasPendingSave = false;
      saveStorageData();
    }
  }
}

/**
 * Updates the given namespace in state and triggers a debounced (400ms) POST to /api/save
 */
export function saveStorageData(namespace, data) {
  if (namespace && data !== undefined) {
    inMemoryState[namespace] = data;
  }

  updateSyncStatusUI('saving', 'Saving...');

  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  saveDebounceTimer = setTimeout(() => {
    executeSave();
  }, 400);
}

/**
 * Atomic "Flush-Then-Swap" Routine:
 * 1. Takes an immediate snapshot of current admin in-memory state.
 * 2. Fires asynchronous fetch to /api/save with admin bearer token.
 * 3. Clears active debounce handlers.
 * 4. Clears admin session and flips profile to 'default'.
 * 5. Restores in-memory state from cached decoy data in < 1ms so UI swaps in < 16ms.
 */
export function flushAdminSaveAndSwapToDecoy() {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }

  // Snapshot payload and admin headers before clearing session
  const payloadToFlush = JSON.parse(JSON.stringify(inMemoryState));
  const adminHeaders = {
    'Content-Type': 'application/json',
    'X-Vault-Profile': 'admin',
    ...(adminSessionToken ? { 'Authorization': `Bearer ${adminSessionToken}` } : {})
  };
  const tokenToRevoke = adminSessionToken;

  // 1. Immediately fire background asynchronous save request
  fetch(`${API_BASE}/save`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify(payloadToFlush)
  }).then(() => {
    // Revoke token on server in background
    if (tokenToRevoke) {
      fetch(`${API_BASE}/admin/logout`, {
        method: 'POST',
        headers: adminHeaders
      }).catch(() => {});
    }
  }).catch(err => {
    console.warn('Background admin flush save notice:', err);
  });

  // 2. Clear volatile admin session
  clearAdminSession();

  // 3. Hot-swap memory state to decoy partition (< 1ms execution)
  if (decoyCachedState) {
    inMemoryState = JSON.parse(JSON.stringify(decoyCachedState));
  } else {
    inMemoryState = JSON.parse(JSON.stringify(CANONICAL_STATE));
  }

  // 4. Trigger background load to refresh decoy state from disk
  fetch(`${API_BASE}/load`, {
    method: 'GET',
    headers: { 'Accept': 'application/json', ...getVaultHeaders() }
  }).then(async res => {
    if (res.ok) {
      const data = await res.json();
      decoyCachedState = JSON.parse(JSON.stringify(data));
    }
  }).catch(() => {});

  updateSyncStatusUI('saved', 'Saved');
  return inMemoryState;
}

/**
 * Returns the current in-memory object for that namespace
 */
export function getNamespace(namespace) {
  return inMemoryState[namespace] || null;
}

/**
 * Helper getter for tab/book/page session state
 */
export function getActiveWorkspace() {
  return inMemoryState.activeWorkspace;
}

/**
 * Helper setter for tab/book/page session state
 */
export function setActiveWorkspace(workspaceData) {
  inMemoryState.activeWorkspace = {
    ...inMemoryState.activeWorkspace,
    ...workspaceData
  };
  saveStorageData();
}

/**
 * Backward-compatibility storage object to integrate seamlessly with existing app components
 */
export const storage = {
  get data() {
    return inMemoryState;
  },
  get currentProfile() {
    return currentProfile;
  },
  get isVaultAdmin() {
    return currentProfile === 'admin';
  },
  async init() {
    return await loadStorageData();
  },
  scheduleSave(delay = 400) {
    saveStorageData();
  },
  getMindFlowData() {
    return inMemoryState.mindFlow;
  },
  getNotesData() {
    return inMemoryState.notes;
  },
  getDiaryData() {
    return inMemoryState.diary;
  },
  getTrashData() {
    if (!Array.isArray(inMemoryState.trash)) {
      inMemoryState.trash = [];
    }
    return inMemoryState.trash;
  },
  get isServerOnline() {
    return typeof window !== 'undefined' ? !!window.isServerOnline : true;
  },
  checkServerHealth,
  setServerStatus,
  onConnectionChange(listener) {
    checkServerHealth().then(ok => {
      listener({
        status: ok ? 'connected' : 'unsupported',
        fileName: currentProfile === 'admin' ? 'mind-redemption-admin-data.json' : 'mind-redemption-data.json'
      });
    });
  },
  appendHistoryEvent,
  fetchRecentHistory,
  onSaveStatus(listener) {},
  onDataChange(listener) {}
};

/**
 * Appends an atomic action to today's history log on companion server
 * Routes to history-admin/ if active profile is admin, otherwise history/
 */
export async function appendHistoryEvent(event) {
  try {
    const res = await fetch(`${API_BASE}/history/append`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getVaultHeaders()
      },
      body: JSON.stringify(event)
    });

    if (!res.ok) {
      console.warn('History append returned status:', res.status);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('History append network error:', err);
    return null;
  }
}

/**
 * Fetches recent 48-hour history events (today and yesterday)
 * in chronological order from companion server
 */
export async function fetchRecentHistory() {
  try {
    const res = await fetch(`${API_BASE}/history/recent`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...getVaultHeaders()
      }
    });

    if (!res.ok) {
      console.warn('Fetch recent history returned status:', res.status);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('Fetch recent history network error:', err);
    return [];
  }
}

