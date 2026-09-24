/**
 * Mind Redemption — Chameleon Masking & Multi-Block Typing Cloak Engine
 * Supports Full Workspace Multi-Block Masking on Ctrl + ` (Backquote).
 * 
 * Features:
 * - Multi-block snapshot registry: saves genuine text per container
 * - Unique philosophical passage assignment per block from MASKING_PASSAGES
 * - Per-block active typing interception with realText buffering and decoy stream appending
 * - Instantaneous flicker-free swap in a single animation frame (requestAnimationFrame)
 * - Complete unmasking and silent save to the active vault
 */

import { MASKING_PASSAGES, DECOY_STREAM } from './cloak-corpus.js';
import { storage } from './fs-storage.js';

// Multi-Block State & Snapshot Architecture
let isCloakedState = false;
const blockSnapshots = new Map(); // elementId/selector -> { el: HTMLElement, key: string, realText: string, decoyIndex: number, passageIndex: number }

// Escape Sequence Shortcut Tracker
let escArmed = false;
let escTimer = null;

// Candidate selectors across Mind Flow, Notes, Diary, and active views
const CANDIDATE_SELECTORS = [
  // Mind Flow: #main-textarea, .side-block textarea, .mindflow-card textarea
  '#main-textarea',
  '#textarea-main',
  '.side-block textarea',
  '.mindflow-card textarea',
  '.mf-block-card textarea',
  '.mf-block-textarea',
  '.mf-block-title-input',
  '#mf-active-note-title',

  // Notes: #quick-note-textarea, .note-card-text, active note modal textareas
  '#quick-note-textarea',
  '#quick-note-body',
  '#quick-note-title',
  '.note-card-text',
  '.note-card-content',
  '#note-edit-modal textarea',
  '#note-edit-modal input',
  '#modal-note-body',
  '#modal-note-title',

  // Diary: #diary-morning-textarea, #diary-evening-textarea
  '#diary-morning-textarea',
  '#diary-morning-input',
  '#diary-evening-textarea',
  '#diary-evening-input',
  '#diary-quote-input',
  '.diary-reflection-textarea'
];

/**
 * Returns whether cloaked masking mode is currently active
 */
export function isCloaked(el = null) {
  if (!isCloakedState) return false;
  if (!el) return isCloakedState;
  return getSnapshot(el) !== null;
}

/**
 * Retrieves the snapshot object for a given element or selector
 */
export function getSnapshot(target) {
  if (!target) return null;
  if (typeof target === 'string') {
    return blockSnapshots.get(target) || null;
  }
  if (target.id && blockSnapshots.has(`#${target.id}`)) {
    return blockSnapshots.get(`#${target.id}`);
  }
  if (target.dataset?.cloakKey && blockSnapshots.has(`[data-cloak-key="${target.dataset.cloakKey}"]`)) {
    return blockSnapshots.get(`[data-cloak-key="${target.dataset.cloakKey}"]`);
  }
  if (blockSnapshots.has(target)) {
    return blockSnapshots.get(target);
  }
  for (const snapshot of blockSnapshots.values()) {
    if (snapshot && snapshot.el === target) {
      return snapshot;
    }
  }
  return null;
}

/**
 * Returns real text buffer for autosave safety, ensuring decoy text is NEVER saved
 */
export function getRealBufferForElement(el) {
  if (isCloakedState) {
    const snapshot = getSnapshot(el);
    if (snapshot) {
      return snapshot.realText;
    }
  }
  return el ? (el.value !== undefined ? el.value : el.innerText) : "";
}

/**
 * Checks whether an element is visible on the screen
 */
function isElementVisible(el) {
  if (!el || !document.contains(el)) return false;
  if (el.closest('.hidden')) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  return el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;
}

/**
 * Queries all active text containers visible on screen across Mind Flow, Notes, and Diary
 */
function queryActiveTextContainers() {
  const elements = new Set();

  for (const selector of CANDIDATE_SELECTORS) {
    document.querySelectorAll(selector).forEach(el => {
      if (isElementVisible(el)) {
        elements.add(el);
      }
    });
  }

  // Also query any visible textareas or editable containers in the active view panel
  const activeView = document.querySelector('.view-panel.active') || document.body;
  activeView.querySelectorAll('textarea, input[type="text"], [contenteditable="true"], .note-card-content, .note-card-text').forEach(el => {
    if (isElementVisible(el)) {
      elements.add(el);
    }
  });

  return Array.from(elements);
}

/**
 * Inserts text at the current caret position
 */
function insertTextAtCaret(el, text) {
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.substring(0, start);
    const after = el.value.substring(end);
    el.value = before + text + after;
    el.selectionStart = el.selectionEnd = start + text.length;
    el.scrollTop = el.scrollHeight;
  } else if (el.isContentEditable) {
    document.execCommand('insertText', false, text);
  }
}

/**
 * Removes character before caret on Backspace
 */
function removeCharBeforeCaret(el) {
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    if (start === end) {
      if (start > 0) {
        const before = el.value.substring(0, start - 1);
        const after = el.value.substring(end);
        el.value = before + after;
        el.selectionStart = el.selectionEnd = start - 1;
      }
    } else {
      const before = el.value.substring(0, start);
      const after = el.value.substring(end);
      el.value = before + after;
      el.selectionStart = el.selectionEnd = start;
    }
  } else if (el.isContentEditable) {
    document.execCommand('delete', false, null);
  }
}

/**
 * Registers an element into the blockSnapshots registry
 */
function registerBlockSnapshot(el, index) {
  const isInput = el.value !== undefined;
  const genuineText = (isInput ? el.value : el.innerText) || "";
  const currentLen = genuineText.length;
  const passageIndex = index % MASKING_PASSAGES.length;
  const assignedPassage = MASKING_PASSAGES[passageIndex];

  let key = el.id ? `#${el.id}` : null;
  if (!key) {
    if (!el.dataset.cloakKey) {
      el.dataset.cloakKey = `block_${index}`;
    }
    key = `[data-cloak-key="${el.dataset.cloakKey}"]`;
  }

  let maskedValue = "";
  let decoyIndex = 0;

  // Strict Proportional Masking Contract:
  // Zero-fill for empty blocks: if currentLen === 0, keep empty ("") and decoyIndex = 0
  if (currentLen === 0) {
    maskedValue = "";
    decoyIndex = 0;
  } else {
    // If currentLen > 0, slice strictly the first currentLen characters
    if (currentLen <= assignedPassage.length) {
      maskedValue = assignedPassage.slice(0, currentLen);
    } else {
      let repeated = "";
      while (repeated.length < currentLen) {
        repeated += assignedPassage;
      }
      maskedValue = repeated.slice(0, currentLen);
    }
    decoyIndex = currentLen;
  }

  const snapshot = {
    el,
    key,
    realText: genuineText,
    decoyIndex: decoyIndex,
    passageIndex: passageIndex
  };

  blockSnapshots.set(key, snapshot);

  // Replace displayed text of that block with strictly proportional decoy text
  if (isInput) {
    el.value = maskedValue;
  } else {
    el.innerText = maskedValue;
  }

  return snapshot;
}

/**
 * Activates Chameleon Masking Mode across all visible text containers
 */
export function activateCloak() {
  if (isCloakedState) return;

  requestAnimationFrame(() => {
    blockSnapshots.clear();
    const containers = queryActiveTextContainers();

    containers.forEach((el, index) => {
      registerBlockSnapshot(el, index);
    });

    isCloakedState = true;
    document.body.classList.add('chameleon-cloaked');

    // Retain focus or focus active element if valid
    const active = document.activeElement;
    if (active && containers.includes(active)) {
      if (active.value !== undefined) {
        active.selectionStart = active.selectionEnd = active.value.length;
      }
    } else if (containers.length > 0 && typeof containers[0].focus === 'function') {
      containers[0].focus();
    }
  });
}

/**
 * Deactivates Masking Mode & Seamlessly Restores All Genuine Text
 */
export function revealCloak() {
  if (!isCloakedState) return;

  requestAnimationFrame(() => {
    // Iterate over all entries in blockSnapshots
    blockSnapshots.forEach((snapshot) => {
      const el = snapshot.el;
      if (el && document.contains(el)) {
        el.classList.add('cloak-revealing');

        if (el.value !== undefined) {
          el.value = snapshot.realText;
        } else {
          el.innerText = snapshot.realText;
        }

        // Trigger input event to update host module models
        el.dispatchEvent(new Event('input', { bubbles: true }));

        setTimeout(() => {
          el.classList.remove('cloak-revealing');
        }, 120);
      }
    });

    // Clear registry and reset state
    blockSnapshots.clear();
    isCloakedState = false;
    document.body.classList.remove('chameleon-cloaked');

    // Trigger silent save to persist all genuine text to the active vault
    try {
      storage.scheduleSave(0);
    } catch (err) {
      console.error('Chameleon Cloak: Silent save error on uncloaking:', err);
    }
  });
}

/**
 * Toggles Chameleon Masking Mode (Mask / Unmask)
 */
export function toggleCloak() {
  if (isCloakedState) {
    revealCloak();
  } else {
    activateCloak();
  }
}

/**
 * Keystroke Interceptor Handler for Multi-Block Typing
 */
function handleCloakKeydown(e) {
  // Primary Unified Shortcut: Ctrl + ` (Backquote / Tilde) to toggle Masking & Unmasking
  const isBackquote = e.key === '`' || e.key === '~' || e.code === 'Backquote';
  if ((e.ctrlKey || e.metaKey) && isBackquote) {
    e.preventDefault();
    e.stopPropagation();
    toggleCloak();
    return;
  }

  // Check Escape sequence: Esc arms 1000ms window
  if (e.key === 'Escape') {
    const adminModal = document.getElementById('admin-auth-modal');
    if (adminModal && !adminModal.classList.contains('hidden')) {
      return;
    }

    escArmed = true;
    if (escTimer) clearTimeout(escTimer);
    escTimer = setTimeout(() => {
      escArmed = false;
    }, 1000);
    return;
  }

  // Shortcut: Esc followed by '1' -> Activate Masking Mode
  if (escArmed && e.key === '1') {
    e.preventDefault();
    e.stopPropagation();
    escArmed = false;
    activateCloak();
    return;
  }

  // Shortcut: Esc followed by '0' -> Reveal Genuine Text
  if (escArmed && e.key === '0') {
    e.preventDefault();
    e.stopPropagation();
    escArmed = false;
    revealCloak();
    return;
  }

  // Shortcut: Alt + 1 -> Activate Masking Mode
  if (e.altKey && e.key === '1') {
    e.preventDefault();
    e.stopPropagation();
    activateCloak();
    return;
  }

  // Shortcut: Alt + 0 -> Reveal Genuine Text
  if (e.altKey && e.key === '0') {
    e.preventDefault();
    e.stopPropagation();
    revealCloak();
    return;
  }

  // If not currently cloaked, do nothing
  if (!isCloakedState) {
    return;
  }

  // Check if target is a text container
  const target = e.target;
  if (!target || !(target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && (target.type === 'text' || !target.type)) || target.isContentEditable)) {
    return;
  }

  // Let browser shortcuts pass through
  if (e.ctrlKey || e.metaKey || (e.altKey && e.key !== '1' && e.key !== '0')) {
    return;
  }

  // Let navigation and selection keys pass through
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Tab', 'CapsLock', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
    return;
  }

  // Retrieve or register snapshot for active block
  let snapshot = getSnapshot(target);
  if (!snapshot) {
    snapshot = registerBlockSnapshot(target, blockSnapshots.size);
  }

  // Handle Backspace
  if (e.key === 'Backspace') {
    e.preventDefault();
    e.stopPropagation();

    if (snapshot.realText.length > 0) {
      snapshot.realText = snapshot.realText.slice(0, -1);
      if (target.value !== undefined) {
        target.value = target.value.slice(0, -1);
      } else {
        removeCharBeforeCaret(target);
      }
      snapshot.decoyIndex = Math.max(0, snapshot.decoyIndex - 1);
    }
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // Handle Enter / Newline
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();

    snapshot.realText += '\n';

    const passage = MASKING_PASSAGES[snapshot.passageIndex % MASKING_PASSAGES.length];
    const decoyChar = passage[snapshot.decoyIndex % passage.length];
    snapshot.decoyIndex++;
    insertTextAtCaret(target, decoyChar);
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // Standard typing keys (character keys)
  if (e.key.length === 1) {
    e.preventDefault();
    e.stopPropagation();

    // 1. Append genuine typed character into that specific block's realText in blockSnapshots
    snapshot.realText += e.key;

    // 2. Fetch the next character of that block's assigned decoy passage
    const passage = MASKING_PASSAGES[snapshot.passageIndex % MASKING_PASSAGES.length];
    const decoyChar = passage[snapshot.decoyIndex % passage.length];
    snapshot.decoyIndex++;

    // 3. Append to visible textarea
    insertTextAtCaret(target, decoyChar);

    // 4. Dispatch input event for state synchronization
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
}

/**
 * Initializes Chameleon Masking Global Key Listener
 */
export function initCloakEngine() {
  window.addEventListener('keydown', handleCloakKeydown, true);
}

// Window state exports for debugging & integration
window.isCloaked = isCloaked;
window.blockSnapshots = blockSnapshots;
window.activateCloak = activateCloak;
window.revealCloak = revealCloak;
window.toggleCloak = toggleCloak;

export { blockSnapshots };
