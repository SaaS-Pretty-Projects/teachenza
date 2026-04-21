import { useState, useRef } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { motion, useInView, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError } from '../lib/firebase';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';

export default function CTASection() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setStatus('loading');
    
    try {
      const newSubscriptionRef = doc(collection(db, 'subscriptions'));
      await setDoc(newSubscriptionRef, {
        email,
        createdAt: serverTimestamp()
      });
      setStatus('success');
    } catch (error) {
      console.error(error);
      try {
        handleFirestoreError(error, 'create', `subscriptions`);
      } catch (err) {
        console.error("Delegated Firestore Error:", err);
      }
      setStatus('idle');
    }
  };

  return (
    <section className="bg-black py-20 md:py-32 px-6 relative w-full flex flex-col items-center justify-center">
      <div ref={ref} className="max-w-xl w-full flex flex-col items-center text-center z-10">
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <button className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 transition-colors mb-16">
            Explore Courses
          </button>
        </motion.div>

        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl md:text-5xl text-white tracking-tight font-serif mb-10 hidden"
        >
          Stay <em className="italic text-white/60">focused</em>.
        </motion.h2>
        
        <motion.form 
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          onSubmit={handleSubmit} 
          className="w-full relative flex flex-col items-center"
        >
          <div className="w-full max-w-xl mx-auto liquid-glass rounded-full pl-6 pr-2 py-2 flex items-center gap-3 mb-6 transition-all duration-300 relative overflow-hidden">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={status !== 'idle'}
              className="flex-1 bg-transparent text-white placeholder:text-white/40 outline-none px-2 text-sm disabled:opacity-50"
              required
            />
            <button 
              type="submit"
              disabled={status !== 'idle'}
              className="bg-white rounded-full p-3 text-black hover:bg-gray-200 transition-colors flex items-center justify-center disabled:opacity-50"
            >
              {status === 'success' ? (
                <Check className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />
              ) : (
                <ArrowRight className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />
              )}
            </button>
          </div>

          <div className="h-10">
            <AnimatePresence mode="wait">
              {status === 'success' ? (
                <motion.p 
                  key="success"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="text-green-400 text-sm"
                >
                  Thanks! Your subscription has been confirmed.
                </motion.p>
              ) : (
                <motion.p 
                  key="prompt"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-white/60 text-sm leading-relaxed max-w-md mx-auto"
                >
                  Join our specialized learning community. Subscribe to receive structured insights and updates related to your educational goals.
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.form>
      </div>
    </section>
  );
}
