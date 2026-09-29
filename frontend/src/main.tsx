import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import ConversationPage from './ConversationPage'

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/conversation" element={<ConversationPage />} />
      <Route
        path="/conversation/:conversationId"
        element={<ConversationPage />}
      />
    </Routes>
  </BrowserRouter>,
)
