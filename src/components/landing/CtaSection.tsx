import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Globe2 } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

export function CtaSection() {
  const { ref, isInView } = useScrollReveal();

  return (
    <section className="py-28 md:py-32 px-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(59,130,246,0.10),transparent)] pointer-events-none" />

      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 40 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.7 }}
        className="relative max-w-2xl mx-auto text-center"
      >
        <Globe2 className="h-12 w-12 md:h-14 md:w-14 text-brand mx-auto mb-6 opacity-90" />
        <h2 className="text-[32px] md:text-[44px] font-bold text-foreground leading-tight mb-5">
          Ready to explore Africa's<br />
          <span className="text-gradient">environmental data?</span>
        </h2>
        <p className="text-[17px] text-muted-foreground mb-10 leading-relaxed">
          Join researchers, policymakers, and organizations using GeoPulse for data-driven
          environmental decisions.
        </p>

        <Link
          to="/auth"
          className="group inline-flex items-center gap-3 px-8 py-4 bg-brand text-white text-[16px] font-semibold rounded-xl hover:bg-blue-500 transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(59,130,246,0.35)]"
        >
          Get Started Free
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
        </Link>
      </motion.div>
    </section>
  );
}
