import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import SoloTripPage from './pages/SoloTripPage';
import GroupTripPage from './pages/GroupTripPage';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/solo-trip" element={<SoloTripPage />} />
        <Route path="/group-trip" element={<GroupTripPage />} />
      </Routes>
    </Router>
  );
}

export default App; 