import {useEffect, useState} from 'react';
import {getIdTokenResult} from 'firebase/auth';
import {BarChart3, BookOpen, Globe, LogOut, Plus, Settings2, Sparkles, WalletCards} from 'lucide-react';
import {NavLink, Outlet, useLocation, useNavigate} from 'react-router-dom';
import {auth} from '../lib/firebase';
import ThemeToggle from './ThemeToggle';

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();

  const user = auth.currentUser;
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Learner';
  const [roles, setRoles] = useState({admin: false, tutor: false});
  const isDashboard = location.pathname === '/dashboard';

  useEffect(() => {
    let cancelled = false;
    async function loadRoles() {
      if (!user) return;
      try {
        const token = await getIdTokenResult(user, true);
        if (!cancelled) {
          setRoles({
            admin: token.claims.admin === true,
            tutor: token.claims.tutor === true || token.claims.admin === true,
          });
        }
      } catch (error) {
        console.error('Failed to read navigation roles', error);
      }
    }
    loadRoles();
    return () => { cancelled = true; };
  }, [user]);

  return (
    <div className="h-screen flex flex-col bg-black text-white overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[20rem] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.09),_transparent_60%)] pointer-events-none z-0" />

      {/* ── Compact single-row header ── */}
      <header className="relative z-10 border-b border-white/8 backdrop-blur-md bg-black/75 shrink-0 shadow-[0_1px_0_rgba(255,255,255,0.04)]">
        <div className="h-12 px-4 flex items-center gap-3">

          {/* Logo */}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 shrink-0 mr-1"
          >
            <div className="w-8 h-8 rounded-xl liquid-glass border border-white/10 flex items-center justify-center">
              <Globe className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-tight hidden sm:block">Tutivex</span>
          </button>

          {/* Nav pills */}
          <nav className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto no-scrollbar">
            <NavLink
              to="/dashboard"
              className={({isActive}) =>
                `rounded-full px-3 py-1.5 text-xs font-medium transition-colors border whitespace-nowrap inline-flex items-center gap-1.5 ${
                  isActive ? 'bg-white/12 text-white border-white/20' : 'text-white/62 border-white/10 hover:bg-white/[0.04] hover:text-white hover:border-white/20'
                }`
              }
            >
              <BookOpen className="w-3.5 h-3.5" />
              Dashboard
            </NavLink>
            <NavLink
              to="/profile"
              className={({isActive}) =>
                `rounded-full px-3 py-1.5 text-xs font-medium transition-colors border whitespace-nowrap inline-flex items-center gap-1.5 ${
                  isActive ? 'bg-white/12 text-white border-white/20' : 'text-white/62 border-white/10 hover:bg-white/[0.04] hover:text-white hover:border-white/20'
                }`
              }
            >
              <Settings2 className="w-3.5 h-3.5" />
              Profile
            </NavLink>
            {roles.tutor ? (
              <NavLink
                to="/tutor/earnings"
                className={({isActive}) =>
                  `rounded-full px-3 py-1.5 text-xs font-medium transition-colors border whitespace-nowrap inline-flex items-center gap-1.5 ${
                    isActive ? 'bg-white/12 text-white border-white/20' : 'text-white/62 border-white/10 hover:bg-white/[0.04] hover:text-white hover:border-white/20'
                  }`
                }
              >
                <WalletCards className="w-3.5 h-3.5" />
                Tutor
              </NavLink>
            ) : null}
            {roles.admin ? (
              <NavLink
                to="/admin/aging"
                className={({isActive}) =>
                  `rounded-full px-3 py-1.5 text-xs font-medium transition-colors border whitespace-nowrap inline-flex items-center gap-1.5 ${
                    isActive ? 'bg-white/12 text-white border-white/20' : 'text-white/62 border-white/10 hover:bg-white/[0.04] hover:text-white hover:border-white/20'
                  }`
                }
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Admin
              </NavLink>
            ) : null}
          </nav>

          {/* Right controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Greeting (desktop only) */}
            <span className="text-xs text-white/40 hidden lg:block mr-1">
              {displayName}
            </span>

            {/* TOP UP — always visible, prominent */}
            <NavLink
              to="/credits"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.06] text-white/78 px-3 py-1.5 text-xs font-semibold hover:bg-white/[0.1] hover:text-white transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Top Up
            </NavLink>

            <div className="w-px h-4 bg-white/10 mx-0.5" />

            <ThemeToggle compact />

            <button
              type="button"
              onClick={() => auth.signOut()}
              className="rounded-full p-1.5 text-white/50 border border-white/10 hover:text-white hover:border-white/25 transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>

            <div className="w-7 h-7 rounded-xl liquid-glass border border-white/10 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white/60" />
            </div>
          </div>
        </div>
      </header>

      {/* ── Content area ── */}
      <main className={`relative z-10 flex-1 min-h-0 ${isDashboard ? '' : 'overflow-y-auto'}`}>
        {isDashboard ? (
          <Outlet />
        ) : (
          <div className="max-w-7xl mx-auto px-6 py-8">
            <Outlet />
          </div>
        )}
      </main>
    </div>
  );
}
