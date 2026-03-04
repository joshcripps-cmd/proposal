import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
        
        {/* Default redirect */}
        <Route path="*" element={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
            <div style={{ textAlign: 'center' }}>
              <img src="/logo.png" alt="Roccabella Yachts" style={{ width: 200, marginBottom: 24 }} />
              <p style={{ color: '#64748b' }}>Proposal system active.</p>
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
