import geopulseLogo from "@/assets/geopulse-logo.png";

export function LandingFooter() {
  return (
    <footer className="border-t border-border px-6 py-10">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <img src={geopulseLogo} className="w-6 h-6 rounded-md" alt="GeoPulse" />
          <span className="text-[14px] font-semibold text-muted-foreground">GeoPulse</span>
        </div>

        <p className="text-[13px] text-muted-foreground/60">
          © {new Date().getFullYear()} GeoPulse. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
