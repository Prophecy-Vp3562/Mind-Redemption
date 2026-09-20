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
import { logTimelineEvent, getTimeMachineDate, onTimeMachineChange, formatDateDMY } from './timeline.js';

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
    this.container = document.getElementById('notes-view') || document.getElementById('notes-tab-view');
    this.notesGrid = document.getElementById('notes-masonry-grid');
    this.quickInputCollapsed = document.getElementById('note-quick-collapsed');
    this.quickInputExpanded = document.getElementById('note-quick-expanded');
    this.quickTitleInput = document.getElementById('quick-note-title');
    this.quickBodyInput = document.getElementById('quick-note-body');
    this.quickDoneBtn = document.getElementById('quick-note-done');
    this.quickColorBtn = document.getElementById('quick-note-color');
    this.quickPinBtn = document.getElementById('quick-note-pin');
    this.searchInput = document.getElementById('notes-search-input');
    this.btnCreateNewNote = document.getElementById('btn-create-new-note');

    this.selectedQuickColor = NOTE_COLORS[0].value;
    this.isQuickPinned = false;
    this.isModalPinned = false;

    // Modal elements
    this.editModal = document.getElementById('note-edit-modal');
    this.modalTitle = document.getElementById('modal-note-title');
    this.modalBody = document.getElementById('modal-note-body');
    this.modalCloseBtn = document.getElementById('modal-note-close');
    this.modalDeleteBtn = document.getElementById('modal-note-delete');
    this.modalPinBtn = document.getElementById('modal-note-pin');
    this.initEvents();

    // Re-render notes when Time Machine date changes
    onTimeMachineChange(() => {
      this.render();
    });
  }

  initEvents() {
    // Top bar + New Note button (stop propagation so document click doesn't immediately close it)
    this.btnCreateNewNote?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openCreateNote();
    });

    // Quick Note expand / collapse
    this.quickInputCollapsed?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.expandQuickNote();
    });

    // Close quick note when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.quickInputExpanded || this.quickInputExpanded.classList.contains('hidden')) return;
      const box = document.getElementById('quick-note-box');
      const createBtn = document.getElementById('btn-create-new-note');
      if (box && !box.contains(e.target) && (!createBtn || !createBtn.contains(e.target))) {
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
    this.modalCloseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeEditModal();
    });
    this.modalDeleteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteActiveModalNote();
    });
    this.modalPinBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleActiveModalPin();
    });

    // Close modal when clicking backdrop overlay
    this.editModal?.addEventListener('click', (e) => {
      if (e.target === this.editModal) {
        this.closeEditModal();
      }
    });

    // Autosave in edit modal on typing
    const handleModalInput = () => {
      const title = (this.modalTitle?.value || '').trim();
      const content = this.modalBody?.value || '';

      if (!this.activeEditNoteId) {
        // First keystrokes in a new note modal -> create the note record
        if (title || content.trim()) {
          const newNote = {
            id: 'note_' + Date.now(),
            title: title || 'Untitled Note',
            content: content,
            color: NOTE_COLORS[0].value,
            pinned: !!this.isModalPinned,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          this.activeEditNoteId = newNote.id;
          this.getNotes().unshift(newNote);
          storage.scheduleSave();
          this.render();
          if (this.modalDeleteBtn) this.modalDeleteBtn.style.display = 'inline-flex';
          logTimelineEvent('notes', 'CREATE', newNote.id, newNote.title, newNote.content);
        }
        return;
      }

      const note = this.getNotes().find(n => n.id === this.activeEditNoteId);
      if (note) {
        note.title = title;
        note.content = content;
        note.updatedAt = new Date().toISOString();
        storage.scheduleSave();
        this.render(); // update card preview in background

        // Debounced telemetry logging
        clearTimeout(this._modalLogTimer);
        this._modalLogTimer = setTimeout(() => {
          logTimelineEvent('notes', 'EDIT', note.id, note.title, note.content);
        }, 1500);
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
      logTimelineEvent('notes', 'CREATE', newNote.id, newNote.title, newNote.content);
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

  expandQuickNote() {
    if (this.quickInputCollapsed && this.quickInputExpanded) {
      this.quickInputCollapsed.classList.add('hidden');
      this.quickInputExpanded.classList.remove('hidden');
      const box = document.getElementById('quick-note-box');
      if (box) {
        box.classList.add('quick-note-active');
      }
      this.quickTitleInput?.focus();
    }
  }

  openCreateNote() {
    // If quick note box was open with unsaved text, collapse and save it first
    if (this.quickInputExpanded && !this.quickInputExpanded.classList.contains('hidden')) {
      this.saveQuickNoteAndCollapse();
    }
    this.openEditModal(null);
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
          <p>${this.searchQuery ? 'Try another search keyword.' : 'Click the input box above or the "+ New Note" button to jot down an idea.'}</p>
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

      const othersHeader = document.createElement('div');
      othersHeader.className = 'notes-section-heading';
      othersHeader.innerHTML = `<span>OTHERS</span>`;
      this.notesGrid.appendChild(othersHeader);
    }

    // Always render othersGrid with a dedicated "+ New Note" card followed by existing notes
    const othersGrid = document.createElement('div');
    othersGrid.className = 'notes-cards-subgrid';
    othersGrid.appendChild(this.createAddNoteCard());
    others.forEach(n => othersGrid.appendChild(this.createNoteCard(n)));
    this.notesGrid.appendChild(othersGrid);
  }

  createAddNoteCard() {
    const card = document.createElement('div');
    card.className = 'note-card note-card-create';
    card.title = 'Create a new note';
    card.innerHTML = `
      <div class="note-create-card-inner">
        <span class="note-create-icon">＋</span>
        <span class="note-create-label">New Note</span>
      </div>
    `;
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openCreateNote();
    });
    return card;
  }

  createNoteCard(note) {
    const timeMachineDate = getTimeMachineDate();
    let tmClass = '';
    if (timeMachineDate) {
      const isMatch = (note.createdAt && note.createdAt.startsWith(timeMachineDate)) || 
                      (note.updatedAt && note.updatedAt.startsWith(timeMachineDate));
      tmClass = isMatch ? 'time-machine-match' : 'time-machine-dimmed';
    }

    const card = document.createElement('div');
    card.className = `note-card ${note.pinned ? 'is-pinned' : ''} ${tmClass}`;
    if (note.color && note.color !== NOTE_COLORS[0].value) {
      card.style.backgroundColor = note.color;
    }

    const lastEdited = formatDateDMY(note.updatedAt || note.createdAt);

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

  openEditModal(noteId = null) {
    if (noteId) {
      const note = this.getNotes().find(n => n.id === noteId);
      if (!note) return;

      this.activeEditNoteId = note.id;
      this.modalTitle.value = note.title || '';
      this.modalBody.value = note.content || '';
      this.isModalPinned = !!note.pinned;
      this.modalPinBtn?.classList.toggle('active', this.isModalPinned);
      if (this.modalDeleteBtn) this.modalDeleteBtn.style.display = 'inline-flex';
    } else {
      this.activeEditNoteId = null;
      this.modalTitle.value = '';
      this.modalBody.value = '';
      this.isModalPinned = false;
      this.modalPinBtn?.classList.remove('active');
      if (this.modalDeleteBtn) this.modalDeleteBtn.style.display = 'none';
    }

    this.editModal?.classList.remove('hidden');
    setTimeout(() => {
      if (!noteId) {
        this.modalTitle?.focus();
      } else {
        this.modalBody?.focus();
      }
    }, 50);
  }

  closeEditModal() {
    const title = (this.modalTitle?.value || '').trim();
    const content = (this.modalBody?.value || '').trim();

    if (!this.activeEditNoteId) {
      if (title || content) {
        const newNote = {
          id: 'note_' + Date.now(),
          title: title || 'Untitled Note',
          content: content,
          color: NOTE_COLORS[0].value,
          pinned: !!this.isModalPinned,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        this.getNotes().unshift(newNote);
        storage.scheduleSave();
        logTimelineEvent('notes', 'CREATE', newNote.id, newNote.title, newNote.content);
      }
    } else {
      const notes = this.getNotes();
      const idx = notes.findIndex(n => n.id === this.activeEditNoteId);
      if (idx !== -1) {
        if (!title && !content) {
          notes.splice(idx, 1);
          storage.scheduleSave();
        } else {
          notes[idx].title = title || 'Untitled Note';
          notes[idx].content = content;
          notes[idx].pinned = !!this.isModalPinned;
          notes[idx].updatedAt = new Date().toISOString();
          storage.scheduleSave();
        }
      }
    }
    this.activeEditNoteId = null;
    this.editModal?.classList.add('hidden');
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
