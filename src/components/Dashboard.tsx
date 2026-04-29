import {useEffect, useState} from 'react';
import {Link, useLocation, useNavigate} from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  Activity,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  FileText,
  Layers3,
  ListChecks,
  Loader2,
  LogOut,
  Network,
  Play,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {auth, db, handleFirestoreError} from '../lib/firebase';
import {
  calculateProgress,
  courseCatalog,
  defaultMemberProfile,
  getCourseById,
  getNextModuleId,
  type MemberProfile,
} from '../lib/learningData';
import {formatMinorAmount, type Currency} from '../lib/money';
import type {BalanceByCurrency, StudentBalance} from '../lib/arrearsTypes';

interface EnrollmentRecord {
  id: string;
  courseId: string;
  courseName: string;
  progress: number;
  currentModuleId?: string;
  completedModuleIds?: string[];
  status?: 'not_started' | 'in_progress' | 'completed';
  difficulty?: string;
  durationMinutes?: number;
  track?: string;
  summary?: string;
  lastAccessedAt?: unknown;
  enrolledAt?: unknown;
}

function toDisplayDate(value: unknown) {
  if (!value) return 'Just now';
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as {toDate: unknown}).toDate === 'function') {
    return (value as {toDate: () => Date}).toDate().toLocaleDateString();
  }
  if (value instanceof Date) return value.toLocaleDateString();
  return 'Recently';
}

/* ── Credits widget ─────────────────────────────────── */
function CreditsWidget({onTopUp}: {onTopUp: () => void}) {
  const user = auth.currentUser;
  const [balance, setBalance] = useState<StudentBalance | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'student_balances', user.uid))
      .then((snap) => { if (snap.exists()) setBalance(snap.data() as StudentBalance); })
      .catch(console.error)
      .finally(() => setLoaded(true));
  }, [user]);

  const entries = balance ? (Object.entries(balance.byCurrency) as [Currency, BalanceByCurrency][]) : [];
  const primary = entries[0];
  const creditsMinor = primary?.[1]?.creditsMinor ?? 0;
  const outstandingMinor = primary?.[1]?.outstandingMinor ?? 0;
  const currency = primary?.[0] ?? 'EUR';

  const isLow = loaded && creditsMinor < 3000; // < €30
  const hasDebt = outstandingMinor > 0;

  return (
    <div className={`rounded-2xl border p-3 ${hasDebt ? 'bg-red-950/40 border-red-500/30' : isLow ? 'bg-amber-950/40 border-amber-500/30' : 'bg-gradient-to-br from-amber-500/12 to-yellow-500/8 border-amber-500/25'}`}>
      {/* Balance display */}
      <div className="flex items-start justify-between mb-1">
        <p className="text-[10px] uppercase tracking-[0.22em] text-white/40">Credits balance</p>
        <CreditCard className="w-3.5 h-3.5 text-white/30" />
      </div>

      {loaded ? (
        <p className={`text-2xl font-bold tabular-nums mt-1 ${hasDebt ? 'text-red-300' : isLow ? 'text-amber-300' : 'text-amber-200'}`}>
          {formatMinorAmount(creditsMinor, currency)}
        </p>
      ) : (
        <div className="h-9 w-24 rounded-lg bg-white/8 animate-pulse mt-1" />
      )}

      {hasDebt ? (
        <p className="text-xs text-red-400/80 mt-1">
          Owed: {formatMinorAmount(outstandingMinor, currency)} — pay now to continue
        </p>
      ) : isLow ? (
        <p className="text-xs text-amber-400/70 mt-1">Running low — top up before your next session</p>
      ) : (
        <p className="text-xs text-white/35 mt-1">~{Math.floor(creditsMinor / 1500)} sessions remaining</p>
      )}

      {/* Progress bar showing burn */}
      {loaded && !hasDebt ? (
        <div className="mt-3 h-1 rounded-full bg-white/8">
          <div
            className={`h-full rounded-full transition-all ${isLow ? 'bg-amber-400' : 'bg-amber-300/60'}`}
            style={{width: `${Math.min(100, (creditsMinor / 15000) * 100)}%`}}
          />
        </div>
      ) : null}

      {/* Top Up CTA */}
      <button
        type="button"
        onClick={onTopUp}
        className={`mt-3 w-full rounded-xl py-2 text-xs font-bold flex items-center justify-center gap-2 transition-all ${
          hasDebt
            ? 'bg-red-500 hover:bg-red-400 text-white'
            : 'bg-amber-400 hover:bg-amber-300 text-black'
        }`}
      >
        <Plus className="w-4 h-4" />
        {hasDebt ? 'Pay outstanding balance' : 'Top up credits'}
      </button>

      {!hasDebt ? (
        <p className="text-[10px] text-white/30 text-center mt-2">Packs from €25 · sessions ~€15</p>
      ) : null}
    </div>
  );
}

/* ── Compact course row ─────────────────────────────── */
function CourseRow({
  course,
  enrollment,
  onEnroll,
  enrolling,
}: {
  course: (typeof courseCatalog)[0];
  enrollment: EnrollmentRecord | null | undefined;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  onEnroll: () => void | Promise<void>;
  enrolling: boolean;
}) {
  const progress = enrollment?.progress ?? 0;
  const status = enrollment
    ? progress >= 100 ? 'Mastered' : enrollment.status === 'not_started' ? 'Queued' : 'In Progress'
    : 'Available';

  const statusColor = status === 'Mastered' ? 'text-emerald-400' : status === 'In Progress' ? 'text-indigo-400' : status === 'Queued' ? 'text-amber-400' : 'text-white/35';

  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-white/6 bg-white/[0.02] px-3 py-2.5 hover:bg-white/[0.04] transition-colors group">
      {/* Thumbnail */}
      <img src={course.imageUrl} alt={course.imageAlt} className="w-11 h-11 rounded-xl object-cover border border-white/8 shrink-0" />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium truncate">{course.title}</p>
          <span className={`text-[10px] uppercase tracking-wider shrink-0 ${statusColor}`}>{status}</span>
        </div>
        <p className="text-xs text-white/40 truncate">{course.track} · {course.difficulty} · {course.durationMinutes}m</p>
        {enrollment ? (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-white/8">
              <div className="h-full rounded-full bg-white/50 transition-all" style={{width: `${progress}%`}} />
            </div>
            <span className="text-[10px] text-white/35 tabular-nums shrink-0">{progress}%</span>
          </div>
        ) : null}
      </div>

      {/* Action */}
      {enrollment ? (
        <Link
          to={`/courses/${course.id}`}
          className="shrink-0 rounded-xl bg-white/8 border border-white/10 px-2.5 py-1.5 text-xs font-medium hover:bg-white/15 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Play className="w-3 h-3" />
          {progress >= 100 ? 'Review' : 'Continue'}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onEnroll}
          disabled={enrolling}
          className="shrink-0 rounded-xl border border-white/15 px-2.5 py-1.5 text-xs font-medium hover:bg-white hover:text-black transition-colors disabled:opacity-40 inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          {enrolling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Enroll
        </button>
      )}
    </div>
  );
}

function StudioCommandPanel({
  course,
  enrollment,
  nextModuleTitle,
}: {
  course: (typeof courseCatalog)[0] | null;
  enrollment: EnrollmentRecord | null;
  nextModuleTitle: string | null;
}) {
  if (!course || !enrollment) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/35 mb-1">Studio command</p>
            <h3 className="text-lg font-serif">Choose a track to unlock study tools</h3>
            <p className="text-xs text-white/45 mt-1">Slides, quizzes, mind maps, and flashcards appear as soon as a course is active.</p>
          </div>
          <Sparkles className="w-5 h-5 text-white/35 shrink-0" />
        </div>
      </div>
    );
  }

  const shortcuts = [
    {label: 'Slide deck', Icon: Layers3, tint: 'text-indigo-300', detail: 'Review the module arc'},
    {label: 'Quiz', Icon: ListChecks, tint: 'text-cyan-300', detail: 'Check understanding'},
    {label: 'Flashcards', Icon: Brain, tint: 'text-rose-300', detail: 'Rehearse key ideas'},
    {label: 'Mind map', Icon: Network, tint: 'text-fuchsia-300', detail: 'Explore relationships'},
  ];

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/35 mb-1">Studio command</p>
          <h3 className="text-base font-serif">{nextModuleTitle ?? course.title}</h3>
          <p className="text-xs text-white/45 mt-1">Jump into the exact tool you need for the next study block.</p>
        </div>
        <Link
          to={`/courses/${course.id}`}
          className="rounded-full bg-white text-black px-3.5 py-2 text-xs font-semibold hover:bg-gray-200 transition-colors inline-flex items-center justify-center gap-1.5"
        >
          Open studio
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {shortcuts.map(({label, Icon, tint, detail}) => (
          <Link
            key={label}
            to={`/courses/${course.id}`}
            className="rounded-2xl border border-white/8 bg-white/[0.03] p-2.5 hover:bg-white/[0.06] transition-colors group"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <Icon className={`w-4 h-4 ${tint}`} />
              <ChevronRight className="w-3.5 h-3.5 text-white/25 group-hover:text-white/50 transition-colors" />
            </div>
            <p className="text-xs font-medium">{label}</p>
            <p className="text-[10px] text-white/38 mt-1">{detail}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function MobilePulse({
  activeCount,
  avgProgress,
  totalMinutes,
}: {
  activeCount: number;
  avgProgress: number;
  totalMinutes: number;
}) {
  const items = [
    {Icon: BookOpen, label: 'Active', value: activeCount},
    {Icon: TrendingUp, label: 'Average', value: `${avgProgress}%`},
    {Icon: Clock3, label: 'Minutes', value: totalMinutes},
  ];

  return (
    <div className="lg:hidden grid grid-cols-3 gap-2 p-3 pb-2">
      {items.map(({Icon, label, value}) => (
        <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
          <Icon className="w-3.5 h-3.5 text-white/35 mb-2" />
          <p className="text-lg font-serif leading-none">{value}</p>
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/35 mt-1">{label}</p>
        </div>
      ))}
    </div>
  );
}

function MobileWorkspaceDock({
  profile,
  firstName,
  onTopUp,
}: {
  profile: MemberProfile;
  firstName: string;
  onTopUp: () => void;
}) {
  return (
    <div className="lg:hidden border-b border-white/6 px-3 pb-3">
      <div className="grid grid-cols-2 gap-2">
        <Link
          to="/profile"
          className="rounded-2xl border border-white/8 bg-white/[0.025] p-3 hover:bg-white/[0.05] transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-xl liquid-glass border border-white/12 flex items-center justify-center">
              <span className="text-xs font-semibold">{firstName[0]?.toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{firstName}</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/35 truncate">{profile.experienceLevel}</p>
            </div>
          </div>
          <p className="line-clamp-2 text-xs leading-relaxed text-white/48">{profile.focusGoal}</p>
        </Link>
        <button
          type="button"
          onClick={onTopUp}
          className="rounded-2xl border border-white/8 bg-white/[0.025] p-3 text-left hover:bg-white/[0.05] transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-4 h-4 text-amber-300" />
            <span className="text-xs font-semibold text-white/80">Credits</span>
          </div>
          <p className="text-xs leading-relaxed text-white/48">Manage top-ups, tutoring access, and session readiness.</p>
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {[
          {to: '/dashboard', icon: Target, label: 'Catalog'},
          {to: '/profile', icon: Settings2, label: 'Profile'},
          {to: '/credits', icon: Plus, label: 'Top up'},
        ].map(({to, icon: Icon, label}) => (
          <Link
            key={to + label}
            to={to}
            className="rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2 text-xs text-white/60 hover:bg-white/[0.05] hover:text-white transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── Main Dashboard ─────────────────────────────────── */
export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = auth.currentUser;
  const [profile, setProfile] = useState<MemberProfile>(defaultMemberProfile);
  const [enrollments, setEnrollments] = useState<EnrollmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'available' | 'done'>('active');

  useEffect(() => {
    if (!user) { navigate('/'); return; }
    async function loadWorkspace() {
      try {
        const [profileSnap, enrollSnap] = await Promise.all([
          getDoc(doc(db, 'users', user.uid)),
          getDocs(query(collection(db, `users/${user.uid}/enrollments`))),
        ]);
        if (profileSnap.exists()) {
          const d = profileSnap.data();
          setProfile({
            displayName: d.displayName || user.displayName || '',
            focusGoal: d.focusGoal || defaultMemberProfile.focusGoal,
            experienceLevel: d.experienceLevel || defaultMemberProfile.experienceLevel,
            weeklyCommitment: d.weeklyCommitment || defaultMemberProfile.weeklyCommitment,
            preferredSession: d.preferredSession || defaultMemberProfile.preferredSession,
          });
        } else {
          setProfile({...defaultMemberProfile, displayName: user.displayName || ''});
        }
        setEnrollments(enrollSnap.docs.map((s) => {
          const d = s.data();
          return {
            id: s.id, courseId: d.courseId, courseName: d.courseName,
            progress: d.progress ?? 0, currentModuleId: d.currentModuleId,
            completedModuleIds: d.completedModuleIds ?? [],
            status: d.status ?? 'in_progress', difficulty: d.difficulty,
            durationMinutes: d.durationMinutes, track: d.track,
            summary: d.summary, lastAccessedAt: d.lastAccessedAt, enrolledAt: d.enrolledAt,
          } as EnrollmentRecord;
        }));
      } catch (err) { console.error('Failed to load workspace', err); }
      finally { setLoading(false); }
    }
    loadWorkspace();
  }, [navigate, user]);

  const handleEnroll = async (courseId: string) => {
    if (!user) return;
    const course = getCourseById(courseId);
    if (!course) return;
    setEnrollingId(courseId);
    const optimistic: EnrollmentRecord = {
      id: course.id, courseId: course.id, courseName: course.title,
      progress: 0, currentModuleId: course.modules[0]?.id ?? '',
      completedModuleIds: [], status: 'not_started',
      difficulty: course.difficulty, durationMinutes: course.durationMinutes,
      track: course.track, summary: course.summary,
      lastAccessedAt: new Date(), enrolledAt: new Date(),
    };
    setEnrollments((cur) => [...cur, optimistic]);
    try {
      await setDoc(doc(db, `users/${user.uid}/enrollments`, course.id), {
        courseId: course.id, courseName: course.title, progress: 0,
        currentModuleId: course.modules[0]?.id ?? '', completedModuleIds: [],
        status: 'not_started', difficulty: course.difficulty,
        durationMinutes: course.durationMinutes, track: course.track,
        summary: course.summary, enrolledAt: serverTimestamp(), lastAccessedAt: serverTimestamp(),
      });
    } catch (err) {
      setEnrollments((cur) => cur.filter((e) => e.courseId !== courseId));
      try { handleFirestoreError(err, 'create', `users/${user.uid}/enrollments/${courseId}`); }
      catch (e) { console.error('Enrollment write failed', e); }
    } finally { setEnrollingId(null); }
  };

  if (!user || loading) {
    return (
      <div className="h-full flex items-center justify-center text-white/50 text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading workspace...
      </div>
    );
  }

  const q = searchQuery.toLowerCase();
  const courseRows = courseCatalog.map((course) => ({
    course,
    enrollment: enrollments.find((e) => e.courseId === course.id) ?? null,
  }));
  const filtered = courseRows.filter(({course, enrollment}) =>
    [course.title, course.description, course.track, enrollment?.courseName ?? ''].join(' ').toLowerCase().includes(q),
  );

  const activeRows = filtered.filter(({enrollment}) => enrollment && enrollment.progress < 100);
  const completedRows = filtered.filter(({enrollment}) => enrollment && enrollment.progress >= 100);
  const availableRows = filtered.filter(({enrollment}) => !enrollment);

  const tabRows = activeTab === 'active' ? activeRows : activeTab === 'available' ? availableRows : completedRows;

  const nextFocusRow = activeRows[0] ?? filtered.find(({enrollment}) => enrollment) ?? null;
  const activeCount = enrollments.filter((e) => e.progress < 100).length;
  const avgProgress = enrollments.length > 0 ? Math.round(enrollments.reduce((s, e) => s + e.progress, 0) / enrollments.length) : 0;
  const totalMinutes = enrollments.reduce((s, e) => s + (e.durationMinutes ?? getCourseById(e.courseId)?.durationMinutes ?? 0), 0);
  const firstName = profile.displayName || user?.displayName || user?.email?.split('@')[0] || 'Learner';
  const nextModuleTitle = nextFocusRow?.enrollment
    ? getCourseById(nextFocusRow.enrollment.courseId)?.modules.find(
        (m) => m.id === (nextFocusRow.enrollment?.currentModuleId || getNextModuleId(nextFocusRow.course, nextFocusRow.enrollment?.completedModuleIds ?? [])),
      )?.title
    : null;
  const lastTouched = nextFocusRow?.enrollment?.lastAccessedAt ? toDisplayDate(nextFocusRow.enrollment.lastAccessedAt) : 'Not started';

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[184px,minmax(0,1fr),236px] 2xl:grid-cols-[220px,minmax(0,1fr),272px] overflow-hidden">

      {/* ══════════════════════════════════════
          LEFT SIDEBAR — identity + stats + nav
      ══════════════════════════════════════ */}
      <aside className="hidden lg:flex flex-col border-r border-white/8 overflow-y-auto">

        {/* User identity */}
        <div className="p-3 border-b border-white/6">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl liquid-glass border border-white/15 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-white/90">{firstName[0]?.toUpperCase()}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{firstName}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">{profile.experienceLevel}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="p-3 border-b border-white/6 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/30 mb-2">Progress</p>
          {[
            {Icon: BookOpen,   label: 'Active tracks', value: activeCount},
            {Icon: TrendingUp, label: 'Avg progress',  value: `${avgProgress}%`},
            {Icon: Clock3,     label: 'Total minutes',  value: totalMinutes},
          ].map(({Icon, label, value}) => (
            <div key={label} className="flex items-center justify-between py-1.5 px-2.5 rounded-xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-white/35" />
                <span className="text-xs text-white/55">{label}</span>
              </div>
              <span className="text-xs font-semibold tabular-nums">{value}</span>
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div className="p-3 border-b border-white/6">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/30 mb-2">Navigate</p>
          <div className="space-y-1">
            {[
              {to: '/dashboard', icon: Activity,  label: 'Dashboard'},
              {to: '/profile',   icon: Settings2, label: 'Profile'},
              {to: '/credits',   icon: CreditCard, label: 'Credits'},
            ].map(({to, icon: Icon, label}) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs transition-colors ${
                  location.pathname === to ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Link>
            ))}
          </div>
        </div>

        {/* Learning profile */}
        <div className="p-3 flex-1">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/30 mb-2">Your profile</p>
          <div className="space-y-2.5">
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Goal</p>
              <p className="text-xs text-white/70 leading-relaxed">{profile.focusGoal}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Sessions</p>
              <p className="text-xs text-white/70">{profile.preferredSession}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Cadence</p>
              <p className="text-xs text-white/70">{profile.weeklyCommitment}</p>
            </div>
          </div>
          <Link to="/profile" className="mt-4 flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
            <Settings2 className="w-3 h-3" /> Edit profile
          </Link>
        </div>

        {/* Sign out */}
        <div className="p-3 border-t border-white/6">
          <button
            type="button"
            onClick={() => auth.signOut()}
            className="flex items-center gap-2 text-xs text-white/35 hover:text-white/60 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* ══════════════════════════════════════
          CENTER — focus hero + course list
      ══════════════════════════════════════ */}
      <div className="flex flex-col overflow-hidden">

        {/* Focus hero strip */}
        <div className="shrink-0 px-4 py-3 border-b border-white/6 liquid-glass relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.08),_transparent_50%)] pointer-events-none" />
          <div className="relative">
            <p className="text-[10px] uppercase tracking-[0.28em] text-white/35 mb-1">Focus Blueprint</p>
            <h2 className="text-lg font-serif tracking-tight leading-snug mb-2">
              {firstName},
              {nextFocusRow
                ? ` continue ${nextFocusRow.course.title}`
                : ' start your first learning track'}
            </h2>
            {nextModuleTitle ? (
              <p className="text-xs text-white/45 mb-2">
                Up next: <span className="text-white/65">{nextModuleTitle}</span>
                <span className="mx-2 text-white/18">/</span>
                Last touched {lastTouched}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {nextFocusRow ? (
                <Link
                  to={`/courses/${nextFocusRow.course.id}`}
                  className="bg-white text-black rounded-full px-3.5 py-2 text-xs font-semibold hover:bg-gray-200 transition-colors inline-flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" /> Continue now
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => availableRows[0] && handleEnroll(availableRows[0].course.id)}
                  className="bg-white text-black rounded-full px-3.5 py-2 text-xs font-semibold hover:bg-gray-200 transition-colors inline-flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Start first track
                </button>
              )}
              <Link
                to="/profile"
                className="rounded-full px-3.5 py-2 text-xs border border-white/15 text-white/65 hover:text-white hover:border-white/30 transition-colors"
              >
                Refine profile
              </Link>
            </div>
          </div>
        </div>

        <MobilePulse
          activeCount={activeCount}
          avgProgress={avgProgress}
          totalMinutes={totalMinutes}
        />

        <MobileWorkspaceDock
          profile={profile}
          firstName={firstName}
          onTopUp={() => navigate('/credits')}
        />

        <div className="shrink-0 px-4 py-3 border-b border-white/6">
          <StudioCommandPanel
            course={nextFocusRow?.course ?? null}
            enrollment={nextFocusRow?.enrollment ?? null}
            nextModuleTitle={nextModuleTitle ?? null}
          />
        </div>

        {/* Search + tabs */}
        <div className="shrink-0 px-4 pt-3 pb-2.5 border-b border-white/6">
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 absolute left-4 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search courses, tracks..."
              className="w-full rounded-full bg-white/5 border border-white/10 py-2 pl-10 pr-4 text-xs text-white placeholder:text-white/30 outline-none focus:border-white/25"
            />
          </div>
          <div className="flex gap-1">
            {([
              {key: 'active',    label: 'Active',    count: activeRows.length},
              {key: 'available', label: 'Available', count: availableRows.length},
              {key: 'done',      label: 'Completed', count: completedRows.length},
            ] as {key: typeof activeTab; label: string; count: number}[]).map(({key, label, count}) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                  activeTab === key ? 'bg-white text-black border-white' : 'border-white/10 text-white/50 hover:border-white/25'
                }`}
              >
                {label} {count > 0 ? <span className="opacity-60">({count})</span> : null}
              </button>
            ))}
          </div>
        </div>

        {/* Course list — the only scrollable area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {tabRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-white/30 text-sm gap-2">
              <BookOpen className="w-8 h-8 opacity-30" />
              {activeTab === 'active'
                ? 'No active courses yet — enroll below'
                : activeTab === 'done'
                ? 'No completed courses yet'
                : 'All courses are enrolled'}
            </div>
          ) : (
            tabRows.map(({course, enrollment}) => (
              <CourseRow
                key={course.id}
                course={course}
                enrollment={enrollment}
                onEnroll={() => handleEnroll(course.id)}
                enrolling={enrollingId === course.id}
              />
            ))
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════
          RIGHT SIDEBAR — credits + actions
      ══════════════════════════════════════ */}
      <aside className="hidden lg:flex flex-col border-l border-white/8 overflow-y-auto p-3 gap-3">

        {/* Credits widget */}
        <CreditsWidget onTopUp={() => navigate('/credits')} />

        {/* Next module */}
        {nextFocusRow ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/35 mb-3">Continue learning</p>
            <div className="flex items-center gap-3 mb-3">
              <img src={nextFocusRow.course.imageUrl} alt="" className="w-10 h-10 rounded-xl object-cover border border-white/8 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{nextFocusRow.course.title}</p>
                {nextModuleTitle ? <p className="text-xs text-white/40 truncate">{nextModuleTitle}</p> : null}
              </div>
            </div>
            {nextFocusRow.enrollment ? (
              <div className="mb-3">
                <div className="flex justify-between text-[10px] text-white/35 mb-1">
                  <span>Progress</span>
                  <span>{nextFocusRow.enrollment.progress}%</span>
                </div>
                <div className="h-1 rounded-full bg-white/8">
                  <div className="h-full rounded-full bg-indigo-400/70" style={{width: `${nextFocusRow.enrollment.progress}%`}} />
                </div>
              </div>
            ) : null}
            <Link
              to={`/courses/${nextFocusRow.course.id}`}
              className="w-full rounded-xl bg-white/8 border border-white/10 py-2 text-xs font-medium hover:bg-white/15 transition-colors flex items-center justify-center gap-2"
            >
              <Play className="w-3 h-3" /> Go to course
            </Link>
          </div>
        ) : null}

        {/* Quick actions */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/35 mb-3">Quick actions</p>
          <div className="space-y-1">
            {[
              {to: '/credits', icon: CreditCard, label: 'Manage credits', accent: 'text-amber-400'},
              {to: '/profile', icon: Settings2,  label: 'Edit profile',   accent: 'text-white/55'},
              {to: '/dashboard', icon: Target,   label: 'Browse catalog', accent: 'text-white/55'},
            ].map(({to, icon: Icon, label, accent}) => (
              <Link
                key={to + label}
                to={to}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/5 transition-colors group"
              >
                <Icon className={`w-3.5 h-3.5 ${accent}`} />
                {label}
                <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-40 transition-opacity" />
              </Link>
            ))}
          </div>
        </div>

        {/* Execution nudges */}
        <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-3 space-y-2.5">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">This week</p>
          {[
            {Icon: Target,      text: 'Keep one course as your primary track.'},
            {Icon: Clock3,      text: `Use ${profile.preferredSession.toLowerCase()} blocks.`},
            {Icon: CheckCircle2,text: 'Leave a re-entry note after each module.'},
          ].map(({Icon, text}) => (
            <div key={text} className="flex gap-2">
              <Icon className="w-3.5 h-3.5 mt-0.5 text-white/30 shrink-0" />
              <p className="text-xs text-white/50 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        {/* Completed courses */}
        {completedRows.length > 0 ? (
          <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/35 mb-3">Mastered</p>
            <div className="space-y-2">
              {completedRows.map(({course, enrollment}) => (
                <Link
                  key={course.id}
                  to={`/courses/${course.id}`}
                  className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-white/5 transition-colors"
                >
                  <span className="text-xs text-white/60 truncate">{course.title}</span>
                  <span className="text-[10px] text-emerald-400 ml-2 shrink-0">
                    {enrollment?.progress ?? calculateProgress(course.modules.length, course.modules.map((m) => m.id))}%
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {/* Spending nudge — bottom */}
        <div className="rounded-2xl border border-white/6 bg-gradient-to-br from-indigo-500/8 to-violet-500/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-indigo-400" />
            <p className="text-xs font-medium text-indigo-300">Unlock live tutoring</p>
          </div>
          <p className="text-xs text-white/45 leading-relaxed mb-3">
            Credits let you book 1-on-1 sessions with expert tutors. Your progress accelerates 3x with live feedback.
          </p>
          <button
            type="button"
            onClick={() => navigate('/credits')}
            className="w-full rounded-xl border border-indigo-400/25 bg-indigo-400/10 py-2 text-xs text-indigo-300 font-medium hover:bg-indigo-400/20 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> Add session credits
          </button>
        </div>
      </aside>
    </div>
  );
}
