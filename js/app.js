/**
 * Main Application Orchestrator
 * 
 * Manages:
 * - Top-level 3-tab navigation (Mind Flow, Note, Diary)
 * - File System Access API UI (Browser detection warning, first-time picker, reconnect prompt)
 * - Save status indicator (Debounced autosave)
 * - Theme management (Dark / Light mode)
 */

import { storage } from './fs-storage.js';
import { MindFlowController } from './mindflow.js';
import { NotesController } from './notes.js';
import { DiaryController } from './diary.js';

class ThoughtApp {
  constructor() {
    this.currentTab = 'mindflow'; // 'mindflow' | 'notes' | 'diary'
    this.theme = localStorage.getItem('thought_theme') || 'dark';

    // Controllers
    this.mindflow = null;
    this.notes = null;
    this.diary = null;

    // UI Elements
    this.tabButtons = document.querySelectorAll('.nav-tab-btn');
    this.tabViews = {
      mindflow: document.getElementById('mindflow-tab-view'),
      notes: document.getElementById('notes-tab-view'),
      diary: document.getElementById('diary-tab-view')
    };

    this.fsBanner = document.getElementById('fs-connection-banner');
    this.fsModal = document.getElementById('fs-file-modal');
    this.saveStatusEl = document.getElementById('app-save-status');
    this.themeToggleBtn = document.getElementById('theme-toggle-btn');

    this.init();
  }

  async init() {
    // 1. Initialize Theme
    this.applyTheme(this.theme);
    this.themeToggleBtn?.addEventListener('click', () => {
      this.toggleTheme();
    });

    // 2. Initialize Controllers
    this.mindflow = new MindFlowController(this);
    this.notes = new NotesController(this);
    this.diary = new DiaryController(this);

    // 3. Tab Switching Events
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab) this.switchTab(tab);
      });
    });

    // 4. Wire Storage Listeners & File System UI
    this.wireStorageEvents();

    // 5. Initialize Storage
    await storage.init();

    // 6. Initial render of active tab
    this.renderActiveTab();
  }

  // --- Theme Management ---
  applyTheme(theme) {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('thought_theme', theme);
    if (this.themeToggleBtn) {
      this.themeToggleBtn.innerHTML = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    }
  }

  toggleTheme() {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  // --- Tab Navigation (Section 2) ---
  switchTab(tabName) {
    if (!this.tabViews[tabName]) return;
    this.currentTab = tabName;

    // Update buttons
    this.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update views
    Object.entries(this.tabViews).forEach(([key, el]) => {
      if (key === tabName) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });

    this.renderActiveTab();
  }

  renderActiveTab() {
    if (this.currentTab === 'mindflow') {
      this.mindflow.render();
    } else if (this.currentTab === 'notes') {
      this.notes.render();
    } else if (this.currentTab === 'diary') {
      this.diary.render();
    }
  }

  // --- Storage & File System Access API UI ---
  wireStorageEvents() {
    // Connection status changes
    storage.onConnectionChange((info) => {
      this.updateConnectionUI(info);
    });

    // Save status indicator (debounced writes)
    storage.onSaveStatus((statusInfo) => {
      this.updateSaveStatusUI(statusInfo);
    });

    // Data changes (e.g. loaded from file or reset)
    storage.onDataChange(() => {
      this.renderActiveTab();
    });

    // Modal action buttons
    document.getElementById('modal-create-file-btn')?.addEventListener('click', async () => {
      const ok = await storage.createNewFile();
      if (ok) this.hideFileModal();
    });

    document.getElementById('modal-open-file-btn')?.addEventListener('click', async () => {
      const ok = await storage.openFilePicker();
      if (ok) this.hideFileModal();
    });

    document.getElementById('modal-close-file-btn')?.addEventListener('click', () => {
      this.hideFileModal();
    });

    document.getElementById('modal-skip-file-btn')?.addEventListener('click', () => {
      this.hideFileModal();
    });

    // Close on clicking modal backdrop
    this.fsModal?.addEventListener('click', (e) => {
      if (e.target === this.fsModal) {
        this.hideFileModal();
      }
    });

    // Close on Escape if modal is open
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.fsModal && !this.fsModal.classList.contains('hidden')) {
        this.hideFileModal();
      }
    });

    document.getElementById('banner-reconnect-btn')?.addEventListener('click', async () => {
      await storage.reconnect();
    });

    document.getElementById('banner-change-file-btn')?.addEventListener('click', () => {
      this.showFileModal();
    });

    document.getElementById('header-file-status')?.addEventListener('click', () => {
      this.showFileModal();
    });
  }

  updateConnectionUI(info) {
    const banner = this.fsBanner;
    const bannerMsg = document.getElementById('banner-message');
    const reconnectBtn = document.getElementById('banner-reconnect-btn');
    const changeBtn = document.getElementById('banner-change-file-btn');
    const headerStatus = document.getElementById('header-file-status');

    if (!banner) return;

    if (info.status === 'unsupported') {
      // Firefox / Safari unsupported message (Spec Section 7.1)
      banner.className = 'connection-banner banner-warning';
      banner.classList.remove('hidden');
      if (bannerMsg) {
        bannerMsg.innerHTML = `⚠️ <strong>Browser Notice:</strong> The File System Access API is not supported in Safari or Firefox. Please use <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong> for direct local JSON file sync. (Your work is currently backed up to browser local storage).`;
      }
      if (reconnectBtn) reconnectBtn.classList.add('hidden');
      if (changeBtn) changeBtn.classList.add('hidden');
      if (headerStatus) headerStatus.textContent = '● Local Storage (Browser Limited)';
    } else if (info.status === 'disconnected') {
      // First run: Show modal prompt
      banner.className = 'connection-banner banner-info';
      banner.classList.remove('hidden');
      if (bannerMsg) bannerMsg.textContent = 'Welcome! Connect a local JSON file to automatically store and sync your thoughts.';
      if (reconnectBtn) reconnectBtn.classList.add('hidden');
      if (changeBtn) changeBtn.classList.remove('hidden');
      if (headerStatus) headerStatus.textContent = '○ No File Connected';
      this.showFileModal();
    } else if (info.status === 'needs_reconnect') {
      // Return visit: Requires user gesture to reconnect
      banner.className = 'connection-banner banner-prompt';
      banner.classList.remove('hidden');
      if (bannerMsg) {
        bannerMsg.innerHTML = `📁 <strong>Return Visit:</strong> Click Reconnect to grant permission to your local file <code>${info.fileName || 'thought-data.json'}</code>.`;
      }
      if (reconnectBtn) reconnectBtn.classList.remove('hidden');
      if (changeBtn) changeBtn.classList.remove('hidden');
      if (headerStatus) headerStatus.textContent = `⚠️ Permission Needed: ${info.fileName || 'file'}`;
    } else if (info.status === 'connected') {
      // Connected & reading/writing ok
      banner.classList.add('hidden');
      if (headerStatus) {
        headerStatus.innerHTML = `<span class="connected-dot">●</span> <code>${info.fileName}</code>`;
        headerStatus.title = `Connected to ${info.fileName}. Click to switch files.`;
      }
    }
  }

  updateSaveStatusUI(statusInfo) {
    if (!this.saveStatusEl) return;

    if (statusInfo.status === 'saving') {
      this.saveStatusEl.textContent = 'Saving to file...';
      this.saveStatusEl.className = 'status-indicator status-saving';
    } else if (statusInfo.status === 'saved') {
      this.saveStatusEl.textContent = statusInfo.message || 'Saved';
      this.saveStatusEl.className = 'status-indicator status-saved';
    } else if (statusInfo.status === 'pending') {
      this.saveStatusEl.textContent = 'Saving...';
      this.saveStatusEl.className = 'status-indicator status-pending';
    } else if (statusInfo.status === 'error') {
      this.saveStatusEl.textContent = statusInfo.message || 'Save error';
      this.saveStatusEl.className = 'status-indicator status-error';
    }
  }

  showFileModal() {
    this.fsModal?.classList.remove('hidden');
  }

  hideFileModal() {
    this.fsModal?.classList.add('hidden');
  }
}

// Start app once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ThoughtApp();
});
