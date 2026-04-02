type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  module?: string;
  data?: Record<string, unknown>;
  error?: Error;
}

function formatLog(entry: LogEntry): string {
  return JSON.stringify({
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  });
}

function log(level: LogLevel, message: string, module?: string, data?: Record<string, unknown>) {
  if (LOG_LEVELS[level] < LOG_LEVELS[MIN_LEVEL]) return;
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    module,
    data,
  };

  switch (level) {
    case 'error':
      console.error(formatLog(entry));
      break;
    case 'warn':
      console.warn(formatLog(entry));
      break;
    case 'debug':
      console.debug(formatLog(entry));
      break;
    default:
      console.log(formatLog(entry));
  }
}

export function createLogger(module: string) {
  return {
    debug: (message: string, data?: Record<string, unknown>) => log('debug', message, module, data),
    info: (message: string, data?: Record<string, unknown>) => log('info', message, module, data),
    warn: (message: string, data?: Record<string, unknown>) => log('warn', message, module, data),
    error: (message: string, error?: Error, data?: Record<string, unknown>) =>
      log('error', message, module, { ...data, error: error?.message, stack: error?.stack }),
  };
}

export const logger = createLogger('app');

export function withRequestLogger(module: string, handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    const l = createLogger(module);
    const start = Date.now();
    const method = req.method;
    const url = new URL(req.url).pathname;

    try {
      const response = await handler(req);
      const duration = Date.now() - start;
      l.info(`${method} ${url}`, { status: response.status, duration: `${duration}ms` });
      return response;
    } catch (error) {
      const duration = Date.now() - start;
      l.error(`${method} ${url}`, error as Error, { duration: `${duration}ms` });
      throw error;
    }
  };
}
