import {useEffect, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {collection, doc, getDoc, getDocs, limit, query, serverTimestamp, updateDoc, where} from 'firebase/firestore';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  Loader2,
  PlayCircle,
  Sparkles,
  Target,
} from 'lucide-react';
import {AnimatePresence, motion} from 'motion/react';
import {auth, db, handleFirestoreError} from '../lib/firebase';
import {
  calculateProgress,
  getCourseById,
  getCurrentModuleIndex,
  getNextModuleId,
} from '../lib/learningData';

interface EnrollmentRecord {
  id: string;
  courseId: string;
  courseName: string;
  progress: number;
  currentModuleId?: string;
  completedModuleIds?: string[];
  status?: 'not_started' | 'in_progress' | 'completed';
}

export default function CourseDetail() {
  const {courseId} = useParams();
  const navigate = useNavigate();
  const user = auth.currentUser;
  const course = getCourseById(courseId);

  const [enrollment, setEnrollment] = useState<EnrollmentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missingEnrollment, setMissingEnrollment] = useState(false);
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    if (!course) {
      navigate('/dashboard');
      return;
    }

    async function loadEnrollment() {
      try {
        setLoading(true);
        setLoadError(null);
        setMissingEnrollment(false);

        const enrollmentCollectionPath = `users/${user.uid}/enrollments`;
        const snapshot = await getDoc(doc(db, enrollmentCollectionPath, course.id));
        let enrollmentId = snapshot.id;
        let data = snapshot.exists() ? snapshot.data() : null;

        if (!data) {
          const fallbackSnapshot = await getDocs(
            query(collection(db, enrollmentCollectionPath), where('courseId', '==', course.id), limit(1)),
          );
          const fallbackDocument = fallbackSnapshot.docs[0];

          if (fallbackDocument) {
            enrollmentId = fallbackDocument.id;
            data = fallbackDocument.data();
          }
        }

        if (!data) {
          setMissingEnrollment(true);
          return;
        }

        const completedModuleIds = Array.isArray(data.completedModuleIds) ? data.completedModuleIds : [];
        const currentModuleId = data.currentModuleId || getNextModuleId(course, completedModuleIds);
        const progress = data.progress ?? calculateProgress(course.modules.length, completedModuleIds);
        const nextEnrollment: EnrollmentRecord = {
          id: enrollmentId,
          courseId: data.courseId,
          courseName: data.courseName || course.title,
          progress,
          currentModuleId,
          completedModuleIds,
          status: data.status ?? (progress >= 100 ? 'completed' : completedModuleIds.length > 0 ? 'in_progress' : 'not_started'),
        };

        setEnrollment(nextEnrollment);
        setActiveModuleIndex(getCurrentModuleIndex(course, currentModuleId, completedModuleIds));
      } catch (error) {
        try {
          handleFirestoreError(error, 'get', `users/${user.uid}/enrollments/${course.id}`);
        } catch (delegatedError) {
          console.error('Failed to load enrollment', delegatedError);
        }
        setLoadError('We could not open this course workspace. Please refresh or return to the dashboard.');
      } finally {
        setLoading(false);
      }
    }

    loadEnrollment();
  }, [course, navigate, user]);

  if (!course || !user || loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-white/70">Loading course workspace...</div>;
  }

  if (loadError || missingEnrollment || !enrollment) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="liquid-glass rounded-[2rem] border border-white/10 max-w-lg w-full p-8 text-center">
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/40 mb-4">Course workspace</p>
          <h2 className="text-3xl font-serif mb-4">
            {missingEnrollment ? `${course.title} is not in your workspace yet` : 'Course could not be opened'}
          </h2>
          <p className="text-white/62 leading-relaxed mb-6">
            {missingEnrollment
              ? 'Return to the dashboard and start the track again so Tutivex can create the enrollment record.'
              : loadError}
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="bg-white text-black rounded-full px-5 py-3 text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const completedModuleIds = enrollment.completedModuleIds ?? [];
  const currentModule = course.modules[activeModuleIndex];
  const progress = enrollment.progress;
  const nextModuleId = getNextModuleId(course, completedModuleIds);
  const allComplete = progress >= 100;

  const startModule = async (moduleIndex: number) => {
    const module = course.modules[moduleIndex];
    const previousModule = course.modules[moduleIndex - 1];
    const isUnlocked = moduleIndex === 0 || completedModuleIds.includes(previousModule.id) || completedModuleIds.includes(module.id);

    if (!isUnlocked || updating) {
      return;
    }

    setActiveModuleIndex(moduleIndex);

    if (module.id === enrollment.currentModuleId && enrollment.status !== 'not_started') {
      return;
    }

    const nextStatus = completedModuleIds.length > 0 || moduleIndex > 0 ? 'in_progress' : 'not_started';

    try {
      setUpdating(true);
      await updateDoc(doc(db, `users/${user.uid}/enrollments`, enrollment.id), {
        currentModuleId: module.id,
        status: nextStatus,
        lastAccessedAt: serverTimestamp(),
      });

      setEnrollment((current) =>
        current
          ? {
              ...current,
              currentModuleId: module.id,
              status: nextStatus,
            }
          : current,
      );
    } catch (error) {
      console.error('Failed to set current module', error);
    } finally {
      setUpdating(false);
    }
  };

  const completeModule = async () => {
    if (updating) {
      return;
    }

    const activeModule = course.modules[activeModuleIndex];
    const nextCompletedModuleIds = Array.from(new Set([...completedModuleIds, activeModule.id]));
    const nextProgress = calculateProgress(course.modules.length, nextCompletedModuleIds);
    const nextCurrentModuleId = getNextModuleId(course, nextCompletedModuleIds);
    const nextStatus = nextProgress >= 100 ? 'completed' : 'in_progress';

    try {
      setUpdating(true);
      await updateDoc(doc(db, `users/${user.uid}/enrollments`, enrollment.id), {
        progress: nextProgress,
        currentModuleId: nextCurrentModuleId,
        completedModuleIds: nextCompletedModuleIds,
        status: nextStatus,
        lastAccessedAt: serverTimestamp(),
      });

      setEnrollment({
        ...enrollment,
        progress: nextProgress,
        currentModuleId: nextCurrentModuleId,
        completedModuleIds: nextCompletedModuleIds,
        status: nextStatus,
      });

      if (nextProgress >= 100 && progress < 100) {
        setShowCelebration(true);
      } else {
        setActiveModuleIndex(getCurrentModuleIndex(course, nextCurrentModuleId, nextCompletedModuleIds));
      }
    } catch (error) {
      try {
        handleFirestoreError(error, 'update', `users/${user.uid}/enrollments/${enrollment.id}`);
      } catch (delegatedError) {
        console.error('Failed to complete module', delegatedError);
      }
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 text-white/55 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </button>
        <span className="text-white/20">/</span>
        <span className="text-white/45">{course.track}</span>
      </div>

      <section className="grid grid-cols-1 xl:grid-cols-[1.15fr,0.85fr] gap-6">
        <div className="liquid-glass rounded-[2rem] p-7 md:p-9 border border-white/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.1),_transparent_45%)] pointer-events-none" />
          <div className="relative">
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-[11px] uppercase tracking-[0.24em] text-white/45">{course.track}</span>
              <span className="text-[11px] uppercase tracking-[0.24em] text-white/25">•</span>
              <span className="text-[11px] uppercase tracking-[0.24em] text-white/45">{course.difficulty}</span>
              <span className="text-[11px] uppercase tracking-[0.24em] text-white/25">•</span>
              <span className="text-[11px] uppercase tracking-[0.24em] text-white/45">
                {allComplete ? 'Mastered' : enrollment.status === 'not_started' ? 'Queued' : 'In progress'}
              </span>
            </div>
            <h2 className="text-3xl md:text-5xl font-serif tracking-tight mb-4">{course.title}</h2>
            <p className="max-w-3xl text-white/62 text-base md:text-lg leading-relaxed mb-8">{course.description}</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-3xl bg-white/[0.03] border border-white/8 px-5 py-5">
                <p className="text-xs uppercase tracking-[0.18em] text-white/40 mb-2">Progress</p>
                <p className="text-3xl font-serif">{progress}%</p>
              </div>
              <div className="rounded-3xl bg-white/[0.03] border border-white/8 px-5 py-5">
                <p className="text-xs uppercase tracking-[0.18em] text-white/40 mb-2">Module Count</p>
                <p className="text-3xl font-serif">{completedModuleIds.length}/{course.modules.length}</p>
              </div>
              <div className="rounded-3xl bg-white/[0.03] border border-white/8 px-5 py-5">
                <p className="text-xs uppercase tracking-[0.18em] text-white/40 mb-2">Guided Minutes</p>
                <p className="text-3xl font-serif">{course.durationMinutes}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="liquid-glass rounded-[2rem] p-7 border border-white/8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/40 mb-3">Session plan</p>
          <h3 className="text-2xl font-serif mb-5">{currentModule.title}</h3>
          <div className="space-y-4">
            <div className="rounded-2xl bg-white/[0.03] border border-white/6 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/40 mb-1">Ritual</p>
              <p className="text-white/75">{currentModule.ritual}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.03] border border-white/6 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/40 mb-1">Target outcome</p>
              <p className="text-white/75">{course.weeklyOutcome}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.03] border border-white/6 px-4 py-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/40 mb-1">Current module duration</p>
              <p className="text-white/75">{currentModule.durationMinutes} minutes</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.2fr,0.8fr] gap-6">
        <div className="liquid-glass rounded-[2rem] p-6 md:p-7 border border-white/8">
          <div className="aspect-video w-full rounded-[1.5rem] overflow-hidden border border-white/8 bg-black/60 mb-6">
            <video
              key={currentModule.id}
              controls
              autoPlay
              className="w-full h-full object-cover"
              src={currentModule.videoUrl}
              poster={`https://picsum.photos/seed/${course.id}-${currentModule.id}/1600/900?blur=3`}
            >
              Your browser does not support the video tag.
            </video>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/40 mb-2">Now playing</p>
              <h3 className="text-2xl font-serif">{currentModule.title}</h3>
              <p className="text-white/55 mt-2 max-w-2xl">{currentModule.description}</p>
            </div>
            <button
              type="button"
              onClick={completeModule}
              disabled={updating || allComplete}
              className="rounded-2xl bg-white text-black px-5 py-3 text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-55 inline-flex items-center justify-center gap-2"
            >
              {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {allComplete ? 'Course complete' : 'Mark module complete'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-[1.5rem] bg-white/[0.03] border border-white/6 p-5">
              <div className="flex items-center gap-2 mb-4 text-white/60">
                <Target className="w-4 h-4" />
                <p className="text-xs uppercase tracking-[0.18em]">What this module should change</p>
              </div>
              <ul className="space-y-3 text-white/75">
                {currentModule.outcomes.map((outcome) => (
                  <li key={outcome} className="flex gap-3">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-white/70 shrink-0" />
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-[1.5rem] bg-white/[0.03] border border-white/6 p-5">
              <div className="flex items-center gap-2 mb-4 text-white/60">
                <BookOpen className="w-4 h-4" />
                <p className="text-xs uppercase tracking-[0.18em]">Resources to use after the video</p>
              </div>
              <ul className="space-y-3 text-white/75">
                {currentModule.resources.map((resource) => (
                  <li key={resource} className="flex gap-3">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-white/70 shrink-0" />
                    <span>{resource}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="liquid-glass rounded-[2rem] p-7 border border-white/8">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/40 mb-2">Curriculum</p>
                <h3 className="text-2xl font-serif">Module sequence</h3>
              </div>
              <div className="text-right">
                <p className="text-sm text-white/40">Current module</p>
                <p className="text-sm text-white/75">{currentModule.title}</p>
              </div>
            </div>

            <div className="space-y-3">
              {course.modules.map((module, index) => {
                const previousModule = course.modules[index - 1];
                const isCompleted = completedModuleIds.includes(module.id);
                const isActive = module.id === currentModule.id;
                const isUnlocked = index === 0 || completedModuleIds.includes(previousModule.id) || isCompleted || isActive;

                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => startModule(index)}
                    disabled={!isUnlocked || updating}
                    className={`w-full rounded-[1.4rem] border p-4 text-left transition-colors ${
                      isActive
                        ? 'bg-white/10 border-white/20'
                        : isUnlocked
                          ? 'bg-white/[0.03] border-white/8 hover:bg-white/[0.05]'
                          : 'bg-white/[0.015] border-white/[0.05] opacity-55'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{module.title}</p>
                        <p className="text-sm text-white/45 mt-1">{module.description}</p>
                      </div>
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                      ) : (
                        <PlayCircle className="w-5 h-5 text-white/45 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-white/40 uppercase tracking-[0.16em]">
                      <span>{module.durationMinutes} min</span>
                      <span>{isCompleted ? 'Completed' : isActive ? 'Current' : isUnlocked ? 'Unlocked' : 'Locked'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="liquid-glass rounded-[2rem] p-7 border border-white/8">
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/40 mb-3">Continuity</p>
            <h3 className="text-2xl font-serif mb-4">What happens after this module</h3>
            <div className="space-y-4 text-white/70">
              <div className="flex gap-3">
                <Clock3 className="w-4 h-4 mt-1 shrink-0 text-white/55" />
                <p>Keep your next session close to the current one. The course now stores the active module so you can re-enter faster.</p>
              </div>
              <div className="flex gap-3">
                <Sparkles className="w-4 h-4 mt-1 shrink-0 text-white/55" />
                <p>Finishing a module advances progress from completed modules instead of a loose percentage guess.</p>
              </div>
            </div>
            <Link
              to="/dashboard"
              className="mt-5 inline-flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
            >
              Return to learning HQ
              <ArrowLeft className="w-4 h-4 rotate-180" />
            </Link>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {showCelebration ? (
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{scale: 0.88, y: 24, opacity: 0}}
              animate={{scale: 1, y: 0, opacity: 1}}
              exit={{scale: 0.92, opacity: 0}}
              className="liquid-glass rounded-[2rem] border border-white/15 max-w-lg w-full p-8 text-center"
            >
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/40 mb-4">Mastery Achieved</p>
              <h3 className="text-4xl font-serif mb-4">{course.title} completed</h3>
              <p className="text-white/62 leading-relaxed mb-6">
                You finished every module in this track. The dashboard will now treat it as mastered and surface it as part of your completed system.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCelebration(false);
                    navigate('/dashboard');
                  }}
                  className="bg-white text-black rounded-full px-5 py-3 text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  Back to dashboard
                </button>
                <button
                  type="button"
                  onClick={() => setShowCelebration(false)}
                  className="rounded-full px-5 py-3 text-sm font-medium border border-white/15 text-white/75 hover:text-white hover:border-white/30 transition-colors"
                >
                  Stay in course view
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
