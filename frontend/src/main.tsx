import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Initialize Telegram WebApp SDK if available
const tgWindow = window as any;
if (tgWindow.Telegram?.WebApp) {
  tgWindow.Telegram.WebApp.ready();
  tgWindow.Telegram.WebApp.expand();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
