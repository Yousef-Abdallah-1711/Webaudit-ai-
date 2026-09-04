/**
 * T220 — compiles an uploaded capability bundle into a callable
 * `AuditCapability`, inside a fresh `vm.Context` with no globals beyond
 * what this file explicitly grants, and no way for ANY value — not just
 * the global object, but every argument ever passed into the capability's
 * own methods — to hand it a live reference back to the host realm.
 *
 * **The bundle format this session defines** (none existed before it —
 * `contracts/realtime-and-internal.md` only types `capabilityBundle` as
 * `Uint8Array`, leaving its internal shape open): UTF-8 JS source whose
 * *completion value* — the value of its last-evaluated expression, the same
 * thing a REPL echoes — is the `AuditCapability`-shaped object. No module
 * system, no `export default`, nothing to resolve: `vm.Script.runInContext`
 * already returns exactly that value, so the object arrives with zero
 * additional plumbing. See `tests/fixtures/hostile-capability/index.js` for
 * what a bundle actually looks like (an object literal in parens).
 *
 * **Two escapes, not one — both found by an adversarial review of this
 * task, both closed here, and the second only after the first fix alone
 * turned out not to be enough.**
 *
 * *First escape*: `vm.createContext({})` — a plain object literal, created
 * by this file's own host-realm code — leaves that object's own
 * `[[Prototype]]` pointing at the *host* realm's `Object.prototype`. Bare
 * identifiers (`require`, `process`, `fetch`) genuinely resolve to nothing
 * inside the context, but a capability walking the prototype chain instead
 * — `this.constructor.constructor('return process')()`, the textbook
 * `vm`-escape — reaches the host's real `Function` constructor through the
 * *global object's own* inherited `.constructor`. Fixed by giving the
 * global object `Object.create(null)` instead: no inherited `.constructor`,
 * nothing to walk. `research.md`'s R1 already rejects `node:vm` on exactly
 * this ground ("trivially escaped via prototype access to host
 * constructors") — that rejection turned out to apply here too, until this
 * fix made it not.
 *
 * *Second escape, found testing the first fix*: the *global object's* own
 * prototype was not the only path. **Any host-realm value passed as a
 * function argument into vm-context code carries its own prototype chain
 * with it, independent of the global object entirely.** A plain data
 * object built by ordinary `{}` object-literal host code — exactly what
 * `request.input` (`CapabilityInput`) is — still resolves
 * `arg.constructor.constructor('return process')()` to the host's real
 * `Function`, proven empirically even with the first fix already in
 * place. There is no argument-level "null prototype" flag for
 * `vm.Script.runInContext`'s return value being *called* with host-realm
 * arguments — the only real fix is to never let a host-realm object cross
 * that call boundary at all. `cloneIntoContext` below re-parses any
 * JSON-serialisable value *through the target context's own `JSON`
 * global* (confirmed a genuinely separate intrinsic from the host's), so
 * the resulting object's prototype chain is rooted in that context from
 * the start — not host data with the escape patched after the fact.
 * `context.ts`'s `buildSandboxedContext` builds the entire
 * `CodeLayerContext` object *inside* this same context for the identical
 * reason — a `ctx.fetch` that were a host-realm function would reopen the
 * exact same hole through *its own* `.constructor` chain, confirmed
 * empirically too.
 *
 * This is the **language boundary** (research.md's third of three nested
 * boundaries) — now actually one. The **process boundary** —
 * `--permission` with no `--allow-fs-*`/`--allow-child-process`/
 * `--allow-worker` — remains the backstop if some vector not yet found
 * defeats this one: even a `require('node:fs')` that somehow resolved
 * would still hit `ERR_ACCESS_DENIED` at the syscall, a check that does
 * not depend on which realm the calling code originated in.
 */
import { Script, createContext, type Context } from 'node:vm';
import type { AuditCapability } from '@webaudit/capability-sdk';

export class BundleInvalidError extends Error {
  override readonly name = 'BundleInvalidError';
}

function describeThrown(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    const name = (value as { name?: unknown }).name;
    const message = (value as { message?: unknown }).message;
    if (typeof name === 'string' && typeof message === 'string') return `${name}: ${message}`;
  }
  return String(value);
}

export interface LoadedCapability {
  readonly capability: AuditCapability;
  /** The exact realm the capability lives in — every further value handed to it must be built through this, never a host-realm object. */
  readonly context: Context;
}

export function loadCapabilityFromBundle(bundleBytes: Uint8Array): LoadedCapability {
  const source = Buffer.from(bundleBytes).toString('utf8');

  let script: Script;
  try {
    script = new Script(source, { filename: 'capability-bundle.js' });
  } catch (error) {
    throw new BundleInvalidError(`bundle failed to parse: ${describeThrown(error)}`);
  }

  // `Object.create(null)`, not `{}` — see the module note's "first escape".
  // Nothing is granted beyond the bare ECMAScript intrinsics every realm
  // gets for free; not even `console` (granting it reopens the identical
  // hole through `console.log`'s own `.constructor` chain — confirmed
  // empirically, not assumed).
  const sandboxGlobal: object = Object.create(null) as object;
  const context = createContext(sandboxGlobal);

  let result: unknown;
  try {
    result = script.runInContext(context);
  } catch (error) {
    throw new BundleInvalidError(`bundle threw while evaluating: ${describeThrown(error)}`);
  }

  if (typeof result !== 'object' || result === null) {
    throw new BundleInvalidError('bundle did not evaluate to an object');
  }
  const candidate = result as Partial<AuditCapability>;
  if (typeof candidate.id !== 'string' || candidate.id === '') {
    throw new BundleInvalidError('bundle object has no string id');
  }
  if (typeof candidate.canRun !== 'function') {
    throw new BundleInvalidError('bundle object has no canRun function');
  }
  return { capability: candidate as AuditCapability, context };
}

/**
 * Re-parses `value` through `context`'s *own* `JSON.parse` — see the
 * module note's "second escape". The result's prototype chain is rooted in
 * `context` from the moment it is created, not host data patched
 * afterward. `value` must be JSON-serialisable (`CapabilityInput` and
 * `ReverifyRequest` both are, by the same "plain data only" contract
 * `protocol.ts` documents) — anything that isn't throws here, loudly,
 * rather than silently passing a host-realm object through.
 */
export function cloneIntoContext(context: Context, value: unknown): unknown {
  const json = JSON.stringify(value ?? null);
  // The literal is embedded as a JSON string inside the script source
  // itself (round-tripped through `JSON.stringify` again, so it is always
  // a syntactically valid string literal regardless of what characters
  // `json` contains) and parsed by `context`'s own `JSON`, not the host's.
  const parseScript = new Script(`JSON.parse(${JSON.stringify(json)})`);
  return parseScript.runInContext(context);
}
