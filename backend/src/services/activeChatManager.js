class ActiveChatManager {
  constructor() {
    this.active = null;
  }

  tryAcquire({ source, conversationId, metadata = {} } = {}) {
    if (this.active) {
      return { acquired: false, active: this.active };
    }

    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    this.active = {
      token,
      source,
      conversationId,
      metadata,
      startedAt: new Date().toISOString()
    };

    return { acquired: true, token, active: this.active };
  }

  release(token) {
    if (!this.active || this.active.token !== token) {
      return false;
    }

    this.active = null;
    return true;
  }

  getStatus() {
    if (!this.active) {
      return { active: false };
    }

    return {
      active: true,
      source: this.active.source,
      conversationId: this.active.conversationId,
      metadata: this.active.metadata,
      startedAt: this.active.startedAt
    };
  }
}

export const activeChatManager = new ActiveChatManager();
