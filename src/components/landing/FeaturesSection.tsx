import { motion } from "framer-motion";
import { Satellite, Search, TrendingUp, type LucideIcon } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

interface Feature {
  id: string;
  icon: LucideIcon;
  accent: string;
  title: string;
  description: string;
  tags: string[];
}

const features: Feature[] = [
  {
    id: "monitoring",
    icon: Satellite,
    accent: "#3b82f6",
    title: "Environmental Monitoring",
    description:
      "Track deforestation, floods, fires, and land use changes with precision satellite analysis.",
    tags: ["Deforestation", "Floods", "Fires"],
  },
  {
    id: "search",
    icon: Search,
    accent: "#8b5cf6",
    title: "AI-Powered Search",
    description:
      "Ask questions in natural language and get instant geospatial insights powered by advanced NLP.",
    tags: ["Natural language", "NLP"],
  },
  {
    id: "change-detection",
    icon: TrendingUp,
    accent: "#22c55e",
    title: "Change Detection",
    description:
      "Identify environmental changes over time with automated analysis and detailed reporting.",
    tags: ["Time series", "Automated analysis"],
  },
];

export function FeaturesSection() {
  const { ref, isInView } = useScrollReveal();

  return (
    <section id="features" className="py-24 md:py-28 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-[34px] md:text-[44px] font-bold text-foreground">
            Discover. Analyze. <span className="text-gradient">Understand.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {features.map((feature, i) => (
            <FeatureCard key={feature.id} feature={feature} index={i} isInView={isInView} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  feature,
  index,
  isInView,
}: {
  feature: Feature;
  index: number;
  isInView: boolean;
}) {
  const Icon = feature.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: index * 0.12, ease: [0.4, 0, 0.2, 1] }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="group relative rounded-2xl overflow-hidden border border-border bg-card hover:bg-accent/40 dark:hover:bg-white/[0.05] transition-colors duration-300 p-7"
    >
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${feature.accent}80, transparent)` }}
      />
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 60% 40% at 50% 0%, ${feature.accent}12, transparent)` }}
      />

      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
        style={{ background: `${feature.accent}18`, border: `1px solid ${feature.accent}30` }}
      >
        <Icon className="w-5 h-5" style={{ color: feature.accent }} />
      </div>

      <h3 className="text-[20px] font-semibold text-foreground mb-3">{feature.title}</h3>
      <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
        {feature.description}
      </p>

      <div className="flex flex-wrap gap-2">
        {feature.tags.map((tag) => (
          <span
            key={tag}
            className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
