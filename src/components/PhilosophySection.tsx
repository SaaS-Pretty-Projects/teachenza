import { useRef } from 'react';
import { motion, useInView } from 'motion/react';

export default function PhilosophySection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="methodology" className="bg-black py-28 md:py-40 px-6 w-full">
      <div ref={ref} className="max-w-6xl mx-auto overflow-hidden">
        <motion.h2
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8 }}
          className="text-5xl md:text-7xl lg:text-8xl text-white tracking-tight mb-16 md:mb-24"
        >
          Focus <span className="font-serif italic text-white/40">x</span> Mastery
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="rounded-3xl overflow-hidden aspect-[4/3]"
          >
            <video
              src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260307_083826_e938b29f-a43a-41ec-a153-3d4730578ab8.mp4"
              muted
              autoPlay
              loop
              playsInline
              preload="auto"
              className="w-full h-full object-cover"
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 40 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex flex-col justify-center gap-8"
          >
            <div>
              <h3 className="text-white/40 text-xs tracking-widest uppercase mb-4">
                ZERO INFORMATION NOISE
              </h3>
              <p className="text-white/70 text-base md:text-lg leading-relaxed">
                Narrow specialization is our mark of expertise. By eliminating scattered topics, we provide targeted learning that allows for a much deeper dive into a single niche.
              </p>
            </div>

            <div className="w-full h-px bg-white/10" />

            <div>
              <h3 className="text-white/40 text-xs tracking-widest uppercase mb-4">
                ONE CLEAR GOAL
              </h3>
              <p className="text-white/70 text-base md:text-lg leading-relaxed">
                You pay not just for lessons, but for structure and sequence. Our platform is a clear educational roadmap built on concentration, ensuring you achieve specific, practical outcomes.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
