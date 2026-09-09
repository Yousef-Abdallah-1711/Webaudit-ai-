/**
 * A real jsdom mount for the handful of admin-page tests that need
 * `useEffect` to actually fire — `renderToStaticMarkup` (every other admin
 * test in this suite) never runs effects, so it can only prove the pre-data
 * shell, not the loading/error/401/403 rendering path a real page reaches
 * after its fetch settles. Import only from a test file carrying the
 * `// @vitest-environment jsdom` pragma; `document` does not exist otherwise.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactElement } from 'react';

// React's `act` warns ("not configured to support act") without this global —
// it still ran correctly in practice, but the flag is what React's own testing
// docs specify, and leaving it unset risks a future React version treating it
// as a hard requirement rather than a warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface ClientRender {
  /** Current rendered HTML, after whatever effects/promises `act` has flushed. */
  html(): string;
  unmount(): void;
}

/**
 * Mounts `element`, awaiting one `act` pass so a `useEffect`'s fetch promise
 * (and the state update once it settles) has already happened by the time
 * this resolves — one await is enough because the mocked API calls in these
 * tests resolve/reject in a single microtask, matching how a real `fetch`
 * promise settles from the caller's perspective.
 */
export async function renderClient(element: ReactElement): Promise<ClientRender> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(element);
    // Gives a fetch mock's promise (and the effect's subsequent setState)
    // one microtask to settle before `act` considers the work done.
    await Promise.resolve();
  });
  return {
    html: () => container.innerHTML,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}
