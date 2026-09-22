/**
 * Production Application Orchestrator for Mind Redemption
 * Manages tab switching, keyboard shortcuts, export/import, and component instantiation.
 * Integrates Stealth Duress Vault & 24-Hour Clock Passphrase Trigger detection.
 */

import {
  loadStorageData,
  getActiveWorkspace,
  setActiveWorkspace,
  setAdminSession,
  clearAdminSession,
  getVaultProfile,
  verifyAdminPassword,
  flushAdminSaveAndSwapToDecoy
} from './fs-storage.js';
import { initMindFlow } from './mindflow.js';
import { initNotes } from './notes.js';
import { initDiary } from './diary.js';
import { initTimeline, trackSession, onTimeMachineChange } from './timeline.js';
import { initCloakEngine, isCloaked, revealCloak } from './cloak.js';

const THEME_KEY = 'thought_theme';
const VALID_TABS = ['mindflow', 'notes', 'diary'];

let duressToastTimer = null;
let isProcessingTrigger = false;

/**
 * Applies the selected theme (dark or light) to root and body
 */
export function applyTheme(theme = 'dark') {
  const isDark = theme === 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add(isDark ? 'theme-dark' : 'theme-light');

  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.innerHTML = isDark ? '☀️ Light' : '🌙 Dark';
  }

  localStorage.setItem(THEME_KEY, theme);
}

/**
 * Toggles between dark and light themes
 */
export function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/**
 * Activates the requested tab and updates session workspace state
 */
export function switchTab(tabName) {
  if (!VALID_TABS.includes(tabName)) return;

  const tabButtons = {
    mindflow: document.getElementById('tab-mindflow'),
    notes: document.getElementById('tab-notes'),
    diary: document.getElementById('tab-diary')
  };

  const viewPanels = {
    mindflow: document.getElementById('mindflow-view') || document.getElementById('mindflow-tab-view'),
    notes: document.getElementById('notes-view') || document.getElementById('notes-tab-view'),
    diary: document.getElementById('diary-view') || document.getElementById('diary-tab-view')
  };

  VALID_TABS.forEach(tab => {
    const btn = tabButtons[tab];
    const view = viewPanels[tab];
    const isActive = tab === tabName;

    if (btn) {
      btn.classList.toggle('active', isActive);
    }
    if (view) {
      view.classList.toggle('active', isActive);
      view.classList.toggle('hidden', !isActive);
    }
  });

  // Re-render diary or active tab views if needed
  if (tabName === 'diary') {
    initDiary();
  }

  // Telemetry: Track active session module
  trackSession(tabName, 'root');

  // Persist current tab in active workspace
  setActiveWorkspace({ currentTab: tabName });
}

/**
 * Starts real-time dynamic clock ticker in header
 */
export function startHeaderClock() {
  const clockEl = document.getElementById('header-clock');
  if (!clockEl) return;

  const updateClock = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    const dateStr = now.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    clockEl.textContent = `${timeStr} • ${dateStr}`;
  };

  // Run immediately on page mount to avoid 1-second blank flash
  updateClock();

  // Clear any existing timer to avoid multiple intervals
  if (window._headerClockTimer) {
    clearInterval(window._headerClockTimer);
  }

  // Tick every second dynamically without requiring a page refresh
  window._headerClockTimer = setInterval(updateClock, 1000);
}

// Start ticker immediately regardless of module execution timing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startHeaderClock);
} else {
  startHeaderClock();
}

/**
 * Displays realistic system error toast notice for duress traps
 */
export function showDuressNotice(message = 'System Notice: Admin workspace corrupted or notes deleted.') {
  const banner = document.getElementById('duress-toast-banner');
  const msgEl = document.getElementById('duress-toast-message');
  if (!banner) return;

  if (msgEl) msgEl.textContent = message;
  banner.classList.remove('hidden');

  if (duressToastTimer) {
    clearTimeout(duressToastTimer);
  }

  duressToastTimer = setTimeout(() => {
    banner.classList.add('hidden');
  }, 4500);
}

/**
 * Evaluates raw search input against strict AM/PM 24-hour clock trigger rules
 */
export function checkClockTrigger(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return { valid: false, trap: false };
  const val = rawInput.trim();
  if (val.length < 4) return { valid: false, trap: false };

  const now = new Date();
  const hours = now.getHours();
  const hh24 = String(hours).padStart(2, '0');
  const mm   = String(now.getMinutes()).padStart(2, '0');
  const hh12 = String((hours % 12) || 12).padStart(2, '0');
  const hh12Single = String(parseInt(hh12, 10));

  const isAM = hours < 12;

  if (isAM) {
    // AM Rule (00:00 to 11:59):
    // Valid Trigger: Strictly uppercase 24h format "${hh24}${mm}AD" (e.g., "0939AD")
    // Decoy / Trap: Lowercase "${hh24}${mm}ad" or 12h formats
    const validAM = `${hh24}${mm}AD`;
    const trapAM_lower = `${hh24}${mm}ad`;
    const trapAM_12h_lower1 = `${hh12}${mm}ad`;
    const trapAM_12h_lower2 = `${hh12Single}${mm}ad`;
    const trapAM_12h_upper1 = `${hh12}${mm}AD`;
    const trapAM_12h_upper2 = `${hh12Single}${mm}AD`;

    if (val === validAM) {
      return { valid: true, trap: false };
    }
    if (
      val === trapAM_lower ||
      val === trapAM_12h_lower1 ||
      val === trapAM_12h_lower2 ||
      val === trapAM_12h_upper1 ||
      val === trapAM_12h_upper2
    ) {
      return { valid: false, trap: true };
    }
  } else {
    // PM Rule (12:00 to 23:59):
    // Valid Trigger: Strictly lowercase 24h format "${hh24}${mm}ad" (e.g., "2139ad")
    // Decoy / Trap: 12h formats or uppercase formats
    const validPM = `${hh24}${mm}ad`;
    const trapPM_12h_lower1 = `${hh12}${mm}ad`;
    const trapPM_12h_lower2 = `${hh12Single}${mm}ad`;
    const trapPM_24h_upper = `${hh24}${mm}AD`;
    const trapPM_12h_upper1 = `${hh12}${mm}AD`;
    const trapPM_12h_upper2 = `${hh12Single}${mm}AD`;

    if (val === validPM) {
      return { valid: true, trap: false };
    }
    if (
      val === trapPM_12h_lower1 ||
      val === trapPM_12h_lower2 ||
      val === trapPM_24h_upper ||
      val === trapPM_12h_upper1 ||
      val === trapPM_12h_upper2
    ) {
      return { valid: false, trap: true };
    }
  }

  return { valid: false, trap: false };
}

/**
 * Opens Stealth Admin Auth Modal
 */
export function openAdminAuthModal() {
  const modal = document.getElementById('admin-auth-modal');
  const input = document.getElementById('admin-password-input');
  const error = document.getElementById('admin-auth-error');
  if (!modal) return;

  if (error) error.classList.add('hidden');
  if (input) input.value = '';
  modal.classList.remove('hidden');

  setTimeout(() => {
    if (input) input.focus();
  }, 50);
}

/**
 * Closes Stealth Admin Auth Modal
 */
export function closeAdminAuthModal() {
  const modal = document.getElementById('admin-auth-modal');
  const input = document.getElementById('admin-password-input');
  const error = document.getElementById('admin-auth-error');
  if (modal) modal.classList.add('hidden');
  if (input) input.value = '';
  if (error) error.classList.add('hidden');
}

/**
 * Handles submission of administrator passphrase
 */
async function handleAdminAuthSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('admin-password-input');
  const error = document.getElementById('admin-auth-error');
  const card = document.querySelector('.admin-auth-card');
  const submitBtn = document.getElementById('admin-auth-submit');
  if (!input) return;

  const password = input.value.trim();
  if (!password) return;

  if (submitBtn) submitBtn.disabled = true;

  const result = await verifyAdminPassword(password);

  if (submitBtn) submitBtn.disabled = false;

  if (result.success && result.token) {
    setAdminSession(result.token);
    closeAdminAuthModal();

    // Hydrate workspace with isolated admin vault partition
    await loadStorageData();
    try { initMindFlow(); } catch (err) { console.error('MindFlow admin init error:', err); }
    try { initNotes(); } catch (err) { console.error('Notes admin init error:', err); }
    try { initDiary(); } catch (err) { console.error('Diary admin init error:', err); }
    try { initTimeline(); } catch (err) { console.error('Timeline admin init error:', err); }

    // Reveal discrete admin indicator beside clock
    const badge = document.getElementById('admin-session-badge');
    if (badge) badge.classList.remove('hidden');

    const workspace = getActiveWorkspace() || { currentTab: 'mindflow' };
    switchTab(workspace.currentTab || 'mindflow');
  } else {
    if (error) {
      error.textContent = result.message || 'Invalid administrative credentials';
      error.classList.remove('hidden');
    }
    if (card) {
      card.classList.add('auth-shake');
      setTimeout(() => card.classList.remove('auth-shake'), 400);
    }
    input.select();
    input.focus();
  }
}

/**
 * Flushes active block and note inputs to in-memory state before atomic exit
 */
function collectUnsavedActiveInputs() {
  // 0. If currently in Chameleon Masking mode, reveal genuine text before flushing
  if (isCloaked()) {
    revealCloak();
  }

  // 1. MindFlow active contenteditable block
  const activeEditable = document.querySelector('.block-body[contenteditable="true"]');
  if (activeEditable) {
    activeEditable.blur();
  }

  // 2. Notes modal or quick-note active inputs
  const noteEditModal = document.getElementById('note-edit-modal');
  const noteCloseBtn = document.getElementById('modal-note-close');
  if (noteCloseBtn && noteEditModal && !noteEditModal.classList.contains('hidden')) {
    noteCloseBtn.click();
  }

  const quickDoneBtn = document.getElementById('quick-note-done');
  const quickBody = document.getElementById('quick-note-body');
  if (quickDoneBtn && quickBody && quickBody.value.trim()) {
    quickDoneBtn.click();
  }
}

/**
 * "Flush-Then-Swap" Atomic Exit Routine:
 * Swaps UI to decoy in < 16ms while saving admin state asynchronously in background
 */
export function executeFlushAndSwapExit() {
  // 1. Collect any unsaved text in active inputs/blocks
  collectUnsavedActiveInputs();

  // 2, 3, 4: Immediately fire background async save, clear timeouts, purge admin session, hot-swap memory state (<1ms)
  flushAdminSaveAndSwapToDecoy();

  // 5. Instantly re-render workspace (<16ms)
  // Close any open modals
  const noteModal = document.getElementById('note-edit-modal');
  if (noteModal) noteModal.classList.add('hidden');
  const pageModal = document.getElementById('add-page-modal');
  if (pageModal) pageModal.classList.add('hidden');
  const timelineModal = document.getElementById('timeline-modal');
  if (timelineModal) timelineModal.classList.add('hidden');

  // Re-render components with decoy state
  try { initMindFlow(); } catch (err) { console.error('MindFlow decoy init error:', err); }
  try { initNotes(); } catch (err) { console.error('Notes decoy init error:', err); }
  try { initDiary(); } catch (err) { console.error('Diary decoy init error:', err); }
  try { initTimeline(); } catch (err) { console.error('Timeline decoy init error:', err); }

  // Hide admin session indicator badge
  const badge = document.getElementById('admin-session-badge');
  if (badge) badge.classList.add('hidden');

  // Restore decoy workspace tab
  const workspace = getActiveWorkspace() || { currentTab: 'mindflow' };
  switchTab(workspace.currentTab || 'mindflow');
}

/**
 * Initializes global search input trigger detection
 */
function setupTriggerListeners() {
  document.addEventListener('input', (e) => {
    const target = e.target;
    if (!target) return;

    // Monitor all search inputs across the application
    const isSearchInput = target.matches(
      '#notes-search-input, #notes-search, .notes-search-bar input, .search-input, input[type="search"]'
    );
    if (!isSearchInput) return;

    if (isProcessingTrigger) return;

    const result = checkClockTrigger(target.value);

    if (result.valid) {
      isProcessingTrigger = true;
      target.value = '';
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.blur();
      isProcessingTrigger = false;

      openAdminAuthModal();
    } else if (result.trap) {
      isProcessingTrigger = true;
      target.value = '';
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.blur();
      isProcessingTrigger = false;

      showDuressNotice('System Notice: Admin workspace corrupted or notes deleted.');
    }
  });
}

/**
 * Application Lifecycle Initialization Pipeline
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Start real-time dynamic header clock
  startHeaderClock();

  // Initialize trigger listeners
  setupTriggerListeners();

  // Initialize Chameleon Masking / Typing Cloak Engine
  initCloakEngine();

  // 1. Rehydrate theme from localStorage (default: dark)
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(savedTheme);

  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
  }

  // 2. Fetch canonical state from the local companion server (Decoy profile by default)
  await loadStorageData();

  // 3. Initialize all subsystems
  try { initMindFlow(); } catch (e) { console.error('MindFlow init error:', e); }
  try { initNotes(); } catch (e) { console.error('Notes init error:', e); }
  try { initDiary(); } catch (e) { console.error('Diary init error:', e); }
  try { initTimeline(); } catch (e) { console.error('Timeline init error:', e); }

  // 4. Retrieve activeWorkspace state and activate recorded tab
  const workspace = getActiveWorkspace() || { currentTab: 'mindflow' };
  const targetTab = workspace.currentTab || 'mindflow';
  switchTab(targetTab);

  // 5. Wire tab navigation button clicks
  VALID_TABS.forEach(tab => {
    const btn = document.getElementById(`tab-${tab}`);
    if (btn) {
      btn.addEventListener('click', () => switchTab(tab));
    }
  });

  // 6. Admin Vault Modal & Exit button listeners
  const exitBtn = document.getElementById('admin-exit-btn');
  if (exitBtn) {
    exitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      executeFlushAndSwapExit();
    });
  }

  const authForm = document.getElementById('admin-auth-form');
  if (authForm) {
    authForm.addEventListener('submit', handleAdminAuthSubmit);
  }

  const cancelBtn = document.getElementById('admin-auth-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeAdminAuthModal);
  }

  // 7. Global Hotkeys & Modal Cancel (Escape)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const authModal = document.getElementById('admin-auth-modal');
      if (authModal && !authModal.classList.contains('hidden')) {
        closeAdminAuthModal();
        return;
      }
    }

    const isCmdOrCtrl = e.ctrlKey || e.metaKey;
    if (isCmdOrCtrl) {
      if (e.key === '1') {
        e.preventDefault();
        switchTab('mindflow');
      } else if (e.key === '2') {
        e.preventDefault();
        switchTab('notes');
      } else if (e.key === '3') {
        e.preventDefault();
        switchTab('diary');
      }
    }
  });
});
