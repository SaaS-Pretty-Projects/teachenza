import { useRef } from 'react';
import { motion, useInView } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';

export default function ServicesSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const services = [
    {
      tag: "COURSES",
      title: "Structured Roadmaps",
      description: "Comprehensive mastery built step-by-step. Our core courses provide a deeply interconnected path without distraction.",
      videoUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4"
    },
    {
      tag: "INTENSIVES",
      title: "Applied Programs",
      description: "Short, highly focused programs designed for rapid skill acquisition and measurable results in a specific sub-topic.",
      videoUrl: "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260324_151826_c7218672-6e92-402c-9e45-f1e0f454bdc4.mp4"
    }
  ];

  return (
    <section id="courses" className="bg-black py-28 md:py-40 px-6 relative w-full overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.02)_0%,_transparent_60%)] pointer-events-none" />
      
      <div ref={ref} className="max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.7 }}
          className="flex items-baseline justify-between mb-16"
        >
          <h2 className="text-3xl md:text-5xl text-white tracking-tight">How we teach</h2>
          <span className="text-white/40 text-sm hidden md:block tracking-widest uppercase">Educational Formats</span>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {services.map((service, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 50 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
              transition={{ duration: 0.8, delay: idx * 0.15 }}
              className="group liquid-glass rounded-3xl overflow-hidden relative flex flex-col items-stretch"
            >
              <div className="relative aspect-video overflow-hidden">
                <video
                  src={service.videoUrl}
                  muted
                  autoPlay
                  loop
                  playsInline
                  preload="auto"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
              </div>
              
              <div className="p-6 md:p-8 flex flex-col flex-1 relative z-10">
                <div className="flex items-center justify-between mb-8 md:mb-12">
                  <span className="text-white/40 text-xs tracking-widest uppercase font-semibold">
                    {service.tag}
                  </span>
                  <div className="liquid-glass rounded-full p-2 text-white/60 group-hover:text-white transition-colors duration-300">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
                
                <h3 className="text-white text-xl md:text-2xl mb-3 tracking-tight font-medium">
                  {service.title}
                </h3>
                <p className="text-white/50 text-sm leading-relaxed">
                  {service.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
