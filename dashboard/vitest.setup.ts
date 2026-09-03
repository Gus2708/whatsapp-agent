import '@testing-library/jest-dom/vitest';

// jsdom does not implement matchMedia. ChatWindow reads it to respect
// prefers-reduced-motion when auto-scrolling; stub it so mounting doesn't throw.
// jsdom does not implement scrollIntoView either; ChatWindow calls it on every new message.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}
