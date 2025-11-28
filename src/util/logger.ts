// src/util/logger.ts

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

export interface LoggerOptions {
   level?: LogLevel;
   /**
    * Optional prefix string (e.g. "[scaffold]" or "[group:app]").
    */
   prefix?: string;
}

/**
 * Minimal ANSI color helpers (no external deps).
 */
const supportsColor =
   typeof process !== 'undefined' &&
   process.stdout &&
   process.stdout.isTTY &&
   process.env.NO_COLOR !== '1';

type ColorFn = (text: string) => string;

function wrap(code: number): ColorFn {
   const open = `\u001b[${code}m`;
   const close = `\u001b[0m`;
   return (text: string) => (supportsColor ? `${open}${text}${close}` : text);
}

const color = {
   red: wrap(31),
   yellow: wrap(33),
   green: wrap(32),
   cyan: wrap(36),
   magenta: wrap(35),
   dim: wrap(2),
   bold: wrap(1),
   gray: wrap(90),
};

function colorForLevel(level: LogLevel): ColorFn {
   switch (level) {
      case 'error':
         return color.red;
      case 'warn':
         return color.yellow;
      case 'info':
         return color.cyan;
      case 'debug':
         return color.gray;
      default:
         return (s) => s;
   }
}

/**
 * Minimal logger for @timeax/scaffold with colored output.
 */
export class Logger {
   private level: LogLevel;
   private prefix: string | undefined;

   constructor(options: LoggerOptions = {}) {
      this.level = options.level ?? 'info';
      this.prefix = options.prefix;
   }

   setLevel(level: LogLevel) {
      this.level = level;
   }

   getLevel(): LogLevel {
      return this.level;
   }

   /**
    * Create a child logger with an additional prefix.
    */
   child(prefix: string): Logger {
      const combined = this.prefix ? `${this.prefix}${prefix}` : prefix;
      return new Logger({ level: this.level, prefix: combined });
   }

   private formatMessage(msg: unknown, lvl: LogLevel): string {
      const text =
         typeof msg === 'string'
            ? msg
            : msg instanceof Error
               ? msg.message
               : String(msg);

      const levelColor = colorForLevel(lvl);
      const prefixColored = this.prefix
         ? color.magenta(this.prefix)
         : undefined;

      const textColored =
         lvl === 'debug' ? color.dim(text) : levelColor(text);

      if (prefixColored) {
         return `${prefixColored} ${textColored}`;
      }

      return textColored;
   }

   private shouldLog(targetLevel: LogLevel): boolean {
      const order: LogLevel[] = ['silent', 'error', 'warn', 'info', 'debug'];
      const currentIdx = order.indexOf(this.level);
      const targetIdx = order.indexOf(targetLevel);
      if (currentIdx === -1 || targetIdx === -1) return true;
      if (this.level === 'silent') return false;
      return targetIdx <= currentIdx || targetLevel === 'error';
   }

   error(msg: unknown, ...rest: unknown[]) {
      if (!this.shouldLog('error')) return;
      console.error(this.formatMessage(msg, 'error'), ...rest);
   }

   warn(msg: unknown, ...rest: unknown[]) {
      if (!this.shouldLog('warn')) return;
      console.warn(this.formatMessage(msg, 'warn'), ...rest);
   }

   info(msg: unknown, ...rest: unknown[]) {
      if (!this.shouldLog('info')) return;
      console.log(this.formatMessage(msg, 'info'), ...rest);
   }

   debug(msg: unknown, ...rest: unknown[]) {
      if (!this.shouldLog('debug')) return;
      console.debug(this.formatMessage(msg, 'debug'), ...rest);
   }
}

/**
 * Default process-wide logger used by CLI and core.
 * Level can be controlled via SCAFFOLD_LOG_LEVEL env.
 */
export const defaultLogger = new Logger({
   level: (process.env.SCAFFOLD_LOG_LEVEL as LogLevel | undefined) ?? 'info',
   prefix: '[scaffold]',
});