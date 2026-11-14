import React from 'react';
import ReactDOM from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles.css';
import { AdminPage } from './pages/AdminPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminPage />
  </React.StrictMode>,
);
