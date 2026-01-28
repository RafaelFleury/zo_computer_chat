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
      const error = await response.json();
      throw new Error(error.error || 'Failed to send message');
    }

    return response.json();
  },

  async streamMessage(message, conversationId = 'default', onChunk, onToolCall, onUsage) {
    // Note: Using fetch with ReadableStream instead of EventSource for POST support
    const response = await fetch(`${API_URL}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, conversationId }),
    });

    if (!response.ok) {
      throw new Error('Failed to start stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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
            onChunk?.(data.content);
          } else if (data.type === 'tool_call') {
            onToolCall?.(data);
          } else if (data.type === 'usage') {
            onUsage?.(data.usage);
          } else if (data.type === 'done') {
            return;
          } else if (data.type === 'error') {
            throw new Error(data.error);
          }
        }
      }
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
};
