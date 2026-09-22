/**
 * Mind Redemption — Chameleon Masking & Typing Cloak Engine
 * Intercepts real keystrokes into a hidden background buffer while
 * outputting canonical philosophical decoy stream into the DOM.
 */

import { DECOY_STREAM } from './cloak-corpus.js';

// Cloak Engine State
let isCloakedState = false;
let realBuffer = "";
let cloakCursorIndex = 0;
let activeElementRef = null;

// Escape Sequence Shortcut Tracker
let escArmed = false;
let escTimer = null;

/**
 * Returns whether cloaked masking mode is currently active
 */
export function isCloaked(el = null) {
  if (!isCloakedState) return false;
  if (!el) return isCloakedState;
  return activeElementRef === el;
}

/**
 * Returns real text buffer for autosave safety, ensuring decoy text is NEVER saved
 */
export function getRealBufferForElement(el) {
  if (isCloakedState && (activeElementRef === el || !activeElementRef)) {
    return realBuffer;
  }
  return el ? (el.value !== undefined ? el.value : el.innerText) : realBuffer;
}

/**
 * Finds the most relevant writing element if document.activeElement is not a text input
 */
function findActiveWritingElement() {
  const active = document.activeElement;
  if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type === 'text') || active.isContentEditable)) {
    return active;
  }

  // Fallbacks: MindFlow active block, Notes modal body, Quick note body, Diary morning/evening
  const candidates = [
    document.querySelector('.mf-block-textarea:focus'),
    document.querySelector('#modal-note-body:focus'),
    document.querySelector('#quick-note-body:focus'),
    document.querySelector('.diary-reflection-textarea:focus'),
    document.querySelector('.mf-block-textarea'),
    document.querySelector('#modal-note-body'),
    document.querySelector('#quick-note-body'),
    document.querySelector('.diary-reflection-textarea')
  ];

  for (const el of candidates) {
    if (el && el.offsetParent !== null) {
      return el;
    }
  }
  return null;
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
 * Activates Chameleon Masking Mode
 */
export function activateCloak(target = null) {
  const el = target || findActiveWritingElement();
  if (!el) {
    console.warn('Chameleon Cloak: No active writing element found to cloak.');
    return;
  }

  activeElementRef = el;
  el.focus();

  // Snapshot genuine text into hidden realBuffer
  realBuffer = (el.value !== undefined ? el.value : el.innerText) || "";

  // Clear visible field to begin clean deceptive stream
  if (el.value !== undefined) {
    el.value = "";
  } else {
    el.innerText = "";
  }

  isCloakedState = true;
  cloakCursorIndex = 0;

  // Visual stealth indication
  document.body.classList.add('chameleon-cloaked');

  // Trigger input event to notify system with realBuffer
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Deactivates Masking Mode & Seamlessly Reveals Genuine Text
 */
export function revealCloak() {
  if (!isCloakedState || !activeElementRef) {
    isCloakedState = false;
    document.body.classList.remove('chameleon-cloaked');
    return;
  }

  const el = activeElementRef;
  el.classList.add('cloak-revealing');

  setTimeout(() => {
    // Restore genuine accumulated text onto screen
    if (el.value !== undefined) {
      el.value = realBuffer;
    } else {
      el.innerText = realBuffer;
    }

    // Reset cloaking states
    isCloakedState = false;
    cloakCursorIndex = 0;
    activeElementRef = null;
    document.body.classList.remove('chameleon-cloaked');

    // Trigger input event to update host modules and persist genuine text
    el.dispatchEvent(new Event('input', { bubbles: true }));

    // Reset caret to end
    if (el.value !== undefined) {
      el.selectionStart = el.selectionEnd = el.value.length;
    }

    setTimeout(() => {
      el.classList.remove('cloak-revealing');
    }, 120);
  }, 100);
}

/**
 * Keystroke Interceptor Handler
 */
function handleCloakKeydown(e) {
  // Check Escape sequence: Esc arms 1000ms window
  if (e.key === 'Escape') {
    // If admin auth modal is open, let standard modal handler close it
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
  if (!isCloakedState || !activeElementRef) {
    return;
  }

  // Ensure target matches or switches to active editing field
  const target = e.target;
  if (!target || (target !== activeElementRef && !target.matches('textarea, input[type="text"], [contenteditable="true"]'))) {
    return;
  }
  activeElementRef = target;

  // Let navigation and browser shortcuts pass through
  if (e.ctrlKey || e.metaKey || (e.altKey && e.key !== '1' && e.key !== '0')) {
    return;
  }

  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Tab', 'CapsLock', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
    return;
  }

  // Handle Backspace
  if (e.key === 'Backspace') {
    e.preventDefault();
    e.stopPropagation();

    if (realBuffer.length > 0) {
      realBuffer = realBuffer.slice(0, -1);
    }
    removeCharBeforeCaret(activeElementRef);
    cloakCursorIndex = (cloakCursorIndex - 1 + DECOY_STREAM.length) % DECOY_STREAM.length;
    activeElementRef.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // Handle Enter / Newline
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();

    realBuffer += '\n';

    // Insert newline or next break in decoy story
    let decoyChar = '\n';
    if (DECOY_STREAM[cloakCursorIndex % DECOY_STREAM.length] === '\n') {
      cloakCursorIndex = (cloakCursorIndex + 1) % DECOY_STREAM.length;
    }
    insertTextAtCaret(activeElementRef, decoyChar);
    activeElementRef.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // Standard typing keys (character keys)
  if (e.key.length === 1) {
    e.preventDefault();
    e.stopPropagation();

    // 1. Append genuine character to realBuffer
    realBuffer += e.key;

    // 2. Fetch next character from canonical DECOY_STREAM
    const decoyChar = DECOY_STREAM[cloakCursorIndex % DECOY_STREAM.length];
    cloakCursorIndex = (cloakCursorIndex + 1) % DECOY_STREAM.length;

    // 3. Insert decoy character into visible field
    insertTextAtCaret(activeElementRef, decoyChar);

    // 4. Dispatch input event for state synchronization
    activeElementRef.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/**
 * Initializes Chameleon Masking Global Key Listener
 */
export function initCloakEngine() {
  window.addEventListener('keydown', handleCloakKeydown, true);
}
