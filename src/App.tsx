import {BrowserRouter as Router, Route, Routes} from 'react-router-dom';
import HeroSection from './components/HeroSection';
import AboutSection from './components/AboutSection';
import FeaturedVideoSection from './components/FeaturedVideoSection';
import PhilosophySection from './components/PhilosophySection';
import ServicesSection from './components/ServicesSection';
import CTASection from './components/CTASection';
import Footer from './components/Footer';
import Dashboard from './components/Dashboard';
import ProfileSettings from './components/ProfileSettings';
import CourseDetail from './components/CourseDetail';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import CreditsTopUp from './components/CreditsTopUp';
import AdminAgingReport from './components/AdminAgingReport';
import TutorEarningsDashboard from './components/TutorEarningsDashboard';
import RoleGate from './components/RoleGate';
import {ThemeProvider} from './lib/theme';

function LandingPage() {
  return (
    <div className="theme-force-dark bg-black text-white">
      <HeroSection />
      <AboutSection />
      <FeaturedVideoSection />
      <PhilosophySection />
      <ServicesSection />
      <CTASection />
      <Footer />
    </div>
  );
}

function LoginPage() {
  return (
    <div className="theme-force-dark bg-black text-white">
      <HeroSection />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Router>
        <div className="min-h-screen bg-black font-sans selection:bg-white/30 selection:text-white">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/profile" element={<ProfileSettings />} />
                <Route path="/courses/:courseId" element={<CourseDetail />} />
                <Route path="/credits" element={<CreditsTopUp />} />
                <Route path="/checkout/success" element={<CreditsTopUp />} />
                <Route path="/checkout/cancel" element={<CreditsTopUp />} />
                <Route
                  path="/tutor/earnings"
                  element={
                    <RoleGate requireTutor>
                      <TutorEarningsDashboard />
                    </RoleGate>
                  }
                />
                <Route
                  path="/admin/aging"
                  element={
                    <RoleGate requireAdmin>
                      <AdminAgingReport />
                    </RoleGate>
                  }
                />
              </Route>
            </Route>
          </Routes>
        </div>
      </Router>
    </ThemeProvider>
  );
}
