// src/core/resolve-structure.ts

import fs from 'fs';
import path from 'path';
import type {
   ScaffoldConfig,
   StructureEntry,
   StructureGroupConfig,
} from '../schema';
import { parseStructureText } from './structure-txt';
import { defaultLogger } from '../util/logger';

const logger = defaultLogger.child('[structure]');

export function resolveGroupStructure(
   scaffoldDir: string,
   group: StructureGroupConfig,
   config: ScaffoldConfig
): StructureEntry[] {
   if (group.structure && group.structure.length) {
      logger.debug(`Using inline structure for group "${group.name}"`);
      return group.structure;
   }

   const fileName = group.structureFile ?? `${group.name}.txt`;
   const filePath = path.join(scaffoldDir, fileName);

   if (!fs.existsSync(filePath)) {
      throw new Error(
         `@timeax/scaffold: Group "${group.name}" has no structure. ` +
         `Expected file "${fileName}" in "${scaffoldDir}".`,
      );
   }

   logger.debug(`Reading structure for group "${group.name}" from ${filePath}`);
   const raw = fs.readFileSync(filePath, 'utf8');
   return parseStructureText(fileName, raw, config.indentStep);
}

/**
 * Legacy single-structure mode (no groups defined).
 */
export function resolveSingleStructure(
   scaffoldDir: string,
   config: ScaffoldConfig,
): StructureEntry[] {
   if (config.structure && config.structure.length) {
      logger.debug('Using inline single structure (no groups)');
      return config.structure;
   }

   const fileName = config.structureFile ?? 'structure.txt';
   const filePath = path.join(scaffoldDir, fileName);

   if (!fs.existsSync(filePath)) {
      throw new Error(
         `@timeax/scaffold: No structure defined. ` +
         `Expected "${fileName}" in "${scaffoldDir}".`,
      );
   }

   logger.debug(`Reading single structure from ${filePath}`);
   const raw = fs.readFileSync(filePath, 'utf8');
   return parseStructureText(fileName, raw, config.indentStep);
}