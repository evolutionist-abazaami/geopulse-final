import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

function SettingsCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card className="p-6 mb-4">
      <h2 className="text-[15px] font-medium text-gray-900 dark:text-v2-primary">{title}</h2>
      <p className="text-[13px] text-gray-500 dark:text-v2-muted mt-0.5 mb-4">{description}</p>
      {children}
    </Card>
  );
}

type AlertPreferences = { email_enabled: boolean; dashboard_enabled: boolean; min_severity: string; email_address: string | null };

function NotificationsCard() {
  const [prefs, setPrefs] = useState<AlertPreferences>({ email_enabled: false, dashboard_enabled: true, min_severity: "moderate", email_address: null });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("alert_preferences").select("*").eq("user_id", user.id).maybeSingle();
      if (data) setPrefs(data as AlertPreferences);
      setLoaded(true);
    })();
  }, []);

  const save = async (next: AlertPreferences) => {
    setPrefs(next);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("alert_preferences").upsert({ user_id: user.id, ...next }, { onConflict: "user_id" });
    if (error) toast.error("Failed to save notification settings");
    else toast.success("Notification settings saved");
  };

  if (!loaded) return null;

  return (
    <SettingsCard title="Notifications" description="Choose how and when you receive alerts">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Show alerts on dashboard</Label>
          <Switch checked={prefs.dashboard_enabled} onCheckedChange={(v) => save({ ...prefs, dashboard_enabled: v })} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-sm">Email notifications</Label>
          <Switch checked={prefs.email_enabled} onCheckedChange={(v) => save({ ...prefs, email_enabled: v })} />
        </div>
        {prefs.email_enabled && (
          <Input
            placeholder="Email address"
            value={prefs.email_address ?? ""}
            onChange={(e) => setPrefs((p) => ({ ...p, email_address: e.target.value }))}
            onBlur={() => save(prefs)}
          />
        )}
        <div className="space-y-1">
          <Label className="text-xs">Minimum severity</Label>
          <Select value={prefs.min_severity} onValueChange={(v) => save({ ...prefs, min_severity: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </SettingsCard>
  );
}

function AccountCard() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email || "");
      setFullName(user?.user_metadata?.full_name || "");
    });
  }, []);

  const saveName = async () => {
    const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    if (error) toast.error("Failed to update profile");
    else toast.success("Profile updated");
  };

  const changePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) toast.error("Failed to change password: " + error.message);
    else {
      toast.success("Password changed");
      setNewPassword("");
    }
  };

  return (
    <SettingsCard title="Account" description="Manage your profile and credentials">
      <div className="space-y-4">
        <div className="space-y-1">
          <Label className="text-xs">Email</Label>
          <Input value={email} disabled />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Display name</Label>
          <div className="flex gap-2">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <Button variant="outline" onClick={saveName}>Save</Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">New password</Label>
          <div className="flex gap-2">
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
            <Button variant="outline" onClick={changePassword}>Change password</Button>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-gray-50 dark:bg-surface-base p-8">
      <div className="max-w-2xl">
        <h1 className="text-[22px] font-semibold text-gray-900 dark:text-v2-primary mb-6">Settings</h1>
        <NotificationsCard />
        <AccountCard />
      </div>
    </div>
  );
}
