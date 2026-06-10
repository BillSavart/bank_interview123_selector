import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import { SelectorPage } from './pages/SelectorPage';
import { AboutPage } from './pages/AboutPage';
import { CheckGamePage } from './pages/CheckGamePage';
import { NumberTrainerPage } from './pages/NumberTrainerPage';
import { CalendarPage } from './pages/CalendarPage';
import { MapPage } from './pages/MapPage';
import { ExperiencePage } from './pages/ExperiencePage';
import { ExperiencePostPage } from './pages/ExperiencePostPage';
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
  useEffect(() => {
    if (isAdminHost) document.title = '後台管理 | 公股銀行新手村';
  }, []);

  if (isAdminHost) return <AdminPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="selector" element={<SelectorPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="check-game" element={<CheckGamePage />} />
        <Route path="number-trainer" element={<NumberTrainerPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="scores-map" element={<MapPage />} />
        <Route path="experience" element={<ExperiencePage />} />
        <Route path="experience/:id" element={<ExperiencePostPage />} />
        {allowAdminPath && <Route path="admin" element={<AdminPage />} />}
        <Route path="*" element={<LandingPage />} />
      </Route>
    </Routes>
  );
}
