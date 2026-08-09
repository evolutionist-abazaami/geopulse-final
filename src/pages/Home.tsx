import { useEffect } from "react";
import Lenis from "lenis";
import { useTheme } from "@/hooks/useTheme";
import { LandingNav } from "@/components/landing/LandingNav";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { CtaSection } from "@/components/landing/CtaSection";
import { LandingFooter } from "@/components/landing/LandingFooter";

const Home = () => {
  // The app's dark/light class is normally applied by the authenticated
  // TopBar's theme toggle; this route renders before sign-in, so it needs
  // to apply the same stored "geopulse-theme" preference itself.
  useTheme();

  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.08, smoothWheel: true });
    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="bg-background text-foreground overflow-x-hidden">
      <LandingNav />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <CtaSection />
      <LandingFooter />
    </div>
  );
};

export default Home;
