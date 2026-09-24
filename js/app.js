/**
 * Production Application Orchestrator for Mind Redemption
 * Manages tab switching, keyboard shortcuts, export/import, and component instantiation.
 * Integrates Stealth Duress Vault & 24-Hour Clock Passphrase Trigger detection.
 */

import {
  storage,
  loadStorageData,
  getActiveWorkspace,
  setActiveWorkspace,
  setAdminSession,
  clearAdminSession,
  getVaultProfile,
  verifyAdminPassword,
  flushAdminSaveAndSwapToDecoy,
  logoutAdminVault
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

// --- Global Scope State Contract ---
window.viewScope = 'today';

/**
 * Compares an ISO timestamp or date string against the current local date YYYY-MM-DD
 */
export function isToday(dateStr) {
  if (!dateStr) return false;
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return dateStr.trim() === todayStr;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
         d.getMonth() === now.getMonth() &&
         d.getDate() === now.getDate();
}
window.isToday = isToday;

/**
 * Returns the currently active tab ID
 */
export function getActiveTab() {
  const activeBtn = document.querySelector('.nav-tab-btn.active');
  if (activeBtn && activeBtn.dataset.tab) {
    return activeBtn.dataset.tab;
  }
  const workspace = getActiveWorkspace();
  return (workspace && workspace.currentTab) || 'mindflow';
}

/**
 * Sets the active view scope and triggers UI updates and tab re-rendering
 */
export function setViewScope(scope) {
  if (scope !== 'today' && scope !== 'all-time') return;
  window.viewScope = scope;
  updateScopeUI();

  // Re-render the active tab (Notes or Mind Flow; Diary is strictly excluded)
  const activeTab = getActiveTab();
  if (activeTab === 'notes') {
    initNotes();
  } else if (activeTab === 'mindflow') {
    initMindFlow();
  }
}
window.setViewScope = setViewScope;

/**
 * Updates UI indicators and popover checkmarks based on window.viewScope
 */
export function updateScopeUI() {
  const isAllTime = window.viewScope === 'all-time';

  // Toggle pills
  const pillHeader = document.getElementById('scope-indicator-pill');
  if (pillHeader) {
    pillHeader.classList.toggle('hidden', !isAllTime);
  }

  const pillSearch = document.getElementById('notes-search-scope-pill');
  if (pillSearch) {
    pillSearch.classList.toggle('hidden', !isAllTime);
  }

  // Update menu item states
  const menuItems = document.querySelectorAll('.scope-dropdown-item');
  menuItems.forEach(item => {
    const itemScope = item.dataset.scope;
    if (itemScope) {
      const isActive = itemScope === window.viewScope;
      item.classList.toggle('active', isActive);
    }
  });

  const trigger = document.getElementById('brand-scope-trigger');
  if (trigger) {
    trigger.setAttribute('title', isAllTime ? 'Current: All-Time Archives (Click to switch)' : "Current: Today's Space (Click to switch)");
  }
}

/**
 * Initializes brand dropdown trigger and event handlers
 */
export function initScopeDropdown() {
  const trigger = document.getElementById('brand-scope-trigger');
  const menu = document.getElementById('scope-dropdown-menu');
  const resetBtnHeader = document.getElementById('scope-pill-reset-btn');
  const resetBtnSearch = document.getElementById('notes-search-pill-reset-btn');

  if (!trigger || !menu) return;

  const openMenu = () => {
    menu.classList.remove('hidden');
    trigger.classList.add('active');
    trigger.setAttribute('aria-expanded', 'true');
  };

  const closeMenu = () => {
    menu.classList.add('hidden');
    trigger.classList.remove('active');
    trigger.setAttribute('aria-expanded', 'false');
  };

  const toggleMenu = () => {
    if (menu.classList.contains('hidden')) {
      openMenu();
    } else {
      closeMenu();
    }
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  // Scope menu option buttons
  const menuItems = menu.querySelectorAll('.scope-dropdown-item');
  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.id === 'scope-bin-item') {
        closeMenu();
        openBinModal();
        return;
      }
      const scope = item.dataset.scope;
      if (scope) {
        setViewScope(scope);
      }
      closeMenu();
    });
  });

  // Reset buttons on pill indicators
  if (resetBtnHeader) {
    resetBtnHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      setViewScope('today');
    });
  }
  if (resetBtnSearch) {
    resetBtnSearch.addEventListener('click', (e) => {
      e.stopPropagation();
      setViewScope('today');
    });
  }

  // Click outside closes popover
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('hidden') && !menu.contains(e.target) && !trigger.contains(e.target)) {
      closeMenu();
    }
  });

  // Escape key closes popover
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.classList.contains('hidden')) {
      closeMenu();
    }
  });

  updateScopeUI();
}

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

  // If in Cloak mode, reveal and persist genuine text before swapping tab view
  if (isCloaked()) {
    revealCloak();
  }

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
  } else if (tabName === 'notes') {
    initNotes();
  } else if (tabName === 'mindflow') {
    initMindFlow();
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

    updateScopeUI();
    refreshBinUI();

    // Initialize 5-minute inactivity watchdog
    resetAdminIdleTimer();

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
export function executeFlushAndSwapExit(noticeMsg = null) {
  // Clear any active idle watchdog timer
  clearAdminIdleTimer();

  // 1. Collect any unsaved text in active inputs/blocks
  collectUnsavedActiveInputs();

  // 2, 3, 4: Immediately fire background async save, clear timeouts, purge admin session, hot-swap memory state (<1ms)
  flushAdminSaveAndSwapToDecoy();

  // Revoke session token on companion server
  logoutAdminVault();

  // 5. Instantly re-render workspace (<16ms)
  // Close any open modals
  const noteModal = document.getElementById('note-edit-modal');
  if (noteModal) noteModal.classList.add('hidden');
  const pageModal = document.getElementById('add-page-modal');
  if (pageModal) pageModal.classList.add('hidden');
  const timelineModal = document.getElementById('timeline-modal');
  if (timelineModal) timelineModal.classList.add('hidden');
  const binModal = document.getElementById('bin-view-modal');
  if (binModal) binModal.classList.add('hidden');
  refreshBinUI();

  // Re-render components with decoy state
  try { initMindFlow(); } catch (err) { console.error('MindFlow decoy init error:', err); }
  try { initNotes(); } catch (err) { console.error('Notes decoy init error:', err); }
  try { initDiary(); } catch (err) { console.error('Diary decoy init error:', err); }
  try { initTimeline(); } catch (err) { console.error('Timeline decoy init error:', err); }

  // Hide admin session indicator badge
  const badge = document.getElementById('admin-session-badge');
  if (badge) badge.classList.add('hidden');

  // Restore decoy workspace tab
  window.viewScope = 'today';
  updateScopeUI();
  const workspace = getActiveWorkspace() || { currentTab: 'mindflow' };
  switchTab(workspace.currentTab || 'mindflow');

  if (noticeMsg) {
    showDuressNotice(noticeMsg);
  }
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

  // Initialize View Scope Dropdown & Pill Indicators
  initScopeDropdown();

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

  // 7. Global Hotkeys, 2-Second Escape Key Hold Panic Lock & Modal Cancel
  let escHoldTimer = null;
  let escHoldTriggered = false;

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // 2-Second Hold Panic Lock detector
      if (!escHoldTimer && !e.repeat) {
        escHoldTimer = setTimeout(() => {
          escHoldTriggered = true;
          if (getVaultProfile() === 'admin') {
            executeFlushAndSwapExit('Panic Lock: Admin vault locked and session cleared.');
          }
        }, 2000);
      }

      // Normal modal / UI close on Escape
      const authModal = document.getElementById('admin-auth-modal');
      if (authModal && !authModal.classList.contains('hidden')) {
        closeAdminAuthModal();
        return;
      }
      const binModal = document.getElementById('bin-view-modal');
      if (binModal && !binModal.classList.contains('hidden')) {
        closeBinModal();
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

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Escape') {
      if (escHoldTimer) {
        clearTimeout(escHoldTimer);
        escHoldTimer = null;
      }
      if (escHoldTriggered) {
        e.preventDefault();
        e.stopPropagation();
        escHoldTriggered = false;
        return;
      }
    }
  });

  // 8. Recycle Bin Modal & Action Listeners
  initBinListeners();

  // 9. Inactivity Watchdog Listeners
  setupIdleWatchdog();
});

// ==========================================================================
// Recycle Bin (Trash) Subsystem
// ==========================================================================

export function formatTrashDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hourStr = String(hours).padStart(2, '0');
  return `${day} ${month} ${year}, ${hourStr}:${minutes} ${ampm}`;
}

function getTrashTextPreview(item) {
  if (!item || !item.payload) return 'No preview available';
  const p = item.payload;
  if (item.type === 'note') {
    return p.content || p.body || '(Empty note content)';
  } else if (item.type === 'mindflow') {
    if (p._isSlide && p.blocks) {
      return p.blocks.main?.content || Object.values(p.blocks).map(b => b.content).filter(Boolean).join(' ') || '(Empty slide content)';
    } else if (p.pages && p.pages.length > 0) {
      const firstPage = p.pages[0];
      return firstPage.blocks?.main?.content || Object.values(firstPage.blocks || {}).map(b => b.content).filter(Boolean).join(' ') || `Book with ${p.pages.length} pages`;
    }
  }
  return '(No text content)';
}

export function openBinModal() {
  const modal = document.getElementById('bin-view-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  refreshBinUI();
}
window.openBinModal = openBinModal;

export function closeBinModal() {
  const modal = document.getElementById('bin-view-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}
window.closeBinModal = closeBinModal;

export function refreshBinUI() {
  const container = document.getElementById('bin-items-container');
  const emptyState = document.getElementById('bin-empty-state');
  const countBadge = document.getElementById('bin-item-count-badge');
  const emptyBtn = document.getElementById('bin-empty-btn');
  if (!container) return;

  const trash = storage.getTrashData() || [];
  // Sort reverse-chronological (most recently deleted at the top)
  const sorted = [...trash].sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));

  if (countBadge) {
    countBadge.textContent = `${sorted.length} ${sorted.length === 1 ? 'item' : 'items'}`;
  }

  if (emptyBtn) {
    emptyBtn.disabled = sorted.length === 0;
  }

  if (sorted.length === 0) {
    container.innerHTML = '';
    emptyState?.classList.remove('hidden');
    return;
  }

  emptyState?.classList.add('hidden');
  container.innerHTML = '';

  sorted.forEach(item => {
    const card = document.createElement('div');
    card.className = 'bin-card';
    card.dataset.id = item.id;

    const isNote = item.type === 'note';
    const typeLabel = isNote ? 'Note' : 'Mind Flow';
    const typeClass = isNote ? 'bin-type-note' : 'bin-type-mindflow';
    const formattedDate = formatTrashDate(item.deletedAt);
    const previewText = getTrashTextPreview(item);

    card.innerHTML = `
      <div class="bin-card-top">
        <div class="bin-card-type-and-title">
          <span class="bin-type-badge ${typeClass}">[${typeLabel}]</span>
          <h4 class="bin-card-title" title="${escapeHtml(item.title || 'Untitled')}">${escapeHtml(item.title || 'Untitled')}</h4>
        </div>
        <span class="bin-card-date">${formattedDate}</span>
      </div>
      <div class="bin-card-preview">${escapeHtml(previewText)}</div>
      <div class="bin-card-actions">
        <button class="btn-bin-restore" data-id="${item.id}" title="Restore back to active workspace">↩ Restore</button>
        <button class="btn-bin-purge" data-id="${item.id}" title="Permanently delete item">✕ Delete Permanently</button>
      </div>
    `;

    // Action listeners
    card.querySelector('.btn-bin-restore')?.addEventListener('click', (e) => {
      e.stopPropagation();
      restoreTrashItem(item.id);
    });

    card.querySelector('.btn-bin-purge')?.addEventListener('click', (e) => {
      e.stopPropagation();
      permanentlyDeleteTrashItem(item.id);
    });

    container.appendChild(card);
  });
}
window.refreshBinUI = refreshBinUI;

export function restoreTrashItem(id) {
  const trash = storage.getTrashData();
  const idx = trash.findIndex(t => t.id === id);
  if (idx === -1) return;

  const [item] = trash.splice(idx, 1);
  if (!item || !item.payload) {
    storage.scheduleSave(0);
    refreshBinUI();
    return;
  }

  if (item.type === 'note') {
    const notesData = storage.getNotesData();
    if (!notesData.items) notesData.items = [];
    notesData.items.unshift(item.payload);
    initNotes();
  } else if (item.type === 'mindflow') {
    const mfData = storage.getMindFlowData();
    if (!mfData.books && !mfData.notes) mfData.books = [];
    const books = mfData.books || mfData.notes;

    if (item.payload._isSlide) {
      const slide = item.payload;
      const parentId = slide._parentBookId;
      delete slide._isSlide;
      delete slide._parentBookId;
      delete slide._parentBookTitle;

      const parentBook = books.find(b => b.id === parentId);
      if (parentBook) {
        if (!parentBook.pages) parentBook.pages = [];
        parentBook.pages.push(slide);
        parentBook.updatedAt = new Date().toISOString();
      } else {
        // Parent book no longer exists, restore slide as its own book
        const newBook = {
          id: 'note_' + Date.now(),
          title: item.title || 'Restored Slide Note',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          pages: [slide]
        };
        books.unshift(newBook);
      }
    } else {
      books.unshift(item.payload);
    }
    initMindFlow();
  }

  storage.scheduleSave(0);
  refreshBinUI();
}

export function permanentlyDeleteTrashItem(id) {
  const trash = storage.getTrashData();
  const item = trash.find(t => t.id === id);
  if (!item) return;

  if (confirm(`Permanently delete "${item.title || 'Untitled'}"? This action cannot be undone.`)) {
    const idx = trash.findIndex(t => t.id === id);
    if (idx !== -1) {
      trash.splice(idx, 1);
      storage.scheduleSave(0);
      refreshBinUI();
    }
  }
}

export function emptyBinPermanently() {
  const trash = storage.getTrashData();
  if (!trash || trash.length === 0) return;

  if (confirm(`Are you sure you want to permanently delete all ${trash.length} items from the Recycle Bin? This action cannot be undone.`)) {
    trash.length = 0;
    storage.scheduleSave(0);
    refreshBinUI();
  }
}

function initBinListeners() {
  const modal = document.getElementById('bin-view-modal');
  const closeBtn = document.getElementById('bin-modal-close-btn');
  const emptyBtn = document.getElementById('bin-empty-btn');

  closeBtn?.addEventListener('click', closeBinModal);
  emptyBtn?.addEventListener('click', emptyBinPermanently);

  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeBinModal();
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// ==========================================================================
// 5-Minute Inactivity Watchdog Subsystem
// ==========================================================================

let adminIdleTimer = null;
const ADMIN_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function resetAdminIdleTimer() {
  if (getVaultProfile() !== 'admin') {
    if (adminIdleTimer) {
      clearTimeout(adminIdleTimer);
      adminIdleTimer = null;
    }
    return;
  }

  if (adminIdleTimer) {
    clearTimeout(adminIdleTimer);
  }

  adminIdleTimer = setTimeout(triggerAdminAutoLock, ADMIN_IDLE_TIMEOUT_MS);
}
window.resetAdminIdleTimer = resetAdminIdleTimer;

export function clearAdminIdleTimer() {
  if (adminIdleTimer) {
    clearTimeout(adminIdleTimer);
    adminIdleTimer = null;
  }
}
window.clearAdminIdleTimer = clearAdminIdleTimer;

export function triggerAdminAutoLock() {
  if (getVaultProfile() !== 'admin') return;
  clearAdminIdleTimer();
  executeFlushAndSwapExit('Session expired due to inactivity.');
}
window.triggerAdminAutoLock = triggerAdminAutoLock;

function setupIdleWatchdog() {
  const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
  let throttleTimer = null;

  const onActivity = () => {
    if (getVaultProfile() !== 'admin') return;
    if (throttleTimer) return;
    throttleTimer = setTimeout(() => {
      throttleTimer = null;
    }, 1000);
    resetAdminIdleTimer();
  };

  ACTIVITY_EVENTS.forEach(evt => {
    window.addEventListener(evt, onActivity, { passive: true });
  });
}

