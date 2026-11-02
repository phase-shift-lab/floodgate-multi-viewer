import '@testing-library/jest-dom/vitest';

// jsdom does not implement the native modal lifecycle; browser E2E covers focus/inertness.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value() { this.setAttribute('open',''); } },
  close: { configurable: true, value() { this.removeAttribute('open'); } },
});

class MatchMediaMock {
  matches = false;
  media = '';
  onchange = null;
  addListener() {}
  removeListener() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return true; }
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => new MatchMediaMock(),
});
