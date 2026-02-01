import {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import ReactMarkdown from "react-markdown";
import { api } from "../services/api";
import { showToast } from "./Toast";
import ToolCallSegment from "./ToolCallSegment";
import "./ChatInterface.css";

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
    externalDisabled = false,
    externalDisabledMessage = "Assistant is busy. Please wait for the current response to finish.",
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
  const [compressionConfig, setCompressionConfig] = useState({
    minimumMessages: 6,
    threshold: 100000,
    keepRecentMessages: 5
  });
  const messagesEndRef = useRef(null);
  const idleTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  // Expose sendMessage method to parent via ref
  useImperativeHandle(
    ref,
    () => ({
      sendMessage: (text) => {
        if (!text) {
          return;
        }

        if (externalDisabled) {
          showToast(externalDisabledMessage, 'warning');
          return;
        }

        if (loading || compressing) {
          if (compressing) {
            showToast('Please wait for compression to complete', 'warning');
          }
          return;
        }

        if (text) {
          setInput(text);
          // Use setTimeout to ensure state is updated before submitting
          setTimeout(() => {
            inputRef.current?.form?.requestSubmit();
          }, 0);
        }
      },
    }),
    [loading, compressing, externalDisabled, externalDisabledMessage],
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

  // Fetch compression configuration on mount
  useEffect(() => {
    const fetchCompressionConfig = async () => {
      try {
        const response = await fetch(`${api.API_URL}/api/chat/compression/config`);
        if (response.ok) {
          const config = await response.json();
          setCompressionConfig(config);
        }
      } catch (err) {
        console.error('Failed to fetch compression config:', err);
        // Keep default values
      }
    };
    fetchCompressionConfig();
  }, []);

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
    if (!currentConversationId || compressing) {
      return;
    }

    setCompressing(true);
    setError(null);
    showToast('Compressing conversation...', 'info');

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

      showToast(`Compressed ${data.compressedCount} messages successfully`, 'success');
      console.log(`Compressed ${data.compressedCount} messages`);
    } catch (err) {
      console.error("Failed to compress conversation:", err);
      setError(`Compression failed: ${err.message}`);
      showToast(`Compression failed: ${err.message}`, 'error');
    } finally {
      setCompressing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (externalDisabled) {
      showToast(externalDisabledMessage, 'warning');
      return;
    }
    if (!input.trim() || loading || compressing) {
      if (compressing) {
        showToast('Please wait for compression to complete', 'warning');
      }
      return;
    }

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
        segments: [],
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
        (content, segmentIndex) => {
          // Switch to talking state when receiving content
          updateStreamingState("talking");

          setMessages((prev) => {
            const updated = [...prev];
            const current = updated[assistantMessageIndex];

            // Handle segmented content
            if (segmentIndex !== undefined) {
              const segments = [...(current.segments || [])];
              // Find or create the text segment at this index
              const existingSegment = segments.findIndex(
                (s) => s.type === "text" && s._segmentIndex === segmentIndex
              );
              if (existingSegment >= 0) {
                // Update existing text segment
                segments[existingSegment] = {
                  ...segments[existingSegment],
                  content: segments[existingSegment].content + content,
                };
              } else {
                // Add new text segment
                segments.push({
                  type: "text",
                  content,
                  _segmentIndex: segmentIndex,
                });
              }
              updated[assistantMessageIndex] = {
                ...current,
                segments,
                loading: false,
              };
            } else {
              // Backward compatibility: update content directly
              updated[assistantMessageIndex] = {
                ...current,
                content: current.content + content,
                loading: false,
              };
            }
            return updated;
          });
        },
        // onToolCall - called when tool is used
        (toolCall, segmentIndex) => {
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

            // Handle segmented tool calls
            if (segmentIndex !== undefined) {
              const segments = [...(current.segments || [])];
              // Find or create the tool call segment at this index
              const existingSegmentIndex = segments.findIndex(
                (s) =>
                  s.type === "tool_call" &&
                  s._segmentIndex === segmentIndex
              );

              if (existingSegmentIndex >= 0) {
                // Update existing tool call segment
                segments[existingSegmentIndex] = {
                  ...segments[existingSegmentIndex],
                  toolName: toolCall.toolName,
                  args: toolCall.args,
                  result: toolCall.result,
                  status: toolCall.status,
                  success: toolCall.success,
                  error: toolCall.error,
                };
              } else {
                // Add new tool call segment
                segments.push({
                  type: "tool_call",
                  toolName: toolCall.toolName,
                  args: toolCall.args,
                  result: toolCall.result,
                  status: toolCall.status,
                  success: toolCall.success,
                  error: toolCall.error,
                  _segmentIndex: segmentIndex,
                });
              }

              updated[assistantMessageIndex] = {
                ...current,
                segments,
              };
            }

            // Always update toolCalls array for backward compatibility
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
              ...updated[assistantMessageIndex],
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

          showToast(`Auto-compressed ${compressionData.compressedCount} messages successfully`, 'success');
          console.log(`Auto-compressed ${compressionData.compressedCount} messages`);
          setCompressing(false);
        },
        // onCompressionStart - called when compression starts
        () => {
          showToast('Auto-compressing conversation...', 'info');
          setCompressing(true);
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
                {msg.loading && !msg.content && (!msg.segments || msg.segments.length === 0) ? (
                  <div className="loading-indicator">
                    <span className="dot"></span>
                    <span className="dot"></span>
                    <span className="dot"></span>
                  </div>
                ) : msg.error ? (
                  <div className="error-message">{msg.content}</div>
                ) : msg.segments && msg.segments.length > 0 ? (
                  <>
                    {msg.segments.map((segment, segmentIdx) => (
                      <div key={segmentIdx} className="message-segment">
                        {segment.type === "text" ? (
                          <div className="message-text">
                            <ReactMarkdown>{segment.content}</ReactMarkdown>
                          </div>
                        ) : segment.type === "tool_call" ? (
                          <ToolCallSegment
                            toolName={segment.toolName}
                            args={segment.args}
                            result={segment.result}
                            status={segment.status}
                            success={segment.success}
                            error={segment.error}
                          />
                        ) : null}
                      </div>
                    ))}
                    {/* Show loading dots at end of message while still generating */}
                    {msg.loading && (
                      <div className="inline-loading">
                        <span className="dot"></span>
                        <span className="dot"></span>
                        <span className="dot"></span>
                      </div>
                    )}
                  </>
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
                    {/* Backward compatibility: render tool calls inline */}
                    {msg.toolCalls && msg.toolCalls.map((toolCall, toolIdx) => (
                      <ToolCallSegment
                        key={toolIdx}
                        toolName={toolCall.toolName}
                        args={toolCall.args}
                        result={toolCall.result}
                        status={toolCall.status}
                        success={toolCall.success}
                        error={toolCall.error}
                      />
                    ))}
                  </>
                ) : null}
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
          placeholder={compressing ? "Compressing conversation..." : "Type a message..."}
          disabled={loading || compressing || externalDisabled}
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
            disabled={!input.trim() || compressing || externalDisabled}
            className="send-button"
            title={compressing ? "Compressing conversation..." : "Send message"}
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
          {currentConversationId && (() => {
            const hasNewMessages = compressionInfo.compressionSummary
              ? messages.length > compressionInfo.compressedMessageCount + compressionConfig.keepRecentMessages
              : true;
            const canCompress = messages.length >= compressionConfig.minimumMessages && hasNewMessages;

            return (
              <button
                type="button"
                className="compress-context-button"
                onClick={handleCompress}
                disabled={compressing || !canCompress}
                title={
                  compressing
                    ? "Compressing..."
                    : !hasNewMessages
                      ? "No new messages to compress"
                      : messages.length < compressionConfig.minimumMessages
                        ? `Need at least ${compressionConfig.minimumMessages} messages to compress`
                        : compressionInfo.compressionSummary
                          ? "Re-compress conversation context"
                          : "Compress conversation context"
                }
              >
                {compressing ? (
                  <span className="loading-dots">
                    <span className="dot">.</span>
                    <span className="dot">.</span>
                    <span className="dot">.</span>
                  </span>
                ) : (
                  '[compress context]'
                )}
              </button>
            );
          })()}
        </div>
      )}
    </div>
  );
});

export default ChatInterface;
