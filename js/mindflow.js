/**
 * Mind Flow Module (Section 3)
 * 
 * Hierarchy:
 * Mind Flow
 *  └── Notes (Books shelf)
 *       └── Pages (Slides - ordered sequence)
 *            └── Blocks (1 Main block + 0 to 4 Side blocks in Cross/Plus layout)
 */

import { storage, getActiveWorkspace, setActiveWorkspace } from './fs-storage.js';
import { logTimelineEvent, trackSession, getTimeMachineDate, onTimeMachineChange, formatDateDMY } from './timeline.js';
import { isCloaked, getRealBufferForElement } from './cloak.js';

// Superscript marker helpers
const SUPERSCRIPTS = ['¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹', '¹⁰', '¹¹', '¹²', '¹³', '¹⁴', '¹⁵'];

export class MindFlowController {
  constructor(app) {
    this.app = app;
    this.currentNoteId = null;
    this.currentPageIndex = 0;
    this.zoomedBlockId = null;

    // Layout Customization State
    this.isLayoutEditing = false;
    this.selectedBlockKey = null;

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

    this.btnToggleLayout = document.getElementById('btn-toggle-layout');
    this.btnResetLayout = document.getElementById('btn-reset-layout');

    this.initEvents();
    this.initLayoutModeEvents();

    // Re-render shelf/workspace when Time Machine date changes
    onTimeMachineChange(() => {
      if (this.workspaceView && !this.workspaceView.classList.contains('hidden')) {
        this.renderWorkspace();
      } else {
        this.render();
      }
    });
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

    // Keyboard shortcuts: Esc to exit zoom / deselect
    window.addEventListener('keydown', (e) => {
      if (!this.workspaceView || this.workspaceView.classList.contains('hidden')) return;

      if (e.key === 'Escape') {
        if (this.zoomedBlockId) {
          this.unzoomBlock();
        } else if (this.isLayoutEditing) {
          this.deselectAllBlocks();
        }
      }
    });
  }

  initLayoutModeEvents() {
    this.btnToggleLayout?.addEventListener('click', () => {
      this.toggleLayoutMode();
    });

    this.btnResetLayout?.addEventListener('click', () => {
      this.resetLayoutToGrid();
    });
  }

  toggleLayoutMode() {
    if (this.isLayoutEditing) {
      this.finishLayoutEditing();
    } else {
      this.startLayoutEditing();
    }
  }

  startLayoutEditing() {
    const page = this.getActivePage();
    if (!page) return;

    this.isLayoutEditing = true;

    if (this.btnToggleLayout) {
      this.btnToggleLayout.textContent = '✓ Done';
      this.btnToggleLayout.classList.add('btn-primary');
    }
    this.btnResetLayout?.classList.remove('hidden');
    this.crossLayout?.classList.add('layout-editing-active');

    // Convert grid-positioned blocks without customLayout to initial rendered pixel coordinates
    const containerRect = this.crossLayout.getBoundingClientRect();
    const cards = this.crossLayout.querySelectorAll('.mf-block-card');
    cards.forEach(card => {
      const key = card.dataset.blockKey;
      if (page.blocks[key] && !page.blocks[key].customLayout) {
        const cardRect = card.getBoundingClientRect();
        const x = Math.round(cardRect.left - containerRect.left);
        const y = Math.round(cardRect.top - containerRect.top);
        const width = Math.round(cardRect.width);
        const height = Math.round(cardRect.height);

        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
        card.style.width = `${width}px`;
        card.style.height = `${height}px`;
        card.classList.add('has-custom-layout');
      }
    });

    // Select the main block by default
    this.selectBlockForEditing('main');
  }

  finishLayoutEditing() {
    const page = this.getActivePage();
    if (page) {
      const cards = this.crossLayout.querySelectorAll('.mf-block-card');
      cards.forEach(card => {
        const key = card.dataset.blockKey;
        if (page.blocks[key]) {
          page.blocks[key].customLayout = {
            x: Math.round(card.offsetLeft),
            y: Math.round(card.offsetTop),
            width: Math.round(card.offsetWidth),
            height: Math.round(card.offsetHeight)
          };
        }
      });

      const note = this.getActiveNote();
      if (note) note.updatedAt = new Date().toISOString();
      storage.scheduleSave();
    }

    this.isLayoutEditing = false;
    if (this.btnToggleLayout) {
      this.btnToggleLayout.textContent = '📐 Edit Layout';
      this.btnToggleLayout.classList.remove('btn-primary');
    }
    this.btnResetLayout?.classList.add('hidden');
    this.crossLayout?.classList.remove('layout-editing-active');
    this.deselectAllBlocks();
    this.renderWorkspace();
  }

  resetLayoutToGrid() {
    if (!confirm('Reset all blocks on this page to the default grid layout?')) return;

    const page = this.getActivePage();
    if (page) {
      Object.keys(page.blocks).forEach(k => {
        delete page.blocks[k].customLayout;
      });
      const note = this.getActiveNote();
      if (note) note.updatedAt = new Date().toISOString();
      storage.scheduleSave();
    }

    this.isLayoutEditing = false;
    if (this.btnToggleLayout) {
      this.btnToggleLayout.textContent = '📐 Edit Layout';
      this.btnToggleLayout.classList.remove('btn-primary');
    }
    this.btnResetLayout?.classList.add('hidden');
    this.crossLayout?.classList.remove('layout-editing-active');
    this.deselectAllBlocks();
    this.renderWorkspace();
  }

  selectBlockForEditing(blockKey) {
    if (!this.isLayoutEditing) return;
    this.deselectAllBlocks();
    this.selectedBlockKey = blockKey;

    const blockCard = this.crossLayout.querySelector(`.mf-block-card[data-block-key="${blockKey}"]`);
    if (!blockCard) return;

    blockCard.classList.add('is-selected');

    // Attach 8 PowerPoint-style resize handles
    const handles = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];
    handles.forEach(dir => {
      const handle = document.createElement('div');
      handle.className = `resize-handle handle-${dir}`;
      handle.dataset.direction = dir;
      this.attachHandleEvents(handle, blockCard);
      blockCard.appendChild(handle);
    });

    // Attach dragging to the block
    this.attachBlockDragEvents(blockCard);
  }

  deselectAllBlocks() {
    this.selectedBlockKey = null;
    if (!this.crossLayout) return;
    this.crossLayout.querySelectorAll('.mf-block-card').forEach(card => {
      card.classList.remove('is-selected');
      card.querySelectorAll('.resize-handle, .resize-dim-badge').forEach(el => el.remove());
    });
  }

  attachHandleEvents(handle, blockCard) {
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = blockCard.offsetLeft;
      const startTop = blockCard.offsetTop;
      const startWidth = blockCard.offsetWidth;
      const startHeight = blockCard.offsetHeight;
      const dir = handle.dataset.direction;

      // Dimension badge showing live width and height
      let badge = blockCard.querySelector('.resize-dim-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'resize-dim-badge';
        blockCard.appendChild(badge);
      }
      badge.textContent = `${startWidth} × ${startHeight} px`;

      const onPointerMove = (moveEv) => {
        const dx = moveEv.clientX - startX;
        const dy = moveEv.clientY - startY;

        let newWidth = startWidth;
        let newHeight = startHeight;
        let newLeft = startLeft;
        let newTop = startTop;

        const MIN_W = 180;
        const MIN_H = 120;

        if (dir.includes('e')) {
          newWidth = Math.max(MIN_W, startWidth + dx);
        } else if (dir.includes('w')) {
          newWidth = Math.max(MIN_W, startWidth - dx);
          newLeft = startLeft + (startWidth - newWidth);
        }

        if (dir.includes('s')) {
          newHeight = Math.max(MIN_H, startHeight + dy);
        } else if (dir.includes('n')) {
          newHeight = Math.max(MIN_H, startHeight - dy);
          newTop = startTop + (startHeight - newHeight);
        }

        blockCard.classList.add('has-custom-layout');
        blockCard.style.left = `${newLeft}px`;
        blockCard.style.top = `${newTop}px`;
        blockCard.style.width = `${newWidth}px`;
        blockCard.style.height = `${newHeight}px`;

        if (badge) {
          badge.textContent = `${Math.round(newWidth)} × ${Math.round(newHeight)} px`;
        }
      };

      const onPointerUp = (upEv) => {
        handle.removeEventListener('pointermove', onPointerMove);
        handle.removeEventListener('pointerup', onPointerUp);
        handle.removeEventListener('pointercancel', onPointerUp);
        try { handle.releasePointerCapture(upEv.pointerId); } catch (_) {}
        badge?.remove();
      };

      handle.addEventListener('pointermove', onPointerMove);
      handle.addEventListener('pointerup', onPointerUp);
      handle.addEventListener('pointercancel', onPointerUp);
    });
  }

  attachBlockDragEvents(blockCard) {
    if (blockCard._hasDragHandler) return;
    blockCard._hasDragHandler = true;

    blockCard.addEventListener('pointerdown', (e) => {
      if (!this.isLayoutEditing) return;
      if (e.target.closest('.resize-handle')) return; // handled by resize handle

      this.selectBlockForEditing(blockCard.dataset.blockKey);

      e.preventDefault();
      blockCard.setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = blockCard.offsetLeft;
      const startTop = blockCard.offsetTop;

      const onPointerMove = (moveEv) => {
        const dx = moveEv.clientX - startX;
        const dy = moveEv.clientY - startY;
        const newLeft = Math.max(0, startLeft + dx);
        const newTop = Math.max(0, startTop + dy);

        blockCard.classList.add('has-custom-layout');
        blockCard.style.left = `${newLeft}px`;
        blockCard.style.top = `${newTop}px`;
      };

      const onPointerUp = (upEv) => {
        blockCard.removeEventListener('pointermove', onPointerMove);
        blockCard.removeEventListener('pointerup', onPointerUp);
        blockCard.removeEventListener('pointercancel', onPointerUp);
        try { blockCard.releasePointerCapture(upEv.pointerId); } catch (_) {}
      };

      blockCard.addEventListener('pointermove', onPointerMove);
      blockCard.addEventListener('pointerup', onPointerUp);
      blockCard.addEventListener('pointercancel', onPointerUp);
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
      const tmDate = getTimeMachineDate();
      let tmClass = '';
      if (tmDate) {
        const isMatch = (note.updatedAt && note.updatedAt.startsWith(tmDate)) || 
                        (note.createdAt && note.createdAt.startsWith(tmDate));
        tmClass = isMatch ? 'time-machine-match' : 'time-machine-dimmed';
      }

      const card = document.createElement('div');
      card.className = `mf-note-card ${tmClass}`;
      const lastEdited = formatDateDMY(note.updatedAt || note.createdAt);
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
    trackSession('mindflow', `${noteId}:0`);
    this.renderWorkspace();
  }

  closeNote() {
    this.currentNoteId = null;
    this.zoomedBlockId = null;
    trackSession('mindflow', 'shelf');
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
    logTimelineEvent('mindflow', 'CREATE', newNote.id, newNote.title, 'New Mind Flow Book');
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
      'Side 1 (Top-Left: Assumptions)',
      'Side 2 (Top-Right: Counter-arguments)',
      'Side 3 (Bottom-Left: Emotional Context)',
      'Side 4 (Bottom-Right: Alternative Hypotheses)'
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
      logTimelineEvent('mindflow', 'CREATE', newPage.id, `Slide ${note.pages.length}`, 'New Mind Flow Slide');
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
    const note = this.getActiveNote();
    if (note && this.currentPageIndex > 0) {
      this.currentPageIndex--;
      this.zoomedBlockId = null;
      trackSession('mindflow', `${this.currentNoteId}:${this.currentPageIndex}`);
      this.renderWorkspace();
    }
  }

  goToNextPage() {
    const note = this.getActiveNote();
    if (note && this.currentPageIndex < note.pages.length - 1) {
      this.currentPageIndex++;
      this.zoomedBlockId = null;
      trackSession('mindflow', `${this.currentNoteId}:${this.currentPageIndex}`);
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

    const tmDate = getTimeMachineDate();

    note.pages.forEach((page, idx) => {
      let tmClass = '';
      if (tmDate) {
        const isMatch = (note.updatedAt && note.updatedAt.startsWith(tmDate)) || 
                        (note.createdAt && note.createdAt.startsWith(tmDate));
        tmClass = isMatch ? 'time-machine-match' : 'time-machine-dimmed';
      }

      const slideItem = document.createElement('div');
      slideItem.className = `slide-thumb ${idx === this.currentPageIndex ? 'active' : ''} ${tmClass}`;
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
    this.crossLayout.className = `mf-cross-grid side-count-${count} ${this.zoomedBlockId ? 'has-zoomed-block' : ''} ${this.isLayoutEditing ? 'layout-editing-active' : ''}`;

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

    // Canvas background click listener: resets focus so Main is on top by default
    const canvasWrap = this.crossLayout.closest('.workspace-canvas-scroll');
    if (canvasWrap && !canvasWrap._hasCanvasListener) {
      canvasWrap._hasCanvasListener = true;
      canvasWrap.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.mf-block-card')) {
          if (this.isLayoutEditing) {
            this.deselectAllBlocks();
          } else {
            this.crossLayout.querySelectorAll('.mf-block-card').forEach(card => {
              card.classList.remove('is-active-focused');
            });
          }
        }
      });
    }

    // If still in layout editing, re-select active block
    if (this.isLayoutEditing && this.selectedBlockKey) {
      this.selectBlockForEditing(this.selectedBlockKey);
    }
  }

  createBlockElement({ blockKey, blockData, isMain, sideIndex, markers, isZoomed }) {
    const blockCard = document.createElement('div');
    blockCard.className = `mf-block-card ${isMain ? 'block-main' : `block-side block-side-${sideIndex}`} ${isZoomed ? 'zoomed-fullscreen' : ''}`;
    blockCard.dataset.blockKey = blockKey;

    // Apply custom layout coordinates if present
    if (blockData.customLayout) {
      blockCard.classList.add('has-custom-layout');
      blockCard.style.left = `${blockData.customLayout.x}px`;
      blockCard.style.top = `${blockData.customLayout.y}px`;
      blockCard.style.width = `${blockData.customLayout.width}px`;
      blockCard.style.height = `${blockData.customLayout.height}px`;
    }

    // Pointer listener for selecting block in layout mode
    blockCard.addEventListener('pointerdown', (e) => {
      if (this.isLayoutEditing) {
        if (!e.target.closest('.resize-handle')) {
          this.selectBlockForEditing(blockKey);
        }
      }
    });

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
      blockData.content = isCloaked(e.target) ? getRealBufferForElement(e.target) : e.target.value;
      const note = this.getActiveNote();
      if (note) note.updatedAt = new Date().toISOString();
      storage.scheduleSave();

      // Debounced telemetry logging
      clearTimeout(this._blockLogTimer);
      this._blockLogTimer = setTimeout(() => {
        const activeNote = this.getActiveNote();
        const activePage = this.getActivePage();
        if (activeNote && activePage) {
          logTimelineEvent('mindflow', 'EDIT', `${activeNote.id}_${activePage.id}_${blockKey}`, `${activeNote.title} (${blockKey})`, blockData.content);
        }
      }, 1500);

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

    // Focus-based stacking (dynamic overlap):
    // By default, Main sits on top. When user clicks into any block to write (Main or Side),
    // that block moves to the front (highest z-index).
    // When focus is lost, layout returns to default state — Main on top.
    const bringToFront = () => {
      if (this.zoomedBlockId) return;
      this.crossLayout.querySelectorAll('.mf-block-card').forEach(card => {
        card.classList.remove('is-active-focused');
      });
      blockCard.classList.add('is-active-focused');
    };

    blockCard.addEventListener('pointerdown', () => {
      bringToFront();
    });

    blockCard.addEventListener('focusin', () => {
      bringToFront();
    });

    blockCard.addEventListener('focusout', () => {
      setTimeout(() => {
        if (!blockCard.contains(document.activeElement)) {
          blockCard.classList.remove('is-active-focused');
        }
      }, 50);
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
