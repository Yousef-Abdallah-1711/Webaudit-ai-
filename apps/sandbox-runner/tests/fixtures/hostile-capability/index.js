/**
 * T217 — SC-017's hostile fixture: a capability attempting, one vector per
 * export, the six prohibited accesses `contracts/realtime-and-internal.md`
 * §3 names in order: filesystem read, filesystem write, outbound
 * connection, environment read, process spawn, and unbounded allocation.
 *
 * Each export is a STRING of JS source, not a JS value — this is the bundle
 * format `child-harness/load.ts` defines for this session (no format
 * existed before it; see that file's own module note): a `vm.Script`
 * whose *completion value* is the `AuditCapability`-shaped object, so the
 * harness never needs a module system inside the sandboxed realm at all.
 * Wrapped in parens (`({...})`) because a bare object-literal statement is
 * ambiguous with a block statement to the parser.
 *
 * **Deliberately does NOT catch its own attempts.** An earlier draft of
 * this fixture wrapped each vector in its own try/catch and returned a
 * normal, successful finding describing what happened — which proved only
 * that a *cooperative* hostile capability's own error handling worked, not
 * that the sandbox itself is what stops an escape. A careless or genuinely
 * adversarial capability has no obligation to catch anything. So each
 * vector below just attempts the action and lets whatever happens happen:
 * `child-harness/harness.ts`'s `classifyEscapeAttempt` is what turns the
 * resulting `ReferenceError`/`ERR_ACCESS_DENIED` into the response-level
 * `FORBIDDEN_ACCESS` `contracts/realtime-and-internal.md` §3 names — the
 * *sandbox's* classification, not the capability's own self-report. The
 * five non-allocation vectors are expected to throw a `ReferenceError`:
 * `require`, `process`, `fetch` are simply not present as globals inside
 * the sandboxed `vm.Context` (there is nothing to poison, because nothing
 * is there) — a *real* escape (the reference resolving to something real)
 * would surface as a normal, successful response instead, exactly as
 * visible to the test as a blocked one, never silently swallowed.
 * `--permission` (the process boundary) is the second, independent
 * backstop if the language boundary is ever defeated: even a
 * `require('node:fs')` that somehow resolved would still hit
 * `ERR_ACCESS_DENIED` at the syscall, which is classified the same way.
 *
 * The sixth vector, `allocationBomb`, can't be caught by anyone at all —
 * a V8 "FATAL ERROR: reached heap limit, JavaScript heap out of memory" is
 * a process-terminating abort, not a catchable exception. That is why this
 * vector is asserted differently in the test: the host detects the
 * child's abnormal exit rather than receiving any response from it.
 */

const HEADER = (id) => `({
  id: ${JSON.stringify(id)},
  module: 'SECURITY',
  layer: 'CODE',
  canRun: () => true,
  runCodeLayer: async () => {`;

const FOOTER = `
  }
})`;

export const FS_READ_SOURCE = `${HEADER('hostile-fs-read')}
    const data = require('node:fs').readFileSync('/etc/passwd', 'utf8');
    return [{ checkId: 'hostile-fs-read', fingerprintParts: ['hostile-fs-read'], severity: 'INFO',
      title: 'ESCAPED', description: 'read ' + String(data.length) + ' bytes', fixable: false }];${FOOTER}`;

export const FS_WRITE_SOURCE = `${HEADER('hostile-fs-write')}
    require('node:fs').writeFileSync('/tmp/hostile-write-probe', 'x');
    return [{ checkId: 'hostile-fs-write', fingerprintParts: ['hostile-fs-write'], severity: 'INFO',
      title: 'ESCAPED', description: 'write succeeded', fixable: false }];${FOOTER}`;

export const NETWORK_SOURCE = `${HEADER('hostile-network')}
    const res = await fetch('http://169.254.169.254/latest/meta-data/');
    return [{ checkId: 'hostile-network', fingerprintParts: ['hostile-network'], severity: 'INFO',
      title: 'ESCAPED', description: 'fetch resolved with status ' + String(res.status), fixable: false }];${FOOTER}`;

export const ENV_READ_SOURCE = `${HEADER('hostile-env-read')}
    const v = process.env.PATH;
    return [{ checkId: 'hostile-env-read', fingerprintParts: ['hostile-env-read'], severity: 'INFO',
      title: 'ESCAPED', description: 'read PATH (' + String(v) + ')', fixable: false }];${FOOTER}`;

export const PROCESS_SPAWN_SOURCE = `${HEADER('hostile-process-spawn')}
    require('node:child_process').spawnSync('node', ['--version']);
    return [{ checkId: 'hostile-process-spawn', fingerprintParts: ['hostile-process-spawn'], severity: 'INFO',
      title: 'ESCAPED', description: 'spawn succeeded', fixable: false }];${FOOTER}`;

/**
 * Not caught, not catchable — see the module note. This never returns; the
 * child process aborts on the V8 heap ceiling before this promise settles.
 */
export const ALLOCATION_BOMB_SOURCE = `${HEADER('hostile-allocation-bomb')}
    const bomb = [];
    while (true) {
      bomb.push(new Array(1e6).fill('x'));
    }${FOOTER}`;

/**
 * The classic `vm`-module escape: walk `this.constructor.constructor` (or
 * any object's `.constructor.constructor`) back to the host's real
 * `Function` constructor, then compile and run arbitrary code with it. Not
 * one of the contract's six named vectors, but an adversarial review of
 * this task found it defeats a naive `vm.Context` completely — this
 * fixture is what proved the fix (a `null`-prototype global object, plus
 * every value ever handed to the capability being constructed inside its
 * own context — see `load.ts`/`context.ts`'s module notes) actually closes
 * it. Attempts to read a real PID (proof of a real, live host `process`
 * reference, not just an absence of a thrown error) rather than anything
 * more destructive — the point is proving the reference is reachable at
 * all, not what could be done with it once it is.
 */
export const CONSTRUCTOR_CHAIN_SOURCE = `${HEADER('hostile-constructor-chain')}
    const realProcess = this.constructor.constructor('return process')();
    return [{ checkId: 'hostile-constructor-chain', fingerprintParts: ['hostile-constructor-chain'],
      severity: 'INFO', title: 'ESCAPED', description: 'reached real pid ' + String(realProcess.pid), fixable: false }];${FOOTER}`;

/** The same escape attempt, reachable via a capability's `reverify` instead of `runCodeLayer` — no separate defence exists for one and not the other, so this proves it, rather than assuming it. */
export const CONSTRUCTOR_CHAIN_REVERIFY_SOURCE = `({
  id: 'hostile-constructor-chain-reverify',
  module: 'SECURITY',
  layer: 'CODE',
  canRun: () => true,
  reverify: async () => {
    const realProcess = this.constructor.constructor('return process')();
    return { outcome: 'FAILED', evidence: { escaped: true, pid: realProcess.pid } };
  },
})`;

/** A benign capability — used to prove the host survives the six attempts above. */
export const BENIGN_SOURCE = `({
  id: 'benign-probe',
  module: 'SECURITY',
  layer: 'CODE',
  canRun: () => true,
  runCodeLayer: async () => ([{
    checkId: 'benign-probe',
    fingerprintParts: ['benign-probe'],
    severity: 'INFO',
    title: 'benign probe ran',
    description: 'the host is still alive',
    fixable: false,
  }]),
})`;

export const HOSTILE_SOURCES = {
  fsRead: FS_READ_SOURCE,
  fsWrite: FS_WRITE_SOURCE,
  network: NETWORK_SOURCE,
  envRead: ENV_READ_SOURCE,
  processSpawn: PROCESS_SPAWN_SOURCE,
  allocationBomb: ALLOCATION_BOMB_SOURCE,
};
