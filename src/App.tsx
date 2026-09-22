import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';

import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard/Dashboard';
import Records from './pages/Records/Records';
import Settings from './pages/Settings/Settings';
import PersonalSettings from './pages/PersonalSettings/PersonalSettings';
import Login from './pages/Login/Login';
import Signup from './pages/Login/Signup';
import FishSelect from './pages/FishSelect/FishSelect';
import CameraSetup from './pages/CameraSetup/CameraSetup';
import AdminTest from './pages/AdminTest/AdminTest';
import { useAppContext } from './context/AppContext';

function RequireAuth() {
  const { currentUser, authLoading, fishSpecies, fishLoading } = useAppContext();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        불러오는 중...
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (fishLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">
        불러오는 중...
      </div>
    );
  }

  // 물고기가 아직 설정되지 않은 계정은 선택 화면으로 강제 이동
  if (!fishSpecies && location.pathname !== '/select-fish') {
    return <Navigate to="/select-fish" replace />;
  }

  // admin(물리 어항 소유자)을 제외하고, 카메라 연결을 아직 안 한
  // 계정은 연결 화면으로 강제 이동. 물고기 선택보다 뒤 순서.
  if (
    currentUser.role !== 'admin' &&
    !currentUser.cameraConfigured &&
    location.pathname !== '/setup-camera' &&
    location.pathname !== '/select-fish'
  ) {
    return <Navigate to="/setup-camera" replace />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <Router>
      <Routes>

        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route element={<RequireAuth />}>

          <Route path="/select-fish" element={<FishSelect />} />

          <Route path="/setup-camera" element={<CameraSetup />} />

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

            <Route
              path="admin-test"
              element={<AdminTest />}
            />

          </Route>

        </Route>

      </Routes>
    </Router>
  );
}