import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Import Tailwind CSS and Global Styles
import ContestScoringApp from './ContestScoringApp'; // Import the main app component

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ContestScoringApp />
  </React.StrictMode>
);
