import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { AboutPage } from './pages/AboutPage';
import { CheckGamePage } from './pages/CheckGamePage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="check-game" element={<CheckGamePage />} />
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}
