/**
 * T222 — FR-028's memory bound.
 *
 * **What this actually enforces, stated precisely rather than assumed.**
 * `--max-old-space-size` is a V8 heap ceiling, not a `cgroup`/`ulimit` OS
 * memory limit — this repository's own development machine (Windows) has
 * no portable equivalent of `ulimit -v` that `child_process.spawn`/`fork`
 * can reach directly, and the OS-level enforcement research.md's own words
 * ("Memory is capped at the OS level") most literally describe belongs one
 * layer further out: a container memory `cgroup` on the real deployment
 * (Session 8's `T225`, `infrastructure/sandbox-runner.md`), the same way a
 * Docker `--memory` flag or a Kubernetes resource limit would. What this
 * file provides is the code-level half of that guarantee, portable across
 * every platform this monorepo runs tests on: when a child's V8 heap grows
 * past the ceiling, V8 raises a fatal, unrecoverable
 * "JavaScript heap out of memory" error and the process **exits — it does
 * not hang, and it does not silently keep allocating**. Confirmed
 * empirically (this session's own investigation, not assumed from V8's
 * docs): that exit is `status 134`, `signal null`, with a distinctive
 * stderr line — this file's `isMemoryExceededExit` recognizes it.
 *
 * The deployment-level `cgroup` limit (Session 8) is real defense in depth,
 * not a substitute for this one: a native `Buffer.allocUnsafe` bomb can, in
 * principle, grow the process's RSS well past the V8 heap ceiling without
 * V8 itself ever raising its own OOM error (V8's tracked heap and the
 * process's total RSS are not the same number) — a `cgroup` limit catches
 * that case where this file's mechanism alone could not. Both layers exist
 * for a reason; neither is redundant with the other.
 */

export function memoryExecArgv(memoryMb: number): readonly string[] {
  return [`--max-old-space-size=${String(memoryMb)}`];
}

/**
 * V8's own "reached heap limit" fatal error always prints this exact phrase
 * to stderr before the process aborts — matched in preference to the bare
 * exit code/signal alone, since those (`134`/`null` on this session's own
 * empirical check) are not exclusively this failure's signature on every
 * platform.
 */
const HEAP_OOM_STDERR_MARKER = 'JavaScript heap out of memory';

export function isMemoryExceededExit(info: {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
}): boolean {
  if (info.stderr.includes(HEAP_OOM_STDERR_MARKER)) return true;
  // Fallback for the case stderr was truncated/lost: a V8 fatal-error abort
  // with no signal (i.e. not something the host itself SIGKILLed) is the
  // next-best signature.
  return info.signal === null && info.code === 134;
}
