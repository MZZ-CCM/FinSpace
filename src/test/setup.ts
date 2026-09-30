// Browser APIs jsdom doesn't provide. Only applied in UI (jsdom) test files.
if (typeof window !== 'undefined') {
  class RO { observe() {} unobserve() {} disconnect() {} }
  window.ResizeObserver = window.ResizeObserver ?? (RO as unknown as typeof ResizeObserver)
  window.matchMedia = window.matchMedia ?? ((q: string) => ({
    // behave as "prefers reduced motion" so animated numbers settle immediately
    matches: q.includes('reduce'), media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }) as unknown as MediaQueryList)
  window.scrollTo = () => {}
  Element.prototype.scrollIntoView = function () {}
}
