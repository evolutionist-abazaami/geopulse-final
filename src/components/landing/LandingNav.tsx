import { Link } from "react-router-dom";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";
import geopulseLogo from "@/assets/geopulse-logo.png";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
];

export function LandingNav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 60);
  });

  return (
    <motion.nav
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 border-b transition-colors duration-300",
        scrolled
          ? "bg-background/85 dark:bg-[#0a0c12]/85 backdrop-blur-md border-border"
          : "bg-transparent border-transparent"
      )}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={geopulseLogo} className="w-8 h-8 rounded-md" alt="GeoPulse" />
          <span
            className={cn(
              "text-[16px] font-semibold transition-colors duration-300",
              scrolled ? "text-foreground" : "text-white"
            )}
          >
            GeoPulse
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={cn(
                "text-[14px] transition-colors duration-200",
                scrolled
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-white/70 hover:text-white"
              )}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/auth"
            className={cn(
              "text-[14px] transition-colors duration-200",
              scrolled
                ? "text-muted-foreground hover:text-foreground"
                : "text-white/70 hover:text-white"
            )}
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            className="px-4 py-2 bg-brand text-white text-[14px] font-medium rounded-lg hover:bg-blue-500 transition-all duration-200"
          >
            Get started
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}
