/**
 * Telemetry Tracker, Activity Calendar Modal, and Option B Time-Machine Engine
 * Mind Redemption
 */

const API_BASE = 'http://127.0.0.1:8000/api';
const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes of inactivity pauses tracking
const FLUSH_INTERVAL_MS = 60 * 1000;   // 60 seconds auto-flush

// Telemetry State
let currentSession = {
  module: 'mindflow',
  entityId: 'root',
  startTime: new Date().toISOString(),
  accumulatedSeconds: 0,
  lastTickTime: Date.now()
};

let isTabVisible = !document.hidden;
let isUserIdle = false;
let idleTimer = null;
let flushTimer = null;
let tickInterval = null;

// Time Machine State
let activeTimeMachineDate = null; // null or 'YYYY-MM-DD'
const timeMachineListeners = new Set();

// Cached Timeline Data
let cachedTimelineData = null;

// Calendar Navigation State
let calendarDate = new Date();

/**
 * Format duration seconds into human readable badge (e.g., "45m", "1h 10m", "< 1m")
 */
export function formatDurationBadge(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;

  if (hrs > 0) {
    return remainingMins > 0 ? `${hrs}h ${remainingMins}m` : `${hrs}h`;
  }
  if (mins > 0) {
    return `${mins}m`;
  }
  return '<1m';
}

/**
 * Format seconds into minute-focused string for banner: "X mins"
 */
export function formatDurationBanner(seconds) {
  if (!seconds || seconds <= 0) return '0 mins';
  const mins = Math.round(seconds / 60);
  if (mins === 0 && seconds > 0) return '< 1 min';
  return `${mins} min${mins === 1 ? '' : 's'}`;
}

/**
 * High-resolution tick: accumulates time if window is focused and user is not idle
 */
function tickSession() {
  const now = Date.now();
  const delta = (now - currentSession.lastTickTime) / 1000;
  currentSession.lastTickTime = now;

  if (isTabVisible && !isUserIdle && delta > 0 && delta < 10) {
    currentSession.accumulatedSeconds += delta;
  }
}

/**
 * Reset idle timer on any user activity (mouse, key, touch, scroll)
 */
function handleUserActivity() {
  if (isUserIdle) {
    isUserIdle = false;
    currentSession.lastTickTime = Date.now();
  }

  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    isUserIdle = true;
  }, IDLE_TIMEOUT_MS);
}

/**
 * Track session context change (tab switch, book change, page change)
 */
export function trackSession(moduleName, entityId = 'root') {
  tickSession();

  // If there is accumulated duration in the previous session, flush it immediately
  if (currentSession.accumulatedSeconds >= 1) {
    flushActiveSession();
  }

  // Switch context
  currentSession = {
    module: moduleName || 'mindflow',
    entityId: entityId || 'root',
    startTime: new Date().toISOString(),
    accumulatedSeconds: 0,
    lastTickTime: Date.now()
  };
}

/**
 * Flushes active accumulated session telemetry to FastAPI
 */
export async function flushActiveSession() {
  tickSession();
  const duration = Math.round(currentSession.accumulatedSeconds);
  if (duration <= 0) return;

  const targetDate = activeTimeMachineDate || new Date().toISOString().split('T')[0];
  const sessionPayload = {
    id: 'ses_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    module: currentSession.module,
    entityId: currentSession.entityId,
    durationSeconds: duration,
    startTime: currentSession.startTime,
    endTime: new Date().toISOString()
  };

  // Reset accumulator
  currentSession.accumulatedSeconds = 0;
  currentSession.startTime = new Date().toISOString();

  try {
    await fetch(`${API_BASE}/timeline/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: targetDate, session: sessionPayload })
    });
  } catch (err) {
    console.warn('Telemetry session flush failed (Companion server offline):', err);
  }
}

/**
 * Log a user action event (CREATE, EDIT, DELETE)
 */
export async function logTimelineEvent(moduleName, action, entityId, title = '', summary = '') {
  const targetDate = activeTimeMachineDate || new Date().toISOString().split('T')[0];
  const eventPayload = {
    id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    timestamp: new Date().toISOString(),
    module: moduleName,
    action: action,
    entityId: entityId || 'general',
    title: title || '',
    summary: (summary || '').slice(0, 160)
  };

  try {
    await fetch(`${API_BASE}/timeline/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: targetDate, event: eventPayload })
    });
  } catch (err) {
    console.warn('Timeline event log failed (Companion server offline):', err);
  }
}

/**
 * Fetch month summary map from /api/timeline/month/{year}/{month}
 */
export async function fetchMonthTimelineData(year, month) {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  try {
    const res = await fetch(`${API_BASE}/timeline/month/${y}/${m}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`Could not fetch month timeline for ${y}-${m}:`, err);
    return {};
  }
}

/**
 * Fetch specific day timeline document from /api/timeline/day/{date_str}
 */
export async function fetchDayTimelineData(dateStr) {
  if (!dateStr) return { date: dateStr, totalDurationSeconds: 0, sessions: [], events: [] };
  const cleaned = String(dateStr).split('T')[0];
  try {
    const res = await fetch(`${API_BASE}/timeline/day/${cleaned}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`Could not fetch day timeline for ${cleaned}:`, err);
    return { date: cleaned, totalDurationSeconds: 0, sessions: [], events: [] };
  }
}

/**
 * Backward-compatible timeline fetcher fallback
 */
export async function fetchTimelineData() {
  const now = new Date();
  return await fetchMonthTimelineData(now.getFullYear(), now.getMonth() + 1);
}

/**
 * Format date string or Date object to "Day, DD Month YYYY" or "DD Month YYYY"
 * Example: "Sunday, 20 September 2026" or "20 September 2026"
 */
export function formatDateDisplay(dateInput, includeWeekday = false) {
  if (!dateInput) return '';
  let dateObj;
  if (typeof dateInput === 'string' && dateInput.includes('-')) {
    const parts = dateInput.split('T')[0].split('-').map(Number);
    if (parts.length === 3) {
      dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    }
  }
  if (!dateObj) {
    dateObj = new Date(dateInput);
  }
  if (isNaN(dateObj.getTime())) return String(dateInput);

  const day = dateObj.getDate();
  const month = dateObj.toLocaleDateString('en-GB', { month: 'long' });
  const year = dateObj.getFullYear();

  if (includeWeekday) {
    const weekday = dateObj.toLocaleDateString('en-GB', { weekday: 'long' });
    return `${weekday}, ${day} ${month} ${year}`;
  }
  return `${day} ${month} ${year}`;
}

/**
 * Format timestamp or Date to 12-hour format with AM/PM (e.g. "02:30 PM" or "02:30:15 PM")
 */
export function formatTimeDisplay(dateOrTimestamp, includeSeconds = false) {
  if (!dateOrTimestamp) return '';
  const d = new Date(dateOrTimestamp);
  if (isNaN(d.getTime())) return String(dateOrTimestamp);

  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true
  });
}

/**
 * Numeric shorthand DD/MM/YYYY when space is constrained (never MM/DD/YYYY)
 */
export function formatDateDMY(dateInput) {
  if (!dateInput) return '';
  if (typeof dateInput === 'string' && dateInput.includes('-')) {
    const parts = dateInput.split('T')[0].split('-');
    if (parts.length === 3) {
      const [y, m, day] = parts;
      return `${day.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Option B: Activate Time-Machine Mode for a specific YYYY-MM-DD
 */
export async function activateTimeMachine(dateStr) {
  if (!dateStr) return;
  activeTimeMachineDate = dateStr;

  // Close calendar modal
  closeCalendarModal();

  // Update Time Machine Banner UI
  const banner = document.getElementById('time-machine-banner');
  const dateEl = document.getElementById('time-machine-date');
  const durationEl = document.getElementById('time-machine-duration');

  if (banner && dateEl && durationEl) {
    // Format to "DD Month YYYY" (e.g. "20 September 2026")
    dateEl.textContent = formatDateDisplay(dateStr);
    
    // Fetch stats for date from /api/timeline/day/{dateStr}
    let durationSeconds = 0;
    try {
      const dateData = await fetchDayTimelineData(dateStr);
      durationSeconds = dateData.totalDurationSeconds || 0;
    } catch (e) {
      console.warn('Could not fetch day timeline for Time Machine:', e);
    }

    durationEl.textContent = formatDurationBanner(durationSeconds);
    banner.classList.remove('hidden');
  }

  // Notify registered listeners (Notes, MindFlow, Diary)
  timeMachineListeners.forEach(fn => {
    try { fn(activeTimeMachineDate); } catch (e) { console.error('Time machine listener error:', e); }
  });
}

/**
 * Option B: Exit Time-Machine Mode and restore live workspace
 */
export function exitTimeMachine() {
  activeTimeMachineDate = null;

  // Hide banner
  const banner = document.getElementById('time-machine-banner');
  if (banner) {
    banner.classList.add('hidden');
  }

  // Notify listeners to restore live workspace
  timeMachineListeners.forEach(fn => {
    try { fn(null); } catch (e) { console.error('Time machine listener error:', e); }
  });
}

/**
 * Subscribe to Time Machine mode date changes
 */
export function onTimeMachineChange(listener) {
  if (typeof listener === 'function') {
    timeMachineListeners.add(listener);
  }
}

/**
 * Returns current active Time Machine date or null
 */
export function getTimeMachineDate() {
  return activeTimeMachineDate;
}

/**
 * Open Calendar Modal
 */
export async function openCalendarModal() {
  const modal = document.getElementById('timeline-modal');
  if (!modal) return;

  modal.classList.remove('hidden');
  await renderCalendarGrid();
}

/**
 * Close Calendar Modal
 */
export function closeCalendarModal() {
  const modal = document.getElementById('timeline-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * Render Calendar Grid with Activity Badges & Module Dots
 */
async function renderCalendarGrid() {
  const grid = document.getElementById('timeline-calendar-grid');
  const monthLabel = document.getElementById('timeline-month-label');
  if (!grid || !monthLabel) return;

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  monthLabel.textContent = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric'
  }).format(calendarDate);

  grid.innerHTML = '<div class="timeline-loading">Loading telemetry...</div>';

  // Fetch month summary from /api/timeline/month/{year}/{month}
  const curMonthData = await fetchMonthTimelineData(year, month + 1);
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const totalCells = firstDayIndex + daysInMonth;
  const remainingCells = (7 - (totalCells % 7)) % 7;

  let prevMonthData = {};
  let nextMonthData = {};
  if (firstDayIndex > 0) {
    const prevDate = new Date(year, month, 0);
    prevMonthData = await fetchMonthTimelineData(prevDate.getFullYear(), prevDate.getMonth() + 1);
  }
  if (remainingCells > 0) {
    const nextDate = new Date(year, month + 1, 1);
    nextMonthData = await fetchMonthTimelineData(nextDate.getFullYear(), nextDate.getMonth() + 1);
  }
  const byDate = { ...prevMonthData, ...curMonthData, ...nextMonthData };

  grid.innerHTML = '';

  const todayStr = new Date().toISOString().split('T')[0];

  // Render leading trailing days from previous month
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    const prevDate = new Date(year, month - 1, dayNum);
    const dateStr = prevDate.toISOString().split('T')[0];

    const cell = createDayCell(dayNum, dateStr, byDate[dateStr], true);
    grid.appendChild(cell);
  }

  // Render current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const curDate = new Date(year, month, day);
    const dateStr = curDate.toISOString().split('T')[0];
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === activeTimeMachineDate;

    const cell = createDayCell(day, dateStr, byDate[dateStr], false, isToday, isSelected);
    grid.appendChild(cell);
  }

  // Render trailing days to fill 7-column grid
  for (let nextDay = 1; nextDay <= remainingCells; nextDay++) {
    const nextDate = new Date(year, month + 1, nextDay);
    const dateStr = nextDate.toISOString().split('T')[0];

    const cell = createDayCell(nextDay, dateStr, byDate[dateStr], true);
    grid.appendChild(cell);
  }

  // Display initial Day Chronicle for today or selected Time Machine date
  const selectedDateStr = activeTimeMachineDate || todayStr;
  await renderDayChronicle(selectedDateStr);
}

/**
 * Render Day Chronicle for selected calendar date
 */
export async function renderDayChronicle(dateStr, dayData = null) {
  const chronicleEl = document.getElementById('timeline-day-chronicle');
  const headingEl = document.getElementById('chronicle-date-heading');
  const durationEl = document.getElementById('chronicle-duration-badge');
  const eventsListEl = document.getElementById('chronicle-events-list');
  const filterBtn = document.getElementById('chronicle-filter-btn');

  if (!chronicleEl || !headingEl || !eventsListEl) return;

  chronicleEl.classList.remove('hidden');
  // Day Chronicle header: Day, DD Month YYYY (e.g. "Sunday, 20 September 2026")
  headingEl.textContent = formatDateDisplay(dateStr, true);

  if (!dayData) {
    eventsListEl.innerHTML = '<div class="chronicle-empty">Loading chronicle...</div>';
    dayData = await fetchDayTimelineData(dateStr);
  }

  const durationSec = dayData?.totalDurationSeconds || dayData?.totalDuration || 0;
  const mins = Math.round(durationSec / 60);
  if (durationEl) {
    durationEl.textContent = `${mins} min${mins === 1 ? '' : 's'} focus`;
  }

  if (filterBtn) {
    if (activeTimeMachineDate === dateStr) {
      filterBtn.textContent = 'Exit Time Machine';
      filterBtn.onclick = () => {
        exitTimeMachine();
        renderDayChronicle(dateStr);
      };
    } else {
      filterBtn.textContent = 'Enter Time Machine';
      filterBtn.onclick = () => {
        activateTimeMachine(dateStr);
      };
    }
  }

  const events = dayData?.events || [];
  if (events.length === 0) {
    eventsListEl.innerHTML = '<div class="chronicle-empty">No activity events logged for this date. Continuous telemetry captures focused work sessions.</div>';
  } else {
    // Sort chronologically
    const sorted = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    eventsListEl.innerHTML = sorted.map(evt => {
      // Event activity logs: Render timestamps as hh:mm AM/PM (e.g., 10:15 AM, 04:45 PM)
      const timeStr = formatTimeDisplay(evt.timestamp);
      const mod = evt.module || 'notes';
      const moduleClass = `module-${mod}`;
      const moduleName = mod.charAt(0).toUpperCase() + mod.slice(1);
      const actionStr = evt.action ? `[${evt.action}]` : '';
      const titleStr = evt.title || evt.summary || 'Activity recorded';
      return `
        <div class="chronicle-event-row">
          <span class="chronicle-event-time">${timeStr}</span>
          <span class="chronicle-event-module ${moduleClass}">${moduleName}</span>
          <span class="chronicle-event-action">${actionStr}</span>
          <span class="chronicle-event-title" title="${titleStr}">${titleStr}</span>
        </div>
      `;
    }).join('');
  }
}

/**
 * Creates an individual calendar day cell element
 */
function createDayCell(dayNum, dateStr, dayData, isOutside = false, isToday = false, isSelected = false) {
  const cell = document.createElement('div');
  cell.className = `calendar-day-cell ${isOutside ? 'day-outside' : ''} ${isToday ? 'day-today' : ''} ${isSelected ? 'day-selected' : ''}`;
  cell.setAttribute('data-date', dateStr);

  const dayHeader = document.createElement('div');
  dayHeader.className = 'cell-header';

  const numSpan = document.createElement('span');
  numSpan.className = 'day-number';
  numSpan.textContent = dayNum;
  dayHeader.appendChild(numSpan);

  const durationSec = dayData?.totalDurationSeconds || dayData?.totalDuration || 0;
  if (durationSec > 0) {
    const badge = document.createElement('span');
    badge.className = 'day-duration-badge';
    badge.textContent = formatDurationBadge(durationSec);
    badge.title = `Focus duration: ${Math.round(durationSec / 60)} minutes`;
    dayHeader.appendChild(badge);
  }

  cell.appendChild(dayHeader);

  // Set tooltip in "Day, DD Month YYYY" format
  cell.title = formatDateDisplay(dateStr, true);

  // Module Activity Dots
  const dotContainer = document.createElement('div');
  dotContainer.className = 'cell-dots';

  let hasMindflow = false;
  let hasNotes = false;
  let hasDiary = false;

  if (dayData) {
    if (Array.isArray(dayData.modules)) {
      hasMindflow = dayData.modules.includes('mindflow');
      hasNotes = dayData.modules.includes('notes');
      hasDiary = dayData.modules.includes('diary');
    } else {
      if (dayData.sessions?.some(s => s.module === 'mindflow') || dayData.events?.some(e => e.module === 'mindflow')) {
        hasMindflow = true;
      }
      if (dayData.sessions?.some(s => s.module === 'notes') || dayData.events?.some(e => e.module === 'notes')) {
        hasNotes = true;
      }
      if (dayData.sessions?.some(s => s.module === 'diary') || dayData.events?.some(e => e.module === 'diary')) {
        hasDiary = true;
      }
    }
  }

  if (hasMindflow) {
    const dot = document.createElement('span');
    dot.className = 'activity-dot dot-mindflow';
    dot.title = 'Mind Flow activity';
    dotContainer.appendChild(dot);
  }
  if (hasNotes) {
    const dot = document.createElement('span');
    dot.className = 'activity-dot dot-notes';
    dot.title = 'Notes activity';
    dotContainer.appendChild(dot);
  }
  if (hasDiary) {
    const dot = document.createElement('span');
    dot.className = 'activity-dot dot-diary';
    dot.title = 'Diary reflection';
    dotContainer.appendChild(dot);
  }

  cell.appendChild(dotContainer);

  // Click to view day chronicle
  cell.addEventListener('click', () => {
    document.querySelectorAll('.calendar-day-cell.day-selected').forEach(c => c.classList.remove('day-selected'));
    cell.classList.add('day-selected');
    renderDayChronicle(dateStr);
  });

  // Double click directly enters Time-Machine Mode
  cell.addEventListener('dblclick', () => {
    activateTimeMachine(dateStr);
  });

  return cell;
}

/**
 * Initializes telemetry listeners, idle detection, auto-flush timer, and calendar modal events
 */
export function initTimeline() {
  // 1. User activity listener (idle detection)
  const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
  activityEvents.forEach(evt => {
    window.addEventListener(evt, handleUserActivity, { passive: true });
  });
  handleUserActivity();

  // 2. Visibility change listener (pause tracking when window loses focus)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      isTabVisible = false;
      tickSession();
      flushActiveSession();
    } else {
      isTabVisible = true;
      currentSession.lastTickTime = Date.now();
    }
  });

  // 3. Heartbeat tick interval (every 1 second)
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = setInterval(tickSession, 1000);

  // 4. Periodic auto-flush interval (every 60 seconds)
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(flushActiveSession, FLUSH_INTERVAL_MS);

  // 5. Before unload flush
  window.addEventListener('beforeunload', () => {
    flushActiveSession();
  });

  // 6. Bind Calendar Modal DOM Events
  const timelineBtn = document.getElementById('timeline-btn');
  const modalCloseBtn = document.getElementById('timeline-modal-close');
  const modalOverlay = document.getElementById('timeline-modal');
  const prevMonthBtn = document.getElementById('timeline-prev-month-btn');
  const nextMonthBtn = document.getElementById('timeline-next-month-btn');
  const exitFilterBtn = document.getElementById('time-machine-exit-btn');

  timelineBtn?.addEventListener('click', () => openCalendarModal());
  modalCloseBtn?.addEventListener('click', () => closeCalendarModal());
  exitFilterBtn?.addEventListener('click', () => exitTimeMachine());

  modalOverlay?.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      closeCalendarModal();
    }
  });

  prevMonthBtn?.addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendarGrid();
  });

  nextMonthBtn?.addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendarGrid();
  });

  // Close modal on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('timeline-modal');
      if (modal && !modal.classList.contains('hidden')) {
        closeCalendarModal();
      }
    }
  });
}
