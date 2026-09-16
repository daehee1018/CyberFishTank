import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard/Dashboard';
import Records from './pages/Records/Records';
import Settings from './pages/Settings/Settings';
import PersonalSettings from './pages/PersonalSettings/PersonalSettings';

export default function App() {
  return (
    <Router>
      <Routes>

        <Route path="/" element={<Layout />}>

          <Route
            index
            element={<Dashboard />}
          />

          <Route
            path="records"
            element={<Records />}
          />

          <Route
            path="settings"
            element={<Settings />}
          />

          <Route
            path="personal-settings"
            element={<PersonalSettings />}
          />

        </Route>

      </Routes>
    </Router>
  );
}