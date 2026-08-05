/**
 * A logger small enough to not be a dependency.
 *
 * Writes to stderr only: the MCP server owns stdout for JSON-RPC framing, and
 * a stray `console.log` there corrupts the protocol stream.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

let threshold: number = RANK.info;

export function setLogLevel(level: LogLevel): void {
  threshold = RANK[level];
}

export interface Logger {
  debug(message: string, ...detail: unknown[]): void;
  info(message: string, ...detail: unknown[]): void;
  warn(message: string, ...detail: unknown[]): void;
  error(message: string, ...detail: unknown[]): void;
}

function write(level: LogLevel, scope: string, message: string, detail: unknown[]): void {
  if (RANK[level] < threshold) return;
  const line = `[saber:${scope}] ${level.toUpperCase()} ${message}`;
  if (detail.length === 0) process.stderr.write(`${line}\n`);
  else process.stderr.write(`${line} ${detail.map(format).join(' ')}\n`);
}

function format(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, ...d) => write('debug', scope, m, d),
    info: (m, ...d) => write('info', scope, m, d),
    warn: (m, ...d) => write('warn', scope, m, d),
    error: (m, ...d) => write('error', scope, m, d),
  };
}
