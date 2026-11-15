import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Remplacements demandés par mantine.dev (guide « Vitest ») : jsdom n'a pas ces API.
// Le second argument (pseudo-élément) n'est pas géré par jsdom : on l'ignore.
const originalGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element) => originalGetComputedStyle(element);

HTMLElement.prototype.scrollIntoView = () => undefined;

window.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => undefined,
  removeListener: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
});

class ResizeObserverStub {
  observe(): void {
    return undefined;
  }
  unobserve(): void {
    return undefined;
  }
  disconnect(): void {
    return undefined;
  }
}
window.ResizeObserver = ResizeObserverStub;

if (!("fonts" in document)) {
  Object.defineProperty(document, "fonts", {
    value: {
      ready: Promise.resolve(),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
}

// Sans `globals: true`, Testing Library ne nettoie pas le DOM tout seul.
afterEach(cleanup);
