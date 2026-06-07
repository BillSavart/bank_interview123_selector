import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { AboutPage } from './pages/AboutPage';
import { CheckGamePage } from './pages/CheckGamePage';
import { NumberTrainerPage } from './pages/NumberTrainerPage';
import { CalendarPage } from './pages/CalendarPage';
import { AdminPage } from './pages/AdminPage';

// In production the admin lives on its own subdomain (admin.你的網域). There the
// whole site IS the admin panel — no public nav/footer. The `/admin` path below
// is only for local dev, where there's no subdomain to use.
const isAdminHost = typeof window !== 'undefined' && /^admin\./i.test(window.location.hostname);

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
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}
