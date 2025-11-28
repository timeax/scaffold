// src/core/hook-runner.ts

import { minimatch } from 'minimatch';
import type {
   ScaffoldConfig,
   HookContext,
   RegularHookKind,
   StubHookKind,
   StubConfig,
   RegularHookConfig,
   StubHookConfig,
} from '../schema';

function matchesFilter(
   pathRel: string,
   cfg: { include?: string[]; exclude?: string[]; files?: string[] },
): boolean {
   const { include, exclude, files } = cfg;

   const patterns: string[] = [];
   if (include?.length) patterns.push(...include);
   if (files?.length) patterns.push(...files);

   if (patterns.length) {
      const ok = patterns.some((p) => minimatch(pathRel, p));
      if (!ok) return false;
   }

   if (exclude?.length) {
      const blocked = exclude.some((p) => minimatch(pathRel, p));
      if (blocked) return false;
   }

   return true;
}

export class HookRunner {
   constructor(private readonly config: ScaffoldConfig) { }

   async runRegular(kind: RegularHookKind, ctx: HookContext): Promise<void> {
      const configs: RegularHookConfig[] = this.config.hooks?.[kind] ?? [];
      for (const cfg of configs) {
         if (!matchesFilter(ctx.targetPath, cfg)) continue;
         await cfg.fn(ctx);
      }
   }

   private getStubConfig(stubName?: string): StubConfig | undefined {
      if (!stubName) return undefined;
      return this.config.stubs?.[stubName];
   }

   async runStub(kind: StubHookKind, ctx: HookContext): Promise<void> {
      const stub = this.getStubConfig(ctx.stubName);
      if (!stub?.hooks) return;

      const configs: StubHookConfig[] =
         kind === 'preStub'
            ? stub.hooks.preStub ?? []
            : stub.hooks.postStub ?? [];

      for (const cfg of configs) {
         if (!matchesFilter(ctx.targetPath, cfg)) continue;
         await cfg.fn(ctx);
      }
   }

   async renderStubContent(ctx: HookContext): Promise<string | undefined> {
      const stub = this.getStubConfig(ctx.stubName);
      if (!stub?.getContent) return undefined;
      return stub.getContent(ctx);
   }
}