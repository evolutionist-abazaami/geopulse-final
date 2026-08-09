import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, ChevronDown, Satellite, Shield } from "lucide-react";
import MapLibreMap from "@/components/MapLibreMap";

const AFRICA_CENTER: [number, number] = [5.5, 20.0];
const AFRICA_ZOOM = 3.2;

export function HeroSection() {
  return (
    <section className="relative h-screen min-h-[700px] flex flex-col items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none" data-lenis-prevent>
        <MapLibreMap center={AFRICA_CENTER} zoom={AFRICA_ZOOM} />
      </div>

      {/* Dark scrim over the map for text readability — intentionally the same
          in both themes, since this sits on live map imagery, not page chrome */}
      <div className="absolute inset-0 z-10 bg-gradient-to-b from-[rgba(10,12,18,0.78)] via-[rgba(10,12,18,0.58)] to-[rgba(10,12,18,0.92)]" />
      <div className="absolute inset-0 z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_60%,rgba(59,130,246,0.14),transparent)]" />

      <div className="relative z-20 text-center px-6 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm"
        >
          <Satellite className="w-3.5 h-3.5 text-white/70" />
          <span className="text-[12px] text-white/70 font-medium tracking-wide">
            Powered by AI &amp; Satellite Imagery
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
          className="text-[40px] sm:text-[52px] md:text-[68px] font-bold leading-[1.05] tracking-tight text-white mb-6"
        >
          AI-Powered{" "}
          <span className="text-gradient">Geospatial Intelligence</span>
          <br />
          for Africa
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="text-[16px] sm:text-[18px] md:text-[20px] text-white/60 leading-relaxed max-w-2xl mx-auto mb-10"
        >
          Monitor environmental changes, detect deforestation, track flooding events, and
          analyze satellite imagery with cutting-edge AI technology.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: [0.4, 0, 0.2, 1] }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            to="/auth"
            className="group relative flex items-center gap-2 px-7 py-3.5 bg-brand text-white text-[15px] font-semibold rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(59,130,246,0.4)]"
          >
            <Shield className="w-4 h-4 relative z-10" />
            <span className="relative z-10">Sign In to Start</span>
            <ArrowRight className="w-4 h-4 relative z-10" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
          </Link>

          <Link
            to="/geowitness"
            className="flex items-center gap-2 px-6 py-3.5 text-[15px] font-medium text-white/70 hover:text-white border border-white/15 rounded-xl hover:border-white/30 hover:bg-white/5 transition-all duration-300"
          >
            Try Demo
          </Link>
        </motion.div>
      </div>

      <motion.a
        href="#features"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.6 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2"
      >
        <span className="text-[11px] text-white/30 tracking-widest uppercase">Scroll</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
        >
          <ChevronDown className="w-4 h-4 text-white/40" />
        </motion.div>
      </motion.a>
    </section>
  );
}
