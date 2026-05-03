const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;
const appWindow = getCurrentWindow();

// ── State ──
let notes = [];
let currentIndex = 0;
let saveTimeout = null;
let animating = false;

// ── DOM ──
const canvas = document.getElementById('note-canvas');
const container = document.getElementById('canvas-container');
const indicator = document.getElementById('note-indicator');

// ── Load & Render ──

async function loadNotes() {
  notes = await invoke('list_notes');
  if (notes.length === 0) {
    const note = await invoke('create_note');
    notes = [note];
  }
  currentIndex = 0;
  renderCurrentNote(false);
}

function renderCurrentNote(animate) {
  if (animate) return; // animated transitions handle their own rendering
  canvas.value = notes[currentIndex]?.content || '';
  updateIndicator();
}

function updateIndicator() {
  if (notes.length <= 1) {
    indicator.classList.remove('visible');
    indicator.innerHTML = '';
    return;
  }

  indicator.classList.add('visible');

  if (notes.length <= 12) {
    let html = '';
    for (let i = 0; i < notes.length; i++) {
      html += `<div class="dot${i === currentIndex ? ' active' : ''}"></div>`;
    }
    indicator.innerHTML = html;
  } else {
    indicator.innerHTML = `<span style="font-size:11px;color:rgba(0,0,0,0.3);font-family:sans-serif;">${currentIndex + 1} / ${notes.length}</span>`;
  }
}

// ── Save ──

function saveCurrentNote() {
  const note = notes[currentIndex];
  if (!note) return;
  const content = canvas.value;
  notes[currentIndex].content = content;
  invoke('save_note', { id: note.id, content });
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveCurrentNote(), 300);
}

// ── Animation helper ──

function animateSwap(outClass, inClass, newContent) {
  return new Promise((resolve) => {
    animating = true;

    // Phase 1: slide out
    canvas.classList.add(outClass);

    setTimeout(() => {
      // Swap content while invisible
      canvas.value = newContent;
      canvas.scrollTop = 0;

      // Phase 2: slide in from opposite side
      canvas.classList.remove(outClass);
      canvas.classList.add(inClass);

      // Force reflow so the browser registers the starting position
      canvas.offsetHeight;

      // Remove the incoming class — transition animates to default (opacity 1, translate 0)
      canvas.classList.remove(inClass);

      setTimeout(() => {
        animating = false;
        canvas.focus();
        resolve();
      }, 200);
    }, 150);
  });
}

// ── Delete empty note helper ──

async function deleteIfEmpty() {
  const content = canvas.value.trim();
  if (content === '' && notes.length > 1) {
    const note = notes[currentIndex];
    await invoke('delete_note', { id: note.id });
    notes.splice(currentIndex, 1);
    // Clamp index
    if (currentIndex >= notes.length) currentIndex = notes.length - 1;
    return true;
  }
  return false;
}

// ── Slide ──

async function slideToNext() {
  if (animating) return;

  const deleted = await deleteIfEmpty();

  if (deleted) {
    // Deleted current empty note — just show whatever is now at currentIndex
    await animateSwap('slide-left-out', 'slide-left-in', notes[currentIndex].content);
    updateIndicator();
    return;
  }

  if (currentIndex >= notes.length - 1) {
    saveCurrentNote();
    const newNote = await invoke('create_note');
    notes.push(newNote);
    currentIndex = notes.length - 1;
    await animateSwap('slide-left-out', 'slide-left-in', '');
  } else {
    saveCurrentNote();
    currentIndex++;
    await animateSwap('slide-left-out', 'slide-left-in', notes[currentIndex].content);
  }

  updateIndicator();
}

async function slideToPrev() {
  if (animating || currentIndex <= 0) return;

  const deleted = await deleteIfEmpty();

  if (deleted) {
    // Index already shifted left by splice — show current
    await animateSwap('slide-right-out', 'slide-right-in', notes[currentIndex].content);
    updateIndicator();
    return;
  }

  saveCurrentNote();
  currentIndex--;
  await animateSwap('slide-right-out', 'slide-right-in', notes[currentIndex].content);
  updateIndicator();
}

// ── Swipe Gesture (trackpad two-finger) ──

let accumulatedX = 0;
let gestureTimer = null;
let gestureLocked = false;
const SWIPE_THRESHOLD = 80;
const GESTURE_TIMEOUT = 200;

container.addEventListener('wheel', (e) => {
  e.preventDefault();

  if (gestureLocked || animating) return;

  accumulatedX += e.deltaX;

  if (gestureTimer) clearTimeout(gestureTimer);
  gestureTimer = setTimeout(() => {
    accumulatedX = 0;
    gestureLocked = false;
  }, GESTURE_TIMEOUT);

  if (Math.abs(accumulatedX) >= SWIPE_THRESHOLD) {
    gestureLocked = true;
    if (accumulatedX > 0) {
      slideToNext();
    } else {
      slideToPrev();
    }
    accumulatedX = 0;

    setTimeout(() => {
      gestureLocked = false;
    }, 400);
  }
}, { passive: false });

// ── Keyboard shortcuts ──

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
    if (e.key === ']') { e.preventDefault(); slideToNext(); }
    if (e.key === '[') { e.preventDefault(); slideToPrev(); }
  }
});

// ── Init ──

window.addEventListener('DOMContentLoaded', () => {
  loadNotes();
  canvas.addEventListener('input', scheduleSave);

  document.getElementById('btn-minimize')?.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    appWindow.minimize();
  });
  document.getElementById('btn-maximize')?.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    appWindow.toggleMaximize();
  });
  document.getElementById('btn-close')?.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    appWindow.close();
  });
});
