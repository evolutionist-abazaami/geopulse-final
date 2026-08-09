import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertTriangle, Bell, BellRing, MapPin, Thermometer, Droplets,
  Wind, CloudRain, Loader2, Plus, Trash2, CheckCircle, RefreshCw,
  TrendingUp, Shield, Eye, Info, Zap, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
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
  { value: "flood", label: "Flood", icon: Droplets, color: "text-blue-500" },
  { value: "drought", label: "Drought", icon: Thermometer, color: "text-amber-500" },
  { value: "fire", label: "Wildfire", icon: AlertTriangle, color: "text-red-500" },
  { value: "storm", label: "Storm", icon: Wind, color: "text-purple-500" },
  { value: "heatwave", label: "Heatwave", icon: Thermometer, color: "text-orange-500" },
  { value: "pollution", label: "Pollution", icon: AlertTriangle, color: "text-emerald-500" },
  { value: "heavy_metal", label: "Heavy Metal Contamination", icon: AlertTriangle, color: "text-rose-500" },
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

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-green-500/10 text-green-500 border-green-500/20",
  moderate: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  critical: "bg-destructive/10 text-destructive border-destructive/20",
};

const DEFAULT_LOCATIONS = [
  { name: "Accra, Ghana", lat: 5.6037, lng: -0.1870 },
  { name: "Lagos, Nigeria", lat: 6.5244, lng: 3.3792 },
  { name: "Nairobi, Kenya", lat: -1.2921, lng: 36.8219 },
  { name: "Kumasi, Ghana", lat: 6.6885, lng: -1.6244 },
  { name: "Addis Ababa, Ethiopia", lat: 9.0192, lng: 38.7525 },
  { name: "Dar es Salaam, Tanzania", lat: -6.7924, lng: 39.2083 },
];

/**
 * Restored to match v1's EarlyWarning.tsx structure (Alerts + Thresholds +
 * Weather Data + Trends all together on this one page) - the v2 shell
 * initially split Alerts into the right panel and Thresholds into Settings,
 * but that was reverted per feedback: this page owns hazard monitoring
 * end-to-end, same as before.
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

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-surface-base">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-gray-50 dark:bg-surface-base p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold bg-gradient-ocean bg-clip-text text-transparent flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              Early Warning System
            </h1>
            <p className="text-muted-foreground mt-1">Automated environmental hazard monitoring and alerts for Africa</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleIngestWeather} disabled={isIngesting}>
              {isIngesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Ingest Weather Now
            </Button>
            <Button size="sm" onClick={handleEvaluateHazards} disabled={isEvaluating} className="bg-gradient-ocean hover:opacity-90">
              {isEvaluating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
              Check Hazards Now
            </Button>
          </div>
        </div>

        <Collapsible>
          <Card className="p-4 border-primary/20 bg-primary/5">
            <CollapsibleTrigger className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">How Early Warning detection works (and why it's useful)</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary mt-0.5 flex-shrink-0">1</div>
                <p><strong className="text-foreground">Real weather data is collected automatically.</strong> Every 30 minutes, current temperature, rainfall, soil moisture, wind speed, and humidity are fetched from the Open-Meteo API for each monitored location - no AI involved in this step, these are real measurements.</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary mt-0.5 flex-shrink-0">2</div>
                <p><strong className="text-foreground">Your thresholds are checked automatically.</strong> Every 15 minutes, each active threshold you've configured below (e.g. "temperature above 38°C in Accra") is compared against the latest real reading for that region using simple numeric comparison - not AI judgment.</p>
              </div>
              <div className="flex items-start gap-2">
                <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary mt-0.5 flex-shrink-0">3</div>
                <p><strong className="text-foreground">An alert is created when a threshold is exceeded.</strong> The AI assistant adds a short plain-language risk assessment alongside the real reading, but the alert itself is triggered by the real number crossing your real threshold - the AI narrates, it doesn't decide.</p>
              </div>
              <div className="pt-2 border-t border-border/50 flex items-start gap-2">
                <Zap className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <p><strong className="text-foreground">Why this matters:</strong> because ingestion and evaluation now run on a schedule in the background, you don't have to keep this page open or click anything to catch an emerging condition - alerts accumulate here even while you're away.</p>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10"><BellRing className="h-5 w-5 text-destructive" /></div>
              <div><p className="text-xs text-muted-foreground">Unread Alerts</p><p className="text-xl font-bold">{unreadCount}</p></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10"><AlertTriangle className="h-5 w-5 text-amber-500" /></div>
              <div><p className="text-xs text-muted-foreground">Active Alerts</p><p className="text-xl font-bold">{activeAlerts.length}</p></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><TrendingUp className="h-5 w-5 text-primary" /></div>
              <div><p className="text-xs text-muted-foreground">Thresholds</p><p className="text-xl font-bold">{thresholds.length}</p></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary/10"><CloudRain className="h-5 w-5 text-secondary" /></div>
              <div><p className="text-xs text-muted-foreground">Observations</p><p className="text-xl font-bold">{observations.length}</p></div>
            </div>
          </Card>
        </div>

        <Tabs defaultValue="alerts" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="alerts" className="relative">
              Alerts
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">{unreadCount}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="thresholds">Thresholds</TabsTrigger>
            <TabsTrigger value="weather">Weather Data</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="alerts" className="space-y-4">
            {activeAlerts.length === 0 && resolvedAlerts.length === 0 ? (
              <Card className="p-8 text-center">
                <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No alerts yet. Set up monitoring thresholds and run evaluations.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {activeAlerts.length > 0 && (
                  <>
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Active Alerts</h3>
                    {activeAlerts.map((alert) => (
                      <Card key={alert.id} className={`p-4 border-l-4 ${!alert.is_read ? "border-l-destructive bg-destructive/5" : "border-l-border"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className={SEVERITY_COLORS[alert.severity]}>{alert.severity}</Badge>
                              <Badge variant="outline" className="capitalize">{alert.hazard_type}</Badge>
                              <span className="text-xs text-muted-foreground">{new Date(alert.created_at).toLocaleString()}</span>
                            </div>
                            <h4 className="font-semibold text-sm">{alert.title}</h4>
                            {alert.description && <p className="text-xs text-muted-foreground">{alert.description}</p>}
                            {alert.ai_analysis?.assessment && (
                              <div className="mt-2 p-3 rounded-lg bg-muted/50 border border-border">
                                <p className="text-xs font-medium text-primary mb-1">AI Risk Assessment</p>
                                <p className="text-xs text-muted-foreground">{alert.ai_analysis.assessment}</p>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            {!alert.is_read && (
                              <Button variant="ghost" size="icon" onClick={() => handleMarkRead(alert.id)} title="Mark as read"><Eye className="h-4 w-4" /></Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => handleResolveAlert(alert.id)} title="Resolve"><CheckCircle className="h-4 w-4 text-secondary" /></Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </>
                )}
                {resolvedAlerts.length > 0 && (
                  <>
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mt-6">Resolved</h3>
                    {resolvedAlerts.slice(0, 10).map((alert) => (
                      <Card key={alert.id} className="p-3 opacity-60">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-secondary" />
                          <span className="text-sm">{alert.title}</span>
                          <Badge variant="outline" className="capitalize text-xs">{alert.severity}</Badge>
                          <span className="text-xs text-muted-foreground ml-auto">{new Date(alert.created_at).toLocaleDateString()}</span>
                        </div>
                      </Card>
                    ))}
                  </>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="thresholds" className="space-y-4">
            <Card className="p-4 space-y-4">
              <h3 className="font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> Add Monitoring Threshold</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                  <Button onClick={handleAddThreshold} className="w-full bg-gradient-ocean hover:opacity-90"><Plus className="h-4 w-4 mr-2" /> Add Threshold</Button>
                </div>
              </div>
            </Card>

            <div className="space-y-2">
              {thresholds.length === 0 ? (
                <Card className="p-8 text-center">
                  <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No monitoring thresholds set. Create one above to start monitoring.</p>
                </Card>
              ) : (
                thresholds.map((t) => (
                  <Card key={t.id} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <MapPin className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm font-medium">{t.region_name}</span>
                          <Badge variant="outline" className="capitalize text-xs">{t.hazard_type}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{METRICS.find((m) => m.value === t.metric)?.label} {t.operator} {t.threshold_value}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={t.is_active} onCheckedChange={(v) => handleToggleThreshold(t.id, v)} />
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteThreshold(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="weather" className="space-y-4">
            {observations.length === 0 ? (
              <Card className="p-8 text-center">
                <CloudRain className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No weather data yet. Click "Ingest Weather" to fetch real-time data.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from(new Set(observations.map((o) => o.region_name))).map((region) => {
                  const latest = observations.find((o) => o.region_name === region)!;
                  return (
                    <Card key={region} className="p-4 space-y-3">
                      <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /><h4 className="font-semibold text-sm">{region}</h4></div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1.5"><Thermometer className="h-3 w-3 text-orange-500" /><span className="text-muted-foreground">Temp:</span><span className="font-medium">{latest.temperature_c?.toFixed(1) ?? "—"}°C</span></div>
                        <div className="flex items-center gap-1.5"><CloudRain className="h-3 w-3 text-blue-500" /><span className="text-muted-foreground">Rain:</span><span className="font-medium">{latest.rainfall_mm?.toFixed(1) ?? "—"} mm</span></div>
                        <div className="flex items-center gap-1.5"><Droplets className="h-3 w-3 text-cyan-500" /><span className="text-muted-foreground">Soil:</span><span className="font-medium">{latest.soil_moisture?.toFixed(2) ?? "—"}</span></div>
                        <div className="flex items-center gap-1.5"><Wind className="h-3 w-3 text-purple-500" /><span className="text-muted-foreground">Wind:</span><span className="font-medium">{latest.wind_speed_kmh?.toFixed(1) ?? "—"} km/h</span></div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Updated: {new Date(latest.observation_date).toLocaleString()}</p>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="trends" className="space-y-4">
            {observations.length === 0 ? (
              <Card className="p-8 text-center">
                <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No data to chart. Ingest weather data first.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TrendChart data={getTrendData("temperature_c")} title="Temperature Trend (°C)" color="hsl(25 95% 53%)" />
                <TrendChart data={getTrendData("rainfall_mm")} title="Rainfall Trend (mm)" color="hsl(210 100% 50%)" />
                <TrendChart data={getTrendData("soil_moisture")} title="Soil Moisture Trend" color="hsl(180 70% 45%)" />
                <TrendChart data={getTrendData("wind_speed_kmh")} title="Wind Speed Trend (km/h)" color="hsl(270 70% 55%)" />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
