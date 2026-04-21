import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Globe } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

export default function HeroSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [user, setUser] = useState(auth.currentUser);
  const navigate = useNavigate();

  useEffect(() => {
    return auth.onAuthStateChanged(setUser);
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Upsert User Profile logic
      const userRef = doc(db, 'users', result.user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: result.user.email,
          createdAt: serverTimestamp()
        });
      }
      navigate('/dashboard');
    } catch (error) {
      console.error("Login failed", error);
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
                <button onClick={handleLogout} className="liquid-glass rounded-full px-6 py-2 text-white text-sm font-medium transition-all hover:bg-white/10">Log Out</button>
              </>
            ) : (
              <>
                <button onClick={handleLogin} className="text-white text-sm font-medium hover:text-white/80 transition-colors">Sign Up</button>
                <button onClick={handleLogin} className="liquid-glass rounded-full px-6 py-2 text-white text-sm font-medium transition-all hover:bg-white/10">Login</button>
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
      </main>
    </section>
  );
}
