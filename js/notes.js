/**
 * Note Tab Module (Section 4)
 * 
 * A traditional single-flow note-taking website (Google Keep style):
 * - Single continuous writing space per note
 * - Quick capture bar ("Take a note...")
 * - Grid of note cards with title/preview, color badges, pinned status, last-edited date
 * - Modal editor for deep writing
 * - Search filter
 * - Completely isolated data from Mind Flow
 */

import { storage } from './fs-storage.js';

const NOTE_COLORS = [
  { name: 'Default', value: 'var(--card-bg)' },
  { name: 'Warm Paper', value: 'rgba(254, 243, 199, 0.25)' },
  { name: 'Misty Sage', value: 'rgba(209, 250, 229, 0.25)' },
  { name: 'Soft Azure', value: 'rgba(224, 242, 254, 0.25)' },
  { name: 'Lilac Fog', value: 'rgba(243, 232, 255, 0.25)' },
  { name: 'Rose Quartz', value: 'rgba(255, 228, 230, 0.25)' },
];

export class NotesController {
  constructor(app) {
    this.app = app;
    this.searchQuery = '';
    this.activeEditNoteId = null;

    // Elements
    this.container = document.getElementById('notes-tab-view');
    this.notesGrid = document.getElementById('notes-masonry-grid');
    this.quickInputCollapsed = document.getElementById('note-quick-collapsed');
    this.quickInputExpanded = document.getElementById('note-quick-expanded');
    this.quickTitleInput = document.getElementById('quick-note-title');
    this.quickBodyInput = document.getElementById('quick-note-body');
    this.quickDoneBtn = document.getElementById('quick-note-done');
    this.quickColorBtn = document.getElementById('quick-note-color');
    this.quickPinBtn = document.getElementById('quick-note-pin');
    this.searchInput = document.getElementById('notes-search-input');

    this.selectedQuickColor = NOTE_COLORS[0].value;
    this.isQuickPinned = false;

    // Modal elements
    this.editModal = document.getElementById('note-edit-modal');
    this.modalTitle = document.getElementById('modal-note-title');
    this.modalBody = document.getElementById('modal-note-body');
    this.modalCloseBtn = document.getElementById('modal-note-close');
    this.modalDeleteBtn = document.getElementById('modal-note-delete');
    this.modalPinBtn = document.getElementById('modal-note-pin');

    this.initEvents();
  }

  initEvents() {
    // Quick Note expand / collapse
    this.quickInputCollapsed?.addEventListener('click', () => {
      this.quickInputCollapsed.classList.add('hidden');
      this.quickInputExpanded.classList.remove('hidden');
      this.quickBodyInput?.focus();
    });

    // Close quick note when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.quickInputExpanded || this.quickInputExpanded.classList.contains('hidden')) return;
      const box = document.getElementById('quick-note-box');
      if (box && !box.contains(e.target)) {
        this.saveQuickNoteAndCollapse();
      }
    });

    this.quickDoneBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.saveQuickNoteAndCollapse();
    });

    this.quickPinBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.isQuickPinned = !this.isQuickPinned;
      this.quickPinBtn.classList.toggle('active', this.isQuickPinned);
    });

    // Search
    this.searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.render();
    });

    // Modal Events
    this.modalCloseBtn?.addEventListener('click', () => this.closeEditModal());
    this.modalDeleteBtn?.addEventListener('click', () => this.deleteActiveModalNote());
    this.modalPinBtn?.addEventListener('click', () => this.toggleActiveModalPin());

    // Autosave in edit modal on typing
    const handleModalInput = () => {
      if (!this.activeEditNoteId) return;
      const note = this.getNotes().find(n => n.id === this.activeEditNoteId);
      if (note) {
        note.title = this.modalTitle.value.trim();
        note.content = this.modalBody.value;
        note.updatedAt = new Date().toISOString();
        storage.scheduleSave();
        this.render(); // update card preview in background
      }
    };

    this.modalTitle?.addEventListener('input', handleModalInput);
    this.modalBody?.addEventListener('input', handleModalInput);

    // Close modal on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.editModal && !this.editModal.classList.contains('hidden')) {
        this.closeEditModal();
      }
    });
  }

  getNotes() {
    const notesData = storage.getNotesData();
    if (!notesData) return [];
    if (!notesData.items && !notesData.list) {
      notesData.items = [];
    }
    return notesData.items || notesData.list;
  }

  saveQuickNoteAndCollapse() {
    const title = (this.quickTitleInput?.value || '').trim();
    const content = (this.quickBodyInput?.value || '').trim();

    if (title || content) {
      const newNote = {
        id: 'note_' + Date.now(),
        title: title || 'Untitled Note',
        content: content,
        color: this.selectedQuickColor,
        pinned: this.isQuickPinned,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.getNotes().unshift(newNote);
      storage.scheduleSave();
    }

    // Reset inputs
    if (this.quickTitleInput) this.quickTitleInput.value = '';
    if (this.quickBodyInput) this.quickBodyInput.value = '';
    this.selectedQuickColor = NOTE_COLORS[0].value;
    this.isQuickPinned = false;
    this.quickPinBtn?.classList.remove('active');

    this.quickInputExpanded?.classList.add('hidden');
    this.quickInputCollapsed?.classList.remove('hidden');

    this.render();
  }

  render() {
    if (!this.notesGrid) return;
    this.notesGrid.innerHTML = '';

    let notes = this.getNotes();

    // Filter by search query
    if (this.searchQuery) {
      notes = notes.filter(n => 
        (n.title && n.title.toLowerCase().includes(this.searchQuery)) ||
        (n.content && n.content.toLowerCase().includes(this.searchQuery))
      );
    }

    if (notes.length === 0) {
      this.notesGrid.innerHTML = `
        <div class="empty-notes-prompt">
          <div class="empty-icon">📝</div>
          <h3>${this.searchQuery ? 'No matching notes found' : 'No notes yet'}</h3>
          <p>${this.searchQuery ? 'Try another search keyword.' : 'Click the input box above to jot down a thought, reminder, or idea.'}</p>
        </div>
      `;
      return;
    }

    // Separate pinned and others
    const pinned = notes.filter(n => n.pinned);
    const others = notes.filter(n => !n.pinned);

    if (pinned.length > 0) {
      const pinnedHeader = document.createElement('div');
      pinnedHeader.className = 'notes-section-heading';
      pinnedHeader.innerHTML = `<span>📌 PINNED</span>`;
      this.notesGrid.appendChild(pinnedHeader);

      const pinnedGrid = document.createElement('div');
      pinnedGrid.className = 'notes-cards-subgrid';
      pinned.forEach(n => pinnedGrid.appendChild(this.createNoteCard(n)));
      this.notesGrid.appendChild(pinnedGrid);

      if (others.length > 0) {
        const othersHeader = document.createElement('div');
        othersHeader.className = 'notes-section-heading';
        othersHeader.innerHTML = `<span>OTHERS</span>`;
        this.notesGrid.appendChild(othersHeader);
      }
    }

    if (others.length > 0) {
      const othersGrid = document.createElement('div');
      othersGrid.className = 'notes-cards-subgrid';
      others.forEach(n => othersGrid.appendChild(this.createNoteCard(n)));
      this.notesGrid.appendChild(othersGrid);
    }
  }

  createNoteCard(note) {
    const card = document.createElement('div');
    card.className = `note-card ${note.pinned ? 'is-pinned' : ''}`;
    if (note.color && note.color !== NOTE_COLORS[0].value) {
      card.style.backgroundColor = note.color;
    }

    const lastEdited = new Date(note.updatedAt || note.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });

    card.innerHTML = `
      <div class="note-card-pin ${note.pinned ? 'active' : ''}" title="${note.pinned ? 'Unpin' : 'Pin note'}">
        📌
      </div>
      ${note.title ? `<h4 class="note-card-title">${escapeHTML(note.title)}</h4>` : ''}
      <div class="note-card-content">${escapeHTML(note.content || '')}</div>
      <div class="note-card-footer">
        <span class="note-card-date">${lastEdited}</span>
        <div class="note-card-actions">
          <button class="icon-btn delete-note-btn" title="Delete note" aria-label="Delete">🗑️</button>
        </div>
      </div>
    `;

    // Click to open edit modal
    card.addEventListener('click', (e) => {
      if (e.target.closest('.note-card-pin') || e.target.closest('.delete-note-btn')) return;
      this.openEditModal(note.id);
    });

    // Pin click
    card.querySelector('.note-card-pin')?.addEventListener('click', (e) => {
      e.stopPropagation();
      note.pinned = !note.pinned;
      note.updatedAt = new Date().toISOString();
      storage.scheduleSave();
      this.render();
    });

    // Delete click
    card.querySelector('.delete-note-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${note.title || 'Untitled Note'}"?`)) {
        const notes = this.getNotes();
        const idx = notes.findIndex(n => n.id === note.id);
        if (idx !== -1) {
          notes.splice(idx, 1);
          storage.scheduleSave();
          this.render();
        }
      }
    });

    return card;
  }

  openEditModal(noteId) {
    const note = this.getNotes().find(n => n.id === noteId);
    if (!note) return;

    this.activeEditNoteId = note.id;
    this.modalTitle.value = note.title || '';
    this.modalBody.value = note.content || '';
    this.modalPinBtn.classList.toggle('active', !!note.pinned);

    this.editModal.classList.remove('hidden');
    this.modalBody.focus();
  }

  closeEditModal() {
    this.activeEditNoteId = null;
    this.editModal.classList.add('hidden');
    this.render();
  }

  deleteActiveModalNote() {
    if (!this.activeEditNoteId) return;
    if (confirm('Delete this note?')) {
      const notes = this.getNotes();
      const idx = notes.findIndex(n => n.id === this.activeEditNoteId);
      if (idx !== -1) {
        notes.splice(idx, 1);
        storage.scheduleSave();
      }
      this.closeEditModal();
    }
  }

  toggleActiveModalPin() {
    if (!this.activeEditNoteId) return;
    const note = this.getNotes().find(n => n.id === this.activeEditNoteId);
    if (note) {
      note.pinned = !note.pinned;
      this.modalPinBtn.classList.toggle('active', note.pinned);
      note.updatedAt = new Date().toISOString();
      storage.scheduleSave();
    }
  }
}

function escapeHTML(str) {
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

let notesInstance = null;

export function initNotes(app = null) {
  if (!notesInstance) {
    notesInstance = new NotesController(app);
  }
  notesInstance.render();
  return notesInstance;
}
