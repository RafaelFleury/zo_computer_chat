import { useState, useEffect } from 'react';
import { api } from '../services/api';
import './LogsViewer.css';

export default function LogsViewer({ isProcessing = false }) {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchLogs = async () => {
    try {
      const filterType = filter === 'all' ? null : filter;
      const response = await api.getLogs(filterType);
      setLogs(response.logs);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  useEffect(() => {
    // Only poll if processing OR auto-refresh is manually enabled
    if (!autoRefresh && !isProcessing) return;

    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [autoRefresh, isProcessing, filter]);

  const handleClearLogs = async () => {
    if (confirm('Are you sure you want to clear all logs?')) {
      try {
        await api.clearLogs();
        setLogs([]);
      } catch (error) {
        console.error('Failed to clear logs:', error);
      }
    }
  };

  const getLogColor = (type) => {
    switch (type) {
      case 'user_message': return '#3b82f6';
      case 'assistant_message': return '#10b981';
      case 'tool_call': return '#f59e0b';
      case 'error': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div className="logs-viewer">
      <div className="logs-header">
        <h2>Activity Logs</h2>
        <div className="logs-controls">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-select">
            <option value="all">All Logs</option>
            <option value="user_message">User Messages</option>
            <option value="assistant_message">Assistant Messages</option>
            <option value="tool_call">Tool Calls</option>
            <option value="error">Errors</option>
          </select>
          <label className="auto-refresh-label">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button onClick={fetchLogs} className="refresh-button">
            🔄 Refresh
          </button>
          <button onClick={handleClearLogs} className="clear-button">
            🗑️ Clear
          </button>
        </div>
      </div>

      <div className="logs-container">
        {logs.length === 0 ? (
          <div className="empty-state">No logs yet</div>
        ) : (
          logs.map((log, idx) => (
            <div key={idx} className="log-entry" style={{ borderLeftColor: getLogColor(log.type) }}>
              <div className="log-header">
                <span className="log-type" style={{ color: getLogColor(log.type) }}>
                  {log.type}
                </span>
                <span className="log-timestamp">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="log-content">
                {log.type === 'tool_call' && (
                  <div className="tool-call-log">
                    <strong>Tool:</strong> {log.toolName}
                    <br />
                    <strong>Status:</strong> {log.success ? '✓ Success' : '✗ Failed'}
                    {log.args && (
                      <>
                        <br />
                        <strong>Args:</strong>
                        <pre>{JSON.stringify(log.args, null, 2)}</pre>
                      </>
                    )}
                    {log.result && (
                      <>
                        <br />
                        <strong>Result:</strong>
                        <pre>{JSON.stringify(log.result, null, 2)}</pre>
                      </>
                    )}
                    {log.error && (
                      <>
                        <br />
                        <strong className="error-text">Error:</strong> {log.error}
                      </>
                    )}
                  </div>
                )}
                {log.type === 'user_message' && (
                  <div>
                    <strong>Message:</strong> {log.message}
                  </div>
                )}
                {log.type === 'assistant_message' && (
                  <div>
                    <strong>Message:</strong> {log.message}
                    {log.usage && (
                      <div className="usage-info">
                        <small>
                          Tokens: {log.usage.total_tokens}
                          (prompt: {log.usage.prompt_tokens}, completion: {log.usage.completion_tokens})
                        </small>
                      </div>
                    )}
                    {log.toolCalls > 0 && (
                      <div className="tool-count">
                        <small>🔧 {log.toolCalls} tool call(s)</small>
                      </div>
                    )}
                  </div>
                )}
                {log.type === 'error' && (
                  <div className="error-log">
                    <strong>Error:</strong> {log.error}
                    {log.stack && (
                      <details>
                        <summary>Stack trace</summary>
                        <pre>{log.stack}</pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
