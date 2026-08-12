import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Satellite, Loader2, ArrowLeft, KeyRound } from "lucide-react";
import geopulseLogo from "@/assets/geopulse-logo.png";

const EASE = [0.4, 0, 0.2, 1] as const;

const Auth = () => {
  const navigate = useNavigate();
  // This route renders before sign-in (outside the authenticated shell), so
  // it needs to apply the stored "geopulse-theme" preference itself - same
  // reasoning as Home.tsx.
  useTheme();

  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard");
      }
    });

    // Listen for auth changes - this fires for sign-in, sign-up (when email
    // confirmation is off), and OAuth callbacks alike, so this one listener
    // covers every path into the app.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password: string) => {
    return password.length >= 6;
  };

  const handleOAuthSignIn = async (provider: "google" | "apple") => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        toast.error(error.message || `Failed to sign in with ${provider === "apple" ? "Apple" : "Google"}`);
        setIsLoading(false);
        return;
      }

      toast.success(`Redirecting to ${provider === "apple" ? "Apple" : "Google"} for sign-in...`);
    } catch (error) {
      console.error(`${provider} signin error:`, error);
      toast.error("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    await handleOAuthSignIn("google");
  };

  const handleAppleSignIn = async () => {
    await handleOAuthSignIn("apple");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail(resetEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Password reset link sent! Check your email.");
      setResetEmail("");
      setShowResetPassword(false);
    } catch (error) {
      console.error("Reset password error:", error);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (!validatePassword(password)) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/dashboard`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        if (error.message.includes("already registered")) {
          toast.error("This email is already registered. Please sign in instead.");
        } else {
          toast.error(error.message);
        }
        return;
      }

      if (data.session) {
        // Email confirmation is off (or this address was already confirmed) -
        // a real session exists immediately. The onAuthStateChange listener
        // above will pick this up and redirect to /dashboard on its own.
        toast.success("Account created! Taking you to your dashboard...");
      } else {
        // A real account now exists in Supabase, but it can't be used to
        // sign in until the confirmation link is clicked - say so plainly
        // instead of implying sign-in will work right away.
        toast.success("Account created! Check your email to confirm it before signing in.");
      }
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Signup error:", error);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateEmail(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (!validatePassword(password)) {
      toast.error("Password must be at least 6 characters long");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast.error("Invalid email or password. Please try again.");
        } else if (error.message.toLowerCase().includes("email not confirmed")) {
          toast.error("Please confirm your email first - check your inbox for the confirmation link.");
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success("Welcome back!");
    } catch (error) {
      console.error("Signin error:", error);
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

          {showResetPassword ? (
            <div className="space-y-5">
              <Button
                type="button"
                variant="ghost"
                className="-ml-2 rounded-xl text-muted-foreground hover:text-foreground"
                onClick={() => setShowResetPassword(false)}
                disabled={isLoading}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to sign in
              </Button>

              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full border border-brand/40 bg-brand/10 flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-brand" />
                </div>
                <div>
                  <h2 className="text-[18px] font-semibold text-foreground mb-1">Reset Password</h2>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    Enter your email and we'll send you a link to reset your password.
                  </p>
                </div>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="your@email.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
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
                      Sending...
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </Button>
              </form>
            </div>
          ) : (
            <>
              <div className="text-center mb-7">
                <h1 className="text-[24px] font-bold tracking-tight text-foreground mb-1.5">
                  Welcome to <span className="text-gradient">GeoPulse</span>
                </h1>
                <p className="text-[14px] text-muted-foreground">
                  AI-powered satellite analysis for Africa
                </p>
              </div>

              {/* Google Sign In Button */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 mb-3 rounded-xl border-border hover:bg-accent/40 dark:hover:bg-white/[0.05] flex items-center justify-center gap-2 transition-colors duration-200"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full h-11 mb-4 rounded-xl border-border hover:bg-accent/40 dark:hover:bg-white/[0.05] flex items-center justify-center gap-2 transition-colors duration-200"
                onClick={handleAppleSignIn}
                disabled={isLoading}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M16.36 8.94c-.03-1.76 1.44-2.6 1.5-2.64-.82-1.2-2.1-1.37-2.56-1.38-1.09-.11-2.13.64-2.69.64-.56 0-1.43-.62-2.35-.6-1.21.01-2.33.7-2.95 1.78-1.27 2.2-.32 5.46 1.02 7.24.68.98 1.49 2.08 2.56 2.04 1.03-.04 1.42-.66 2.67-.66 1.25 0 1.61.66 2.71.64 1.12-.02 1.82-.99 2.5-1.97.78-1.14 1.11-2.24 1.13-2.3-.02-.01-2.16-.83-2.16-3.33ZM14.2 2.83c.48-.58.8-1.39.71-2.2-.69.03-1.52.46-2.01 1.04-.44.51-.83 1.33-.73 2.11.77.06 1.55-.39 2.03-0.95Z"/>
                </svg>
                Continue with Apple
              </Button>

              {/* Divider */}
              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-[11px] uppercase tracking-widest">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with email</span>
                </div>
              </div>

              <Tabs defaultValue="signin" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 h-11 rounded-xl">
                  <TabsTrigger value="signin" className="rounded-lg">Sign In</TabsTrigger>
                  <TabsTrigger value="signup" className="rounded-lg">Sign Up</TabsTrigger>
                </TabsList>

                <TabsContent value="signin">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Email</Label>
                      <Input
                        id="signin-email"
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isLoading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signin-password">Password</Label>
                      <Input
                        id="signin-password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
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
                          Signing in...
                        </>
                      ) : (
                        "Sign In"
                      )}
                    </Button>

                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        variant="link"
                        className="text-[13px] text-muted-foreground hover:text-foreground"
                        onClick={() => setShowResetPassword(true)}
                        disabled={isLoading}
                      >
                        Forgot your password?
                      </Button>
                    </div>
                  </form>
                </TabsContent>

                <TabsContent value="signup">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isLoading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isLoading}
                      />
                      <p className="text-[12px] text-muted-foreground">
                        At least 6 characters
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm Password</Label>
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
                          Creating account...
                        </>
                      ) : (
                        "Create Account"
                      )}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </>
          )}
        </motion.div>

        <div className="mt-6 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
          <Satellite className="h-3.5 w-3.5" />
          <span>Track your environmental analyses</span>
        </div>
      </div>
    </div>
  );
};

export default Auth;
