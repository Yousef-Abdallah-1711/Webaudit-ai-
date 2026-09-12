/**
 * T220 — the `CodeLayerContext` an untrusted capability receives, built
 * ENTIRELY inside the capability's own `vm.Context` (`load.ts`'s
 * `context`) — not a host-realm object handed across the call boundary.
 *
 * **Why this changed from a plain host-realm object to a script executed
 * inside the sandbox.** The original version of this file built a normal
 * TypeScript object (`{ fetch: () => rejects(), ... }`) in this module's
 * own host-realm code and passed it as `capability.runCodeLayer`'s second
 * argument. An adversarial review of this task found that *any* host-realm
 * function crosses the boundary carrying its own prototype chain: a
 * capability calling `ctx.fetch.constructor.constructor('return
 * process')()` reached the real host `process` through `ctx.fetch`'s own
 * `.constructor`, completely independent of `load.ts`'s global-object fix
 * (which only closes the escape through the *global object's* prototype,
 * not through function arguments). Confirmed empirically, twice over —
 * see `load.ts`'s module note for the full account.
 *
 * The fix: every function on this object — `fetch`, `withPage`,
 * `readFile`, `glob`, and the inert `signal` stub's methods — is defined
 * by a `vm.Script` run *inside* the same `context` the capability itself
 * lives in, so each one's `.constructor` chain is rooted there from the
 * moment it is created. `contracts/realtime-and-internal.md` §3 already
 * documents that "`CodeLayerContext` is unavailable to untrusted
 * capabilities... pure functions over supplied evidence" — this is that
 * unavailability, now actually enforced rather than merely modelled by an
 * object that happened to only reject.
 *
 * **Logging and `signal` are honest reductions, not silent gaps.** A
 * legitimate capability's `ctx.logger` calls and `ctx.signal` checks are
 * dropped inside the sandbox rather than forwarded to the parent: a
 * forwarding callback would itself be a host-realm function crossing the
 * boundary, reopening the identical hole. `signal` is a static, always-
 * unaborted stub (a cooperative capability checking `ctx.signal.aborted`
 * never sees a false negative that would make it behave unsafely — it
 * simply never observes an early abort while sandboxed) — the *actual*
 * enforcement of a deadline is `limits/timeout.ts`'s parent-armed
 * `SIGKILL`, which was always the real mechanism and never depended on a
 * capability's own cooperation with `ctx.signal` in the first place.
 * `logger` calls are silently discarded; nothing about this reachable
 * capability surface (an inert context object) has anything worth an
 * operator watching for in real time the way a genuine finding does — a
 * legitimate capability's actual output is its returned findings, not its
 * log lines.
 */
import { Script, type Context } from 'node:vm';
import type { CodeLayerContext } from '@webaudit/capability-sdk';

const UNAVAILABLE =
  'ctx is unavailable to a sandboxed capability — everything it needs must be ' +
  'supplied as input data (contracts/realtime-and-internal.md §3).';

const BUILD_SCRIPT_SOURCE = `(function (message) {
  function rejects() {
    return Promise.reject(new Error(message));
  }
  return {
    fetch: rejects,
    withPage: rejects,
    readFile: rejects,
    glob: rejects,
    logger: {
      debug: function () {},
      info: function () {},
      warn: function () {},
      error: function () {},
    },
    signal: {
      aborted: false,
      onabort: null,
      addEventListener: function () {},
      removeEventListener: function () {},
      throwIfAborted: function () {},
    },
  };
})`;

export function buildSandboxedContext(context: Context): CodeLayerContext {
  const build = new Script(BUILD_SCRIPT_SOURCE).runInContext(context) as (
    message: string,
  ) => unknown;
  return build(UNAVAILABLE) as CodeLayerContext;
}

/**
 * The vm-native equivalent of `@webaudit/capability-sdk`'s
 * `checkCanRunPure`'s default trap — supplied to `runConformanceSuite` via
 * `ConformanceDeps.buildCanRunTrap` (see that function's own module note
 * for why the default, host-realm Proxy is unsafe to hand a sandboxed
 * capability). Built by one `vm.Script` executed inside `context`: the
 * `Proxy`, its handler, and the array recording touched property names are
 * all constructed by that same realm's own intrinsics, so `trap`'s
 * `.constructor` chain has nothing to walk back to the host with — the
 * identical property the rest of this file relies on. Reading
 * `touched()`'s returned array from host code afterward (`.length`,
 * `.join`) is safe: those are pure, side-effect-free operations on the
 * array's own data, not a call into anything the capability controls.
 */
const BUILD_TRAP_SCRIPT_SOURCE = `(function () {
  var touched = [];
  var trap = new Proxy({}, {
    get: function (_target, property) {
      touched.push(String(property));
      return function () {
        throw new Error('canRun must not use ctx.' + String(property));
      };
    },
  });
  return { trap: trap, touched: function () { return touched; } };
})`;

export function buildSandboxedCanRunTrap(context: Context): {
  readonly trap: object;
  readonly touched: () => readonly string[];
} {
  const build = new Script(BUILD_TRAP_SCRIPT_SOURCE).runInContext(context) as () => {
    readonly trap: object;
    readonly touched: () => readonly string[];
  };
  return build();
}
