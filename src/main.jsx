import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'        // ✅ Tailwind 지시문이 들어있는 CSS 반드시 import

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)