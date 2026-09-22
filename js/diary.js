/**
 * Diary Component (Refactored)
 * Fully functional chronological daily reflection workspace for Mind Redemption.
 */

import { getNamespace, saveStorageData } from './fs-storage.js';
import { logTimelineEvent, getTimeMachineDate, onTimeMachineChange, formatDateDisplay, formatTimeDisplay } from './timeline.js';
import { isCloaked, getRealBufferForElement } from './cloak.js';

/**
 * Format Date object to local YYYY-MM-DD
 */
function toLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse YYYY-MM-DD into a Date object (in local time)
 */
function parseLocalDateString(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format Date to human-readable string: e.g. "20 September 2026"
 */
function formatDisplayDate(date) {
  return formatDateDisplay(date, false);
}

export class DiaryController {
  constructor(app = null) {
    this.app = app;
    this.currentDateStr = toLocalDateString();
    this.container = null;
  }

  render() {
    this.container = document.getElementById('diary-view') || document.getElementById('diary-tab-view');
    if (this.container) {
      initDiary(this.container, this.currentDateStr);
    }
  }
}

/**
 * Mounts the daily reflection workspace into container
 */
export function initDiary(containerEl = null, initialDate = null) {
  const container = containerEl || document.getElementById('diary-view') || document.getElementById('diary-tab-view');
  if (!container) return;

  let activeDateStr = initialDate || getTimeMachineDate() || toLocalDateString();

  // Helper to fetch diary namespace
  function getDiaryState() {
    let diary = getNamespace('diary');
    if (!diary) {
      diary = { entries: {} };
    }
    if (!diary.entries) {
      diary.entries = {};
    }
    return diary;
  }

  // Helper to get or create entry for a date
  function getEntry(dateKey) {
    const diary = getDiaryState();
    if (!diary.entries[dateKey]) {
      diary.entries[dateKey] = {
        morningIntentions: '',
        eveningReview: '',
        quote: '',
        updatedAt: new Date().toISOString()
      };
    }
    return diary.entries[dateKey];
  }

  // Render Base Layout Structure
  container.innerHTML = `
    <div class="diary-workspace-wrap">
      <!-- Date Navigation Header -->
      <header class="diary-nav-bar">
        <div class="diary-nav-left">
          <button id="diary-prev-day-btn" class="btn btn-secondary btn-sm" title="Previous Day">
            ← Previous Day
          </button>
          <button id="diary-today-btn" class="btn btn-secondary btn-sm" title="Jump to Today">
            Today
          </button>
          <button id="diary-next-day-btn" class="btn btn-secondary btn-sm" title="Next Day">
            Next Day →
          </button>
        </div>

        <div class="diary-nav-center">
          <h2 id="diary-display-date" class="diary-date-title"></h2>
          <span id="diary-relative-label" class="diary-relative-badge"></span>
        </div>

        <div class="diary-nav-right">
          <label for="diary-native-date-picker" class="diary-picker-label" title="Select Date">
            📅
            <input type="date" id="diary-native-date-picker" class="diary-native-picker" />
          </label>
        </div>
      </header>

      <!-- Reflection Sections Grid -->
      <div class="diary-editor-container">
        <!-- Section 1: Morning Intentions -->
        <section class="diary-card-section morning-section">
          <div class="diary-section-header">
            <div class="section-badge morning-badge">🌅 MORNING COGNITIVE PRIMING</div>
            <h3 class="section-title">Morning Intentions</h3>
            <p class="section-prompt">
              What is the single most important focus today? What potential distractions or emotional traps might arise, and how will I respond?
            </p>
          </div>
          <textarea
            id="diary-morning-input"
            class="diary-reflection-textarea"
            placeholder="Set your clarity of intent, define primary tasks, and prime your mind for deep focus..."
            rows="6"
          ></textarea>
        </section>

        <!-- Section 2: Evening Retrospective -->
        <section class="diary-card-section evening-section">
          <div class="diary-section-header">
            <div class="section-badge evening-badge">🧭 EVENING RETROSPECTIVE</div>
            <h3 class="section-title">Evening Review</h3>
            <p class="section-prompt">
              What worked? Where was focus lost or compromised? What did I learn about my thinking and decision-making today?
            </p>
          </div>
          <textarea
            id="diary-evening-input"
            class="diary-reflection-textarea"
            placeholder="Audit beliefs updated, examine friction points, and note what you can calibrate for tomorrow..."
            rows="6"
          ></textarea>
        </section>

        <!-- Section 3: Daily Axiom / Stoic Principle -->
        <section class="diary-card-section axiom-section">
          <div class="diary-section-header">
            <div class="section-badge axiom-badge">⚡ GUIDING PRINCIPLE / AXIOM</div>
            <h3 class="section-title">Daily Axiom</h3>
          </div>
          <div class="diary-axiom-input-wrap">
            <span class="axiom-quote-mark">“</span>
            <input
              type="text"
              id="diary-quote-input"
              class="diary-axiom-input"
              placeholder="A guiding mental model, stoic principle, or rule of life for today..."
            />
            <span class="axiom-quote-mark">”</span>
          </div>
        </section>
      </div>

      <!-- Last Updated Status Footer -->
      <footer class="diary-footer">
        <span id="diary-last-updated" class="diary-updated-timestamp"></span>
      </footer>
    </div>
  `;

  // UI Element References
  const prevBtn = container.querySelector('#diary-prev-day-btn');
  const todayBtn = container.querySelector('#diary-today-btn');
  const nextBtn = container.querySelector('#diary-next-day-btn');
  const datePicker = container.querySelector('#diary-native-date-picker');
  const dateTitle = container.querySelector('#diary-display-date');
  const relativeBadge = container.querySelector('#diary-relative-label');
  const morningInput = container.querySelector('#diary-morning-input');
  const eveningInput = container.querySelector('#diary-evening-input');
  const quoteInput = container.querySelector('#diary-quote-input');
  const updatedStamp = container.querySelector('#diary-last-updated');

  /**
   * Auto-resizes textarea to fit continuous content
   */
  function autoResize(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 140) + 'px';
  }

  /**
   * Updates UI with data from activeDateStr
   */
  function hydrateUI() {
    const entry = getEntry(activeDateStr);
    const dateObj = parseLocalDateString(activeDateStr);
    const todayStr = toLocalDateString();

    // Set Date Header
    dateTitle.textContent = formatDisplayDate(dateObj);
    datePicker.value = activeDateStr;

    // Relative badge with standardized Day Month Year display
    const dateFormatted = formatDateDisplay(dateObj);
    if (activeDateStr === todayStr) {
      relativeBadge.textContent = `TODAY — ${dateFormatted}`;
      relativeBadge.className = 'diary-relative-badge badge-today';
    } else {
      const diffDays = Math.round((dateObj - parseLocalDateString(todayStr)) / (1000 * 60 * 60 * 24));
      if (diffDays === -1) {
        relativeBadge.textContent = `YESTERDAY — ${dateFormatted}`;
        relativeBadge.className = 'diary-relative-badge badge-past';
      } else if (diffDays === 1) {
        relativeBadge.textContent = `TOMORROW — ${dateFormatted}`;
        relativeBadge.className = 'diary-relative-badge badge-future';
      } else if (diffDays < 0) {
        relativeBadge.textContent = `${Math.abs(diffDays)} DAYS AGO — ${dateFormatted}`;
        relativeBadge.className = 'diary-relative-badge badge-past';
      } else {
        relativeBadge.textContent = `IN ${diffDays} DAYS — ${dateFormatted}`;
        relativeBadge.className = 'diary-relative-badge badge-future';
      }
    }

    // Populate Fields
    morningInput.value = entry.morningIntentions || '';
    eveningInput.value = entry.eveningReview || '';
    quoteInput.value = entry.quote || '';

    autoResize(morningInput);
    autoResize(eveningInput);

    // Update timestamp in 12-hour AM/PM format
    if (entry.updatedAt) {
      const lastModified = formatTimeDisplay(entry.updatedAt);
      updatedStamp.textContent = `Last modified for this date at ${lastModified}`;
    } else {
      updatedStamp.textContent = 'Unsaved entry';
    }
  }

  /**
   * Flushes current inputs directly into state & storage
   */
  function commitCurrentEntry() {
    const diary = getDiaryState();
    const entry = getEntry(activeDateStr);

    entry.morningIntentions = isCloaked(morningInput) ? getRealBufferForElement(morningInput) : morningInput.value;
    entry.eveningReview = isCloaked(eveningInput) ? getRealBufferForElement(eveningInput) : eveningInput.value;
    entry.quote = isCloaked(quoteInput) ? getRealBufferForElement(quoteInput) : quoteInput.value;
    entry.updatedAt = new Date().toISOString();

    saveStorageData('diary', diary);

    const lastModified = formatTimeDisplay(entry.updatedAt);
    updatedStamp.textContent = `Saved at ${lastModified}`;
  }

  /**
   * Switch Date Handler: Flushes pending data, updates active date, re-hydrates UI
   */
  function navigateToDate(newDateStr) {
    if (newDateStr === activeDateStr) return;
    commitCurrentEntry();
    activeDateStr = newDateStr;
    hydrateUI();
  }

  // --- Date Navigation Listeners ---
  prevBtn.addEventListener('click', () => {
    const current = parseLocalDateString(activeDateStr);
    current.setDate(current.getDate() - 1);
    navigateToDate(toLocalDateString(current));
  });

  nextBtn.addEventListener('click', () => {
    const current = parseLocalDateString(activeDateStr);
    current.setDate(current.getDate() + 1);
    navigateToDate(toLocalDateString(current));
  });

  todayBtn.addEventListener('click', () => {
    navigateToDate(toLocalDateString());
  });

  datePicker.addEventListener('change', (e) => {
    if (e.target.value) {
      navigateToDate(e.target.value);
    }
  });

  // --- Reactive Persistence on Input ---
  const handleInput = () => {
    const diary = getDiaryState();
    const entry = getEntry(activeDateStr);

    entry.morningIntentions = morningInput.value;
    entry.eveningReview = eveningInput.value;
    entry.quote = quoteInput.value;
    entry.updatedAt = new Date().toISOString();

    saveStorageData('diary', diary);

    // Debounced timeline telemetry event logging
    clearTimeout(handleInput._debounceTimer);
    handleInput._debounceTimer = setTimeout(() => {
      const summaryText = (entry.morningIntentions || entry.eveningReview || entry.quote || '').slice(0, 120);
      logTimelineEvent('diary', 'EDIT', activeDateStr, `Diary: ${activeDateStr}`, summaryText);
    }, 1500);

    const lastModified = formatTimeDisplay(entry.updatedAt);
    updatedStamp.textContent = `Saving... (Last recorded ${lastModified})`;
  };

  morningInput.addEventListener('input', () => {
    autoResize(morningInput);
    handleInput();
  });

  eveningInput.addEventListener('input', () => {
    autoResize(eveningInput);
    handleInput();
  });

  quoteInput.addEventListener('input', () => {
    handleInput();
  });

  // Initial UI hydration
  hydrateUI();
}

// React to Time-Machine date changes
onTimeMachineChange((tmDate) => {
  const container = document.getElementById('diary-view') || document.getElementById('diary-tab-view');
  if (container && container.classList.contains('active')) {
    initDiary(container, tmDate || toLocalDateString());
  }
});

export default initDiary;
