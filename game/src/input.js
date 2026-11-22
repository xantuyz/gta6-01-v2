// input.js — keyboard + mouse-drag state.
// A tap is queued in `justPressed` so it still lands when the frame rate
// is low (headless / weak machines) and the keyup arrives before the next
// frame reads the key.
export function createInput() {
  const keys = new Set();
  const justPressed = new Set();
  const input = { keys, justPressed, camDragX: 0, camDragY: 0, wheel: 0 };
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys.add(e.key.toLowerCase());
    justPressed.add(e.key.toLowerCase());
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  const canvas = document.getElementById('scene');
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    input.camDragX += e.clientX - lastX;
    input.camDragY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvas.addEventListener('wheel', (e) => { input.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
  return input;
}

// -1 / 0 / +1 from a pair of keys (negative key, positive key).
export function axis(input, neg, pos) {
  return (input.keys.has(pos) ? 1 : 0) - (input.keys.has(neg) ? 1 : 0);
}

// True once per physical press; consumes the queued press.
export function pressed(input, key) {
  if (!input.justPressed.has(key)) return false;
  input.justPressed.delete(key);
  return true;
}
