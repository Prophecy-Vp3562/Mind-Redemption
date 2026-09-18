/**
 * Storage Layer using File System Access API & IndexedDB
 * 
 * Provides:
 * - Detection of browser support (Chrome/Edge vs Firefox/Safari)
 * - File picker on first run (Create new file or Open existing JSON file)
 * - IndexedDB persistence for FileSystemFileHandle across browser sessions
 * - Reconnect flow on return visits (permission query & request)
 * - Debounced read/write of a single unified JSON file
 * - Distinct data namespaces for Mind Flow, Note, and Diary
 */

const DB_NAME = 'ThoughtRedemptionDB';
const DB_VERSION = 1;
const STORE_NAME = 'file_handles';
const HANDLE_KEY = 'active_data_file';

// Default initial JSON document structure
export const DEFAULT_WORKSPACE_DATA = {
  version: 1,
  appName: 'Thought Redemption',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  mindFlow: {
    notes: [
      {
        id: 'starter-note-1',
        title: 'Metacognitive Thinking: Welcome & Guide',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pages: [
          {
            id: 'page-1',
            sideBlockCount: 4,
            blocks: {
              main: {
                id: 'main',
                title: 'Core Thesis & Central Thought',
                content: 'Welcome to Mind Flow.\n\nThe central block is your Main Branch ¹. This is where your primary argument, stream-of-consciousness, or core problem statement develops continuously.\n\nNotice the footnote marker ¹ right above? You can insert footnote markers using the "Insert Marker" button or by typing Ctrl+Shift+M. The surrounding side blocks can reference these markers (like "re: ¹") to create parallel metacognitive tracks without fragmenting your central flow ².\n\nDouble-click any block to enter Fullscreen Deep Focus mode. Double-click again or press Esc to return to this overview.',
                markers: ['¹', '²']
              },
              side1: {
                id: 'side1',
                title: 'Assumptions & Biases',
                content: 'Side Block 1 (Top):\nWhat implicit assumptions am I making in the main thesis? Am I anchoring to early conclusions?',
                reference: '¹'
              },
              side2: {
                id: 'side2',
                title: 'Counter-Arguments',
                content: 'Side Block 2 (Right):\nWhat would someone who completely disagrees with my thesis say? How might this fail?',
                reference: '²'
              },
              side3: {
                id: 'side3',
                title: 'Emotional State & Felt Sense',
                content: 'Side Block 3 (Bottom):\nHow do I feel while writing this? Is there anxiety, impatience, or cognitive dissonance?',
                reference: ''
              },
              side4: {
                id: 'side4',
                title: 'Alternative Hypotheses',
                content: 'Side Block 4 (Left):\nWhat is the simplest explanation I have not considered yet?',
                reference: ''
              }
            }
          }
        ]
      }
    ]
  },
  notes: {
    items: [
      {
        id: 'note-starter-1',
        title: 'Welcome to Notes',
        content: 'This is the Note tab — a traditional single-flow note-taking space inspired by Google Keep.\n\nEach note here is a single continuous writing space. It is completely isolated from your Mind Flow workspace.\n\nPin notes, color-code them, search instantly, and let your thoughts autosave straight to your local file.',
        color: '#f8fafc',
        pinned: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]
  },
  diary: {
    entries: []
  }
};

class FileSystemStorage {
  constructor() {
    this.isSupported = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
    this.fileHandle = null;
    this.fileName = null;
    this.data = JSON.parse(JSON.stringify(DEFAULT_WORKSPACE_DATA));
    this.saveTimeout = null;
    this.saveStatusListeners = [];
    this.dataChangeListeners = [];
    this.connectionListeners = [];
    this.isSaving = false;
    this.hasPendingSave = false;
    this.lastSavedAt = null;
  }

  // --- IndexedDB Handle Cache ---
  async getIDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async saveHandleToIDB(handle) {
    try {
      const db = await this.getIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(handle, HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('Failed to save file handle to IndexedDB:', err);
    }
  }

  async getHandleFromIDB() {
    try {
      const db = await this.getIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(HANDLE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('Failed to read file handle from IndexedDB:', err);
      return null;
    }
  }

  async clearHandleFromIDB() {
    try {
      const db = await this.getIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('Failed to clear handle from IDB:', err);
    }
  }

  // --- Initialization & Connection Management ---
  async init() {
    if (!this.isSupported) {
      this.notifyConnection({
        status: 'unsupported',
        message: 'File System Access API is not supported in this browser. Please use Google Chrome, Microsoft Edge, Brave, or another Chromium-based browser for local file access.'
      });
      // Fallback to localStorage so app remains testable
      this.loadFromLocalStorageFallback();
      return;
    }

    const savedHandle = await this.getHandleFromIDB();
    if (!savedHandle) {
      // First run: No file picked yet
      this.notifyConnection({
        status: 'disconnected',
        message: 'No file connected. Please select or create a local storage file to get started.'
      });
      return;
    }

    this.fileHandle = savedHandle;
    this.fileName = savedHandle.name;

    // Check permission
    try {
      const permission = await savedHandle.queryPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        await this.readFromFile();
        this.notifyConnection({
          status: 'connected',
          fileName: this.fileName
        });
      } else {
        // Needs user gesture to requestPermission
        this.notifyConnection({
          status: 'needs_reconnect',
          fileName: this.fileName,
          message: 'Permission required to reconnect to your local file.'
        });
      }
    } catch (err) {
      console.warn('Error checking permission for cached handle:', err);
      this.notifyConnection({
        status: 'needs_reconnect',
        fileName: this.fileName,
        message: 'Could not access file. Click reconnect to restore access.'
      });
    }
  }

  // Reconnect when user clicks "Reconnect"
  async reconnect() {
    if (!this.fileHandle) {
      return this.openFilePicker();
    }
    try {
      const permission = await this.fileHandle.requestPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        await this.readFromFile();
        this.notifyConnection({
          status: 'connected',
          fileName: this.fileName
        });
        return true;
      } else {
        this.notifyConnection({
          status: 'needs_reconnect',
          fileName: this.fileName,
          message: 'Permission denied. Click reconnect to retry or pick a different file.'
        });
        return false;
      }
    } catch (err) {
      console.error('Reconnect error:', err);
      // Handle might be stale (e.g. moved file)
      this.notifyConnection({
        status: 'needs_reconnect',
        fileName: this.fileName,
        message: 'Failed to access file. You may choose a new file.'
      });
      return false;
    }
  }

  // First run: create a brand new file
  async createNewFile() {
    if (!this.isSupported) {
      alert('File System Access API is not supported in this browser.');
      return false;
    }
    try {
      const options = {
        suggestedName: 'thought-redemption-data.json',
        types: [{
          description: 'JSON Data File',
          accept: { 'application/json': ['.json'] }
        }]
      };
      const handle = await window.showSaveFilePicker(options);
      this.fileHandle = handle;
      this.fileName = handle.name;
      await this.saveHandleToIDB(handle);

      // Initialize with default data
      this.data = JSON.parse(JSON.stringify(DEFAULT_WORKSPACE_DATA));
      await this.writeToFileDirectly();

      this.notifyConnection({
        status: 'connected',
        fileName: this.fileName
      });
      this.notifyDataChange();
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false; // User cancelled
      console.error('Error creating file:', err);
      alert('Could not create file: ' + err.message);
      return false;
    }
  }

  // First run or switch file: open existing JSON file
  async openFilePicker() {
    if (!this.isSupported) {
      alert('File System Access API is not supported in this browser.');
      return false;
    }
    try {
      const options = {
        types: [{
          description: 'JSON Data File',
          accept: { 'application/json': ['.json'] }
        }],
        multiple: false
      };
      const [handle] = await window.showOpenFilePicker(options);
      this.fileHandle = handle;
      this.fileName = handle.name;
      await this.saveHandleToIDB(handle);

      await this.readFromFile();
      this.notifyConnection({
        status: 'connected',
        fileName: this.fileName
      });
      this.notifyDataChange();
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false; // User cancelled
      console.error('Error opening file:', err);
      alert('Could not open file: ' + err.message);
      return false;
    }
  }

  // Disconnect / change file
  async disconnect() {
    this.fileHandle = null;
    this.fileName = null;
    await this.clearHandleFromIDB();
    this.notifyConnection({
      status: 'disconnected',
      message: 'File disconnected. Please select or create a local storage file.'
    });
  }

  // --- Read & Write ---
  async readFromFile() {
    if (!this.fileHandle) return;
    try {
      this.notifySaveStatus('reading', 'Loading data from local file...');
      const file = await this.fileHandle.getFile();
      const text = await file.text();
      if (!text || !text.trim()) {
        // Empty file, initialize with default data
        this.data = JSON.parse(JSON.stringify(DEFAULT_WORKSPACE_DATA));
        await this.writeToFileDirectly();
      } else {
        const parsed = JSON.parse(text);
        // Merge with defaults to ensure all keys exist
        this.data = {
          ...DEFAULT_WORKSPACE_DATA,
          ...parsed,
          mindFlow: parsed.mindFlow || { notes: [] },
          notes: parsed.notes || { items: [] },
          diary: parsed.diary || { entries: [] }
        };
      }
      this.mirrorToLocalStorage();
      this.notifySaveStatus('saved', 'Synced with local file');
      this.notifyDataChange();
    } catch (err) {
      console.error('Error reading JSON from file:', err);
      this.notifySaveStatus('error', 'Failed to read file: ' + err.message);
    }
  }

  // Immediate write to file
  async writeToFileDirectly() {
    if (!this.fileHandle) {
      this.mirrorToLocalStorage();
      return;
    }
    try {
      this.isSaving = true;
      this.notifySaveStatus('saving', 'Saving to file...');
      this.data.updatedAt = new Date().toISOString();
      const jsonString = JSON.stringify(this.data, null, 2);

      const writable = await this.fileHandle.createWritable();
      await writable.write(jsonString);
      await writable.close();

      this.mirrorToLocalStorage();
      this.isSaving = false;
      this.lastSavedAt = new Date();
      const timeStr = this.lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      this.notifySaveStatus('saved', `Saved at ${timeStr}`);

      if (this.hasPendingSave) {
        this.hasPendingSave = false;
        this.scheduleSave(50);
      }
    } catch (err) {
      this.isSaving = false;
      console.error('Error writing to file:', err);
      this.notifySaveStatus('error', 'Save error: ' + err.message);
      // Fallback save to localStorage to ensure no data loss
      this.mirrorToLocalStorage();
    }
  }

  // Debounced autosave (Section 7.4)
  scheduleSave(delay = 400) {
    this.notifySaveStatus('pending', 'Unsaved changes...');
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(async () => {
      if (this.isSaving) {
        this.hasPendingSave = true;
        return;
      }
      await this.writeToFileDirectly();
    }, delay);
  }

  // LocalStorage mirroring for safety & fallback
  mirrorToLocalStorage() {
    try {
      localStorage.setItem('thought_redemption_mirror_data', JSON.stringify(this.data));
    } catch (err) {
      // Storage quota exceeded or disabled
    }
  }

  loadFromLocalStorageFallback() {
    try {
      const raw = localStorage.getItem('thought_redemption_mirror_data');
      if (raw) {
        this.data = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Could not read fallback from localStorage:', err);
    }
    this.notifyDataChange();
  }

  // --- Namespace Accessors ---
  getMindFlowData() {
    if (!this.data.mindFlow) this.data.mindFlow = { notes: [] };
    return this.data.mindFlow;
  }

  getNotesData() {
    if (!this.data.notes) this.data.notes = { items: [] };
    return this.data.notes;
  }

  getDiaryData() {
    if (!this.data.diary) this.data.diary = { entries: [] };
    return this.data.diary;
  }

  // --- Event Subscriptions ---
  onConnectionChange(listener) {
    this.connectionListeners.push(listener);
  }

  onSaveStatus(listener) {
    this.saveStatusListeners.push(listener);
  }

  onDataChange(listener) {
    this.dataChangeListeners.push(listener);
  }

  notifyConnection(info) {
    this.connectionListeners.forEach(fn => fn(info));
  }

  notifySaveStatus(status, message) {
    this.saveStatusListeners.forEach(fn => fn({ status, message, time: new Date() }));
  }

  notifyDataChange() {
    this.dataChangeListeners.forEach(fn => fn(this.data));
  }
}

export const storage = new FileSystemStorage();
