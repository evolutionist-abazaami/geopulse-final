import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // --- v2 shell design tokens (dark-dominant, map-centric) ---
        // Surfaces
        'surface-base': '#0f1117',
        'surface-1':    '#161b25',
        'surface-2':    '#1e2535',
        'surface-3':    '#26304a',

        // Light mode surfaces (used as the default, dark: overrides them)
        'light-base': '#f8fafc',
        'light-1':    '#ffffff',
        'light-2':    '#f1f5f9',
        'light-3':    '#e2e8f0',

        // Brand
        'brand':        '#3b82f6',
        'brand-dim':    'rgba(59,130,246,0.12)',
        'brand-border': 'rgba(59,130,246,0.25)',

        // Severity - used consistently for alerts, metrics, pins
        'critical':        '#ef4444',
        'critical-dim':    'rgba(239,68,68,0.12)',
        'warning':         '#f59e0b',
        'warning-dim':     'rgba(245,158,11,0.12)',
        'stable':          '#22c55e',
        'stable-dim':      'rgba(34,197,94,0.12)',

        // Event types - history icons, map pin accents
        'event-deforestation': '#22c55e',
        'event-flood':         '#3b82f6',
        'event-wildfire':      '#f59e0b',
        'event-drought':       '#ef4444',
        'event-search':        '#8b5cf6',

        // v2 text tokens (namespaced to avoid colliding with shadcn's own
        // "primary"/"secondary"/"muted" color keys above)
        'v2-primary':   '#f1f5f9',
        'v2-secondary': '#94a3b8',
        'v2-muted':     '#475569',
        'v2-disabled':  '#334155',

        // Borders
        'border-subtle':  'rgba(255,255,255,0.06)',
        'border-default': 'rgba(255,255,255,0.10)',
        'border-strong':  'rgba(255,255,255,0.16)',
        'border-accent':  'rgba(59,130,246,0.35)',
      },
      backgroundImage: {
        'gradient-ocean': 'var(--gradient-ocean)',
        'gradient-forest': 'var(--gradient-forest)',
        'gradient-hero': 'var(--gradient-hero)',
      },
      boxShadow: {
        'glow': 'var(--shadow-glow)',
        'elevated': 'var(--shadow-elevated)',
      },
      transitionProperty: {
        'smooth': 'var(--transition-smooth)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "16px",
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      transitionDuration: {
        'fast': '150ms',
        'base': '250ms',
        'slow': '350ms',
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "fade-in": {
          "0%": {
            opacity: "0",
            transform: "translateY(10px)"
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)"
          }
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" }
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" }
        },
        shimmer: {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'pulse-ring': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':      { opacity: '0.4', transform: 'scale(1.8)' },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.5s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "pulse-glow": "pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer:     'shimmer 1.5s infinite',
        'pulse-ring': 'pulse-ring 2s ease-in-out infinite',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
