// Use VITE_API_URL if set
// Dev mode (.env): 'http://localhost:3001' for separate servers
// Prod mode (.env.production): empty string for same-origin relative paths
const API_URL = import.meta.env.VITE_API_URL !== undefined
  ? import.meta.env.VITE_API_URL
  : 'http://localhost:3001';

// Export API_URL for use in other components
export { API_URL };

export const api = {
  API_URL, // Make API_URL accessible via api.API_URL
  async sendMessage(message, conversationId = 'default') {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, conversationId }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to send message';
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
      } catch (err) {
        // Ignore JSON parsing errors
      }
      const requestError = new Error(errorMessage);
      requestError.status = response.status;
      throw requestError;
    }

    return response.json();
  },

  async streamMessage(message, conversationId = 'default', onChunk, onToolCall, onUsage, onCompression, onCompressionStart, signal) {
    // Note: Using fetch with ReadableStream instead of EventSource for POST support
    const response = await fetch(`${API_URL}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, conversationId }),
      signal, // Add abort signal support
    });

    if (!response.ok) {
      let errorMessage = 'Failed to start stream';
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
      } catch (err) {
        // Ignore JSON parsing errors
      }
      const requestError = new Error(errorMessage);
      requestError.status = response.status;
      throw requestError;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'content') {
              onChunk?.(data.content, data.segmentIndex);
            } else if (data.type === 'tool_call') {
              onToolCall?.(data, data.segmentIndex);
            } else if (data.type === 'usage') {
              onUsage?.(data.usage);
            } else if (data.type === 'compression_start') {
              onCompressionStart?.();
            } else if (data.type === 'compression') {
              onCompression?.(data);
            } else if (data.type === 'done') {
              return;
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          }
        }
      }
    } finally {
      reader.cancel();
    }
  },

  async streamProactiveMessage(onChunk, onToolCall, onUsage, onCompression, onCompressionStart, onDone, signal) {
    const response = await fetch(`${API_URL}/api/chat/proactive/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      signal,
    });

    if (!response.ok) {
      let errorMessage = 'Failed to start proactive stream';
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
      } catch (err) {
        // Ignore JSON parsing errors
      }
      const requestError = new Error(errorMessage);
      requestError.status = response.status;
      throw requestError;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'content') {
              onChunk?.(data.content, data.segmentIndex);
            } else if (data.type === 'tool_call') {
              onToolCall?.(data, data.segmentIndex);
            } else if (data.type === 'usage') {
              onUsage?.(data.usage);
            } else if (data.type === 'compression_start') {
              onCompressionStart?.();
            } else if (data.type === 'compression') {
              onCompression?.(data);
            } else if (data.type === 'done') {
              onDone?.(data);
              return;
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          }
        }
      }
    } finally {
      reader.cancel();
    }
  },

  async getConversations() {
    const response = await fetch(`${API_URL}/api/chat/conversations`);
    return response.json();
  },

  async getConversation(id) {
    const response = await fetch(`${API_URL}/api/chat/conversations/${id}`);
    return response.json();
  },

  async getConversationHistory(id) {
    const response = await fetch(`${API_URL}/api/chat/history/${id}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch conversation history');
    }
    return response.json();
  },

  async deleteConversationHistory(id) {
    const response = await fetch(`${API_URL}/api/chat/history/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete conversation history');
    }
    return response.json();
  },

  async deleteConversation(id) {
    const response = await fetch(`${API_URL}/api/chat/conversations/${id}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  async getLogs(type = null, limit = 100) {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    params.append('limit', limit);

    const response = await fetch(`${API_URL}/api/chat/logs?${params}`);
    return response.json();
  },

  async clearLogs() {
    const response = await fetch(`${API_URL}/api/chat/logs`, {
      method: 'DELETE',
    });
    return response.json();
  },

  async getTools() {
    const response = await fetch(`${API_URL}/api/tools`);
    return response.json();
  },

  async healthCheck() {
    const response = await fetch(`${API_URL}/health`);
    return response.json();
  },

  async getMemories() {
    const response = await fetch(`${API_URL}/api/chat/memories`);
    if (!response.ok) throw new Error('Failed to fetch memories');
    return response.json(); // Returns { memories: [...] }
  },

  async addMemory(content, category = 'user', metadata = {}) {
    const response = await fetch(`${API_URL}/api/chat/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, category, metadata }),
    });
    if (!response.ok) throw new Error('Failed to add memory');
    return response.json(); // Returns { message, memory: {...} }
  },

  async updateMemory(id, updates) {
    const response = await fetch(`${API_URL}/api/chat/memories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error('Failed to update memory');
    return response.json(); // Returns { message, memory: {...} }
  },

  async deleteMemory(id) {
    const response = await fetch(`${API_URL}/api/chat/memories/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete memory');
    return response.json();
  },

  async reloadMemories() {
    const response = await fetch(`${API_URL}/api/chat/memories/reload`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to reload memories');
    return response.json();
  },

  async getSettings() {
    const response = await fetch(`${API_URL}/api/chat/settings`);
    if (!response.ok) throw new Error('Failed to fetch settings');
    return response.json();
  },

  async updateSettings(updates) {
    const response = await fetch(`${API_URL}/api/chat/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update settings');
    }
    return response.json();
  },

  async reloadSettings() {
    const response = await fetch(`${API_URL}/api/chat/settings/reload`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to reload settings');
    return response.json();
  },

  async resetSettings() {
    const response = await fetch(`${API_URL}/api/chat/settings/reset`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to reset settings');
    return response.json();
  },

  async getProactiveStatus() {
    const response = await fetch(`${API_URL}/api/chat/proactive/status`);
    if (!response.ok) throw new Error('Failed to fetch proactive status');
    return response.json();
  },

  async triggerProactive() {
    const response = await fetch(`${API_URL}/api/chat/proactive/trigger`, {
      method: 'POST'
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to trigger proactive mode');
    }
    return response.json();
  },
};
