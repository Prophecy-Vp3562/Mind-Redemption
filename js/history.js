/**
 * Mind Redemption Linear Event History & Undo/Redo Engine
 * Day-partitioned, linear, append-only event stream with 48-hour active window.
 *
 * Strict Canonical Formatting:
 * Date: "DD:MM:YYYY" (e.g. 24:09:2026)
 * Time: "HH:mm:ss" (e.g. 21:18:51)
 * DateTime: "DD:MM:YYYY HH:mm:ss"
 */

import { storage, appendHistoryEvent, fetchRecentHistory } from './fs-storage.js';

// --- Canonical Formatting Utilities ---

export function formatCustomDate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}:${month}:${year}`;
}

export function formatCustomTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function formatCustomDateTime(date = new Date()) {
  return `${formatCustomDate(date)} ${formatCustomTime(date)}`;
}

// --- Core History State ---
let historyStack = [];
let historyPointer = -1;
let isApplyingHistory = false;

// --- Typing Batch Granularity State ---
let activeTypingBatch = null;
let typingDebounceTimer = null;

export function getHistoryStack() {
  return historyStack;
}

export function getHistoryPointer() {
  return historyPointer;
}

/**
 * Loads recent 48-hour history log from backend companion server
 * into the in-memory historyStack and positions the pointer at the tail.
 */
export async function loadHistoryFromBackend() {
  try {
    const events = await fetchRecentHistory();
    historyStack = Array.isArray(events) ? events : [];
    historyPointer = historyStack.length - 1;
    return historyStack;
  } catch (err) {
    console.warn('Failed to load history from backend:', err);
    historyStack = [];
    historyPointer = -1;
    return [];
  }
}

/**
 * In-Memory Hygiene: Purges entire history stack and pointer immediately from memory.
 * Guaranteed zero leakage across vault partitions.
 */
export function purgeHistoryState() {
  sealActiveTypingBatch();
  historyStack = [];
  historyPointer = -1;
  activeTypingBatch = null;
  if (typingDebounceTimer) {
    clearTimeout(typingDebounceTimer);
    typingDebounceTimer = null;
  }
}

/**
 * Switches vault partition history: purges memory immediately, then reloads from disk.
 */
export async function switchHistoryVault(profile = 'default') {
  purgeHistoryState();
  return await loadHistoryFromBackend();
}

/**
 * Appends an atomic action event forward onto the single linear timeline
 * and asynchronously dispatches it to the disk history partition.
 */
export function recordEvent(eventData) {
  if (isApplyingHistory) return null;

  const now = new Date();
  const event = {
    id: eventData.id || `evt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: eventData.timestamp || now.getTime(),
    formattedDate: eventData.formattedDate || formatCustomDate(now),
    formattedTime: eventData.formattedTime || formatCustomTime(now),
    type: eventData.type,
    target: eventData.target || {},
    before: eventData.before !== undefined ? eventData.before : null,
    after: eventData.after !== undefined ? eventData.after : null
  };

  // Single linear main timeline: forward operations append to the continuous axis
  historyStack.push(event);
  historyPointer = historyStack.length - 1;

  // Asynchronous background persistence to today's log
  appendHistoryEvent(event).catch(err => {
    console.warn('Failed to append history event to server:', err);
  });

  return event;
}

// Make globally available to decouple event emission across components
if (typeof window !== 'undefined') {
  window.recordHistoryEvent = recordEvent;
}

// --- Typing Batching Subsystem ---

function resolveInputTarget(el) {
  if (!el) return null;

  // Ignore search inputs and secret passphrase inputs
  if (el.id === 'admin-password-input' || el.id === 'notes-search-input' || el.classList.contains('search-input')) {
    return null;
  }

  // 1. Note Edit Modal
  if (el.id === 'modal-note-title' || el.id === 'modal-note-body') {
    const isTitle = el.id === 'modal-note-title';
    const activeNoteId = window._activeEditNoteId || 'active-modal-note';
    return {
      scope: 'notes',
      id: activeNoteId,
      field: isTitle ? 'title' : 'content'
    };
  }

  // 2. Quick Note Box
  if (el.id === 'quick-note-title' || el.id === 'quick-note-body') {
    const isTitle = el.id === 'quick-note-title';
    return {
      scope: 'notes',
      id: 'quick-note',
      field: isTitle ? 'title' : 'content'
    };
  }

  // 3. Mind Flow Block Card
  const blockCard = el.closest('.mf-block-card');
  if (blockCard) {
    const blockKey = blockCard.dataset.blockKey || 'main';
    const isTitle = el.classList.contains('mf-block-title-input');
    const ws = (storage.getActiveWorkspace && storage.getActiveWorkspace()) || {};
    return {
      scope: 'mindflow',
      bookId: ws.activeBookId || null,
      pageId: ws.activePageId || null,
      blockKey: blockKey,
      field: isTitle ? 'title' : 'content'
    };
  }

  // 4. Diary Entry Textarea
  const diaryArea = el.closest('#diary-view') || el.closest('#diary-tab-view');
  if (diaryArea && (el.tagName === 'TEXTAREA' || el.id === 'diary-entry-text')) {
    return {
      scope: 'diary',
      id: el.dataset.date || new Date().toISOString().split('T')[0],
      field: 'content'
    };
  }

  // Generic fallback for any other text input/textarea
  if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el.type === 'text' || !el.type))) {
    return {
      scope: 'general',
      id: el.id || el.name || 'input',
      field: 'value'
    };
  }

  return null;
}

/**
 * Seals any active continuous typing batch into an atomic TEXT_MUTATION step.
 */
export function sealActiveTypingBatch() {
  if (typingDebounceTimer) {
    clearTimeout(typingDebounceTimer);
    typingDebounceTimer = null;
  }
  if (!activeTypingBatch) return;

  const { element, target, beforeValue } = activeTypingBatch;
  const afterValue = element ? (element.value || '') : '';

  activeTypingBatch = null;

  if (beforeValue !== afterValue && target) {
    if (element) {
      element.dataset.historyInitialValue = afterValue;
    }
    recordEvent({
      type: 'TEXT_MUTATION',
      target: target,
      before: { value: beforeValue },
      after: { value: afterValue }
    });
  }
}

// --- Notification Toast Subsystem ---

export function showToastNotification(message) {
  let container = document.getElementById('history-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'history-toast-container';
    container.className = 'history-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'history-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const cleanMsg = message.replace(/^↩\s*/, '');
  toast.innerHTML = `
    <span class="history-toast-icon">↩</span>
    <span class="history-toast-msg">${escapeHtml(cleanMsg)}</span>
  `;

  container.appendChild(toast);

  // Auto-dismiss smoothly after 3.5 seconds
  setTimeout(() => {
    if (toast.classList) {
      toast.classList.add('toast-dismissing');
    }
    setTimeout(() => {
      if (toast && typeof toast.remove === 'function') {
        toast.remove();
      } else if (toast && toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      if (container && (!container.children || container.children.length === 0)) {
        if (typeof container.remove === 'function') {
          container.remove();
        } else if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }
    }, 300);
  }, 3500);
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

// --- Undo / Redo Operations ---

function applyEventBackward(event) {
  const data = storage.data;
  if (!data) return;

  switch (event.type) {
    case 'TEXT_MUTATION': {
      const target = event.target || {};
      const beforeVal = event.before?.value ?? '';

      if (target.scope === 'notes') {
        const note = (data.notes?.items || []).find(n => n.id === target.id);
        if (note) {
          note[target.field || 'content'] = beforeVal;
          note.updatedAt = new Date().toISOString();
        }
        const modalTitle = document.getElementById('modal-note-title');
        const modalBody = document.getElementById('modal-note-body');
        const modal = document.getElementById('note-edit-modal');
        if (modal && !modal.classList.contains('hidden')) {
          if (target.field === 'title' && modalTitle) modalTitle.value = beforeVal;
          if (target.field === 'content' && modalBody) modalBody.value = beforeVal;
        }
        if (target.id === 'quick-note') {
          const qTitle = document.getElementById('quick-note-title');
          const qBody = document.getElementById('quick-note-body');
          if (target.field === 'title' && qTitle) qTitle.value = beforeVal;
          if (target.field === 'content' && qBody) qBody.value = beforeVal;
        }
        if (typeof window.initNotes === 'function') window.initNotes();
      } else if (target.scope === 'mindflow') {
        const mf = data.mindFlow || {};
        const books = mf.books || mf.notes || [];
        for (const book of books) {
          if (target.bookId && book.id !== target.bookId) continue;
          for (const page of (book.pages || [])) {
            if (target.pageId && page.id !== target.pageId) continue;
            if (page.blocks && page.blocks[target.blockKey]) {
              page.blocks[target.blockKey][target.field || 'content'] = beforeVal;
              page.updatedAt = new Date().toISOString();
              book.updatedAt = new Date().toISOString();
              break;
            }
          }
        }
        if (target.blockKey) {
          const blockEl = document.querySelector(`.mf-block-card[data-block-key="${target.blockKey}"]`);
          if (blockEl) {
            if (target.field === 'title') {
              const tInput = blockEl.querySelector('.mf-block-title-input');
              if (tInput) tInput.value = beforeVal;
            } else {
              const tArea = blockEl.querySelector('.mf-block-textarea');
              if (tArea) tArea.value = beforeVal;
            }
          }
        }
        if (typeof window.initMindFlow === 'function') window.initMindFlow();
      } else if (target.scope === 'diary') {
        if (data.diary && data.diary.entries) {
          data.diary.entries[target.id] = beforeVal;
        }
        if (typeof window.initDiary === 'function') window.initDiary();
      }
      break;
    }

    case 'NOTE_CREATE': {
      const items = data.notes?.items || [];
      const idx = items.findIndex(n => n.id === event.target.id);
      if (idx !== -1) {
        items.splice(idx, 1);
      }
      const modal = document.getElementById('note-edit-modal');
      if (modal && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
      }
      if (typeof window.initNotes === 'function') window.initNotes();
      break;
    }

    case 'NOTE_DELETE': {
      // Reversible Trash Action: restore note back from trash into data.notes.items
      const trash = data.trash || [];
      const trashId = event.after?.trashId;
      const noteId = event.target.id;
      const tIdx = trash.findIndex(t => (trashId && t.id === trashId) || (t.payload && t.payload.id === noteId));
      if (tIdx !== -1) {
        trash.splice(tIdx, 1);
      }

      const noteToRestore = event.before?.note;
      if (noteToRestore) {
        if (!data.notes) data.notes = { items: [] };
        if (!data.notes.items) data.notes.items = [];
        const targetIdx = (typeof event.before?.index === 'number' && event.before.index >= 0 && event.before.index <= data.notes.items.length)
          ? event.before.index
          : 0;
        data.notes.items.splice(targetIdx, 0, noteToRestore);

        // Toast: "↩ Restored Note: '[Note Title]' ([DD:MM:YYYY] [HH:mm:ss])"
        const noteTitle = noteToRestore.title || 'Untitled Note';
        const dateStr = event.formattedDate || formatCustomDate();
        const timeStr = event.formattedTime || formatCustomTime();
        showToastNotification(`↩ Restored Note: '${noteTitle}' (${dateStr} ${timeStr})`);
      }

      if (typeof window.initNotes === 'function') window.initNotes();
      if (typeof window.refreshBinUI === 'function') window.refreshBinUI();
      break;
    }

    case 'NOTE_PIN': {
      const note = (data.notes?.items || []).find(n => n.id === event.target.id);
      if (note) {
        const prevPinned = !!event.before?.pinned;
        note.pinned = prevPinned;
        note.isPinned = prevPinned;
        note.updatedAt = new Date().toISOString();
      }
      if (typeof window.initNotes === 'function') window.initNotes();
      break;
    }

    case 'MINDFLOW_SLIDE_ADD': {
      const books = data.mindFlow?.books || data.mindFlow?.notes || [];
      const book = books.find(b => b.id === event.target.bookId);
      if (book && book.pages) {
        const pIdx = book.pages.findIndex(p => p.id === event.target.slideId);
        if (pIdx !== -1) {
          book.pages.splice(pIdx, 1);
          book.updatedAt = new Date().toISOString();
        }
      }
      if (typeof window.initMindFlow === 'function') window.initMindFlow();
      break;
    }

    case 'MINDFLOW_SLIDE_DELETE': {
      const trash = data.trash || [];
      const trashId = event.after?.trashId;
      const slideId = event.target.slideId;
      const tIdx = trash.findIndex(t => (trashId && t.id === trashId) || (t.payload && t.payload.id === slideId));
      if (tIdx !== -1) {
        trash.splice(tIdx, 1);
      }

      const slideToRestore = event.before?.slide;
      const books = data.mindFlow?.books || data.mindFlow?.notes || [];
      const book = books.find(b => b.id === event.target.bookId);
      if (book && slideToRestore) {
        if (!book.pages) book.pages = [];
        const insertIdx = (typeof event.before?.index === 'number' && event.before.index >= 0 && event.before.index <= book.pages.length)
          ? event.before.index
          : book.pages.length;
        book.pages.splice(insertIdx, 0, slideToRestore);
        book.updatedAt = new Date().toISOString();

        const slideTitle = event.before?.bookTitle ? `${event.before.bookTitle} - Slide` : 'Mind Flow Slide';
        const dateStr = event.formattedDate || formatCustomDate();
        const timeStr = event.formattedTime || formatCustomTime();
        showToastNotification(`↩ Restored Slide: '${slideTitle}' (${dateStr} ${timeStr})`);
      }
      if (typeof window.initMindFlow === 'function') window.initMindFlow();
      if (typeof window.refreshBinUI === 'function') window.refreshBinUI();
      break;
    }

    case 'TRASH_RESTORE': {
      const trashItem = event.before?.trashItem;
      if (trashItem) {
        if (!data.trash) data.trash = [];
        data.trash.unshift(trashItem);

        if (event.after?.restoredTo === 'note' || event.after?.restoredTo === 'notes') {
          const items = data.notes?.items || [];
          const idx = items.findIndex(n => n.id === trashItem.payload?.id || n.id === event.target.id);
          if (idx !== -1) items.splice(idx, 1);
          if (typeof window.initNotes === 'function') window.initNotes();
        } else if (event.after?.restoredTo === 'mindflow') {
          const books = data.mindFlow?.books || data.mindFlow?.notes || [];
          const idx = books.findIndex(b => b.id === trashItem.payload?.id || b.id === event.target.id);
          if (idx !== -1) books.splice(idx, 1);
          if (typeof window.initMindFlow === 'function') window.initMindFlow();
        }
        if (typeof window.refreshBinUI === 'function') window.refreshBinUI();
      }
      break;
    }
  }
}

function applyEventForward(event) {
  const data = storage.data;
  if (!data) return;

  switch (event.type) {
    case 'TEXT_MUTATION': {
      const target = event.target || {};
      const afterVal = event.after?.value ?? '';

      if (target.scope === 'notes') {
        const note = (data.notes?.items || []).find(n => n.id === target.id);
        if (note) {
          note[target.field || 'content'] = afterVal;
          note.updatedAt = new Date().toISOString();
        }
        const modalTitle = document.getElementById('modal-note-title');
        const modalBody = document.getElementById('modal-note-body');
        const modal = document.getElementById('note-edit-modal');
        if (modal && !modal.classList.contains('hidden')) {
          if (target.field === 'title' && modalTitle) modalTitle.value = afterVal;
          if (target.field === 'content' && modalBody) modalBody.value = afterVal;
        }
        if (target.id === 'quick-note') {
          const qTitle = document.getElementById('quick-note-title');
          const qBody = document.getElementById('quick-note-body');
          if (target.field === 'title' && qTitle) qTitle.value = afterVal;
          if (target.field === 'content' && qBody) qBody.value = afterVal;
        }
        if (typeof window.initNotes === 'function') window.initNotes();
      } else if (target.scope === 'mindflow') {
        const mf = data.mindFlow || {};
        const books = mf.books || mf.notes || [];
        for (const book of books) {
          if (target.bookId && book.id !== target.bookId) continue;
          for (const page of (book.pages || [])) {
            if (target.pageId && page.id !== target.pageId) continue;
            if (page.blocks && page.blocks[target.blockKey]) {
              page.blocks[target.blockKey][target.field || 'content'] = afterVal;
              page.updatedAt = new Date().toISOString();
              book.updatedAt = new Date().toISOString();
              break;
            }
          }
        }
        if (target.blockKey) {
          const blockEl = document.querySelector(`.mf-block-card[data-block-key="${target.blockKey}"]`);
          if (blockEl) {
            if (target.field === 'title') {
              const tInput = blockEl.querySelector('.mf-block-title-input');
              if (tInput) tInput.value = afterVal;
            } else {
              const tArea = blockEl.querySelector('.mf-block-textarea');
              if (tArea) tArea.value = afterVal;
            }
          }
        }
        if (typeof window.initMindFlow === 'function') window.initMindFlow();
      } else if (target.scope === 'diary') {
        if (data.diary && data.diary.entries) {
          data.diary.entries[target.id] = afterVal;
        }
        if (typeof window.initDiary === 'function') window.initDiary();
      }
      break;
    }

    case 'NOTE_CREATE': {
      if (!data.notes) data.notes = { items: [] };
      if (!data.notes.items) data.notes.items = [];
      if (event.after?.note) {
        data.notes.items.unshift(event.after.note);
      }
      if (typeof window.initNotes === 'function') window.initNotes();
      break;
    }

    case 'NOTE_DELETE': {
      const items = data.notes?.items || [];
      const idx = items.findIndex(n => n.id === event.target.id);
      if (idx !== -1) {
        const [deletedItem] = items.splice(idx, 1);
        if (!data.trash) data.trash = [];
        data.trash.unshift({
          id: event.after?.trashId || ('trash_' + Date.now()),
          type: 'note',
          title: deletedItem.title || 'Untitled Note',
          deletedAt: new Date().toISOString(),
          payload: deletedItem
        });
      }
      if (typeof window.initNotes === 'function') window.initNotes();
      if (typeof window.refreshBinUI === 'function') window.refreshBinUI();
      break;
    }

    case 'NOTE_PIN': {
      const note = (data.notes?.items || []).find(n => n.id === event.target.id);
      if (note) {
        const newPinned = !!event.after?.pinned;
        note.pinned = newPinned;
        note.isPinned = newPinned;
        note.updatedAt = new Date().toISOString();
      }
      if (typeof window.initNotes === 'function') window.initNotes();
      break;
    }

    case 'MINDFLOW_SLIDE_ADD': {
      const books = data.mindFlow?.books || data.mindFlow?.notes || [];
      const book = books.find(b => b.id === event.target.bookId);
      if (book && event.after?.slide) {
        if (!book.pages) book.pages = [];
        const idx = (typeof event.after.index === 'number') ? event.after.index : book.pages.length;
        book.pages.splice(idx, 0, event.after.slide);
        book.updatedAt = new Date().toISOString();
      }
      if (typeof window.initMindFlow === 'function') window.initMindFlow();
      break;
    }

    case 'MINDFLOW_SLIDE_DELETE': {
      const books = data.mindFlow?.books || data.mindFlow?.notes || [];
      const book = books.find(b => b.id === event.target.bookId);
      if (book && book.pages) {
        const pIdx = book.pages.findIndex(p => p.id === event.target.slideId);
        if (pIdx !== -1) {
          const [deleted] = book.pages.splice(pIdx, 1);
          if (!data.trash) data.trash = [];
          data.trash.unshift({
            id: event.after?.trashId || ('trash_' + Date.now()),
            type: 'mindflow',
            title: `${book.title || 'Mind Flow'} - Slide`,
            deletedAt: new Date().toISOString(),
            payload: deleted
          });
          book.updatedAt = new Date().toISOString();
        }
      }
      if (typeof window.initMindFlow === 'function') window.initMindFlow();
      if (typeof window.refreshBinUI === 'function') window.refreshBinUI();
      break;
    }

    case 'TRASH_RESTORE': {
      const trash = data.trash || [];
      const tIdx = trash.findIndex(t => t.id === event.target.id);
      if (tIdx !== -1) {
        trash.splice(tIdx, 1);
      }
      if (event.after?.restoredTo === 'note' || event.after?.restoredTo === 'notes') {
        if (!data.notes) data.notes = { items: [] };
        if (!data.notes.items) data.notes.items = [];
        if (event.after?.item) data.notes.items.unshift(event.after.item);
        if (typeof window.initNotes === 'function') window.initNotes();
        const dateStr = event.formattedDate || formatCustomDate();
        const timeStr = event.formattedTime || formatCustomTime();
        showToastNotification(`↩ Restored Note: '${event.after?.item?.title || 'Untitled'}' (${dateStr} ${timeStr})`);
      } else if (event.after?.restoredTo === 'mindflow') {
        const books = data.mindFlow?.books || data.mindFlow?.notes || [];
        if (event.after?.item) books.unshift(event.after.item);
        if (typeof window.initMindFlow === 'function') window.initMindFlow();
      }
      if (typeof window.refreshBinUI === 'function') window.refreshBinUI();
      break;
    }
  }
}

/**
 * Ctrl + Z: Undo (step backward).
 * Reverses operation at historyPointer, applies to active workspace in memory,
 * decrements historyPointer, and triggers autosave.
 */
export function undo() {
  if (isApplyingHistory) return;
  sealActiveTypingBatch();

  if (historyPointer < 0 || historyPointer >= historyStack.length) {
    return;
  }

  const event = historyStack[historyPointer];
  if (!event) return;

  isApplyingHistory = true;
  try {
    applyEventBackward(event);
    historyPointer--;
    storage.scheduleSave(0);
  } finally {
    isApplyingHistory = false;
  }
}

/**
 * Ctrl + Y and Ctrl + Shift + Z: Redo (step forward).
 * Re-applies forward delta of event at historyPointer + 1,
 * increments historyPointer, and saves.
 */
export function redo() {
  if (isApplyingHistory) return;
  sealActiveTypingBatch();

  if (historyPointer + 1 >= historyStack.length) {
    return;
  }

  const nextEvent = historyStack[historyPointer + 1];
  if (!nextEvent) return;

  isApplyingHistory = true;
  try {
    applyEventForward(nextEvent);
    historyPointer++;
    storage.scheduleSave(0);
  } finally {
    isApplyingHistory = false;
  }
}

// --- Global Event Delegation Listeners ---

export function initHistoryListeners() {
  // Capture focus to store initial values before typing starts
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!el) return;
    const target = resolveInputTarget(el);
    if (!target) return;
    if (el.dataset.historyInitialValue === undefined) {
      el.dataset.historyInitialValue = el.value || '';
    }
  }, true);

  // Group continuous keystrokes and handle 1000ms debounce
  document.addEventListener('input', (e) => {
    if (isApplyingHistory) return;
    const el = e.target;
    if (!el) return;
    const target = resolveInputTarget(el);
    if (!target) return;

    const currentVal = el.value || '';
    if (!activeTypingBatch || activeTypingBatch.element !== el) {
      if (activeTypingBatch) {
        sealActiveTypingBatch();
      }
      const initialVal = el.dataset.historyInitialValue !== undefined ? el.dataset.historyInitialValue : currentVal;
      activeTypingBatch = {
        element: el,
        target: target,
        beforeValue: initialVal
      };
    }

    // 1000ms pause debounce
    if (typingDebounceTimer) {
      clearTimeout(typingDebounceTimer);
    }
    typingDebounceTimer = setTimeout(() => {
      sealActiveTypingBatch();
    }, 1000);
  }, true);

  // Seal on Enter or handle Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
  window.addEventListener('keydown', (e) => {
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;

    // Check for Enter key on inputs/textareas to seal batch
    if (e.key === 'Enter' && activeTypingBatch && activeTypingBatch.element === e.target) {
      setTimeout(() => {
        sealActiveTypingBatch();
      }, 0);
    }

    // Undo / Redo Shortcuts
    if (isCtrlOrCmd) {
      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) {
          // Ctrl + Shift + Z: Redo
          e.preventDefault();
          e.stopPropagation();
          redo();
        } else {
          // Ctrl + Z: Undo
          e.preventDefault();
          e.stopPropagation();
          undo();
        }
      } else if (e.key === 'y' || e.key === 'Y') {
        // Ctrl + Y: Redo
        e.preventDefault();
        e.stopPropagation();
        redo();
      }
    }
  }, true);

  // Seal on blur
  document.addEventListener('focusout', (e) => {
    if (activeTypingBatch && activeTypingBatch.element === e.target) {
      sealActiveTypingBatch();
    }
  }, true);
}

/**
 * Initializes the history subsystem:
 * Loads initial history events from backend and sets up event listeners.
 */
export async function initHistory() {
  initHistoryListeners();
  return await loadHistoryFromBackend();
}
