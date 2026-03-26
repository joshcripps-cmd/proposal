import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProposalViewer from './components/ProposalViewer';
import AdminDashboard from './components/AdminDashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Client-facing proposal viewer */}
        <Route path="/p/:slug" element={<ProposalViewer />} />
        
        {/* Admin dashboard */}
        <Route path="/admin/*" element={<AdminDashboard />} />
        
        {/* Root redirects to admin */}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
