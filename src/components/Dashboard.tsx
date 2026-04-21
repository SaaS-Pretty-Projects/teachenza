import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, handleFirestoreError } from '../lib/firebase';
import { collection, query, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Globe, BookOpen, Clock, Activity, ArrowRight, Play, CheckCircle, Search, Plus, Loader2 } from 'lucide-react';

interface Enrollment {
  id: string;
  courseId: string;
  courseName: string;
  progress: number;
  enrolledAt?: any;
  lastAccessedAt?: any;
}

const MOCK_CATALOG = [
  { id: '101', title: 'The Foundations of Focus', description: 'Master the art of deep work and eliminate distractions. Build a bulletproof cognitive routine.' },
  { id: '102', title: 'Advanced Cognitive Patterns', description: 'Rewire your brain for sustained concentration over long periods to achieve peak output.' },
  { id: '103', title: 'Flow State Architecture', description: 'Design your environment and physiological routine to trigger and maintain flow states on command.' },
  { id: '001', title: 'Introduction to Mastery', description: 'The beginner guide to achieving top 1% performance through structured, dedicated learning.' }
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(auth.currentUser);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      if (!u) {
        navigate('/');
      } else {
        setUser(u);
        fetchEnrollments(u.uid);
      }
    });
    return unsubscribe;
  }, [navigate]);

  const fetchEnrollments = async (userId: string) => {
    try {
      const q = query(collection(db, `users/${userId}/enrollments`));
      const querySnapshot = await getDocs(q);
      const items: Enrollment[] = [];
      querySnapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Enrollment);
      });
      setEnrollments(items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnroll = async (courseId: string, courseName: string) => {
    if (!user) return;
    setEnrollingId(courseId);

    // Optimistic update for instant UI feedback
    const optimisticEnrollment: Enrollment = {
      id: courseId,
      courseId,
      courseName,
      progress: 0,
      enrolledAt: new Date(),
      lastAccessedAt: new Date(),
    };
    setEnrollments(prev => [...prev, optimisticEnrollment]);

    try {
      const newRef = doc(db, `users/${user.uid}/enrollments`, courseId);
      await setDoc(newRef, {
        courseId,
        courseName,
        progress: 0,
        enrolledAt: serverTimestamp(),
        lastAccessedAt: serverTimestamp()
      });
      // Fetch latest state passively to sync timestamps
      fetchEnrollments(user.uid);
    } catch (error) {
      console.error("Failed to enroll");
      // Revert optimistic update on failure
      setEnrollments(prev => prev.filter(e => e.courseId !== courseId));
      try {
        handleFirestoreError(error, 'create', `users/${user.uid}/enrollments`);
      } catch(e) {
        console.error("Delegated:", e);
      }
    } finally {
      setEnrollingId(null);
    }
  };

  if (!user || loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>;
  }

  const lowerQuery = searchQuery.toLowerCase();
  const enrolledIds = new Set(enrollments.map(e => e.courseId));

  const activeCourses = enrollments.filter(e => e.progress < 100 && e.courseName.toLowerCase().includes(lowerQuery));
  const completedCourses = enrollments.filter(e => e.progress === 100 && e.courseName.toLowerCase().includes(lowerQuery));
  const availableCatalog = MOCK_CATALOG.filter(c => 
    !enrolledIds.has(c.id) && 
    (c.title.toLowerCase().includes(lowerQuery) || c.description.toLowerCase().includes(lowerQuery))
  );

  return (
    <div className="min-h-screen bg-black text-white px-6 py-12 md:py-20 max-w-6xl mx-auto">
      <nav className="flex items-center justify-between mb-16">
        <div className="flex items-center cursor-pointer" onClick={() => navigate('/')}>
          <Globe className="w-6 h-6 text-white" />
          <span className="text-white font-semibold text-lg ml-2">Tutivex</span>
        </div>
        <div className="flex items-center gap-6">
          <button 
            onClick={() => navigate('/profile')}
            className="text-white/60 text-sm hover:text-white transition-colors"
          >
            Profile Settings
          </button>
          <button 
            onClick={() => auth.signOut()}
            className="text-white/60 text-sm hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </nav>

      <header className="mb-16">
        <h1 className="text-4xl md:text-6xl font-serif tracking-tight mb-4">
          Welcome back, <em className="italic text-white/70">{user.displayName || user.email?.split('@')[0]}</em>.
        </h1>
        <p className="text-white/50 text-lg">Your focused learning environment.</p>
      </header>

      {/* Progress Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        <div className="liquid-glass rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="w-5 h-5 text-white/50" />
            <h3 className="text-sm font-semibold uppercase tracking-widest text-white/50">Active Courses</h3>
          </div>
          <p className="text-4xl font-serif">{enrollments.filter(e => e.progress < 100).length}</p>
        </div>
        <div className="liquid-glass rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-5 h-5 text-white/50" />
            <h3 className="text-sm font-semibold uppercase tracking-widest text-white/50">Average Progress</h3>
          </div>
          <p className="text-4xl font-serif">
            {enrollments.length > 0 ? Math.round(enrollments.reduce((acc, curr) => acc + curr.progress, 0) / enrollments.length) : 0}%
          </p>
        </div>
        <div className="liquid-glass rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="w-5 h-5 text-white/50" />
            <h3 className="text-sm font-semibold uppercase tracking-widest text-white/50">Completed</h3>
          </div>
          <p className="text-4xl font-serif">{enrollments.filter(e => e.progress === 100).length}</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="w-full relative max-w-xl mb-12">
        <Search className="w-5 h-5 absolute left-6 top-1/2 -translate-y-1/2 text-white/40" />
        <input 
          type="text"
          placeholder="Search courses and catalog..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full liquid-glass rounded-full py-4 pl-14 pr-6 text-white placeholder:text-white/40 outline-none focus:bg-white/10 transition-colors border border-white/5"
        />
      </div>

      <div className="mb-8 flex items-baseline justify-between">
        <h2 className="text-2xl md:text-3xl font-serif tracking-tight">Active Curriculum</h2>
      </div>

      {activeCourses.length === 0 ? (
        <div className="border border-white/10 rounded-2xl p-12 text-center flex flex-col items-center mb-16 liquid-glass">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6">
            <BookOpen className="w-6 h-6 text-white/40" />
          </div>
          <h3 className="text-xl font-medium mb-3">No active courses</h3>
          <p className="text-white/50 text-sm max-w-md">
            {searchQuery ? "No enrolled courses match your search." : "You haven't enrolled in any focused paths yet. Browse the catalog below to begin your journey."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          {activeCourses.map((enr) => (
            <div key={enr.id} className="liquid-glass rounded-2xl p-6 flex flex-col hover:bg-white/5 transition-colors border border-white/5">
              <div className="mb-8">
                <span className="text-xs font-semibold tracking-widest uppercase text-white/40 block mb-2">COURSE</span>
                <h3 className="text-2xl font-serif tracking-tight">{enr.courseName}</h3>
              </div>
              
              <div className="mt-auto mb-6">
                <div className="flex justify-between text-xs text-white/60 mb-2">
                  <span>Progress</span>
                  <span>{enr.progress}%</span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-white transition-all duration-1000 ease-out"
                    style={{ width: `${enr.progress}%` }}
                  />
                </div>
              </div>

              <button 
                 onClick={() => navigate(`/courses/${enr.courseId}`)}
                 className="w-full py-3 bg-white text-black text-sm font-medium rounded-xl hover:bg-gray-300 transition-colors flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 text-black" /> Continue Learning
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Course Catalog */}
      <div className="mb-8 flex items-baseline justify-between mt-8">
        <h2 className="text-2xl md:text-3xl font-serif tracking-tight text-white">Course Catalog</h2>
      </div>

      {availableCatalog.length === 0 ? (
        <div className="p-8 text-center text-white/50 border border-white/5 rounded-2xl liquid-glass mb-16">
          {searchQuery ? "No catalog courses match your search." : "You have enrolled in all available courses."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          {availableCatalog.map(course => (
            <div key={course.id} className="liquid-glass rounded-2xl p-6 flex flex-col hover:bg-white/[0.04] transition-colors border border-white/5">
              <div className="mb-4">
                <span className="text-[10px] font-semibold tracking-widest uppercase text-green-400 block mb-2">Available</span>
                <h3 className="text-xl font-medium tracking-tight mb-2">{course.title}</h3>
                <p className="text-sm text-white/60 leading-relaxed">{course.description}</p>
              </div>
              <div className="mt-auto pt-6">
                <button 
                  onClick={() => handleEnroll(course.id, course.title)}
                  disabled={enrollingId === course.id}
                  className="w-full py-3 bg-transparent border border-white/20 text-white text-sm font-medium rounded-xl hover:bg-white hover:text-black transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-white cursor-pointer"
                >
                  {enrollingId === course.id ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Enrolling...</>
                  ) : (
                    <><Plus className="w-4 h-4" /> Enroll Now</>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Learning History */}
      {completedCourses.length > 0 && (
        <>
          <div className="mb-8 flex items-baseline justify-between mt-8">
            <h2 className="text-2xl md:text-3xl font-serif tracking-tight text-white/60">Learning History</h2>
          </div>
          <div className="flex flex-col gap-4">
            {completedCourses.map((enr) => {
              const catalogInfo = MOCK_CATALOG.find(c => c.id === enr.courseId);
              const summary = catalogInfo?.description || "Curriculum mastered and completed. You have full access to review all materials.";

              return (
                <div key={enr.id} className="flex flex-col sm:flex-row sm:items-start justify-between p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors group">
                  <div className="mb-6 sm:mb-0 max-w-2xl pr-0 sm:pr-8">
                    <div className="flex items-center gap-3 mb-3">
                      <CheckCircle className="w-5 h-5 text-green-400 opacity-80" />
                      <h4 className="text-xl font-medium text-white/90">{enr.courseName}</h4>
                    </div>
                    <p className="text-sm text-white/50 leading-relaxed mb-4">
                      {summary}
                    </p>
                    <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">
                      Completed • {enr.lastAccessedAt?.toDate?.()?.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) || 'Recently'}
                    </p>
                  </div>
                  <div className="sm:text-right flex flex-col sm:items-end w-full sm:w-auto mt-2 sm:mt-0">
                    <button 
                      onClick={() => navigate(`/courses/${enr.courseId}`)}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white/5 group-hover:bg-white/10 text-white text-sm font-medium rounded-xl transition-all duration-300 border border-white/5 hover:border-white/20 w-full sm:w-auto whitespace-nowrap"
                    >
                      View Details <ArrowRight className="w-4 h-4 text-white/50 group-hover:text-white transition-colors" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
