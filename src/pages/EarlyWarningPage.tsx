import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertTriangle, Bell, BellRing, MapPin, Thermometer, Droplets,
  Wind, CloudRain, Loader2, Plus, Trash2, CheckCircle, RefreshCw,
  TrendingUp, Shield, Eye, Info, Zap, ChevronDown, Flame,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TrendChart } from "@/components/charts/TrendChart";

type HazardAlert = {
  id: string;
  region_name: string;
  lat: number;
  lng: number;
  hazard_type: string;
  severity: string;
  title: string;
  description: string | null;
  metric_name: string | null;
  metric_value: number | null;
  threshold_value: number | null;
  ai_analysis: any;
  is_read: boolean;
  is_resolved: boolean;
  created_at: string;
};

type MonitoringThreshold = {
  id: string;
  region_name: string;
  lat: number;
  lng: number;
  hazard_type: string;
  metric: string;
  operator: string;
  threshold_value: number;
  is_active: boolean;
  created_at: string;
};

type WeatherObservation = {
  id: string;
  region_name: string;
  temperature_c: number | null;
  rainfall_mm: number | null;
  soil_moisture: number | null;
  wind_speed_kmh: number | null;
  humidity_percent: number | null;
  observation_date: string;
};

const HAZARD_TYPES = [
  { value: "flood", label: "Flood" },
  { value: "drought", label: "Drought" },
  { value: "fire", label: "Wildfire" },
  { value: "storm", label: "Storm" },
  { value: "heatwave", label: "Heatwave" },
  { value: "pollution", label: "Pollution" },
  { value: "heavy_metal", label: "Heavy Metal Contamination" },
];

// Same shape as Sidebar's eventTypeStyles, so hazard chips read consistently
// with the analysis-history icons elsewhere in the app.
const HAZARD_STYLES: Record<string, { bg: string; text: string; Icon: typeof Droplets }> = {
  flood: { bg: "bg-event-flood/15", text: "text-event-flood", Icon: Droplets },
  drought: { bg: "bg-warning-dim", text: "text-warning", Icon: Thermometer },
  fire: { bg: "bg-event-wildfire/15", text: "text-event-wildfire", Icon: Flame },
  storm: { bg: "bg-event-search/15", text: "text-event-search", Icon: Wind },
  heatwave: { bg: "bg-event-wildfire/15", text: "text-event-wildfire", Icon: Thermometer },
  pollution: { bg: "bg-stable-dim", text: "text-stable", Icon: AlertTriangle },
  heavy_metal: { bg: "bg-critical-dim", text: "text-critical", Icon: AlertTriangle },
};

function hazardStyle(type: string) {
  return HAZARD_STYLES[type] || HAZARD_STYLES.flood;
}

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

// 4 hazard-alert severities mapped onto the app's 3 semantic tokens (low is
// the only unambiguous "fine" state; moderate is cautionary; high/critical
// both read as alarming, so they share the strongest token).
const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: "bg-stable-dim", text: "text-stable", border: "border-l-stable" },
  moderate: { bg: "bg-warning-dim", text: "text-warning", border: "border-l-warning" },
  high: { bg: "bg-critical-dim", text: "text-critical", border: "border-l-critical" },
  critical: { bg: "bg-critical-dim", text: "text-critical", border: "border-l-critical" },
};

function severityStyle(sev: string) {
  return SEVERITY_STYLES[sev] || SEVERITY_STYLES.moderate;
}

const DEFAULT_LOCATIONS = [
  { name: "Accra, Ghana", lat: 5.6037, lng: -0.1870 },
  { name: "Lagos, Nigeria", lat: 6.5244, lng: 3.3792 },
  { name: "Nairobi, Kenya", lat: -1.2921, lng: 36.8219 },
  { name: "Kumasi, Ghana", lat: 6.6885, lng: -1.6244 },
  { name: "Addis Ababa, Ethiopia", lat: 9.0192, lng: 38.7525 },
  { name: "Dar es Salaam, Tanzania", lat: -6.7924, lng: 39.2083 },
];

type Tab = "alerts" | "thresholds" | "weather" | "trends";

/**
 * Alerts + Thresholds + Weather Data + Trends all together on this one page
 * - this page owns hazard monitoring end-to-end. Restyled to match the v2
 * shell design language (Sidebar/TopBar/RightPanel/ReportsPage) instead of
 * the older generic shadcn Card/Badge/Tabs look.
 */
export default function EarlyWarningPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [alerts, setAlerts] = useState<HazardAlert[]>([]);
  const [thresholds, setThresholds] = useState<MonitoringThreshold[]>([]);
  const [observations, setObservations] = useState<WeatherObservation[]>([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("alerts");

  const [newThreshold, setNewThreshold] = useState({
    region_name: "", lat: "", lng: "", hazard_type: "flood", metric: "rainfall_mm", operator: ">", threshold_value: "",
  });

  useEffect(() => {
    checkUserAndLoad();
  }, []);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("early-warning-hazard-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "hazard_alerts" },
        (payload) => {
          const newAlert = payload.new as HazardAlert & { user_id: string };
          if (newAlert.user_id === user.id) {
            setAlerts((prev) => [newAlert, ...prev]);
            toast.warning(`New ${newAlert.hazard_type} alert: ${newAlert.region_name}`, { duration: 8000 });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const checkUserAndLoad = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please sign in to access Early Warning");
      navigate("/auth");
      return;
    }
    setUser(user);
    await loadAllData();
  };

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [alertsRes, thresholdsRes, obsRes] = await Promise.all([
        supabase.from("hazard_alerts").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("monitoring_thresholds").select("*").order("created_at", { ascending: false }),
        supabase.from("weather_observations").select("*").order("observation_date", { ascending: false }).limit(100),
      ]);
      if (alertsRes.data) setAlerts(alertsRes.data);
      if (thresholdsRes.data) setThresholds(thresholdsRes.data);
      if (obsRes.data) setObservations(obsRes.data);
    } catch (err) {
      console.error("Load error:", err);
      toast.error("Failed to load early warning data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleIngestWeather = async () => {
    setIsIngesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ingest-weather");
      if (error) throw error;
      toast.success(`Weather data ingested: ${data.ingested} locations`);
      await loadAllData();
    } catch (err: any) {
      toast.error("Failed to ingest weather data: " + err.message);
    } finally {
      setIsIngesting(false);
    }
  };

  const handleEvaluateHazards = async () => {
    setIsEvaluating(true);
    try {
      const { data, error } = await supabase.functions.invoke("evaluate-hazards");
      if (error) throw error;
      toast.success(`Evaluation complete: ${data.alerts_created} new alerts`);
      await loadAllData();
    } catch (err: any) {
      toast.error("Failed to evaluate hazards: " + err.message);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleAddThreshold = async () => {
    if (!newThreshold.region_name || !newThreshold.threshold_value) {
      toast.error("Please fill in all fields");
      return;
    }
    const selectedLocation = DEFAULT_LOCATIONS.find((l) => l.name === newThreshold.region_name);
    const lat = selectedLocation ? selectedLocation.lat : parseFloat(newThreshold.lat);
    const lng = selectedLocation ? selectedLocation.lng : parseFloat(newThreshold.lng);

    const { error } = await supabase.from("monitoring_thresholds").insert({
      user_id: user.id,
      region_name: newThreshold.region_name,
      lat, lng,
      hazard_type: newThreshold.hazard_type,
      metric: newThreshold.metric,
      operator: newThreshold.operator,
      threshold_value: parseFloat(newThreshold.threshold_value),
    });

    if (error) {
      toast.error("Failed to create threshold: " + error.message);
    } else {
      toast.success("Monitoring threshold created");
      setNewThreshold({ region_name: "", lat: "", lng: "", hazard_type: "flood", metric: "rainfall_mm", operator: ">", threshold_value: "" });
      await loadAllData();
    }
  };

  const handleDeleteThreshold = async (id: string) => {
    const { error } = await supabase.from("monitoring_thresholds").delete().eq("id", id);
    if (!error) {
      setThresholds((prev) => prev.filter((t) => t.id !== id));
      toast.success("Threshold deleted");
    }
  };

  const handleToggleThreshold = async (id: string, isActive: boolean) => {
    const { error } = await supabase.from("monitoring_thresholds").update({ is_active: isActive }).eq("id", id);
    if (!error) setThresholds((prev) => prev.map((t) => (t.id === id ? { ...t, is_active: isActive } : t)));
  };

  const handleMarkRead = async (id: string) => {
    const { error } = await supabase.from("hazard_alerts").update({ is_read: true }).eq("id", id);
    if (!error) setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
  };

  const handleResolveAlert = async (id: string) => {
    const { error } = await supabase.from("hazard_alerts").update({ is_resolved: true, resolved_at: new Date().toISOString() }).eq("id", id);
    if (!error) {
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_resolved: true } : a)));
      toast.success("Alert resolved");
    }
  };

  const getTrendData = (metric: string) => {
    return observations
      .filter((o) => o[metric as keyof WeatherObservation] !== null)
      .map((o) => ({ date: new Date(o.observation_date).toLocaleDateString(), value: Number(o[metric as keyof WeatherObservation]) || 0 }))
      .reverse()
      .slice(0, 30);
  };

  const unreadCount = alerts.filter((a) => !a.is_read && !a.is_resolved).length;
  const activeAlerts = alerts.filter((a) => !a.is_resolved);
  const resolvedAlerts = alerts.filter((a) => a.is_resolved);

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "alerts", label: "Alerts", badge: unreadCount },
    { id: "thresholds", label: "Thresholds" },
    { id: "weather", label: "Weather" },
    { id: "trends", label: "Trends" },
  ];

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-surface-base">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-gray-50 dark:bg-surface-base p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-semibold text-gray-900 dark:text-v2-primary flex items-center gap-2.5">
              <Shield className="w-5 h-5 text-brand" />
              Early Warning
            </h1>
            <p className="text-[14px] text-gray-500 dark:text-v2-muted mt-1">Automated environmental hazard monitoring and alerts for Africa</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleIngestWeather}
              disabled={isIngesting}
              className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-gray-600 dark:text-v2-secondary bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-default rounded-md hover:border-gray-300 dark:hover:border-border-strong hover:text-gray-900 dark:hover:text-v2-primary disabled:opacity-50 transition-all duration-fast"
            >
              {isIngesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Ingest Weather Now
            </button>
            <button
              onClick={handleEvaluateHazards}
              disabled={isEvaluating}
              className="flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-brand rounded-md hover:bg-blue-500 disabled:opacity-50 transition-all duration-fast"
            >
              {isEvaluating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              Check Hazards Now
            </button>
          </div>
        </div>

        <Collapsible className="mb-6">
          <div className="rounded-xl border border-brand-border bg-brand-dim/30 p-4">
            <CollapsibleTrigger className="flex items-center justify-between w-full group">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-brand" />
                <span className="text-[13px] font-medium text-gray-900 dark:text-v2-primary">How Early Warning detection works (and why it's useful)</span>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-400 dark:text-v2-muted transition-transform duration-fast group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3 text-[13px] text-gray-600 dark:text-v2-secondary">
              <div className="flex items-start gap-2.5">
                <div className="h-5 w-5 rounded-full bg-brand-dim flex items-center justify-center text-[10px] font-bold text-brand mt-0.5 flex-shrink-0">1</div>
                <p><strong className="text-gray-900 dark:text-v2-primary font-medium">Real weather data is collected automatically.</strong> Every 30 minutes, current temperature, rainfall, soil moisture, wind speed, and humidity are fetched from the Open-Meteo API for each monitored location.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="h-5 w-5 rounded-full bg-brand-dim flex items-center justify-center text-[10px] font-bold text-brand mt-0.5 flex-shrink-0">2</div>
                <p><strong className="text-gray-900 dark:text-v2-primary font-medium">Your thresholds are checked automatically.</strong> Every 15 minutes, each active threshold you've configured below (e.g. "temperature above 38°C in Accra") is compared against the latest real reading for that region.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="h-5 w-5 rounded-full bg-brand-dim flex items-center justify-center text-[10px] font-bold text-brand mt-0.5 flex-shrink-0">3</div>
                <p><strong className="text-gray-900 dark:text-v2-primary font-medium">An alert is created when a threshold is exceeded.</strong> The AI assistant adds a short plain-language risk assessment alongside the real reading that crossed your threshold.</p>
              </div>
              <div className="pt-2 border-t border-brand-border/50 flex items-start gap-2.5">
                <Zap className="h-4 w-4 text-brand mt-0.5 flex-shrink-0" />
                <p><strong className="text-gray-900 dark:text-v2-primary font-medium">Why this matters:</strong> because ingestion and evaluation now run on a schedule in the background, you don't have to keep this page open or click anything to catch an emerging condition - alerts accumulate here even while you're away.</p>
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-critical-dim flex items-center justify-center flex-shrink-0"><BellRing className="h-[18px] w-[18px] text-critical" /></div>
              <div className="min-w-0"><p className="text-[11px] text-gray-400 dark:text-v2-muted truncate">Unread Alerts</p><p className="text-[20px] font-semibold text-gray-900 dark:text-v2-primary">{unreadCount}</p></div>
            </div>
          </div>
          <div className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-warning-dim flex items-center justify-center flex-shrink-0"><AlertTriangle className="h-[18px] w-[18px] text-warning" /></div>
              <div className="min-w-0"><p className="text-[11px] text-gray-400 dark:text-v2-muted truncate">Active Alerts</p><p className="text-[20px] font-semibold text-gray-900 dark:text-v2-primary">{activeAlerts.length}</p></div>
            </div>
          </div>
          <div className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-brand-dim flex items-center justify-center flex-shrink-0"><TrendingUp className="h-[18px] w-[18px] text-brand" /></div>
              <div className="min-w-0"><p className="text-[11px] text-gray-400 dark:text-v2-muted truncate">Thresholds</p><p className="text-[20px] font-semibold text-gray-900 dark:text-v2-primary">{thresholds.length}</p></div>
            </div>
          </div>
          <div className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-stable-dim flex items-center justify-center flex-shrink-0"><CloudRain className="h-[18px] w-[18px] text-stable" /></div>
              <div className="min-w-0"><p className="text-[11px] text-gray-400 dark:text-v2-muted truncate">Observations</p><p className="text-[20px] font-semibold text-gray-900 dark:text-v2-primary">{observations.length}</p></div>
            </div>
          </div>
        </div>

        <div className="flex border-b border-gray-200 dark:border-border-subtle mb-5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative text-[13px] py-2.5 px-4 border-b-2 transition-all duration-fast",
                activeTab === tab.id
                  ? "text-brand border-brand font-medium"
                  : "text-gray-400 dark:text-v2-muted border-transparent hover:text-gray-600 dark:hover:text-v2-secondary"
              )}
            >
              {tab.label}
              {!!tab.badge && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-medium bg-critical text-white rounded-full">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === "alerts" && (
          <div className="space-y-3">
            {activeAlerts.length === 0 && resolvedAlerts.length === 0 ? (
              <div className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl p-10 text-center">
                <Bell className="h-10 w-10 mx-auto text-gray-300 dark:text-v2-disabled mb-3" />
                <p className="text-[13px] text-gray-400 dark:text-v2-muted">No alerts yet. Set up monitoring thresholds and run evaluations.</p>
              </div>
            ) : (
              <>
                {activeAlerts.length > 0 && (
                  <>
                    <p className="text-[11px] text-gray-400 dark:text-v2-muted uppercase tracking-[0.08em]">Active alerts</p>
                    {activeAlerts.map((alert) => {
                      const sev = severityStyle(alert.severity);
                      const { bg, text, Icon } = hazardStyle(alert.hazard_type);
                      return (
                        <div
                          key={alert.id}
                          className={cn(
                            "bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl p-4 border-l-4",
                            !alert.is_read ? sev.border : "border-l-transparent"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className={cn("w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5", bg)}>
                                <Icon className={cn("w-4 h-4", text)} />
                              </div>
                              <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full capitalize", sev.bg, sev.text)}>{alert.severity}</span>
                                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full capitalize bg-gray-100 dark:bg-surface-3 text-gray-600 dark:text-v2-secondary">{alert.hazard_type}</span>
                                  <span className="text-[11px] text-gray-400 dark:text-v2-muted">{new Date(alert.created_at).toLocaleString()}</span>
                                </div>
                                <h4 className="font-medium text-[13px] text-gray-900 dark:text-v2-primary">{alert.title}</h4>
                                {alert.description && <p className="text-[12px] text-gray-500 dark:text-v2-muted">{alert.description}</p>}
                                {alert.ai_analysis?.assessment && (
                                  <div className="mt-1.5 p-2.5 rounded-md bg-brand-dim/30 border border-brand-border">
                                    <p className="text-[11px] font-medium text-brand mb-1">AI Risk Assessment</p>
                                    <p className="text-[12px] text-gray-600 dark:text-v2-secondary">{alert.ai_analysis.assessment}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col gap-1 flex-shrink-0">
                              {!alert.is_read && (
                                <button
                                  onClick={() => handleMarkRead(alert.id)}
                                  title="Mark as read"
                                  className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 dark:text-v2-muted hover:bg-gray-100 dark:hover:bg-surface-3 hover:text-gray-900 dark:hover:text-v2-primary transition-all duration-fast"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleResolveAlert(alert.id)}
                                title="Resolve"
                                className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 dark:text-v2-muted hover:bg-stable-dim hover:text-stable transition-all duration-fast"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                {resolvedAlerts.length > 0 && (
                  <>
                    <p className="text-[11px] text-gray-400 dark:text-v2-muted uppercase tracking-[0.08em] mt-5">Resolved</p>
                    {resolvedAlerts.slice(0, 10).map((alert) => (
                      <div key={alert.id} className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-lg p-3 opacity-60">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-3.5 w-3.5 text-stable flex-shrink-0" />
                          <span className="text-[13px] text-gray-700 dark:text-v2-secondary truncate">{alert.title}</span>
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full capitalize bg-gray-100 dark:bg-surface-3 text-gray-500 dark:text-v2-muted flex-shrink-0">{alert.severity}</span>
                          <span className="text-[11px] text-gray-400 dark:text-v2-muted ml-auto flex-shrink-0">{new Date(alert.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "thresholds" && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl p-4 space-y-4">
              <h3 className="text-[13px] font-medium text-gray-900 dark:text-v2-primary flex items-center gap-2"><Plus className="h-4 w-4 text-brand" /> Add Monitoring Threshold</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-gray-400 dark:text-v2-muted uppercase tracking-[0.06em]">Region</Label>
                  <Select value={newThreshold.region_name} onValueChange={(v) => setNewThreshold((p) => ({ ...p, region_name: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select region" /></SelectTrigger>
                    <SelectContent>{DEFAULT_LOCATIONS.map((l) => <SelectItem key={l.name} value={l.name}>{l.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-gray-400 dark:text-v2-muted uppercase tracking-[0.06em]">Hazard Type</Label>
                  <Select value={newThreshold.hazard_type} onValueChange={(v) => setNewThreshold((p) => ({ ...p, hazard_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{HAZARD_TYPES.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-gray-400 dark:text-v2-muted uppercase tracking-[0.06em]">Metric</Label>
                  <Select value={newThreshold.metric} onValueChange={(v) => setNewThreshold((p) => ({ ...p, metric: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-gray-400 dark:text-v2-muted uppercase tracking-[0.06em]">Condition</Label>
                  <Select value={newThreshold.operator} onValueChange={(v) => setNewThreshold((p) => ({ ...p, operator: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-gray-400 dark:text-v2-muted uppercase tracking-[0.06em]">Threshold Value</Label>
                  <Input type="number" placeholder="e.g. 50" value={newThreshold.threshold_value} onChange={(e) => setNewThreshold((p) => ({ ...p, threshold_value: e.target.value }))} />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleAddThreshold}
                    className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-brand rounded-md hover:bg-blue-500 transition-all duration-fast"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Threshold
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {thresholds.length === 0 ? (
                <div className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl p-10 text-center">
                  <TrendingUp className="h-10 w-10 mx-auto text-gray-300 dark:text-v2-disabled mb-3" />
                  <p className="text-[13px] text-gray-400 dark:text-v2-muted">No monitoring thresholds set. Create one above to start monitoring.</p>
                </div>
              ) : (
                thresholds.map((t) => {
                  const { bg, text, Icon } = hazardStyle(t.hazard_type);
                  return (
                    <div key={t.id} className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-lg p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={cn("w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0", bg)}>
                            <Icon className={cn("w-4 h-4", text)} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <MapPin className="h-3 w-3 text-gray-400 dark:text-v2-muted flex-shrink-0" />
                              <span className="text-[13px] font-medium text-gray-900 dark:text-v2-primary truncate">{t.region_name}</span>
                              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full capitalize bg-gray-100 dark:bg-surface-3 text-gray-600 dark:text-v2-secondary">{t.hazard_type}</span>
                            </div>
                            <p className="text-[12px] text-gray-400 dark:text-v2-muted mt-1">{METRICS.find((m) => m.value === t.metric)?.label} {t.operator} {t.threshold_value}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Switch checked={t.is_active} onCheckedChange={(v) => handleToggleThreshold(t.id, v)} />
                          <button
                            onClick={() => handleDeleteThreshold(t.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 dark:text-v2-muted hover:bg-critical-dim hover:text-critical transition-all duration-fast"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === "weather" && (
          <div>
            {observations.length === 0 ? (
              <div className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl p-10 text-center">
                <CloudRain className="h-10 w-10 mx-auto text-gray-300 dark:text-v2-disabled mb-3" />
                <p className="text-[13px] text-gray-400 dark:text-v2-muted">No weather data yet. Click "Ingest Weather Now" to fetch real-time data.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from(new Set(observations.map((o) => o.region_name))).map((region) => {
                  const latest = observations.find((o) => o.region_name === region)!;
                  return (
                    <div key={region} className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-brand" /><h4 className="font-medium text-[13px] text-gray-900 dark:text-v2-primary">{region}</h4></div>
                      <div className="grid grid-cols-2 gap-2 text-[12px]">
                        <div className="flex items-center gap-1.5"><Thermometer className="h-3.5 w-3.5 text-event-wildfire flex-shrink-0" /><span className="text-gray-400 dark:text-v2-muted">Temp:</span><span className="font-medium text-gray-900 dark:text-v2-primary">{latest.temperature_c?.toFixed(1) ?? "—"}°C</span></div>
                        <div className="flex items-center gap-1.5"><CloudRain className="h-3.5 w-3.5 text-event-flood flex-shrink-0" /><span className="text-gray-400 dark:text-v2-muted">Rain:</span><span className="font-medium text-gray-900 dark:text-v2-primary">{latest.rainfall_mm?.toFixed(1) ?? "—"} mm</span></div>
                        <div className="flex items-center gap-1.5"><Droplets className="h-3.5 w-3.5 text-brand flex-shrink-0" /><span className="text-gray-400 dark:text-v2-muted">Soil:</span><span className="font-medium text-gray-900 dark:text-v2-primary">{latest.soil_moisture?.toFixed(2) ?? "—"}</span></div>
                        <div className="flex items-center gap-1.5"><Wind className="h-3.5 w-3.5 text-event-search flex-shrink-0" /><span className="text-gray-400 dark:text-v2-muted">Wind:</span><span className="font-medium text-gray-900 dark:text-v2-primary">{latest.wind_speed_kmh?.toFixed(1) ?? "—"} km/h</span></div>
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-v2-muted">Updated: {new Date(latest.observation_date).toLocaleString()}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "trends" && (
          <div>
            {observations.length === 0 ? (
              <div className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl p-10 text-center">
                <TrendingUp className="h-10 w-10 mx-auto text-gray-300 dark:text-v2-disabled mb-3" />
                <p className="text-[13px] text-gray-400 dark:text-v2-muted">No data to chart. Ingest weather data first.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl p-4">
                  <TrendChart data={getTrendData("temperature_c")} title="Temperature Trend (°C)" color="hsl(25 95% 53%)" />
                </div>
                <div className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl p-4">
                  <TrendChart data={getTrendData("rainfall_mm")} title="Rainfall Trend (mm)" color="hsl(210 100% 50%)" />
                </div>
                <div className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl p-4">
                  <TrendChart data={getTrendData("soil_moisture")} title="Soil Moisture Trend" color="hsl(180 70% 45%)" />
                </div>
                <div className="bg-white dark:bg-surface-1 border border-gray-200 dark:border-border-subtle rounded-xl p-4">
                  <TrendChart data={getTrendData("wind_speed_kmh")} title="Wind Speed Trend (km/h)" color="hsl(270 70% 55%)" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
