import { useState, useRef } from 'react';
import ChatInterface from './components/ChatInterface';
import LogsViewer from './components/LogsViewer';
import ChatHistory from './components/ChatHistory';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('chat');
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const chatHistoryRef = useRef(null);

  // Refresh chat history (called after message sent or conversation deleted)
  const refreshChatHistory = () => {
    chatHistoryRef.current?.refresh();
  };

  // Create new conversation
  const handleNewConversation = async () => {
    try {
      console.log('Creating new conversation...');
      const response = await fetch('http://localhost:3001/api/chat/history/new', {
        method: 'POST'
      });
      const data = await response.json();
      console.log('New conversation created:', data.conversationId);
      setConversationId(data.conversationId);
      setMessages([]);
    } catch (err) {
      console.error('Failed to create new conversation:', err);
      alert(`Failed to create new conversation: ${err.message}`);
    }
  };

  // Select existing conversation
  const handleSelectConversation = (id, loadedMessages) => {
    setConversationId(id);
    setMessages(loadedMessages);
  };

  return (
    <div className="app">
      <ChatHistory
        ref={chatHistoryRef}
        currentConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
      />

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          💬 Chat
        </button>
        <button
          className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          📊 Logs
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'chat' ? (
          <ChatInterface
            conversationId={conversationId}
            initialMessages={messages}
            onConversationChange={(id) => setConversationId(id)}
            onMessageSent={refreshChatHistory}
          />
        ) : (
          <LogsViewer />
        )}
      </div>
    </div>
  );
}

export default App;
