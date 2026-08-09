import { useEffect, useState, type ReactNode } from "react";
import { Plus, Trash2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

const HAZARD_TYPES = [
  { value: "flood", label: "Flood" },
  { value: "drought", label: "Drought" },
  { value: "fire", label: "Wildfire" },
  { value: "storm", label: "Storm" },
  { value: "heatwave", label: "Heatwave" },
  { value: "pollution", label: "Pollution" },
  { value: "heavy_metal", label: "Heavy Metal Contamination" },
];

const METRICS = [
  { value: "temperature_c", label: "Temperature (°C)" },
  { value: "rainfall_mm", label: "Rainfall (mm)" },
  { value: "soil_moisture", label: "Soil Moisture" },
  { value: "wind_speed_kmh", label: "Wind Speed (km/h)" },
  { value: "humidity_percent", label: "Humidity (%)" },
];

const OPERATORS = [
  { value: ">", label: "Greater than (>)" },
  { value: "<", label: "Less than (<)" },
  { value: ">=", label: "Greater or equal (≥)" },
  { value: "<=", label: "Less or equal (≤)" },
];

const DEFAULT_LOCATIONS = [
  { name: "Accra, Ghana", lat: 5.6037, lng: -0.1870 },
  { name: "Lagos, Nigeria", lat: 6.5244, lng: 3.3792 },
  { name: "Nairobi, Kenya", lat: -1.2921, lng: 36.8219 },
  { name: "Kumasi, Ghana", lat: 6.6885, lng: -1.6244 },
  { name: "Addis Ababa, Ethiopia", lat: 9.0192, lng: 38.7525 },
  { name: "Dar es Salaam, Tanzania", lat: -6.7924, lng: 39.2083 },
];

type Threshold = {
  id: string;
  region_name: string;
  hazard_type: string;
  metric: string;
  operator: string;
  threshold_value: number;
  is_active: boolean;
};

function SettingsCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card className="p-6 mb-4">
      <h2 className="text-[15px] font-medium text-gray-900 dark:text-v2-primary">{title}</h2>
      <p className="text-[13px] text-gray-500 dark:text-v2-muted mt-0.5 mb-4">{description}</p>
      {children}
    </Card>
  );
}

// Thresholds card - ported verbatim from EarlyWarning.tsx's Thresholds tab.
function ThresholdsCard() {
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [newThreshold, setNewThreshold] = useState({
    region_name: "", hazard_type: "flood", metric: "rainfall_mm", operator: ">", threshold_value: "",
  });

  const load = async () => {
    const { data } = await supabase.from("monitoring_thresholds").select("*").order("created_at", { ascending: false });
    if (data) setThresholds(data as Threshold[]);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newThreshold.region_name || !newThreshold.threshold_value) {
      toast.error("Please fill in all fields");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const loc = DEFAULT_LOCATIONS.find((l) => l.name === newThreshold.region_name);
    const { error } = await supabase.from("monitoring_thresholds").insert({
      user_id: user.id,
      region_name: newThreshold.region_name,
      lat: loc?.lat ?? 0,
      lng: loc?.lng ?? 0,
      hazard_type: newThreshold.hazard_type,
      metric: newThreshold.metric,
      operator: newThreshold.operator,
      threshold_value: parseFloat(newThreshold.threshold_value),
    });
    if (error) {
      toast.error("Failed to create threshold: " + error.message);
    } else {
      toast.success("Monitoring threshold created");
      setNewThreshold({ region_name: "", hazard_type: "flood", metric: "rainfall_mm", operator: ">", threshold_value: "" });
      load();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("monitoring_thresholds").delete().eq("id", id);
    if (!error) setThresholds((prev) => prev.filter((t) => t.id !== id));
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    const { error } = await supabase.from("monitoring_thresholds").update({ is_active: isActive }).eq("id", id);
    if (!error) setThresholds((prev) => prev.map((t) => (t.id === id ? { ...t, is_active: isActive } : t)));
  };

  return (
    <SettingsCard title="Alert thresholds" description="Set per-region thresholds that trigger notifications">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="space-y-1">
          <Label className="text-xs">Region</Label>
          <Select value={newThreshold.region_name} onValueChange={(v) => setNewThreshold((p) => ({ ...p, region_name: v }))}>
            <SelectTrigger><SelectValue placeholder="Select region" /></SelectTrigger>
            <SelectContent>{DEFAULT_LOCATIONS.map((l) => <SelectItem key={l.name} value={l.name}>{l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hazard Type</Label>
          <Select value={newThreshold.hazard_type} onValueChange={(v) => setNewThreshold((p) => ({ ...p, hazard_type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{HAZARD_TYPES.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Metric</Label>
          <Select value={newThreshold.metric} onValueChange={(v) => setNewThreshold((p) => ({ ...p, metric: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Condition</Label>
          <Select value={newThreshold.operator} onValueChange={(v) => setNewThreshold((p) => ({ ...p, operator: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Threshold Value</Label>
          <Input type="number" placeholder="e.g. 50" value={newThreshold.threshold_value} onChange={(e) => setNewThreshold((p) => ({ ...p, threshold_value: e.target.value }))} />
        </div>
        <div className="flex items-end">
          <Button onClick={handleAdd} className="w-full bg-gradient-ocean hover:opacity-90"><Plus className="h-4 w-4 mr-2" /> Add Threshold</Button>
        </div>
      </div>

      <div className="space-y-2">
        {thresholds.map((t) => (
          <Card key={t.id} className="p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm font-medium">{t.region_name}</span>
                  <Badge variant="outline" className="capitalize text-xs">{t.hazard_type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {METRICS.find((m) => m.value === t.metric)?.label} {t.operator} {t.threshold_value}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={t.is_active} onCheckedChange={(v) => handleToggle(t.id, v)} />
                <Button variant="ghost" size="icon" onClick={() => handleDelete(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </SettingsCard>
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
        <ThresholdsCard />
        <NotificationsCard />
        <AccountCard />
      </div>
    </div>
  );
}
