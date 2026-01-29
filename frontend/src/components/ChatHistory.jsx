import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { showToast } from './Toast';
import { API_URL } from '../services/api';
import './ChatHistory.css';

const ChatHistory = forwardRef(({ currentConversationId, onSelectConversation, onNewConversation, onToggle }, ref) => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(true);

  // Notify parent when sidebar toggles
  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    if (onToggle) {
      onToggle(newState);
    }
  };

  // Load conversation list
  const loadConversations = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/chat/history`);
      const data = await response.json();
      setConversations(data.conversations || []);
      setError(null);
    } catch (err) {
      console.error('Failed to load conversations:', err);
      setError('Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  // Delete conversation
  const handleDelete = async (conversationId, e) => {
    e.stopPropagation(); // Prevent selecting the conversation

    if (!window.confirm('Are you sure you want to delete this conversation?')) {
      return;
    }

    // Store backup for rollback
    const backup = [...conversations];

    // Optimistic update - remove immediately from UI
    setConversations(prev => prev.filter(conv => conv.id !== conversationId));

    try {
      console.log('Deleting conversation:', conversationId);
      const response = await fetch(`${API_URL}/api/chat/history/${conversationId}`, {
        method: 'DELETE'
      });

      console.log('Delete response:', response.status);

      if (response.ok) {
        console.log('Conversation deleted successfully');
        showToast('Conversation deleted', 'success');

        // If deleted conversation was active, create new one
        if (conversationId === currentConversationId) {
          onNewConversation();
        }
      } else {
        const errorData = await response.json();
        console.error('Delete failed:', errorData);

        // Rollback on failure
        setConversations(backup);
        showToast(`Failed to delete: ${errorData.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);

      // Rollback on error
      setConversations(backup);
      showToast(`Failed to delete: ${err.message}`, 'error');
    }
  };

  // Load conversation
  const handleSelect = async (conversationId) => {
    try {
      const response = await fetch(`${API_URL}/api/chat/history/${conversationId}`);
      const data = await response.json();

      if (data.messages) {
        const compressionInfo = {
          compressionSummary: data.compressionSummary || null,
          compressedAt: data.compressedAt || null,
          compressedMessageCount: data.compressedMessageCount || 0
        };
        onSelectConversation(conversationId, data.messages, data.usage, compressionInfo);
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
      alert('Failed to load conversation');
    }
  };

  // Format date - handles both ISO strings and numeric timestamps
  const formatDate = (dateValue) => {
    if (!dateValue) {
      return 'Unknown date';
    }

    // If it's already a number, use it as milliseconds timestamp
    if (typeof dateValue === 'number') {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return 'Unknown date';
      }
      return formatRelativeTime(date);
    }

    // If it's a string, try to parse as ISO date first
    const date = new Date(dateValue);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Unknown date';
    }

    return formatRelativeTime(date);
  };

  // Helper function to format relative time
  const formatRelativeTime = (date) => {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  // Expose refresh method to parent component
  useImperativeHandle(ref, () => ({
    refresh: loadConversations
  }));

  // Load on mount only - no automatic polling
  // Will reload after user actions (delete, new conversation, send message)
  useEffect(() => {
    loadConversations();
  }, []);

  return (
    <div className={`chat-history ${isOpen ? 'open' : 'closed'}`}>
      <div className="chat-history-toggle" onClick={handleToggle}>
        <span className="toggle-icon">{isOpen ? '←' : '→'}</span>
      </div>

      {isOpen && (
        <div className="chat-history-content">
          <div className="chat-history-header">
            <h3>Conversations</h3>
            <div className="header-buttons">
              <button
                className="refresh-btn"
                onClick={loadConversations}
                disabled={loading}
                title="Refresh history"
              >
                ↻
              </button>
              <button className="new-chat-btn" onClick={onNewConversation} title="New conversation">
                +
              </button>
            </div>
          </div>

          {loading && conversations.length === 0 && (
            <div className="chat-history-loading">Loading...</div>
          )}

          {error && (
            <div className="chat-history-error">{error}</div>
          )}

          {!loading && conversations.length === 0 && (
            <div className="chat-history-empty">
              No conversations yet. Start chatting to create your first conversation!
            </div>
          )}

          <div className="conversations-list">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${conv.id === currentConversationId ? 'active' : ''}`}
                onClick={() => handleSelect(conv.id)}
              >
                <div className="conversation-info">
                  <div className="conversation-id">
                    {conv.id.replace('conv_', '').substring(0, 12)}...
                  </div>
                  <div className="conversation-date">
                    {formatDate(conv.createdAt)}
                  </div>
                </div>
                <button
                  className="delete-btn"
                  onClick={(e) => handleDelete(conv.id, e)}
                  title="Delete conversation"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

ChatHistory.displayName = 'ChatHistory';

export default ChatHistory;
