/**
 * T221 — FR-028's wall-clock bound, armed by the parent, unconditionally
 * `SIGKILL`able.
 *
 * research.md, verbatim: "Timeout is enforced by the parent, not by the
 * child: the parent arms a timer and SIGKILLs on expiry, so a capability
 * cannot defeat its own deadline with a tight loop." A capability blocking
 * its own event loop with `while (true) {}` cannot starve *this* timer —
 * it lives in a different OS process with its own event loop, entirely
 * unaffected by whatever the child is or isn't doing. `SIGKILL` (not
 * `SIGTERM`) is deliberate: it cannot be caught, deferred, or ignored by
 * anything running in the child, including a capability that installed its
 * own signal handler to try to survive.
 */
import type { ChildProcess } from 'node:child_process';

export interface ArmedTimeout {
  /** Call once the child has responded on its own — stops the timer from ever firing. */
  readonly cancel: () => void;
}

export function armTimeout(
  child: ChildProcess,
  wallClockMs: number,
  onTimeout: () => void,
): ArmedTimeout {
  let fired = false;
  const timer = setTimeout(() => {
    fired = true;
    child.kill('SIGKILL');
    onTimeout();
  }, wallClockMs);
  // Never hold the host process open on a request that has already finished
  // by the time this timer would fire.
  timer.unref?.();

  return {
    cancel: () => {
      if (!fired) clearTimeout(timer);
    },
  };
}
