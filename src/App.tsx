import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard/Dashboard';
import Records from './pages/Records/Records';
import RemoteControl from './pages/RemoteControl/RemoteControl';
import Settings from './pages/Settings/Settings';

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
            path="control"
            element={<RemoteControl />}
          />

          <Route
            path="settings"
            element={<Settings />}
          />

        </Route>

      </Routes>
    </Router>
  );
}