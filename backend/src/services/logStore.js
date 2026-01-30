import { logger } from '../utils/logger.js';

const sessionLogs = [];

export function addLog(type, data) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type,
    ...data
  };
  sessionLogs.push(logEntry);
  logger.debug('Log entry added', logEntry);
  return logEntry;
}

export function getLogs({ type = null, limit = 100 } = {}) {
  let logs = sessionLogs;
  if (type) {
    logs = logs.filter(log => log.type === type);
  }
  return logs.slice(-parseInt(limit, 10));
}

export function clearLogs() {
  const count = sessionLogs.length;
  sessionLogs.length = 0;
  logger.info('Session logs cleared');
  return count;
}
