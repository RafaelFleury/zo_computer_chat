import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../services/api';
import './ChatInterface.css';

export default function ChatInterface({ conversationId, initialMessages, onConversationChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentConversationId, setCurrentConversationId] = useState(conversationId);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Update messages when initialMessages change (including clearing)
  useEffect(() => {
    console.log('Initial messages changed:', initialMessages?.length);
    if (initialMessages !== undefined) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  // Update conversationId when prop changes
  useEffect(() => {
    console.log('Conversation ID changed:', conversationId);
    if (conversationId !== undefined) {
      setCurrentConversationId(conversationId);
    }
  }, [conversationId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

    // Add placeholder for assistant message
    const assistantMessageIndex = messages.length + 1;
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: '',
      loading: true,
      toolCalls: [],
      process: [] // Track process steps
    }]);

    setLoading(true);

    try {
      // Create new conversation if none exists
      let convId = currentConversationId;
      if (!convId) {
        const newConvResponse = await fetch('http://localhost:3001/api/chat/history/new', {
          method: 'POST'
        });
        const newConvData = await newConvResponse.json();
        convId = newConvData.conversationId;
        setCurrentConversationId(convId);
        if (onConversationChange) {
          onConversationChange(convId);
        }
      }

      // Add "Request received" step
      setMessages(prev => {
        const updated = [...prev];
        updated[assistantMessageIndex] = {
          ...updated[assistantMessageIndex],
          process: [{ step: 'Request received', timestamp: Date.now() }]
        };
        return updated;
      });

      // Use streaming API
      await api.streamMessage(
        userMessage,
        convId,
        // onChunk - called for each content piece
        (content) => {
          setMessages(prev => {
            const updated = [...prev];
            const current = updated[assistantMessageIndex];
            updated[assistantMessageIndex] = {
              ...current,
              content: current.content + content,
              loading: false
            };
            return updated;
          });
        },
        // onToolCall - called when tool is used
        (toolCall) => {
          setMessages(prev => {
            const updated = [...prev];
            const current = updated[assistantMessageIndex];

            // Find if this tool call already exists (update status)
            const existingToolIndex = current.toolCalls?.findIndex(
              t => t.toolName === toolCall.toolName && t.status !== 'completed' && t.status !== 'failed'
            );

            let newToolCalls;
            if (existingToolIndex >= 0) {
              // Update existing tool call
              newToolCalls = [...current.toolCalls];
              newToolCalls[existingToolIndex] = toolCall;
            } else {
              // Add new tool call
              newToolCalls = [...(current.toolCalls || []), toolCall];
            }

            // Add process step based on status
            let processSteps = [...(current.process || [])];
            if (toolCall.status === 'starting') {
              processSteps.push({
                step: `Calling tool: ${toolCall.toolName}`,
                timestamp: Date.now()
              });
            } else if (toolCall.status === 'completed') {
              processSteps.push({
                step: `Tool ${toolCall.toolName} completed`,
                timestamp: Date.now()
              });
            } else if (toolCall.status === 'failed') {
              processSteps.push({
                step: `Tool ${toolCall.toolName} failed`,
                timestamp: Date.now()
              });
            }

            updated[assistantMessageIndex] = {
              ...current,
              toolCalls: newToolCalls,
              process: processSteps
            };
            return updated;
          });
        }
      );

      // Add "Response complete" step
      setMessages(prev => {
        const updated = [...prev];
        const current = updated[assistantMessageIndex];
        updated[assistantMessageIndex] = {
          ...current,
          loading: false,
          process: [...(current.process || []), {
            step: 'Response complete',
            timestamp: Date.now()
          }]
        };
        return updated;
      });

    } catch (err) {
      setError(err.message);
      setMessages(prev => {
        const updated = [...prev];
        updated[assistantMessageIndex] = {
          role: 'assistant',
          content: `Error: ${err.message}`,
          loading: false,
          error: true
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <h1>Zo Computer Chat</h1>
        <p className="subtitle">Powered by GLM-4.7 + Zo MCP</p>
      </div>

      <div className="messages-container">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-role">
              {msg.role === 'user' ? '👤 You' : '🤖 Assistant'}
            </div>
            <div className="message-content">
              {/* Show process steps for assistant messages */}
              {msg.role === 'assistant' && msg.process && msg.process.length > 0 && (
                <div className="process-timeline">
                  {msg.process.map((step, i) => (
                    <div key={i} className="process-step">
                      <span className="step-indicator">›</span>
                      <span className="step-text">{step.step}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Show tool calls as they happen */}
              {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="tool-calls-live">
                  {msg.toolCalls.map((tool, i) => (
                    <div key={i} className={`tool-call-item ${tool.status || ''}`}>
                      <span className="tool-icon">🔧</span>
                      <span className="tool-name">{tool.toolName}</span>
                      {tool.status === 'starting' && (
                        <span className="tool-status starting">⋯</span>
                      )}
                      {tool.status === 'executing' && (
                        <span className="tool-status executing">⏳</span>
                      )}
                      {tool.status === 'completed' && (
                        <span className="tool-status success">✓</span>
                      )}
                      {tool.status === 'failed' && (
                        <span className="tool-status failure">✗</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Main content */}
              {msg.loading && !msg.content ? (
                <div className="loading-indicator">
                  <span className="dot"></span>
                  <span className="dot"></span>
                  <span className="dot"></span>
                </div>
              ) : msg.error ? (
                <div className="error-message">{msg.content}</div>
              ) : msg.content ? (
                <div className="message-text">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : null}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={loading}
          className="message-input"
        />
        <button type="submit" disabled={loading || !input.trim()} className="send-button">
          <span>{loading ? 'Sending...' : 'Send'}</span>
        </button>
      </form>
    </div>
  );
}
