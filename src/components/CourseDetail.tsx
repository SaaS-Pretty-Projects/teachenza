import {useEffect, useState} from 'react';
import {Link, useNavigate, useParams} from 'react-router-dom';
import {collection, doc, getDoc, getDocs, limit, query, serverTimestamp, updateDoc, where} from 'firebase/firestore';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Loader2,
  PenLine,
  PlayCircle,
  Save,
  Sparkles,
  Target,
} from 'lucide-react';
import {AnimatePresence, motion} from 'motion/react';
import {auth, db, handleFirestoreError} from '../lib/firebase';
import {
  calculateProgress,
  defaultStudyStudioState,
  getCourseById,
  getCurrentModuleIndex,
  getNextModuleId,
  type StudyStudioState,
} from '../lib/learningData';
import {isLocalPreviewEnabled} from '../lib/previewSession';
import CourseStudio from './CourseStudio';

interface EnrollmentRecord {
  id: string;
  courseId: string;
  courseName: string;
  progress: number;
  currentModuleId?: string;
  completedModuleIds?: string[];
  moduleNotes?: Record<string, string>;
  studyStudio?: StudyStudioState;
  status?: 'not_started' | 'in_progress' | 'completed';
}

function normalizeStudyStudio(value: unknown): StudyStudioState {
  if (!value || typeof value !== 'object') {
    return defaultStudyStudioState;
  }

  const data = value as Partial<StudyStudioState>;
  const activeTool = data.activeTool;

  return {
    activeTool:
      activeTool === 'slides' ||
      activeTool === 'mindmap' ||
      activeTool === 'quiz' ||
      activeTool === 'flashcards' ||
      activeTool === 'guide' ||
      activeTool === 'cards'
        ? activeTool
        : defaultStudyStudioState.activeTool,
    quizAnswers: data.quizAnswers && typeof data.quizAnswers === 'object' ? data.quizAnswers : {},
    flashcardConfidence:
      data.flashcardConfidence && typeof data.flashcardConfidence === 'object' ? data.flashcardConfidence : {},
    slideIndexByModule: data.slideIndexByModule && typeof data.slideIndexByModule === 'object' ? data.slideIndexByModule : {},
    mindMapFocusNodeId: typeof data.mindMapFocusNodeId === 'string' ? data.mindMapFocusNodeId : '',
  };
}

function resourceDetail(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes('worksheet') || normalized.includes('canvas')) {
    return {
      kind: 'Worksheet',
      description: 'Capture the working evidence from this module in one place.',
      prompts: ['Name the current pattern', 'Write the next concrete action', 'Mark one review signal'],
    };
  }

  if (normalized.includes('checklist')) {
    return {
      kind: 'Checklist',
      description: 'Run a short pre-session or post-session pass without relying on memory.',
      prompts: ['Confirm the setup', 'Remove one friction point', 'Check the session exit condition'],
    };
  }

  if (normalized.includes('template')) {
    return {
      kind: 'Template',
      description: 'Reuse the same structure each week so progress is easier to compare.',
      prompts: ['Duplicate the structure', 'Fill only the active fields', 'Archive the finished version'],
    };
  }

  if (normalized.includes('tracker') || normalized.includes('log')) {
    return {
      kind: 'Tracker',
      description: 'Track repeated signals over time instead of judging a single session in isolation.',
      prompts: ['Record start state', 'Record interruption count', 'Record recovery quality'],
    };
  }

  if (normalized.includes('scorecard') || normalized.includes('matrix') || normalized.includes('table')) {
    return {
      kind: 'Scoring tool',
      description: 'Compare choices with a lightweight rubric before committing to the next session.',
      prompts: ['Score impact', 'Score friction', 'Choose the highest-leverage adjustment'],
    };
  }

  if (normalized.includes('prompt')) {
    return {
      kind: 'Reflection prompts',
      description: 'Turn the video into a written decision you can carry into the next block.',
      prompts: ['What changed?', 'What still leaks attention?', 'What gets tested next?'],
    };
  }

  return {
    kind: 'Guide',
    description: 'Use this reference to translate the module into your own working routine.',
    prompts: ['Extract the rule', 'Apply it once', 'Review the result'],
  };
}

export default function CourseDetail() {
  const {courseId} = useParams();
  const navigate = useNavigate();
  const user = auth.currentUser;
  const previewEnabled = isLocalPreviewEnabled();
  const course = getCourseById(courseId);

  const [enrollment, setEnrollment] = useState<EnrollmentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missingEnrollment, setMissingEnrollment] = useState(false);
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [studyStudio, setStudyStudio] = useState<StudyStudioState>(defaultStudyStudioState);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    if (previewEnabled) {
      if (!course) {
        navigate('/dashboard');
        return;
      }

      const completedModuleIds = course.modules[0] ? [course.modules[0].id] : [];
      const currentModuleId = getNextModuleId(course, completedModuleIds);
      const progress = calculateProgress(course.modules.length, completedModuleIds);
      const moduleIndex = getCurrentModuleIndex(course, currentModuleId, completedModuleIds);
      const nextEnrollment: EnrollmentRecord = {
        id: course.id,
        courseId: course.id,
        courseName: course.title,
        progress,
        currentModuleId,
        completedModuleIds,
        moduleNotes: {},
        studyStudio: defaultStudyStudioState,
        status: 'in_progress',
      };

      setEnrollment(nextEnrollment);
      setStudyStudio(defaultStudyStudioState);
      setActiveModuleIndex(moduleIndex);
      setNoteDraft('');
      setLoading(false);
      return;
    }

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
        const moduleNotes = data.moduleNotes && typeof data.moduleNotes === 'object' ? data.moduleNotes : {};
        const nextStudyStudio = normalizeStudyStudio(data.studyStudio);
        const moduleIndex = getCurrentModuleIndex(course, currentModuleId, completedModuleIds);
        const nextEnrollment: EnrollmentRecord = {
          id: enrollmentId,
          courseId: data.courseId,
          courseName: data.courseName || course.title,
          progress,
          currentModuleId,
          completedModuleIds,
          moduleNotes,
          studyStudio: nextStudyStudio,
          status: data.status ?? (progress >= 100 ? 'completed' : completedModuleIds.length > 0 ? 'in_progress' : 'not_started'),
        };

        setEnrollment(nextEnrollment);
        setStudyStudio(nextStudyStudio);
        setActiveModuleIndex(moduleIndex);
        setNoteDraft(moduleNotes[course.modules[moduleIndex]?.id] ?? '');
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
  }, [course, navigate, previewEnabled, user]);

  if (!course || (!user && !previewEnabled) || loading) {
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

  const updateStudyStudio = (nextStudio: StudyStudioState) => {
    setStudyStudio(nextStudio);
    setEnrollment((current) => (current ? {...current, studyStudio: nextStudio} : current));

    if (previewEnabled || !user) {
      return;
    }

    updateDoc(doc(db, `users/${user.uid}/enrollments`, enrollment.id), {
      studyStudio: nextStudio,
      lastAccessedAt: serverTimestamp(),
    }).catch((error) => {
      try {
        handleFirestoreError(error, 'update', `users/${user.uid}/enrollments/${enrollment.id}`);
      } catch (delegatedError) {
        console.error('Failed to save studio state', delegatedError);
      }
    });
  };

  const startModule = async (moduleIndex: number) => {
    const module = course.modules[moduleIndex];
    const previousModule = course.modules[moduleIndex - 1];
    const isUnlocked = moduleIndex === 0 || completedModuleIds.includes(previousModule.id) || completedModuleIds.includes(module.id);

    if (!isUnlocked || updating) {
      return;
    }

    setActiveModuleIndex(moduleIndex);
    setNoteDraft(enrollment.moduleNotes?.[module.id] ?? '');

    if (module.id === enrollment.currentModuleId && enrollment.status !== 'not_started') {
      return;
    }

    const nextStatus = completedModuleIds.length > 0 || moduleIndex > 0 ? 'in_progress' : 'not_started';

    try {
      setUpdating(true);
      if (previewEnabled || !user) {
        setEnrollment((current) =>
          current
            ? {
                ...current,
                currentModuleId: module.id,
                status: nextStatus,
              }
            : current,
        );
        return;
      }

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
      if (previewEnabled || !user) {
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
          const nextIndex = getCurrentModuleIndex(course, nextCurrentModuleId, nextCompletedModuleIds);
          setActiveModuleIndex(nextIndex);
          setNoteDraft(enrollment.moduleNotes?.[course.modules[nextIndex]?.id] ?? '');
        }
        return;
      }

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
        const nextIndex = getCurrentModuleIndex(course, nextCurrentModuleId, nextCompletedModuleIds);
        setActiveModuleIndex(nextIndex);
        setNoteDraft(enrollment.moduleNotes?.[course.modules[nextIndex]?.id] ?? '');
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

  const saveModuleNote = async () => {
    if (noteSaving || !currentModule) {
      return;
    }

    const trimmedNote = noteDraft.trim().slice(0, 1200);

    try {
      setNoteSaving(true);
      if (previewEnabled || !user) {
        setEnrollment((current) =>
          current
            ? {
                ...current,
                moduleNotes: {
                  ...(current.moduleNotes ?? {}),
                  [currentModule.id]: trimmedNote,
                },
              }
            : current,
        );
        setNoteDraft(trimmedNote);
        return;
      }

      await updateDoc(doc(db, `users/${user.uid}/enrollments`, enrollment.id), {
        [`moduleNotes.${currentModule.id}`]: trimmedNote,
        lastAccessedAt: serverTimestamp(),
      });

      setEnrollment((current) =>
        current
          ? {
              ...current,
              moduleNotes: {
                ...(current.moduleNotes ?? {}),
                [currentModule.id]: trimmedNote,
              },
            }
          : current,
      );
      setNoteDraft(trimmedNote);
    } catch (error) {
      try {
        handleFirestoreError(error, 'update', `users/${user.uid}/enrollments/${enrollment.id}`);
      } catch (delegatedError) {
        console.error('Failed to save module note', delegatedError);
      }
    } finally {
      setNoteSaving(false);
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

      <CourseStudio
        course={course}
        currentModule={currentModule}
        activeModuleIndex={activeModuleIndex}
        completedModuleIds={completedModuleIds}
        studio={studyStudio}
        onStudioChange={updateStudyStudio}
        onSelectModule={startModule}
      />

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
              <div className="space-y-3">
                {currentModule.resources.map((resource) => {
                  const detail = resourceDetail(resource);
                  return (
                    <div key={resource} className="rounded-2xl bg-black/15 border border-white/8 p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="text-white/85 font-medium">{resource}</p>
                          <p className="text-xs uppercase tracking-[0.16em] text-white/35 mt-1">{detail.kind}</p>
                        </div>
                        <ClipboardList className="w-4 h-4 text-white/45 shrink-0" />
                      </div>
                      <p className="text-sm text-white/58 leading-relaxed mb-3">{detail.description}</p>
                      <ul className="space-y-2 text-sm text-white/65">
                        {detail.prompts.map((prompt) => (
                          <li key={prompt} className="flex gap-2">
                            <span className="mt-2 w-1 h-1 rounded-full bg-white/55 shrink-0" />
                            <span>{prompt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-[1.5rem] bg-white/[0.03] border border-white/6 p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2 text-white/60">
                <PenLine className="w-4 h-4" />
                <p className="text-xs uppercase tracking-[0.18em]">Module journal</p>
              </div>
              <span className="text-xs text-white/35">{noteDraft.trim().length}/1200</span>
            </div>
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value.slice(0, 1200))}
              rows={5}
              className="w-full rounded-2xl bg-black/20 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-white/25 resize-none"
              placeholder="Capture the cue, decision, or next experiment you want to remember when you return."
            />
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-xs text-white/40">Saved against {currentModule.title}</p>
              <button
                type="button"
                onClick={saveModuleNote}
                disabled={noteSaving}
                className="rounded-full bg-white text-black px-4 py-2 text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-60 inline-flex items-center gap-2"
              >
                {noteSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save note
              </button>
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
