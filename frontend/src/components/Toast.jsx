import { useState, useEffect } from 'react';
import './Toast.css';

let toastId = 0;
const listeners = new Set();

export const showToast = (message, type = 'success') => {
  const id = toastId++;
  listeners.forEach(listener => listener({ id, message, type }));
  return id;
};

export default function Toast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const listener = (toast) => {
      setToasts(prev => [...prev, toast]);

      // Auto-remove after 3 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, 3000);
    };

    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          {toast.type === 'success' && <span className="toast-icon">✓</span>}
          {toast.type === 'error' && <span className="toast-icon">✗</span>}
          <span className="toast-message">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
