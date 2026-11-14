import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import { SelectorPage } from './pages/SelectorPage';
import { AboutPage } from './pages/AboutPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { DisclaimerPage } from './pages/DisclaimerPage';
import { CheckGamePage } from './pages/CheckGamePage';
import { NumberTrainerPage } from './pages/NumberTrainerPage';
import { SalaryCalculatorPage } from './pages/SalaryCalculatorPage';
import { CalendarPage } from './pages/CalendarPage';
import { MapPage } from './pages/MapPage';
import { VenuePage } from './pages/VenuePage';
import { OfficialDocPracticePage } from './pages/OfficialDocPracticePage';
import { ExperiencePage } from './pages/ExperiencePage';
import { ExperiencePostPage } from './pages/ExperiencePostPage';
import { ResourceGuidePage } from './pages/ResourceGuidePage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="selector" element={<SelectorPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="disclaimer" element={<DisclaimerPage />} />
        <Route path="check-game" element={<CheckGamePage />} />
        <Route path="number-trainer" element={<NumberTrainerPage />} />
        <Route path="salary" element={<SalaryCalculatorPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="scores-map" element={<MapPage />} />
        <Route path="venues" element={<VenuePage />} />
        <Route path="official-doc-practice" element={<OfficialDocPracticePage />} />
        <Route path="official-doc-practice/:questionId" element={<OfficialDocPracticePage />} />
        <Route path="experience" element={<ExperiencePage />} />
        <Route path="experience/:id" element={<ExperiencePostPage />} />
        <Route path="interview-guide" element={<ResourceGuidePage guidePath="/interview-guide" />} />
        <Route path="methodology" element={<ResourceGuidePage guidePath="/methodology" />} />
        <Route path="*" element={<LandingPage />} />
      </Route>
    </Routes>
  );
}
