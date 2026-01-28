import { useState, useRef, useCallback } from "react";
import ChatInterface from "./components/ChatInterface";
import LogsViewer from "./components/LogsViewer";
import ChatHistory from "./components/ChatHistory";
import FaceTimeView from "./components/FaceTimeView";
import Toast from "./components/Toast";
import "./App.css";

function App() {
  const [activeTab, setActiveTab] = useState("chat");
  const [conversationId, setConversationId] = useState(null);
  // Messages loaded from conversation history (passed TO ChatInterface)
  const [loadedMessages, setLoadedMessages] = useState([]);
  // Current messages synced FROM ChatInterface (for FaceTimeView)
  const [displayMessages, setDisplayMessages] = useState([]);
  const [usage, setUsage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const chatHistoryRef = useRef(null);
  const chatInterfaceRef = useRef(null);

  // Streaming state for FaceTimeView
  const [streamingState, setStreamingState] = useState({
    status: "idle", // 'idle' | 'talking' | 'thinking'
    lastUpdate: Date.now(),
  });
  const [currentToolCalls, setCurrentToolCalls] = useState([]);

  // Refresh chat history (called after message sent or conversation deleted)
  const refreshChatHistory = () => {
    chatHistoryRef.current?.refresh();
  };

  // Create new conversation
  const handleNewConversation = async () => {
    try {
      console.log("Creating new conversation...");
      const response = await fetch(
        "http://localhost:3001/api/chat/history/new",
        {
          method: "POST",
        },
      );
      const data = await response.json();
      console.log("New conversation created:", data.conversationId);
      setConversationId(data.conversationId);
      setLoadedMessages([]);
      setDisplayMessages([]);
      setUsage(null);
    } catch (err) {
      console.error("Failed to create new conversation:", err);
      alert(`Failed to create new conversation: ${err.message}`);
    }
  };

  // Select existing conversation
  const handleSelectConversation = (id, loadedMsgs, loadedUsage) => {
    setConversationId(id);
    setLoadedMessages(loadedMsgs);
    setDisplayMessages(loadedMsgs);
    setUsage(loadedUsage);
  };

  // Handle streaming state changes from ChatInterface
  const handleStreamingStateChange = (status) => {
    setStreamingState({
      status,
      lastUpdate: Date.now(),
    });
  };

  // Handle tool calls updates from ChatInterface
  const handleToolCallsUpdate = (toolCalls) => {
    setCurrentToolCalls(toolCalls);
  };

  // Handle sending message from FaceTimeView (delegates to ChatInterface)
  const handleSendMessage = useCallback((text) => {
    chatInterfaceRef.current?.sendMessage(text);
  }, []);

  // Handle messages update from ChatInterface (for FaceTimeView sync)
  const handleMessagesUpdate = useCallback((newMessages) => {
    setDisplayMessages(newMessages);
  }, []);

  return (
    <div className={`app ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      <Toast />
      <ChatHistory
        ref={chatHistoryRef}
        currentConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onToggle={setSidebarOpen}
      />

      <div className="tabs">
        <button
          className={`tab ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => setActiveTab("chat")}
        >
          💬 Chat
        </button>
        <button
          className={`tab ${activeTab === "face" ? "active" : ""}`}
          onClick={() => setActiveTab("face")}
        >
          🤖 Face
        </button>
        <button
          className={`tab ${activeTab === "logs" ? "active" : ""}`}
          onClick={() => setActiveTab("logs")}
        >
          📊 Logs
        </button>
      </div>

      <div className="tab-content">
        <div
          className={activeTab === "chat" ? "tab-panel active" : "tab-panel"}
        >
          <ChatInterface
            ref={chatInterfaceRef}
            conversationId={conversationId}
            initialMessages={loadedMessages}
            initialUsage={usage}
            onConversationChange={(id) => setConversationId(id)}
            onMessageSent={refreshChatHistory}
            onProcessingChange={setIsProcessing}
            onStreamingStateChange={handleStreamingStateChange}
            onToolCallsUpdate={handleToolCallsUpdate}
            onMessagesUpdate={handleMessagesUpdate}
          />
        </div>
        <div
          className={activeTab === "face" ? "tab-panel active" : "tab-panel"}
        >
          <FaceTimeView
            streamingState={streamingState}
            currentToolCalls={currentToolCalls}
            conversationId={conversationId}
            messages={displayMessages}
            onSendMessage={handleSendMessage}
            isLoading={isProcessing}
          />
        </div>
        <div
          className={activeTab === "logs" ? "tab-panel active" : "tab-panel"}
        >
          <LogsViewer isProcessing={isProcessing} />
        </div>
      </div>
    </div>
  );
}

export default App;
