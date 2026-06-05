import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { InterviewIndexPage } from './pages/InterviewIndexPage';
import { InterviewPage } from './pages/InterviewPage';
import { AboutPage } from './pages/AboutPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="interview" element={<InterviewIndexPage />} />
        <Route path="interview/:id" element={<InterviewPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}
