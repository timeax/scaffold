// src/core/init-scaffold.ts

import fs from 'fs';
import path from 'path';
import { ensureDirSync } from '../util/fs-utils';
import { defaultLogger } from '../util/logger';
import { SCAFFOLD_ROOT_DIR } from '../schema';

const logger = defaultLogger.child('[init]');

export interface InitScaffoldOptions {
   /**
    * Path to the scaffold directory (relative to cwd).
    * Default: "scaffold"
    */
   scaffoldDir?: string;

   /**
    * Overwrite existing config/structure files if they already exist.
    */
   force?: boolean;

   /**
    * Name of the config file inside the scaffold directory.
    * Default: "config.ts"
    */
   configFileName?: string;

   /**
    * Name of the default structure file inside the scaffold directory
    * for single-root mode.
    * Default: "structure.txt"
    */
   structureFileName?: string;
}

// src/core/init-scaffold.ts

const DEFAULT_CONFIG_TS = `import type { ScaffoldConfig } from '@timeax/scaffold';

const config: ScaffoldConfig = {
  // Root for resolving the scaffold/ folder & this config file.
  // By default, this is the directory where you run \`scaffold\`.
  // Example:
  //   root: '.',          // scaffold/ at <cwd>/scaffold
  //   root: 'tools',      // scaffold/ at <cwd>/tools/scaffold
  // root: '.',

  // Base directory where structures are applied and files/folders are created.
  // This is resolved relative to \`root\` above. Defaults to the same as root.
  // Example:
  //   base: '.',          // apply to <root>
  //   base: 'src',        // apply to <root>/src
  //   base: '..',         // apply to parent of <root>
  // base: '.',
  
  // Number of spaces per indent level in structure files (default: 2).
  // indentStep: 2,
  
  // Cache file path, relative to base.
  // cacheFile: '.scaffold-cache.json',

  // --- Single-structure mode (simple) ---
  // structureFile: 'structure.txt',

  // --- Grouped mode (uncomment and adjust) ---
  // groups: [
  //   { name: 'app', root: 'app', structureFile: 'app.txt' },
  //   { name: 'frontend', root: 'resources/js', structureFile: 'frontend.txt' },
  // ],

  hooks: {
    // preCreateFile: [],
    // postCreateFile: [],
    // preDeleteFile: [],
    // postDeleteFile: [],
  },

  stubs: {
    // Example:
    // page: {
    //   name: 'page',
    //   getContent: (ctx) =>
    //     \`export default function Page() { return <div>\${ctx.targetPath}</div>; }\`,
    // },
  },
};

export default config;
`;


const DEFAULT_STRUCTURE_TXT = `# ${SCAFFOLD_ROOT_DIR}/structure.txt
# Example structure definition.
# - Indent with 2 spaces per level
# - Directories must end with "/"
# - Files do not
# - Lines starting with "#" are comments and ignored by parser

# Example:
# src/
#   index.ts
`;

/**
 * Initialize the scaffold directory and basic config/structure files.
 *
 * - Creates the scaffold directory if it doesn't exist.
 * - Writes a default config.ts if missing (or if force = true).
 * - Writes a default structure.txt if missing (or if force = true).
 */
export async function initScaffold(
   cwd: string,
   options: InitScaffoldOptions = {},
): Promise<{
   scaffoldDir: string;
   configPath: string;
   structurePath: string;
   created: { config: boolean; structure: boolean };
}> {
   const scaffoldDirRel = options.scaffoldDir ?? SCAFFOLD_ROOT_DIR;
   const scaffoldDirAbs = path.resolve(cwd, scaffoldDirRel);
   const configFileName = options.configFileName ?? 'config.ts';
   const structureFileName = options.structureFileName ?? 'structure.txt';

   ensureDirSync(scaffoldDirAbs);

   const configPath = path.join(scaffoldDirAbs, configFileName);
   const structurePath = path.join(scaffoldDirAbs, structureFileName);

   let createdConfig = false;
   let createdStructure = false;

   // config.ts
   if (fs.existsSync(configPath) && !options.force) {
      logger.info(`Config already exists at ${configPath} (use --force to overwrite).`);
   } else {
      fs.writeFileSync(configPath, DEFAULT_CONFIG_TS, 'utf8');
      createdConfig = true;
      logger.info(
         `${fs.existsSync(configPath) ? 'Overwrote' : 'Created'} config at ${configPath}`,
      );
   }

   // structure.txt
   if (fs.existsSync(structurePath) && !options.force) {
      logger.info(
         `Structure file already exists at ${structurePath} (use --force to overwrite).`,
      );
   } else {
      fs.writeFileSync(structurePath, DEFAULT_STRUCTURE_TXT, 'utf8');
      createdStructure = true;
      logger.info(
         `${fs.existsSync(structurePath) ? 'Overwrote' : 'Created'} structure file at ${structurePath}`,
      );
   }

   return {
      scaffoldDir: scaffoldDirAbs,
      configPath,
      structurePath,
      created: {
         config: createdConfig,
         structure: createdStructure,
      },
   };
}