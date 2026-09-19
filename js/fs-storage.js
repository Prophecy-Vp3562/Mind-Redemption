/**
 * Storage Layer for Thought Redemption
 * Connects directly to the local FastAPI companion server at http://127.0.0.1:8000/api
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
  }
};

let inMemoryState = JSON.parse(JSON.stringify(CANONICAL_STATE));
let saveDebounceTimer = null;
let isSaving = false;
let hasPendingSave = false;

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

/**
 * Health check for FastAPI server
 */
export async function checkServerHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.status === 'ok';
  } catch (err) {
    return false;
  }
}

/**
 * Fetches from /api/load, hydrates internal state, updates sync status, and returns state object
 */
export async function loadStorageData() {
  try {
    const res = await fetch(`${API_BASE}/load`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
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
      }
    };

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    updateSyncStatusUI('saved', `Loaded at ${timeStr}`);

    return inMemoryState;
  } catch (err) {
    console.error('loadStorageData error:', err);
    updateSyncStatusUI('error', 'Server Offline (Run server.py)');
    return inMemoryState;
  }
}

/**
 * Executes direct POST to /api/save
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
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(inMemoryState)
    });

    if (!res.ok) {
      throw new Error(`Save failed with HTTP status ${res.status}`);
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    updateSyncStatusUI('saved', `Saved at ${timeStr}`);
  } catch (err) {
    console.error('saveStorageData network error:', err);
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
  onConnectionChange(listener) {
    // Notify listeners of connection status
    checkServerHealth().then(ok => {
      listener({
        status: ok ? 'connected' : 'unsupported',
        fileName: 'thought-redemption-data.json'
      });
    });
  },
  onSaveStatus(listener) {},
  onDataChange(listener) {}
};
