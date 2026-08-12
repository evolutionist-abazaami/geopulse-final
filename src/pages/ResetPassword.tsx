import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import geopulseLogo from "@/assets/geopulse-logo.png";

const EASE = [0.4, 0, 0.2, 1] as const;

const ResetPassword = () => {
  const navigate = useNavigate();
  // This route renders before sign-in (outside the authenticated shell), so
  // it needs to apply the stored "geopulse-theme" preference itself - same
  // reasoning as Home.tsx.
  useTheme();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handleRecovery = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        toast.error("Unable to initialize password reset session.");
        navigate("/auth");
        return;
      }

      if (!session) {
        toast.error("This reset link is invalid or has expired.");
        navigate("/auth");
      }
    };

    handleRecovery();
  }, [navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message || "Unable to update password");
        return;
      }

      toast.success("Password updated successfully");
      navigate("/");
    } catch (error) {
      console.error("Reset password error:", error);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background px-4 py-12 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_60%_50%_at_50%_15%,rgba(59,130,246,0.12),transparent)]" />

      <div className="relative z-10 w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2.5 mb-8">
          <img src={geopulseLogo} className="w-8 h-8 rounded-md" alt="GeoPulse" />
          <span className="text-[16px] font-semibold text-foreground">GeoPulse</span>
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="relative rounded-2xl border border-border bg-card/90 backdrop-blur-xl shadow-xl overflow-hidden p-8"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent" />

          <div className="flex flex-col items-center text-center gap-3 mb-7">
            <div className="w-12 h-12 rounded-full border border-brand/40 bg-brand/10 flex items-center justify-center">
              <Lock className="h-5 w-5 text-brand" />
            </div>
            <div>
              <h1 className="text-[22px] font-bold tracking-tight text-foreground">Set a new password</h1>
              <p className="text-[14px] text-muted-foreground mt-1.5">
                Choose a new password for your GeoPulse account.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl bg-brand text-white hover:bg-blue-500 transition-all duration-300 hover:shadow-[0_0_30px_rgba(59,130,246,0.35)]"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating password...
                </>
              ) : (
                "Save new password"
              )}
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default ResetPassword;
