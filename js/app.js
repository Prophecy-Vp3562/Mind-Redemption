/**
 * Production Application Orchestrator for Mind Redemption
 * Manages tab switching, keyboard shortcuts, export/import, and component instantiation.
 */

import { loadStorageData, getActiveWorkspace, setActiveWorkspace } from './fs-storage.js';
import { initMindFlow } from './mindflow.js';
import { initNotes } from './notes.js';
import { initDiary } from './diary.js';
import { initTimeline, trackSession, onTimeMachineChange } from './timeline.js';

const THEME_KEY = 'thought_theme';
const VALID_TABS = ['mindflow', 'notes', 'diary'];

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
 * Application Lifecycle Initialization Pipeline
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Start real-time dynamic header clock
  startHeaderClock();

  // 1. Rehydrate theme from localStorage (default: dark)
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(savedTheme);

  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
  }

  // 2. Fetch canonical state from the local FastAPI companion server
  await loadStorageData();

  // 3. Initialize all subsystems
  try { initMindFlow(); } catch (e) { console.error('MindFlow init error:', e); }
  try { initNotes(); } catch (e) { console.error('Notes init error:', e); }
  try { initDiary(); } catch (e) { console.error('Diary init error:', e); }
  try { initTimeline(); } catch (e) { console.error('Timeline init error:', e); }

  // 4. Retrieve activeWorkspace state and activate the recorded currentTab
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

  // 6. Global Hotkeys (Ctrl/Cmd + 1, 2, 3)
  window.addEventListener('keydown', (e) => {
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

