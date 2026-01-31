import { logger } from '../utils/logger.js';
import { runProactiveTrigger, PROACTIVE_CONVERSATION_ID } from './proactiveService.js';
import { activeChatManager } from './activeChatManager.js';

class ProactiveScheduler {
  constructor() {
    this.enabled = false;
    this.intervalMinutes = 15;
    this.timer = null;
    this.lastTriggered = null;
    this.nextTriggerAt = null;
    this.isTriggering = false;
  }

  configure(settings = {}) {
    const enabled = Boolean(settings.enabled);
    const parsedInterval = Number(settings.intervalMinutes);
    const intervalMinutes = Number.isFinite(parsedInterval)
      ? parsedInterval
      : this.intervalMinutes;

    const needsRestart = this.enabled !== enabled || this.intervalMinutes !== intervalMinutes;

    this.enabled = enabled;
    this.intervalMinutes = intervalMinutes;

    if (needsRestart) {
      if (this.enabled) {
        this.start();
      } else {
        this.stop();
      }
    }
  }

  start() {
    this.stop();

    if (!this.enabled) {
      return;
    }

    const intervalMs = this.intervalMinutes * 60 * 1000;
    this.nextTriggerAt = new Date(Date.now() + intervalMs).toISOString();

    this.timer = setInterval(async () => {
      if (this.isTriggering) {
        logger.warn('Proactive trigger skipped (already running)');
        return;
      }

      const lock = activeChatManager.tryAcquire({
        source: 'proactive',
        conversationId: PROACTIVE_CONVERSATION_ID,
        metadata: { triggerSource: 'scheduled' }
      });

      if (!lock.acquired) {
        logger.warn('Proactive trigger skipped (another chat active)', lock.active);
        this.nextTriggerAt = new Date(Date.now() + intervalMs).toISOString();
        return;
      }

      this.isTriggering = true;
      try {
        await runProactiveTrigger({ source: 'scheduled' });
        this.lastTriggered = new Date().toISOString();
        this.nextTriggerAt = new Date(Date.now() + intervalMs).toISOString();
      } catch (error) {
        logger.error('Scheduled proactive trigger failed:', error);
      } finally {
        this.isTriggering = false;
        activeChatManager.release(lock.token);
      }
    }, intervalMs);

    logger.info(`Proactive scheduler started (${this.intervalMinutes} min interval)`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.nextTriggerAt = null;
    this.isTriggering = false;
    logger.info('Proactive scheduler stopped');
  }

  async triggerManual() {
    if (this.isTriggering) {
      const error = new Error('Proactive trigger already running');
      error.statusCode = 409;
      throw error;
    }

    const lock = activeChatManager.tryAcquire({
      source: 'proactive',
      conversationId: PROACTIVE_CONVERSATION_ID,
      metadata: { triggerSource: 'manual' }
    });

    if (!lock.acquired) {
      const error = new Error('Another chat is currently active. Please wait.');
      error.statusCode = 409;
      throw error;
    }

    this.isTriggering = true;
    try {
      const result = await runProactiveTrigger({ source: 'manual' });
      this.lastTriggered = new Date().toISOString();
      return result;
    } finally {
      this.isTriggering = false;
      activeChatManager.release(lock.token);
    }
  }

  getStatus() {
    return {
      enabled: this.enabled,
      intervalMinutes: this.intervalMinutes,
      lastTriggered: this.lastTriggered,
      nextTriggerAt: this.nextTriggerAt,
      isRunning: Boolean(this.timer),
      isTriggering: this.isTriggering
    };
  }
}

export const proactiveScheduler = new ProactiveScheduler();
