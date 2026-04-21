import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, PlayCircle, CheckCircle, BookOpen, Loader2, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, handleFirestoreError } from '../lib/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface Enrollment {
  courseId: string;
  courseName: string;
  progress: number;
}

const MOCK_MODULES = [
  { id: 'm1', title: 'Module 1: The Foundation', description: 'Establish the core tenets of deep work, set up a distraction-free environment, and build the initial habits required for extended focus.', videoUrl: 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_074625_a81f018a-956b-43fb-9aee-4d1508e30e6a.mp4' },
  { id: 'm2', title: 'Module 2: Core Concepts', description: 'Dive into the neuroscience of attention, understand cognitive loops, and learn how to identify and dismantle internal triggers for distraction.', videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4' },
  { id: 'm3', title: 'Module 3: Advanced Flow', description: 'Learn the precise triggers to enter a flow state on command, and develop stamina to maintain it for multi-hour sessions.', videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4' },
  { id: 'm4', title: 'Module 4: Total Mastery', description: 'Synthesize all past modules into a sustainable, lifelong system for continuous high-level cognitive output.', videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4' },
];

export default function CourseDetail() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [user, setUser] = useState(auth.currentUser);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      if (!u) {
        navigate('/');
      } else {
        setUser(u);
        fetchEnrollment(u.uid);
      }
    });
    return unsubscribe;
  }, [navigate, courseId]);

  const fetchEnrollment = async (userId: string) => {
    if (!courseId) return;
    try {
      const docRef = doc(db, `users/${userId}/enrollments`, courseId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as Enrollment;
        setEnrollment(data);
        
        // Calculate the highest uncompleted module based on progress
        const completedCount = Math.round((data.progress / 100) * MOCK_MODULES.length);
        const nextModule = Math.min(completedCount, MOCK_MODULES.length - 1);
        setActiveModuleIndex(nextModule);
      } else {
        navigate('/dashboard'); // Course not found
      }
    } catch (error) {
      console.error("Failed to fetch enrollment", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartModule = async (index: number) => {
    if (index === activeModuleIndex) return;

    // Smoothly fade out the current video
    if (videoRef.current) {
      videoRef.current.style.opacity = '0';
    }

    // Wait for the fade out transition
    setTimeout(async () => {
      setActiveModuleIndex(index);
      
      // Let React re-render with the new source, then fade back in
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.load();
          videoRef.current.play().catch(console.error);
          videoRef.current.style.opacity = '1';
        }
      }, 50);

      // Update progress indicator accordingly if they start a module further ahead
      if (user && courseId && enrollment) {
        const completedCount = Math.round((enrollment.progress / 100) * MOCK_MODULES.length);
        if (index > completedCount) {
          const newProgress = Math.round((index / MOCK_MODULES.length) * 100);
          try {
            const docRef = doc(db, `users/${user.uid}/enrollments`, courseId);
            await updateDoc(docRef, {
              progress: newProgress,
              lastAccessedAt: serverTimestamp()
            });
            setEnrollment({ ...enrollment, progress: newProgress });
          } catch (error) {
            console.error("Failed to sync progress jump", error);
          }
        }
      }
    }, 300);
  };

  const handleCompleteModule = async () => {
    if (!user || !courseId || !enrollment || updating) return;
    setUpdating(true);
    
    try {
      // Calculate current completed modules based on existing progress
      let completedCount = Math.round((enrollment.progress / 100) * MOCK_MODULES.length);
      
      // If they are completing a module that extends their highest progress
      if (activeModuleIndex >= completedCount) {
        completedCount = activeModuleIndex + 1;
      }

      // Cap at total modules
      if (completedCount > MOCK_MODULES.length) {
        completedCount = MOCK_MODULES.length;
      }

      const newProgress = Math.round((completedCount / MOCK_MODULES.length) * 100);
      
      const docRef = doc(db, `users/${user.uid}/enrollments`, courseId);
      await updateDoc(docRef, {
        progress: newProgress,
        lastAccessedAt: serverTimestamp()
      });

      setEnrollment({ ...enrollment, progress: newProgress });
      
      // Trigger celebration if mastered, otherwise auto-advance
      if (newProgress === 100 && enrollment.progress < 100) {
        setShowCelebration(true);
        setShowToast(true);
      } else if (activeModuleIndex < MOCK_MODULES.length - 1) {
        handleStartModule(activeModuleIndex + 1);
      }

    } catch (error) {
      console.error(error);
      try {
        handleFirestoreError(error, 'update', `users/${user.uid}/enrollments/${courseId}`);
      } catch (err) {
        console.error(err);
      }
    } finally {
      setUpdating(false);
    }
  };

  if (loading || !enrollment) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>;
  }

  const isCourseComplete = enrollment.progress === 100;
  const activeModule = MOCK_MODULES[activeModuleIndex];
  const completedCount = Math.round((enrollment.progress / 100) * MOCK_MODULES.length);

  return (
    <div className="min-h-screen bg-black text-white px-6 py-12 md:py-20 max-w-5xl mx-auto">
      <button 
        onClick={() => navigate('/dashboard')} 
        className="mb-12 flex items-center gap-2 text-white/50 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>
      
      <div className="mb-10">
        <div className="flex items-center gap-4 text-xs font-semibold tracking-widest uppercase mb-4">
          <span className="text-white/40">Tutivex Core</span>
          <span className="text-white/40">•</span>
          {isCourseComplete ? (
            <span className="text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Mastered</span>
          ) : (
            <span className="text-white/80">In Progress</span>
          )}
        </div>
        <h1 className="text-4xl md:text-5xl font-serif tracking-tight mb-4">
          {enrollment.courseName}
        </h1>
        <p className="text-white/60 text-lg max-w-3xl leading-relaxed mb-6">
          This comprehensive program is designed to take you from a distracted, scattered workflow into a state of relentless, deliberate focus. Our curriculum is tailored for high-achievers looking to reclaim their cognitive bandwidth and produce rare, valuable work in a distracted world.
        </p>
      </div>

      {/* Main Video Player */}
      <div className="aspect-video w-full rounded-3xl overflow-hidden liquid-glass relative mb-4 flex items-center justify-center border border-white/5 bg-black/50">
        <video 
          ref={videoRef}
          controls
          onEnded={handleCompleteModule}
          className="w-full h-full object-contain bg-black transition-opacity duration-300 ease-in-out"
          src={activeModule.videoUrl}
          poster={`https://picsum.photos/seed/${courseId}/1920/1080?blur=4`}
        >
          Your browser does not support the video tag.
        </video>
        
        <div className="absolute top-6 left-6 bg-black/60 backdrop-blur-md px-4 py-1.5 rounded-full text-[10px] tracking-widest uppercase border border-white/10 text-white font-medium z-10 transition-opacity duration-300">
          Now Playing: {activeModule.title}
        </div>
      </div>
      
      {/* Preload Next Video for seamless transitions */}
      {activeModuleIndex < MOCK_MODULES.length - 1 && (
        <link rel="prefetch" as="video" href={MOCK_MODULES[activeModuleIndex + 1].videoUrl} />
      )}

      <div className="flex justify-between items-center mb-12 px-2">
        <button 
          onClick={() => handleStartModule(activeModuleIndex - 1)}
          disabled={activeModuleIndex === 0}
          className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors disabled:opacity-30 disabled:hover:text-white/60"
        >
          <ArrowLeft className="w-4 h-4" /> Previous Module
        </button>
        <button 
          onClick={() => handleStartModule(activeModuleIndex + 1)}
          disabled={activeModuleIndex === MOCK_MODULES.length - 1}
          className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors disabled:opacity-30 disabled:hover:text-white/60"
        >
          Next Module <ArrowLeft className="w-4 h-4 rotate-180" />
        </button>
      </div>

      {/* Progress & Actions Section */}
      <div className="liquid-glass rounded-2xl p-8 mb-12 flex flex-col md:flex-row justify-between items-center gap-8 border border-white/5">
        <div className="w-full md:w-1/3">
          <h3 className="text-xl font-medium mb-1">Your Progress</h3>
          <p className="text-white/50 text-sm">
            {isCourseComplete 
              ? "All modules completed." 
              : `You are on Module ${Math.min(completedCount + 1, MOCK_MODULES.length)} of ${MOCK_MODULES.length}.`}
          </p>
        </div>
        
        <div className="w-full md:w-1/3">
          <div className="flex justify-between text-xs text-white/60 mb-3">
            <span className="uppercase tracking-widest text-[10px]">Mastery Track</span>
            <span className="font-serif text-lg">{enrollment.progress}%</span>
          </div>
          <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden inset-shadow-sm border border-white/5">
            <div 
              className="h-full bg-gradient-to-r from-white/60 to-white rounded-full transition-all duration-1000 ease-out" 
              style={{ width: `${enrollment.progress}%` }} 
            />
          </div>
        </div>

        <div className="w-full md:w-auto flex justify-end">
           <button
             onClick={handleCompleteModule}
             disabled={updating || isCourseComplete && activeModuleIndex === MOCK_MODULES.length - 1}
             className="w-full md:w-auto liquid-glass rounded-xl px-6 py-3 text-sm font-medium hover:bg-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 border border-white/10 text-white"
           >
             {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
             {isCourseComplete && activeModuleIndex === MOCK_MODULES.length - 1 ? "Course Finished" : "Mark Module Complete"}
           </button>
        </div>
      </div>

      {/* Course Curriculum / Module List */}
      <div>
        <h3 className="text-2xl font-serif tracking-tight mb-6">Curriculum</h3>
        <div className="flex flex-col gap-3">
          {MOCK_MODULES.map((mod, index) => {
            const isCompleted = index < completedCount;
            const isActive = index === activeModuleIndex;

            return (
              <div 
                key={mod.id} 
                className={`flex items-center justify-between p-5 rounded-2xl border transition-colors ${
                  isActive ? 'bg-white/10 border-white/20' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${
                    isCompleted ? 'bg-green-400/10 border-green-400/30 text-green-400' : 
                    isActive ? 'bg-white/10 border-white/30 text-white' : 'bg-white/5 border-white/10 text-white/30'
                  }`}>
                    {isCompleted ? <CheckCircle className="w-5 h-5" /> : <BookOpen className="w-4 h-4" />}
                  </div>
                  <div>
                    <h4 className={`font-medium ${isActive ? 'text-white' : 'text-white/80'}`}>{mod.title}</h4>
                    <p className="text-sm text-white/60 mt-1 max-w-xl">{mod.description}</p>
                    <p className="text-xs text-white/40 mt-2 font-medium tracking-wide uppercase">{isCompleted ? 'Completed' : isActive ? 'Currently Playing' : 'Locked / Next up'}</p>
                  </div>
                </div>
                
                <button 
                  onClick={() => handleStartModule(index)}
                  className={`px-5 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors ${
                    isActive ? 'bg-white text-black' : 'bg-white/5 hover:bg-white/10 text-white'
                  }`}
                >
                  <PlayCircle className="w-4 h-4" />
                  {isActive ? 'Playing' : 'Start Module'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Celebratory Mastery Modal */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.8, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", duration: 0.6, bounce: 0.4 }}
              className="liquid-glass rounded-3xl p-10 md:p-14 flex flex-col items-center text-center max-w-lg border border-white/20 shadow-[0_0_150px_rgba(255,255,255,0.15)] relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
              
              <motion.div 
                initial={{ rotate: -15, scale: 0.5 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", duration: 0.8, delay: 0.2 }}
                className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center mb-8 shadow-[0_0_50px_rgba(255,255,255,0.2)] relative z-10 border border-white/20"
              >
                <Trophy className="w-10 h-10 text-white" />
              </motion.div>
              
              <motion.h2 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-4xl font-serif tracking-tight mb-4 relative z-10"
              >
                Mastery Achieved
              </motion.h2>
              
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-white/60 text-lg mb-10 relative z-10"
              >
                You have successfully completed and mastered <strong className="text-white font-medium">{enrollment.courseName}</strong>.
              </motion.p>
              
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ delay: 0.8 }}
                onClick={() => setShowCelebration(false)}
                className="bg-white text-black px-10 py-4 rounded-full text-sm font-semibold hover:bg-gray-300 transition-colors relative z-10"
              >
                Return to Curriculum
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Temporary Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-green-500/10 border border-green-500/30 backdrop-blur-md text-green-400 px-6 py-4 rounded-full shadow-[0_0_30px_rgba(34,197,94,0.15)] flex items-center gap-3 pointer-events-none"
          >
            <Trophy className="w-5 h-5" />
            <span className="text-sm font-medium tracking-wide">Course Mastered! Incredible focus.</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
