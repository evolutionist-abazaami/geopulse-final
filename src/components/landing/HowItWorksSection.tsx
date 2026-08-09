import { motion } from "framer-motion";
import { MapPin, Satellite, Sparkles, type LucideIcon } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

interface Step {
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

const steps: Step[] = [
  {
    number: "01",
    title: "Select your region",
    description: "Click anywhere on the map to choose an area of interest across Africa.",
    icon: MapPin,
  },
  {
    number: "02",
    title: "Run satellite analysis",
    description: "GeoWitness analyzes the selected region using satellite imagery to surface change.",
    icon: Satellite,
  },
  {
    number: "03",
    title: "Get AI-powered insights",
    description: "Review results, generate reports, and set up early-warning alerts for what matters.",
    icon: Sparkles,
  },
];

export function HowItWorksSection() {
  const { ref, isInView } = useScrollReveal();

  return (
    <section
      id="how-it-works"
      className="py-16 md:py-20 px-6 bg-muted/30 dark:bg-white/[0.015] border-t border-border"
    >
      <div className="max-w-3xl mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <h2 className="text-[34px] md:text-[44px] font-bold text-foreground">
            From region to insight<br />
            <span className="text-gradient">in minutes.</span>
          </h2>
        </motion.div>

        <div className="relative">
          <div className="absolute left-[23px] top-0 bottom-0 w-px bg-border hidden md:block" />
          <motion.div
            className="absolute left-[23px] top-0 w-px bg-gradient-to-b from-brand to-violet-500 hidden md:block origin-top"
            initial={{ scaleY: 0 }}
            animate={isInView ? { scaleY: 1 } : {}}
            transition={{ duration: 1.2, delay: 0.4, ease: [0.4, 0, 0.2, 1] }}
          />

          <div className="space-y-7">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, x: -20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.15 }}
                  className="flex gap-5 items-start"
                >
                  <div className="relative flex-shrink-0 w-12 h-12 rounded-full border border-brand/40 bg-brand/10 flex items-center justify-center z-10 bg-background">
                    <Icon className="w-[18px] h-[18px] text-brand" />
                    <span className="absolute -top-1 -right-1 text-[10px] font-bold text-brand/60">
                      {step.number}
                    </span>
                  </div>

                  <div className="pt-2">
                    <h3 className="text-[18px] font-semibold text-foreground mb-1">{step.title}</h3>
                    <p className="text-[14px] text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
