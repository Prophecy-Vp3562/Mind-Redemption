/**
 * Mind Flow Module (Section 3)
 * 
 * Hierarchy:
 * Mind Flow
 *  └── Notes (Books shelf)
 *       └── Pages (Slides - ordered sequence)
 *            └── Blocks (1 Main block + 0 to 4 Side blocks in Cross/Plus layout)
 */

import { storage } from './fs-storage.js';

// Superscript marker helpers
const SUPERSCRIPTS = ['¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', '¹⁰', '¹¹', '¹²', '¹³', '¹⁴', '¹⁵'];

export class MindFlowController {
  constructor(app) {
    this.app = app;
    this.currentNoteId = null;
    this.currentPageIndex = 0;
    this.zoomedBlockId = null;

    // Elements
    this.shelfView = document.getElementById('mindflow-shelf-view');
    this.workspaceView = document.getElementById('mindflow-workspace-view');
    this.notesGrid = document.getElementById('mf-notes-grid');
    this.slideStrip = document.getElementById('mf-slide-strip');
    this.crossLayout = document.getElementById('mf-cross-layout');
    this.activeNoteTitleEl = document.getElementById('mf-active-note-title');
    this.pageCounterEl = document.getElementById('mf-page-counter');
    this.prevPageBtn = document.getElementById('mf-prev-page');
    this.nextPageBtn = document.getElementById('mf-next-page');

    this.initEvents();
  }

  initEvents() {
    // Back to shelf
    document.getElementById('mf-back-to-shelf')?.addEventListener('click', () => {
      this.closeNote();
    });

    // Create new note button
    document.getElementById('mf-create-note-btn')?.addEventListener('click', () => {
      this.showCreateNoteModal();
    });

    // Slide navigation
    this.prevPageBtn?.addEventListener('click', () => this.goToPrevPage());
    this.nextPageBtn?.addEventListener('click', () => this.goToNextPage());

    // Add new page button
    document.getElementById('mf-add-page-btn')?.addEventListener('click', () => {
      this.showAddPageModal();
    });

    // Delete current page button
    document.getElementById('mf-delete-page-btn')?.addEventListener('click', () => {
      this.confirmDeleteCurrentPage();
    });

    // Editable Note Title in Workspace
    this.activeNoteTitleEl?.addEventListener('input', (e) => {
      const note = this.getActiveNote();
      if (note) {
        note.title = e.target.textContent.trim() || 'Untitled Note';
        note.updatedAt = new Date().toISOString();
        storage.scheduleSave();
      }
    });

    // Keyboard shortcuts: Esc to exit zoom, Left/Right for slides when not typing in textarea
    window.addEventListener('keydown', (e) => {
      if (!this.workspaceView || this.workspaceView.classList.contains('hidden')) return;

      if (e.key === 'Escape') {
        if (this.zoomedBlockId) {
          this.unzoomBlock();
        }
      }
    });
  }

  getNotes() {
    const mf = storage.getMindFlowData();
    if (!mf) return [];
    if (!mf.books && !mf.notes) {
      mf.books = [];
    }
    return mf.books || mf.notes;
  }

  getActiveNote() {
    if (!this.currentNoteId) return null;
    return this.getNotes().find(n => n.id === this.currentNoteId) || null;
  }

  getActivePage() {
    const note = this.getActiveNote();
    if (!note || !note.pages || note.pages.length === 0) return null;
    if (this.currentPageIndex < 0) this.currentPageIndex = 0;
    if (this.currentPageIndex >= note.pages.length) this.currentPageIndex = note.pages.length - 1;
    return note.pages[this.currentPageIndex];
  }

  // --- Render Views ---
  render() {
    if (this.currentNoteId) {
      this.renderWorkspace();
    } else {
      this.renderShelf();
    }
  }

  renderShelf() {
    this.shelfView.classList.remove('hidden');
    this.workspaceView.classList.add('hidden');

    const notes = this.getNotes();
    this.notesGrid.innerHTML = '';

    if (notes.length === 0) {
      this.notesGrid.innerHTML = `
        <div class="empty-shelf-prompt">
          <div class="empty-icon">📖</div>
          <h3>No Mind Flow Notes Yet</h3>
          <p>Create your first multi-block metacognitive book to begin structured personal thinking.</p>
          <button class="btn btn-primary" id="empty-create-note-btn">+ Create First Note</button>
        </div>
      `;
      document.getElementById('empty-create-note-btn')?.addEventListener('click', () => {
        this.showCreateNoteModal();
      });
      return;
    }

    notes.forEach(note => {
      const card = document.createElement('div');
      card.className = 'mf-note-card';
      const lastEdited = new Date(note.updatedAt || note.createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      const pageCount = note.pages ? note.pages.length : 1;

      card.innerHTML = `
        <div class="mf-card-header">
          <span class="mf-card-badge">${pageCount} ${pageCount === 1 ? 'Page' : 'Pages'}</span>
          <div class="mf-card-actions">
            <button class="icon-btn mf-rename-btn" title="Rename Note" aria-label="Rename Note">✏️</button>
            <button class="icon-btn mf-delete-btn" title="Delete Note" aria-label="Delete Note">🗑️</button>
          </div>
        </div>
        <h3 class="mf-card-title">${escapeHTML(note.title)}</h3>
        <p class="mf-card-meta">Last edited: ${lastEdited}</p>
        <div class="mf-card-preview-strip">
          ${(note.pages || []).slice(0, 4).map((p, idx) => `
            <span class="preview-mini-slide" title="Page ${idx + 1}: ${p.sideBlockCount} Side blocks">
              ${idx + 1}
            </span>
          `).join('')}
          ${pageCount > 4 ? `<span class="preview-mini-slide-more">+${pageCount - 4}</span>` : ''}
        </div>
      `;

      // Open Note on click
      card.addEventListener('click', (e) => {
        if (e.target.closest('.mf-card-actions')) return;
        this.openNote(note.id);
      });

      // Rename button
      card.querySelector('.mf-rename-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.promptRenameNote(note);
      });

      // Delete button
      card.querySelector('.mf-delete-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.confirmDeleteNote(note);
      });

      this.notesGrid.appendChild(card);
    });
  }

  // --- Shelf Actions ---
  openNote(noteId) {
    this.currentNoteId = noteId;
    this.currentPageIndex = 0;
    this.zoomedBlockId = null;
    this.renderWorkspace();
  }

  closeNote() {
    this.currentNoteId = null;
    this.zoomedBlockId = null;
    this.renderShelf();
  }

  showCreateNoteModal() {
    const title = prompt('Enter a title for your new Mind Flow note:', 'Untitled Note');
    if (title === null) return;
    const cleanTitle = title.trim() || 'Untitled Note';

    const newNote = {
      id: 'note_' + Date.now(),
      title: cleanTitle,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pages: [
        this.createNewPageObject(4) // default to classic 4 side blocks
      ]
    };

    this.getNotes().unshift(newNote);
    storage.scheduleSave();
    this.openNote(newNote.id);
  }

  promptRenameNote(note) {
    const newTitle = prompt('Rename note:', note.title);
    if (newTitle === null) return;
    note.title = newTitle.trim() || 'Untitled Note';
    note.updatedAt = new Date().toISOString();
    storage.scheduleSave();
    this.render();
  }

  confirmDeleteNote(note) {
    if (confirm(`Are you sure you want to delete "${note.title}"? This cannot be undone.`)) {
      const notes = this.getNotes();
      const idx = notes.findIndex(n => n.id === note.id);
      if (idx !== -1) {
        notes.splice(idx, 1);
        storage.scheduleSave();
        this.render();
      }
    }
  }

  // --- Page Creation Helper ---
  createNewPageObject(sideBlockCount = 4) {
    const pageId = 'page_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const blocks = {
      main: {
        id: 'main',
        title: 'Main Branch',
        content: '',
        markers: []
      }
    };

    const sideDefaultTitles = [
      'Side 1 (Assumptions)',
      'Side 2 (Counter-arguments)',
      'Side 3 (Emotional Context)',
      'Side 4 (Alternative Hypotheses)'
    ];

    for (let i = 1; i <= sideBlockCount; i++) {
      const key = 'side' + i;
      blocks[key] = {
        id: key,
        title: sideDefaultTitles[i - 1] || `Side ${i}`,
        content: '',
        reference: ''
      };
    }

    return {
      id: pageId,
      sideBlockCount,
      blocks
    };
  }

  showAddPageModal() {
    const modal = document.getElementById('add-page-modal');
    if (!modal) return;

    modal.classList.remove('hidden');

    const selectOptions = modal.querySelectorAll('.block-count-choice');
    let selectedCount = 4; // default

    selectOptions.forEach(btn => {
      btn.classList.remove('selected');
      if (parseInt(btn.dataset.count, 10) === selectedCount) {
        btn.classList.add('selected');
      }

      btn.onclick = () => {
        selectOptions.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedCount = parseInt(btn.dataset.count, 10);
      };
    });

    const confirmBtn = document.getElementById('modal-create-page-btn');
    const cancelBtn = document.getElementById('modal-cancel-page-btn');

    confirmBtn.onclick = () => {
      modal.classList.add('hidden');
      const note = this.getActiveNote();
      if (!note) return;

      const newPage = this.createNewPageObject(selectedCount);
      note.pages.push(newPage);
      note.updatedAt = new Date().toISOString();
      this.currentPageIndex = note.pages.length - 1;
      this.zoomedBlockId = null;

      storage.scheduleSave();
      this.renderWorkspace();
    };

    cancelBtn.onclick = () => {
      modal.classList.add('hidden');
    };
  }

  confirmDeleteCurrentPage() {
    const note = this.getActiveNote();
    if (!note) return;

    if (note.pages.length <= 1) {
      alert('A note must have at least one page.');
      return;
    }

    if (confirm(`Delete Page ${this.currentPageIndex + 1}? All content on this slide will be removed.`)) {
      note.pages.splice(this.currentPageIndex, 1);
      if (this.currentPageIndex >= note.pages.length) {
        this.currentPageIndex = note.pages.length - 1;
      }
      this.zoomedBlockId = null;
      note.updatedAt = new Date().toISOString();
      storage.scheduleSave();
      this.renderWorkspace();
    }
  }

  // --- Page Navigation ---
  goToPrevPage() {
    if (this.currentPageIndex > 0) {
      this.currentPageIndex--;
      this.zoomedBlockId = null;
      this.renderWorkspace();
    }
  }

  goToNextPage() {
    const note = this.getActiveNote();
    if (note && this.currentPageIndex < note.pages.length - 1) {
      this.currentPageIndex++;
      this.zoomedBlockId = null;
      this.renderWorkspace();
    }
  }

  // --- Render Workspace (Slides & Cross Layout) ---
  renderWorkspace() {
    const note = this.getActiveNote();
    if (!note) {
      this.closeNote();
      return;
    }

    this.shelfView.classList.add('hidden');
    this.workspaceView.classList.remove('hidden');

    // Title
    if (this.activeNoteTitleEl) {
      this.activeNoteTitleEl.textContent = note.title;
    }

    // Slide Strip
    this.renderSlideStrip(note);

    // Current Page Info
    const totalPages = note.pages.length;
    if (this.pageCounterEl) {
      this.pageCounterEl.textContent = `Page ${this.currentPageIndex + 1} of ${totalPages}`;
    }

    if (this.prevPageBtn) this.prevPageBtn.disabled = this.currentPageIndex === 0;
    if (this.nextPageBtn) this.nextPageBtn.disabled = this.currentPageIndex === totalPages - 1;

    // Render Blocks
    const page = this.getActivePage();
    if (!page) return;

    this.renderPageBlocks(page);
  }

  renderSlideStrip(note) {
    if (!this.slideStrip) return;
    this.slideStrip.innerHTML = '';

    note.pages.forEach((page, idx) => {
      const slideItem = document.createElement('div');
      slideItem.className = `slide-thumb ${idx === this.currentPageIndex ? 'active' : ''}`;
      slideItem.innerHTML = `
        <div class="slide-thumb-number">${idx + 1}</div>
        <div class="slide-thumb-preview count-${page.sideBlockCount}">
          <div class="mini-block mini-center"></div>
          ${page.sideBlockCount >= 1 ? '<div class="mini-block mini-side1"></div>' : ''}
          ${page.sideBlockCount >= 2 ? '<div class="mini-block mini-side2"></div>' : ''}
          ${page.sideBlockCount >= 3 ? '<div class="mini-block mini-side3"></div>' : ''}
          ${page.sideBlockCount >= 4 ? '<div class="mini-block mini-side4"></div>' : ''}
        </div>
      `;

      slideItem.addEventListener('click', () => {
        if (this.currentPageIndex !== idx) {
          this.currentPageIndex = idx;
          this.zoomedBlockId = null;
          this.renderWorkspace();
        }
      });

      this.slideStrip.appendChild(slideItem);
    });
  }

  renderPageBlocks(page) {
    if (!this.crossLayout) return;
    this.crossLayout.innerHTML = '';

    const count = page.sideBlockCount;
    this.crossLayout.className = `mf-cross-grid side-count-${count} ${this.zoomedBlockId ? 'has-zoomed-block' : ''}`;

    const blocks = page.blocks;
    if (!blocks.main) {
      blocks.main = { id: 'main', title: 'Main Branch', content: '', markers: [] };
    }

    // Get list of markers from Main block for cross-referencing
    const mainMarkers = this.extractMarkers(blocks.main.content || '');

    // Render Main Block
    const mainEl = this.createBlockElement({
      blockKey: 'main',
      blockData: blocks.main,
      isMain: true,
      markers: mainMarkers,
      isZoomed: this.zoomedBlockId === 'main'
    });
    this.crossLayout.appendChild(mainEl);

    // Render Side Blocks (up to 4)
    for (let i = 1; i <= count; i++) {
      const key = 'side' + i;
      if (!blocks[key]) {
        blocks[key] = { id: key, title: `Side ${i}`, content: '', reference: '' };
      }
      const sideEl = this.createBlockElement({
        blockKey: key,
        blockData: blocks[key],
        isMain: false,
        sideIndex: i,
        markers: mainMarkers,
        isZoomed: this.zoomedBlockId === key
      });
      this.crossLayout.appendChild(sideEl);
    }
  }

  createBlockElement({ blockKey, blockData, isMain, sideIndex, markers, isZoomed }) {
    const blockCard = document.createElement('div');
    blockCard.className = `mf-block-card ${isMain ? 'block-main' : `block-side block-side-${sideIndex}`} ${isZoomed ? 'zoomed-fullscreen' : ''}`;
    blockCard.dataset.blockKey = blockKey;

    // Header with editable title, zoom button, and reference tag / marker inserter
    const header = document.createElement('div');
    header.className = 'mf-block-header';

    // Title element
    const titleContainer = document.createElement('div');
    titleContainer.className = 'mf-block-title-container';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'mf-block-title-input';
    titleInput.value = blockData.title || (isMain ? 'Main Branch' : `Side ${sideIndex}`);
    titleInput.placeholder = isMain ? 'Main Branch Title...' : `Side ${sideIndex} Title...`;
    titleInput.addEventListener('input', (e) => {
      blockData.title = e.target.value;
      const note = this.getActiveNote();
      if (note) note.updatedAt = new Date().toISOString();
      storage.scheduleSave();
    });

    titleContainer.appendChild(titleInput);

    // Reference Badge / Selector for Side block
    if (!isMain) {
      const refBadge = document.createElement('div');
      refBadge.className = 'mf-ref-container';

      const select = document.createElement('select');
      select.className = 'mf-ref-select';
      select.title = 'Link to footnote marker in Main Branch';
      
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = 're: none';
      select.appendChild(defaultOpt);

      markers.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = `re: ${m}`;
        if (blockData.reference === m) opt.selected = true;
        select.appendChild(opt);
      });

      // If reference has a value not currently in markers, keep it as an option
      if (blockData.reference && !markers.includes(blockData.reference)) {
        const opt = document.createElement('option');
        opt.value = blockData.reference;
        opt.textContent = `re: ${blockData.reference}`;
        opt.selected = true;
        select.appendChild(opt);
      }

      select.addEventListener('change', (e) => {
        blockData.reference = e.target.value;
        const note = this.getActiveNote();
        if (note) note.updatedAt = new Date().toISOString();
        storage.scheduleSave();
      });

      refBadge.appendChild(select);
      titleContainer.appendChild(refBadge);
    } else {
      // Main block marker action button
      const markerBtn = document.createElement('button');
      markerBtn.className = 'btn-marker-insert';
      markerBtn.type = 'button';
      markerBtn.title = 'Insert next footnote marker (¹ ²) at cursor';
      markerBtn.innerHTML = `<span>+ Marker</span>`;
      markerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.insertNextMarkerInMain(blockData);
      });
      titleContainer.appendChild(markerBtn);
    }

    // Header Right Actions (Zoom / Unzoom button)
    const actions = document.createElement('div');
    actions.className = 'mf-block-actions';

    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'icon-btn zoom-toggle-btn';
    zoomBtn.title = isZoomed ? 'Exit Fullscreen (Esc or double-click)' : 'Expand to Fullscreen (Double-click)';
    zoomBtn.innerHTML = isZoomed ? '✕ Exit Focus' : '⛶ Zoom';
    zoomBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleZoom(blockKey);
    });

    actions.appendChild(zoomBtn);
    header.appendChild(titleContainer);
    header.appendChild(actions);

    // Textarea Writing Area
    const body = document.createElement('div');
    body.className = 'mf-block-body';

    const textarea = document.createElement('textarea');
    textarea.className = 'mf-block-textarea';
    textarea.id = `textarea-${blockKey}`;
    textarea.placeholder = isMain 
      ? 'Central thought, primary hypothesis, or main argument...\n\n(Click to write continuously; block scrolls internally)'
      : `Parallel thought, perspective, counter-point, or reflection...`;
    textarea.value = blockData.content || '';

    // Click-to-write: typing writes only into this block
    textarea.addEventListener('input', (e) => {
      blockData.content = e.target.value;
      const note = this.getActiveNote();
      if (note) note.updatedAt = new Date().toISOString();
      storage.scheduleSave();

      // If main block content changed, update markers for side block dropdowns
      if (isMain) {
        this.refreshSideBlockReferences();
      }
    });

    body.appendChild(textarea);
    blockCard.appendChild(header);
    blockCard.appendChild(body);

    // Double-click zoom behavior (Section 3.2):
    // Double-clicking a block expands it to fill the entire screen for focused, distraction-free writing.
    // Double-clicking again (while zoomed) returns to the multi-block overview.
    blockCard.addEventListener('dblclick', (e) => {
      // Don't trigger if double-clicking inside the input title
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      this.toggleZoom(blockKey);
    });

    return blockCard;
  }

  // --- Zoom Logic ---
  toggleZoom(blockKey) {
    if (this.zoomedBlockId === blockKey) {
      this.unzoomBlock();
    } else {
      this.zoomBlock(blockKey);
    }
  }

  zoomBlock(blockKey) {
    this.zoomedBlockId = blockKey;
    const page = this.getActivePage();
    if (page) {
      this.renderPageBlocks(page);
      // Focus textarea in zoomed block
      setTimeout(() => {
        const ta = document.getElementById(`textarea-${blockKey}`);
        if (ta) ta.focus();
      }, 50);
    }
  }

  unzoomBlock() {
    const prevZoomed = this.zoomedBlockId;
    this.zoomedBlockId = null;
    const page = this.getActivePage();
    if (page) {
      this.renderPageBlocks(page);
      // Retain focus
      if (prevZoomed) {
        setTimeout(() => {
          const ta = document.getElementById(`textarea-${prevZoomed}`);
          if (ta) ta.focus();
        }, 50);
      }
    }
  }

  // --- Footnote Marker System ---
  extractMarkers(content) {
    const found = [];
    SUPERSCRIPTS.forEach(marker => {
      if (content.includes(marker)) {
        found.push(marker);
      }
    });
    return found;
  }

  insertNextMarkerInMain(mainBlockData) {
    const textarea = document.getElementById('textarea-main');
    if (!textarea) return;

    const content = textarea.value;
    const existingMarkers = this.extractMarkers(content);
    
    // Find next available superscript
    let nextMarker = SUPERSCRIPTS[0];
    for (const m of SUPERSCRIPTS) {
      if (!existingMarkers.includes(m)) {
        nextMarker = m;
        break;
      }
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = content.substring(0, start);
    const after = content.substring(end);

    const insertedText = ` ${nextMarker} `;
    textarea.value = before + insertedText + after;
    textarea.selectionStart = textarea.selectionEnd = start + insertedText.length;
    textarea.focus();

    mainBlockData.content = textarea.value;
    const note = this.getActiveNote();
    if (note) note.updatedAt = new Date().toISOString();
    storage.scheduleSave();

    this.refreshSideBlockReferences();
  }

  refreshSideBlockReferences() {
    const page = this.getActivePage();
    if (!page || !page.blocks || !page.blocks.main) return;

    const markers = this.extractMarkers(page.blocks.main.content || '');
    const selects = this.crossLayout.querySelectorAll('.mf-ref-select');

    selects.forEach((select) => {
      const currentVal = select.value;
      select.innerHTML = '';

      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = 're: none';
      select.appendChild(defaultOpt);

      markers.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = `re: ${m}`;
        if (currentVal === m) opt.selected = true;
        select.appendChild(opt);
      });

      if (currentVal && !markers.includes(currentVal)) {
        const opt = document.createElement('option');
        opt.value = currentVal;
        opt.textContent = `re: ${currentVal}`;
        opt.selected = true;
        select.appendChild(opt);
      }
    });
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

let mindFlowInstance = null;

export function initMindFlow(app = null) {
  if (!mindFlowInstance) {
    mindFlowInstance = new MindFlowController(app);
  }
  mindFlowInstance.render();
  return mindFlowInstance;
}
