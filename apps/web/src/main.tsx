import React from 'react';
import { createRoot } from 'react-dom/client';
import './core-host';
import { App } from './App';
import './style.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
