import {useEffect, useState} from 'react';
import {getIdTokenResult} from 'firebase/auth';
import {BarChart3, BookOpen, Globe, LogOut, Settings2, Sparkles, WalletCards} from 'lucide-react';
import {NavLink, Outlet, useLocation, useNavigate} from 'react-router-dom';
import {auth} from '../lib/firebase';

const shellMeta: Record<string, {eyebrow: string; title: string; description: string}> = {
  '/dashboard': {
    eyebrow: 'Learning HQ',
    title: 'Your focused learning workspace',
    description: 'Track progress, continue active courses, and move through your mastery roadmap without leaving the flow.',
  },
  '/profile': {
    eyebrow: 'Profile',
    title: 'Shape the system around you',
    description: 'Tune the preferences and cadence that personalize how Tutivex guides your deep work.',
  },
  '/credits': {
    eyebrow: 'Credits',
    title: 'Manage your learning balance',
    description: 'Top up securely, review payment state, and keep lesson credits ready before the next session.',
  },
  '/tutor/earnings': {
    eyebrow: 'Tutor Finance',
    title: 'Track lessons and payouts',
    description: 'Review earned balance, recent lesson ledger entries, and payout readiness.',
  },
  '/admin/aging': {
    eyebrow: 'Finance Ops',
    title: 'Monitor arrears and aging',
    description: 'Review outstanding invoices, aging buckets, and finance operations from one workspace.',
  },
};

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const meta = shellMeta[location.pathname] ?? {
    eyebrow: 'Course Flow',
    title: 'Stay inside the session',
    description: 'Move through the curriculum with less friction, clearer rituals, and stronger continuity between modules.',
  };

  const user = auth.currentUser;
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Learner';
  const [roles, setRoles] = useState({admin: false, tutor: false});

  useEffect(() => {
    let cancelled = false;

    async function loadRoles() {
      if (!user) {
        return;
      }

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

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_60%)] pointer-events-none" />

      <header className="relative z-10 border-b border-white/8 backdrop-blur-md bg-black/65">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start justify-between gap-4">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex items-center gap-3 text-left"
            >
              <div className="w-11 h-11 rounded-2xl liquid-glass border border-white/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.25em] text-white/45">{meta.eyebrow}</p>
                <h1 className="text-xl md:text-2xl font-serif tracking-tight">{meta.title}</h1>
              </div>
            </button>
          </div>

          <div className="flex flex-col gap-4 lg:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <NavLink
                to="/dashboard"
                className={({isActive}) =>
                  `rounded-full px-4 py-2 text-sm transition-colors border ${
                    isActive ? 'bg-white text-black border-white' : 'text-white/70 border-white/10 hover:text-white hover:border-white/25'
                  }`
                }
              >
                <span className="inline-flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  Dashboard
                </span>
              </NavLink>
              <NavLink
                to="/profile"
                className={({isActive}) =>
                  `rounded-full px-4 py-2 text-sm transition-colors border ${
                    isActive ? 'bg-white text-black border-white' : 'text-white/70 border-white/10 hover:text-white hover:border-white/25'
                  }`
                }
              >
                <span className="inline-flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  Profile
                </span>
              </NavLink>
              {roles.tutor ? (
                <NavLink
                  to="/tutor/earnings"
                  className={({isActive}) =>
                    `rounded-full px-4 py-2 text-sm transition-colors border ${
                      isActive ? 'bg-white text-black border-white' : 'text-white/70 border-white/10 hover:text-white hover:border-white/25'
                    }`
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    <WalletCards className="w-4 h-4" />
                    Tutor
                  </span>
                </NavLink>
              ) : null}
              {roles.admin ? (
                <NavLink
                  to="/admin/aging"
                  className={({isActive}) =>
                    `rounded-full px-4 py-2 text-sm transition-colors border ${
                      isActive ? 'bg-white text-black border-white' : 'text-white/70 border-white/10 hover:text-white hover:border-white/25'
                    }`
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Admin
                  </span>
                </NavLink>
              ) : null}
              <button
                type="button"
                onClick={() => auth.signOut()}
                className="rounded-full px-4 py-2 text-sm text-white/70 border border-white/10 hover:text-white hover:border-white/25 transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <LogOut className="w-4 h-4" />
                  Sign out
                </span>
              </button>
            </div>

            <div className="flex items-start gap-3 text-right">
              <div>
                <p className="text-sm text-white/80">Welcome back, {displayName}.</p>
                <p className="text-sm text-white/45 max-w-xl">{meta.description}</p>
              </div>
              <div className="w-11 h-11 rounded-2xl liquid-glass border border-white/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white/70" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-10 md:py-12">
        <Outlet />
      </main>
    </div>
  );
}
