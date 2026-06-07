import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { AboutPage } from './pages/AboutPage';
import { CheckGamePage } from './pages/CheckGamePage';
import { NumberTrainerPage } from './pages/NumberTrainerPage';
import { CalendarPage } from './pages/CalendarPage';
import { MapPage } from './pages/MapPage';
import { AdminPage } from './pages/AdminPage';

// In production the admin lives on its own subdomain (admin.你的網域). There the
// whole site IS the admin panel — no public nav/footer.
const isAdminHost = typeof window !== 'undefined' && /^admin\./i.test(window.location.hostname);
// The `/admin` path is only wired up in local dev (where there's no subdomain to
// use). In a production build the route doesn't exist, so the main domain's
// /admin just falls through to the home page — admin is reachable only via the
// subdomain. (Security still comes from ADMIN_TOKEN on the API, not this routing.)
const allowAdminPath = import.meta.env.DEV;

export function App() {
  if (isAdminHost) return <AdminPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="check-game" element={<CheckGamePage />} />
        <Route path="number-trainer" element={<NumberTrainerPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="scores-map" element={<MapPage />} />
        {allowAdminPath && <Route path="admin" element={<AdminPage />} />}
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}
