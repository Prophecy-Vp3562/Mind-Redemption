/**
 * Diary Tab Module (Section 5)
 * 
 * Placeholder tab wired up and clickable:
 * - Dedicated coming-soon screen
 * - Minimalist journal aesthetic
 * - Clean calendar visual preview and metacognitive prompt ideas
 * - Separate namespace prepared in storage for future release
 */

export class DiaryController {
  constructor(app) {
    this.app = app;
    this.container = document.getElementById('diary-tab-view');
  }

  render() {
    if (!this.container) return;

    const todayStr = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    this.container.innerHTML = `
      <div class="diary-placeholder-wrap">
        <div class="diary-header-card">
          <div class="diary-badge">COMING SOON</div>
          <h2 class="diary-heading">Chronological Metacognition & Daily Reflections</h2>
          <p class="diary-subtitle">
            The Diary tab will bring time-anchored reflection, daily morning intentions, evening cognitive retrospectives, and emotional audits into your local workspace.
          </p>
          <div class="diary-date-stamp">Today: <strong>${todayStr}</strong></div>
        </div>

        <div class="diary-preview-grid">
          <div class="diary-feature-card">
            <div class="feature-icon">🌅</div>
            <h3>Morning Cognitive Priming</h3>
            <p>Set clarity of intent, anticipate mental traps, and delineate what requires deep focus vs quick reaction.</p>
          </div>

          <div class="diary-feature-card">
            <div class="feature-icon">🧭</div>
            <h3>Evening Retrospective</h3>
            <p>Audit beliefs updated, decisions made under uncertainty, and moments where autopilot took over.</p>
          </div>

          <div class="diary-feature-card">
            <div class="feature-icon">🔒</div>
            <h3>100% Private & Local</h3>
            <p>Stored alongside your Mind Flow notes in your single encrypted local JSON file with zero telemetry.</p>
          </div>
        </div>

        <div class="diary-quote-box">
          <blockquote>
            "We do not learn from experience... we learn from reflecting on experience."
          </blockquote>
          <cite>— John Dewey</cite>
        </div>
      </div>
    `;
  }
}
