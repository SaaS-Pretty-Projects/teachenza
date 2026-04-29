import {useEffect, useRef, useState} from 'react';
import {ArrowRight, Globe} from 'lucide-react';
import {auth, db} from '../lib/firebase';
import {getRedirectResult, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut} from 'firebase/auth';
import {doc, getDoc, setDoc, serverTimestamp} from 'firebase/firestore';
import {useNavigate} from 'react-router-dom';
import {defaultMemberProfile} from '../lib/learningData';

export default function HeroSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [user, setUser] = useState(auth.currentUser);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    return auth.onAuthStateChanged(setUser);
  }, []);

  const upsertUserProfile = async (signedInUser: NonNullable<typeof auth.currentUser>) => {
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
  };

  const provider = () => {
    const googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({prompt: 'select_account'});
    return googleProvider;
  };

  const resumeAfterLogin = () => {
    const nextPath = localStorage.getItem('tutivex:postLoginPath') || '/dashboard';
    localStorage.removeItem('tutivex:postLoginPath');
    navigate(nextPath);
  };

  useEffect(() => {
    let cancelled = false;

    async function completeRedirectLogin() {
      try {
        const result = await getRedirectResult(auth);
        if (cancelled) return;

        if (result?.user) {
          await upsertUserProfile(result.user);
          if (!cancelled) resumeAfterLogin();
        } else if (auth.currentUser && localStorage.getItem('tutivex:postLoginPath')) {
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
  }, []);

  const startRedirectLogin = async () => {
    localStorage.setItem('tutivex:postLoginPath', '/dashboard');
    setLoginMessage('Opening Google sign-in in this browser...');
    await signInWithRedirect(auth, provider());
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
        await startRedirectLogin();
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
    <section className="min-h-screen relative overflow-hidden flex flex-col bg-black">
      <video
        ref={videoRef}
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_074625_a81f018a-956b-43fb-9aee-4d1508e30e6a.mp4"
        muted
        autoPlay
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover object-bottom"
        style={{ opacity: 0 }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black z-[1]"></div>
      
      {/* Navbar */}
      <nav className="relative z-20 px-6 py-6 w-full">
        <div className="liquid-glass rounded-full max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center">
            <Globe className="w-6 h-6 text-white" />
            <span className="text-white font-semibold text-lg ml-2">Tutivex</span>
            
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
                <button onClick={() => navigate('/dashboard')} className="text-white text-sm font-medium hover:text-white/80 transition-colors">Dashboard</button>
                <button onClick={handleLogout} className="liquid-glass rounded-full px-6 py-2 text-white text-sm font-medium transition-all hover:bg-white/10">Log Out</button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={loginBusy}
                  className="text-white text-sm font-medium hover:text-white/80 transition-colors disabled:opacity-50"
                >
                  Sign Up
                </button>
                <button
                  type="button"
                  onClick={handleLogin}
                  disabled={loginBusy}
                  className="liquid-glass rounded-full px-6 py-2 text-white text-sm font-medium transition-all hover:bg-white/10 disabled:opacity-50"
                >
                  {loginBusy ? 'Opening...' : 'Login'}
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center transform -translate-y-[10%]">
        <h1 className="text-5xl md:text-7xl lg:text-9xl text-white tracking-tight font-serif mb-8 leading-[1.1]">
          Master one subject.<br className="hidden md:block" />
          Deep, focused <em className="italic font-serif text-white/90">learning</em>.
        </h1>
        <p className="max-w-3xl text-white/65 text-base md:text-lg leading-relaxed mb-8">
          Tutivex now carries the learning experience beyond the landing page with a real internal workspace:
          active roadmaps, progress-aware curriculum, and a profile that shapes how your sessions unfold.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => (user ? navigate('/dashboard') : handleLogin())}
            disabled={loginBusy}
            className="bg-white text-black rounded-full px-6 py-3 text-sm font-medium hover:bg-gray-200 transition-colors inline-flex items-center gap-2"
          >
            {user ? 'Open Dashboard' : loginBusy ? 'Opening sign-in...' : 'Start Learning'}
            <ArrowRight className="w-4 h-4" />
          </button>
          <a
            href="#courses"
            className="liquid-glass rounded-full px-6 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            Explore Curriculum
          </a>
        </div>
        {loginMessage ? (
          <div className="mt-5 flex flex-col items-center gap-3">
            <p className="max-w-md text-sm text-white/60">{loginMessage}</p>
            {!user ? (
              <button
                type="button"
                onClick={startRedirectLogin}
                className="liquid-glass rounded-full px-5 py-2 text-xs font-semibold text-white hover:bg-white/10 transition-colors"
              >
                Continue with redirect sign-in
              </button>
            ) : null}
          </div>
        ) : null}
      </main>
    </section>
  );
}
