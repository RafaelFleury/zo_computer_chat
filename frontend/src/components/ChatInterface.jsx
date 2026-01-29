import {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import ReactMarkdown from "react-markdown";
import { api } from "../services/api";
import "./ChatInterface.css";

// Tool calls expandable footer component
function ToolCallsFooter({ toolCalls }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="tool-calls-footer">
      <button
        className="tool-calls-summary"
        onClick={() => setExpanded(!expanded)}
      >
        ⚡ {toolCalls.length} {toolCalls.length === 1 ? 'tool' : 'tools'} used
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="tool-calls-details">
          {toolCalls.map((tool, i) => (
            <div key={i} className="tool-call-item">
              <div className="tool-call-name">{tool.toolName}</div>
              <div className="tool-call-status">{tool.status}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ChatInterface = forwardRef(function ChatInterface(
  {
    conversationId,
    initialMessages,
    initialUsage,
    initialCompressionInfo,
    onConversationChange,
    onMessageSent,
    onProcessingChange,
    onStreamingStateChange,
    onToolCallsUpdate,
    onMessagesUpdate,
  },
  ref,
) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentConversationId, setCurrentConversationId] =
    useState(conversationId);
  const [usage, setUsage] = useState(null);
  const [showContext, setShowContext] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [compressionInfo, setCompressionInfo] = useState({
    compressionSummary: null,
    compressedAt: null,
    compressedMessageCount: 0
  });
  const [compressing, setCompressing] = useState(false);
  const messagesEndRef = useRef(null);
  const idleTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  // Expose sendMessage method to parent via ref
  useImperativeHandle(
    ref,
    () => ({
      sendMessage: (text) => {
        if (text && !loading) {
          setInput(text);
          // Use setTimeout to ensure state is updated before submitting
          setTimeout(() => {
            inputRef.current?.form?.requestSubmit();
          }, 0);
        }
      },
    }),
    [loading],
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Notify parent when messages change (for FaceTimeView sync)
  useEffect(() => {
    onMessagesUpdate?.(messages);
  }, [messages, onMessagesUpdate]);

  // Update messages when initialMessages change (from conversation selection)
  useEffect(() => {
    console.log("Initial messages changed:", initialMessages?.length);
    if (initialMessages !== undefined) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  // Update usage when initialUsage changes
  useEffect(() => {
    if (initialUsage !== undefined) {
      setUsage(initialUsage);
    }
  }, [initialUsage]);

  // Update compression info when initialCompressionInfo changes
  useEffect(() => {
    if (initialCompressionInfo !== undefined) {
      setCompressionInfo(initialCompressionInfo);
    }
  }, [initialCompressionInfo]);

  // Update conversationId when prop changes
  useEffect(() => {
    console.log("Conversation ID changed:", conversationId);
    if (conversationId !== undefined) {
      setCurrentConversationId(conversationId);
    }
  }, [conversationId]);

  // Cleanup idle timeout on unmount
  useEffect(() => {
    return () => {
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
    };
  }, []);

  // Helper to update streaming state with debounced idle transition
  const updateStreamingState = (status) => {
    // Clear any pending idle timeout
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }

    if (status === "idle") {
      // Delay idle transition to prevent flicker
      idleTimeoutRef.current = setTimeout(() => {
        onStreamingStateChange?.("idle");
      }, 2000);
    } else {
      onStreamingStateChange?.(status);
    }
  };

  const handleStop = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setLoading(false);
      onProcessingChange?.(false);
      updateStreamingState("idle");
    }
  };

  const handleCompress = async () => {
    if (!currentConversationId || compressing || compressionInfo.compressionSummary) {
      return;
    }

    setCompressing(true);
    setError(null);

    try {
      const response = await fetch(
        `${api.API_URL}/api/chat/compress/${currentConversationId}`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Compression failed");
      }

      const data = await response.json();

      setCompressionInfo({
        compressionSummary: data.summary,
        compressedAt: data.compressedAt,
        compressedMessageCount: data.compressedCount
      });

      console.log(`Compressed ${data.compressedCount} messages`);
    } catch (err) {
      console.error("Failed to compress conversation:", err);
      setError(`Compression failed: ${err.message}`);
    } finally {
      setCompressing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setError(null);

    // Create abort controller for this request
    const controller = new AbortController();
    setAbortController(controller);

    // Immediately reflect that we're listening for the assistant to respond.
    // This prevents FaceTimeView from entering "sleep" while the request is in-flight.
    updateStreamingState("listening");

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    // Add placeholder for assistant message
    const assistantMessageIndex = messages.length + 1;
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "",
        loading: true,
        toolCalls: [],
        process: [], // Track process steps
      },
    ]);

    setLoading(true);
    onProcessingChange?.(true);

    // Track active tool calls for face animation
    let activeToolCalls = [];

    try {
      // Create new conversation if none exists
      let convId = currentConversationId;
      if (!convId) {
        const newConvResponse = await fetch(
          `${api.API_URL}/api/chat/history/new`,
          {
            method: "POST",
          },
        );
        const newConvData = await newConvResponse.json();
        convId = newConvData.conversationId;
        setCurrentConversationId(convId);
        if (onConversationChange) {
          onConversationChange(convId);
        }
      }

      // Add "Request received" step
      setMessages((prev) => {
        const updated = [...prev];
        updated[assistantMessageIndex] = {
          ...updated[assistantMessageIndex],
          process: [{ step: "Request received", timestamp: Date.now() }],
        };
        return updated;
      });

      // Use streaming API with abort signal
      await api.streamMessage(
        userMessage,
        convId,
        // onChunk - called for each content piece
        (content) => {
          // Switch to talking state when receiving content
          updateStreamingState("talking");

          setMessages((prev) => {
            const updated = [...prev];
            const current = updated[assistantMessageIndex];
            updated[assistantMessageIndex] = {
              ...current,
              content: current.content + content,
              loading: false,
            };
            return updated;
          });
        },
        // onToolCall - called when tool is used
        (toolCall) => {
          // Switch to thinking state when tool is called
          updateStreamingState("thinking");

          // Update active tool calls for face animation
          const existingIndex = activeToolCalls.findIndex(
            (t) =>
              t.toolName === toolCall.toolName &&
              t.status !== "completed" &&
              t.status !== "failed",
          );

          if (existingIndex >= 0) {
            activeToolCalls[existingIndex] = toolCall;
          } else {
            activeToolCalls = [...activeToolCalls, toolCall];
          }

          // Notify parent of tool calls update
          onToolCallsUpdate?.(activeToolCalls);

          // If tool completed/failed, check if we should switch back to talking
          if (toolCall.status === "completed" || toolCall.status === "failed") {
            const stillExecuting = activeToolCalls.some(
              (t) => t.status === "executing" || t.status === "starting",
            );
            if (!stillExecuting) {
              // All tools done, switch back to talking (content will follow)
              updateStreamingState("talking");
            }
          }

          setMessages((prev) => {
            const updated = [...prev];
            const current = updated[assistantMessageIndex];

            // Find if this tool call already exists (update status)
            const existingToolIndex = current.toolCalls?.findIndex(
              (t) =>
                t.toolName === toolCall.toolName &&
                t.status !== "completed" &&
                t.status !== "failed",
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
            if (toolCall.status === "starting") {
              processSteps.push({
                step: `Calling tool: ${toolCall.toolName}`,
                timestamp: Date.now(),
              });
            } else if (toolCall.status === "completed") {
              processSteps.push({
                step: `Tool ${toolCall.toolName} completed`,
                timestamp: Date.now(),
              });
            } else if (toolCall.status === "failed") {
              processSteps.push({
                step: `Tool ${toolCall.toolName} failed`,
                timestamp: Date.now(),
              });
            }

            updated[assistantMessageIndex] = {
              ...current,
              toolCalls: newToolCalls,
              process: processSteps,
            };
            return updated;
          });
        },
        // onUsage - called when usage info is received
        (usageData) => {
          setUsage(usageData);
        },
        // onCompression - called when compression occurs
        (compressionData) => {
          setCompressionInfo({
            compressionSummary: compressionData.summary,
            compressedAt: new Date().toISOString(),
            compressedMessageCount: compressionData.compressedCount
          });
          console.log(`Auto-compressed ${compressionData.compressedCount} messages`);
        },
        // Pass abort signal
        controller.signal,
      );

      // Add "Response complete" step
      setMessages((prev) => {
        const updated = [...prev];
        const current = updated[assistantMessageIndex];
        updated[assistantMessageIndex] = {
          ...current,
          loading: false,
          process: [
            ...(current.process || []),
            {
              step: "Response complete",
              timestamp: Date.now(),
            },
          ],
        };
        return updated;
      });

      // Notify parent that message was sent (to refresh history)
      if (onMessageSent) {
        onMessageSent();
      }

      // Clear tool calls and transition to idle after completion
      activeToolCalls = [];
      onToolCallsUpdate?.([]);
      updateStreamingState("idle");
      setAbortController(null);
    } catch (err) {
      // Check if it was aborted by user
      if (err.name === 'AbortError') {
        setMessages((prev) => {
          const updated = [...prev];
          updated[assistantMessageIndex] = {
            ...updated[assistantMessageIndex],
            loading: false,
            content: updated[assistantMessageIndex].content || '(stopped)',
          };
          return updated;
        });
      } else {
        setError(err.message);
        setMessages((prev) => {
          const updated = [...prev];
          updated[assistantMessageIndex] = {
            role: "assistant",
            content: `Error: ${err.message}`,
            loading: false,
            error: true,
          };
          return updated;
        });
      }

      // Reset to idle on error
      activeToolCalls = [];
      onToolCallsUpdate?.([]);
      updateStreamingState("idle");
      setAbortController(null);
    } finally {
      setLoading(false);
      onProcessingChange?.(false);
    }
  };

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <h1>Zo Computer Chat</h1>
        <p className="subtitle">Powered by GLM-4.7 + Zo MCP</p>
      </div>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="welcome-message">
            <h2>Welcome to ZoBot Chat!</h2>
            <p>How can I help you?</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.role}`}>
              <div className="message-header">
                <div className="message-role">
                  {msg.role === "user" ? "You" : "Zo"}
                </div>
                <div className="message-timestamp">
                  {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </div>
              </div>
              <div className="message-content">
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
                  <>
                    <div className="message-text">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    {/* Show loading dots at end of message while still generating */}
                    {msg.loading && (
                      <div className="inline-loading">
                        <span className="dot"></span>
                        <span className="dot"></span>
                        <span className="dot"></span>
                      </div>
                    )}
                  </>
                ) : null}

                {/* Tool calls footer - expandable */}
                {msg.role === "assistant" &&
                  !msg.loading &&
                  msg.toolCalls &&
                  msg.toolCalls.length > 0 && (
                    <ToolCallsFooter toolCalls={msg.toolCalls} />
                  )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit} className="input-form">
        {usage && (
          <button
            type="button"
            className="info-toggle"
            onClick={() => setShowContext(!showContext)}
            title="Toggle info"
          >
            ⚙
          </button>
        )}
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Auto-resize textarea
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Type a message..."
          disabled={loading}
          className="message-input"
          rows="1"
        />
        {loading ? (
          <button
            type="button"
            onClick={handleStop}
            className="stop-button"
            title="Stop generation"
          >
            ■
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="send-button"
          >
            <span>Send</span>
          </button>
        )}
      </form>
      {showContext && usage && (
        <div className="context-footer">
          <div className="context-stats">
            <span className="context-stat">
              Prompt: {usage.prompt_tokens?.toLocaleString() || 0}
            </span>
            <span className="context-stat">
              Completion: {usage.completion_tokens?.toLocaleString() || 0}
            </span>
            <span className="context-stat">
              Total: {usage.total_tokens?.toLocaleString() || 0} / 128K
            </span>
            {compressionInfo.compressionSummary && (
              <span className="context-stat compression-info">
                Compressed: {compressionInfo.compressedMessageCount} messages
              </span>
            )}
          </div>
          {!compressionInfo.compressionSummary && currentConversationId && (
            <button
              type="button"
              className="compress-context-button"
              onClick={handleCompress}
              disabled={compressing || messages.length < 6}
              title={messages.length < 6 ? "Need at least 6 messages to compress" : "Compress conversation context"}
            >
              {compressing ? '...' : '[compress context]'}
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default ChatInterface;
