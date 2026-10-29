import type { AdapterContext } from '../../src/execution-runtime/adapter.js';
import type { UnitObservation } from '@webaudit/api/execution-runtime';
import type { Behavior } from './test-adapter.js';

export async function runTestAdapterChild(ctx: AdapterContext): Promise<UnitObservation> {
  const behavior = ((ctx.unit.configuration as { behavior?: Behavior } | null)?.behavior ?? {
    kind: 'COMPLETE',
  }) as Behavior;
  switch (behavior.kind) {
    case 'THROW':
      throw new Error('engine bug');
    case 'INFRA':
      return { source: 'INFRASTRUCTURE_ERROR' };
    case 'CUSTOMER_EXIT':
      return { source: 'CUSTOMER_CODE_EXIT', exitCode: behavior.code };
    case 'HANG':
      ctx.progress({ label: 'working', completedUnits: 0, totalUnits: 2 });
      return await new Promise<UnitObservation>(() => undefined);
    case 'PROCESS_HANG':
      ctx.progress({ label: `child-${String(process.pid)}`, completedUnits: 0, totalUnits: 2 });
      if ((await ctx.safetyCheckpoint()).outcome !== 'PROCEED') return { source: 'F07_STOP' };
      if ((await ctx.authorizeEffect('REQUEST', 1)).result !== 'AUTHORIZED') {
        return { source: 'F07_STOP' };
      }
      await ctx.confirmEffect('REQUEST', 1);
      // Keep the process alive after IPC disconnect so crash cleanup is exercised.
      setInterval(() => undefined, 1000);
      return await new Promise<UnitObservation>(() => undefined);
    case 'CHECKPOINT_WAIT': {
      ctx.progress({ label: 'checkpoint-wait-start', completedUnits: 0, totalUnits: 2 });
      await new Promise((resolve) => setTimeout(resolve, behavior.ms));
      ctx.progress({ label: 'checkpoint-wait-finished', completedUnits: 1, totalUnits: 2 });
      const checkpoint = await ctx.safetyCheckpoint();
      return checkpoint.outcome === 'PROCEED'
        ? { source: 'ENGINE_RESULT' }
        : { source: 'F07_STOP' };
    }
    case 'WAIT':
      ctx.progress({ label: 'working', completedUnits: 0, totalUnits: 2 });
      await new Promise((resolve) => setTimeout(resolve, behavior.ms));
      return { source: 'ENGINE_RESULT' };
    case 'EFFECTS':
      for (let i = 1; i <= behavior.count; i++) {
        const checkpoint = await ctx.safetyCheckpoint();
        if (checkpoint.outcome !== 'PROCEED') return { source: 'F07_STOP' };
        const decision = await ctx.authorizeEffect('REQUEST', i);
        if (decision.result !== 'AUTHORIZED') return { source: 'F07_STOP' };
        await ctx.confirmEffect('REQUEST', i);
      }
      return { source: 'ENGINE_RESULT' };
    case 'COMPLETE': {
      ctx.progress({ label: 'start', completedUnits: 0, totalUnits: 2 });
      const checkpoint = await ctx.safetyCheckpoint();
      if (checkpoint.outcome !== 'PROCEED') return { source: 'F07_STOP' };
      const decision = await ctx.authorizeEffect('REQUEST', 1);
      if (decision.result !== 'AUTHORIZED') return { source: 'F07_STOP' };
      await ctx.recordEvidence('HTTP_TRANSACTION', {
        status: 200,
        unit: ctx.unit.id,
        processId: process.pid,
        checkpoint: checkpoint.outcome,
        databaseUrlAvailable: process.env['DATABASE_URL'] !== undefined,
        redisUrlAvailable: process.env['REDIS_URL'] !== undefined,
      });
      await ctx.confirmEffect('REQUEST', 1);
      ctx.progress({ label: 'done', completedUnits: 2, totalUnits: 2 });
      return { source: 'ENGINE_RESULT' };
    }
  }
}
