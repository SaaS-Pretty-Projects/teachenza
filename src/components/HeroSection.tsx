import {type FormEvent, useCallback, useEffect, useRef, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {ArrowRight, Globe} from 'lucide-react';
import {auth, db} from '../lib/firebase';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {doc, getDoc, setDoc, serverTimestamp} from 'firebase/firestore';
import {useNavigate} from 'react-router-dom';
import {defaultMemberProfile} from '../lib/learningData';
import {canUseLocalPreview, enableLocalPreview} from '../lib/previewSession';

export default function HeroSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [user, setUser] = useState(auth.currentUser);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [emailMode, setEmailMode] = useState<'login' | 'signup'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const navigate = useNavigate();
  const canPreviewDashboard = canUseLocalPreview();

  useEffect(() => {
    return auth.onAuthStateChanged(setUser);
  }, []);

  const upsertUserProfile = useCallback(async (signedInUser: NonNullable<typeof auth.currentUser>) => {
    const userRef = doc(db, 'users', signedInUser.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        email: signedInUser.email,
        displayName: signedInUser.displayName || '',
        focusGoal: defaultMemberProfile.focusGoal,
        experienceLevel: defaultMemberProfile.experienceLevel,
        weeklyCommitment: defaultMemberProfile.weeklyCommitment,
        preferredSession: defaultMemberProfile.preferredSession,
        createdAt: serverTimestamp(),
      });
    }
  }, []);

  const provider = () => {
    const googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({prompt: 'select_account'});
    return googleProvider;
  };

  const resumeAfterLogin = useCallback(() => {
    const nextPath = localStorage.getItem('teachenza:postLoginPath') || localStorage.getItem('tutivex:postLoginPath') || '/dashboard';
    localStorage.removeItem('teachenza:postLoginPath');
    localStorage.removeItem('tutivex:postLoginPath');
    navigate(nextPath);
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    async function completeRedirectLogin() {
      try {
        const result = await getRedirectResult(auth);
        if (cancelled) return;

        if (result?.user) {
          await upsertUserProfile(result.user);
          if (!cancelled) resumeAfterLogin();
        } else if (auth.currentUser && (localStorage.getItem('teachenza:postLoginPath') || localStorage.getItem('tutivex:postLoginPath'))) {
          await upsertUserProfile(auth.currentUser);
          if (!cancelled) resumeAfterLogin();
        }
      } catch (error) {
        console.error('Redirect login failed', error);
        if (!cancelled) {
          setLoginMessage('Google redirect sign-in could not finish. Check that this domain is authorized in Firebase.');
        }
      }
    }

    completeRedirectLogin();
    return () => { cancelled = true; };
  }, [resumeAfterLogin, upsertUserProfile]);

  const startRedirectLogin = () => {
    localStorage.setItem('teachenza:postLoginPath', '/dashboard');
    localStorage.setItem('tutivex:postLoginPath', '/dashboard');
    setLoginMessage('Opening Google sign-in in this browser...');
    window.setTimeout(() => {
      setLoginBusy(false);
      setLoginMessage(
        canPreviewDashboard
          ? 'Google sign-in is blocked in this embedded browser. Use local preview to inspect the dashboard here.'
          : 'Google sign-in did not open in this browser. Try again in a full browser window.',
      );
    }, 2500);
    void signInWithRedirect(auth, provider()).catch((error) => {
      console.error('Redirect login failed to start', error);
      setLoginBusy(false);
      setLoginMessage(
        canPreviewDashboard
          ? 'Google sign-in is blocked in this embedded browser. Use local preview to inspect the dashboard here.'
          : 'Google sign-in could not open in this browser.',
      );
    });
  };

  const handlePreviewDashboard = () => {
    if (!enableLocalPreview()) return;
    setLoginBusy(false);
    setLoginMessage('');
    navigate('/dashboard');
  };

  const handleLogin = async () => {
    setLoginBusy(true);
    setLoginMessage('');
    try {
      const result = await signInWithPopup(auth, provider());
      await upsertUserProfile(result.user);
      resumeAfterLogin();
    } catch (error) {
      console.error('Login failed', error);
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      if (code === 'auth/unauthorized-domain') {
        setLoginMessage('This domain is not authorized for Firebase Google sign-in yet.');
        return;
      }
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        startRedirectLogin();
        return;
      }
      setLoginMessage('Google sign-in failed. Try the redirect sign-in option.');
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const resetEmailFeedback = () => {
    setEmailMessage('');
    setLoginMessage('');
  };

  const handleEmailAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setEmailMessage('Email and password are required.');
      return;
    }
    if (emailMode === 'signup' && fullName.trim().length < 2) {
      setEmailMessage('Please add your name to complete sign up.');
      return;
    }

    setEmailBusy(true);
    resetEmailFeedback();

    try {
      if (emailMode === 'signup') {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, {displayName: fullName.trim()});
        await upsertUserProfile(credential.user);
      } else {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        await upsertUserProfile(credential.user);
      }

      setShowEmailAuth(false);
      setPassword('');
      resumeAfterLogin();
    } catch (error) {
      console.error('Email/password auth failed', error);
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';

      if (code === 'auth/email-already-in-use') {
        setEmailMessage('This email is already in use. Try logging in instead.');
        setEmailMode('login');
      } else if (code === 'auth/invalid-email') {
        setEmailMessage('Please enter a valid email address.');
      } else if (code === 'auth/weak-password') {
        setEmailMessage('Password must be at least 6 characters.');
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setEmailMessage('Invalid email or password.');
      } else if (code === 'auth/too-many-requests') {
        setEmailMessage('Too many attempts. Please wait and try again.');
      } else {
        setEmailMessage('Could not complete email/password sign-in right now.');
      }
    } finally {
      setEmailBusy(false);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let fadeReq: number;
    let opacityVal = 0;
    let isFadingOut = false;

    const animateFade = (target: number, duration: number, callback?: () => void) => {
      const start = performance.now();
      const startOpacity = opacityVal;
      const animate = (time: number) => {
        let progress = (time - start) / duration;
        if (progress > 1) progress = 1;
        opacityVal = startOpacity + (target - startOpacity) * progress;
        video.style.opacity = opacityVal.toString();
        
        if (progress < 1) {
          fadeReq = requestAnimationFrame(animate);
        } else if (callback) {
          callback();
        }
      };
      
      cancelAnimationFrame(fadeReq);
      fadeReq = requestAnimationFrame(animate);
    };

    const handleCanPlay = () => {
      video.play().catch(console.error);
      animateFade(1, 500);
    };

    const handleTimeUpdate = () => {
      if (!video.duration) return;
      const remaining = video.duration - video.currentTime;
      // Start fading out when 0.55s remaining
      if (remaining <= 0.55 && !isFadingOut) {
        isFadingOut = true;
        animateFade(0, 500);
      }
    };

    const handleEnded = () => {
      opacityVal = 0;
      video.style.opacity = '0';
      
      // Wait 100ms before resetting and playing again
      setTimeout(() => {
        video.currentTime = 0;
        video.play().catch(console.error);
        isFadingOut = false;
        animateFade(1, 500);
      }, 100);
    };

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      cancelAnimationFrame(fadeReq);
    };
  }, []);

  return (
    <section className="min-h-screen relative overflow-x-hidden flex flex-col bg-black">
      <video
        ref={videoRef}
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_074625_a81f018a-956b-43fb-9aee-4d1508e30e6a.mp4"
        muted
        autoPlay
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover object-bottom opacity-0 pointer-events-none"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black z-[1] pointer-events-none"></div>
      
      {/* Navbar */}
      <nav className="relative z-20 px-6 py-6 w-full">
        <div className="liquid-glass rounded-full max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center">
            <Globe className="w-6 h-6 text-white" />
            <span className="text-white font-semibold text-lg ml-2">Teachenza</span>
            
            <div className="hidden md:flex items-center gap-8 ml-10">
              <a href="#courses" className="text-white/80 hover:text-white text-sm font-medium transition-colors">Courses</a>
              <a href="#methodology" className="text-white/80 hover:text-white text-sm font-medium transition-colors">Methodology</a>
              <a href="#about" className="text-white/80 hover:text-white text-sm font-medium transition-colors">About</a>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <span className="hidden md:block text-white text-sm opacity-60">Hi, {user.displayName || user.email?.split('@')[0]}</span>
                <button type="button" onClick={() => navigate('/dashboard')} className="text-white text-sm font-medium hover:text-white/80 transition-colors">Dashboard</button>
                <button type="button" onClick={handleLogout} className="liquid-glass rounded-full px-6 py-2 text-white text-sm font-medium transition-all hover:bg-white/10">Log Out</button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { setEmailMode('signup'); setShowEmailAuth(true); }}
                  disabled={loginBusy}
                  className="text-white text-sm font-medium hover:text-white/80 transition-colors disabled:opacity-50"
                >
                  Sign Up
                </button>
                <button
                  type="button"
                  onClick={() => { setEmailMode('login'); setShowEmailAuth(true); }}
                  disabled={loginBusy}
                  className="liquid-glass rounded-full px-6 py-2 text-white text-sm font-medium transition-all hover:bg-white/10 disabled:opacity-50"
                >
                  Login
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pt-8 pb-10 text-center md:pt-12 md:pb-16">
        <h1 className="text-5xl md:text-7xl lg:text-9xl text-white tracking-tight font-serif mb-8 leading-[1.1]">
          Master one subject.<br className="hidden md:block" />
          Deep, focused <em className="italic font-serif text-white/90">learning</em>.
        </h1>
        <p className="max-w-3xl text-white/65 text-base md:text-lg leading-relaxed mb-8">
          Teachenza now carries the learning experience beyond the landing page with a real internal workspace:
          active roadmaps, progress-aware curriculum, and a profile that shapes how your sessions unfold.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => { if (user) { navigate('/dashboard'); } else { setEmailMode('login'); setShowEmailAuth(true); } }}
            disabled={loginBusy}
            className="bg-white text-black rounded-full px-6 py-3 text-sm font-medium hover:bg-gray-200 transition-colors inline-flex items-center gap-2"
          >
            {user ? 'Open Dashboard' : 'Start Learning'}
            <ArrowRight className="w-4 h-4" />
          </button>
          {!user ? (
            <button
              type="button"
              onClick={handleLogin}
              disabled={loginBusy}
              className="liquid-glass rounded-full px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {loginBusy ? 'Opening Google...' : 'Continue with Google'}
            </button>
          ) : null}
          <a
            href="#courses"
            className="liquid-glass rounded-full px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            Explore Curriculum
          </a>
          {canPreviewDashboard && !user ? (
            <button
              type="button"
              onClick={handlePreviewDashboard}
              className="liquid-glass rounded-full px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors"
            >
              Codex preview
            </button>
          ) : null}
        </div>
        {loginMessage ? (
          <div className="mt-5 flex flex-col items-center gap-3">
            <p className="max-w-md text-sm text-white/60">{loginMessage}</p>
            {!user ? (
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={startRedirectLogin}
                  className="liquid-glass rounded-full px-5 py-2 text-xs font-semibold text-white hover:bg-white/10 transition-colors"
                >
                  Try redirect sign-in
                </button>
                {canPreviewDashboard ? (
                  <button
                    type="button"
                    onClick={handlePreviewDashboard}
                    className="rounded-full bg-white/90 px-5 py-2 text-xs font-semibold text-black hover:bg-white transition-colors"
                  >
                    Open local preview dashboard
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <AnimatePresence>
        {showEmailAuth && !user ? (
          <motion.div
            key="auth-panel"
            className="auth-panel mt-6 w-full max-w-md rounded-3xl border border-white/15 bg-zinc-950/90 p-5 text-left text-white shadow-[0_24px_80px_#000000AA] backdrop-blur-md overflow-hidden"
            initial={{ opacity: 0, y: -16, scaleY: 0.94, transformOrigin: 'top center' }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -10, scaleY: 0.96 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold tracking-wide text-white">
                {emailMode === 'signup' ? 'Create your account' : 'Log in with email'}
              </p>
              <button
                type="button"
                onClick={() => setShowEmailAuth(false)}
                className="text-xs text-white/60 hover:text-white"
              >
                Close
              </button>
            </div>
            <form onSubmit={handleEmailAuth} className="space-y-3">
              {emailMode === 'signup' ? (
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-white/50">Name</span>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(event) => {
                      setFullName(event.target.value);
                      resetEmailFeedback();
                    }}
                    className="auth-input w-full rounded-xl border border-white/15 bg-white/[0.08] px-3 py-2 text-sm text-white outline-none transition focus:border-white/40"
                    placeholder="Your full name"
                    autoComplete="name"
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-white/50">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    resetEmailFeedback();
                  }}
                  className="auth-input w-full rounded-xl border border-white/15 bg-white/[0.08] px-3 py-2 text-sm text-white outline-none transition focus:border-white/40"
                  placeholder="you@example.com"
                  autoComplete="username"
                  required
                />
              </label>
              <div className="block">
                <label htmlFor={emailMode === 'signup' ? 'signup-password' : 'login-password'} className="mb-1 block text-xs uppercase tracking-[0.2em] text-white/50">Password</label>
                {emailMode === 'signup' ? (
                  <input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      resetEmailFeedback();
                    }}
                    className="auth-input w-full rounded-xl border border-white/15 bg-white/[0.08] px-3 py-2 text-sm text-white outline-none transition focus:border-white/40"
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    required
                  />
                ) : (
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      resetEmailFeedback();
                    }}
                    className="auth-input w-full rounded-xl border border-white/15 bg-white/[0.08] px-3 py-2 text-sm text-white outline-none transition focus:border-white/40"
                    placeholder="At least 6 characters"
                    autoComplete="current-password"
                    required
                  />
                )}
              </div>
              {emailMessage ? <p className="text-xs text-amber-200">{emailMessage}</p> : null}
              <button
                type="submit"
                disabled={emailBusy}
                className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-gray-200 disabled:opacity-60"
              >
                {emailBusy ? 'Please wait...' : emailMode === 'signup' ? 'Create account' : 'Log in'}
              </button>
            </form>
            <div className="mt-3 text-center text-xs text-white/60">
              {emailMode === 'signup' ? 'Already have an account?' : 'Need an account?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setEmailMode(emailMode === 'signup' ? 'login' : 'signup');
                  resetEmailFeedback();
                }}
                className="font-semibold text-white/80 hover:text-white"
              >
                {emailMode === 'signup' ? 'Log in' : 'Create one'}
              </button>
            </div>
          </motion.div>
        ) : null}
        </AnimatePresence>
      </main>
    </section>
  );
}
