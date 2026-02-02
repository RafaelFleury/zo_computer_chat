import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Set actual viewport height (accounts for mobile browser chrome)
const setVH = () => {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
};

// Set initial value
setVH();

// Update on resize
window.addEventListener('resize', setVH);

// Update on orientation change (mobile)
window.addEventListener('orientationchange', setVH);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
