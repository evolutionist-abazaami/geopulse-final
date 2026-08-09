import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Calendar, TrendingUp, TrendingDown, Minus, ArrowLeft, Download, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ComparisonChart } from "@/components/charts/ComparisonChart";
import jsPDF from "jspdf";

const SharedReport = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const [report, setReport] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      if (!shareId) {
        setError("Invalid share link");
        setIsLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .rpc("get_shared_report", { p_share_id: shareId })
          .single();

        if (fetchError || !data) {
          setError("Report not found or has expired");
          setIsLoading(false);
          return;
        }

        // Increment view count using secure RPC function
        await supabase.rpc("increment_shared_report_view", { p_share_id: shareId });

        setReport(data);
      } catch (err) {
        console.error("Error fetching report:", err);
        setError("Failed to load report");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReport();
  }, [shareId]);

  const getEventTypeInfo = (type: string) => {
    const types: Record<string, { label: string; icon: string }> = {
      deforestation: { label: "Deforestation", icon: "🌳" },
      vegetation_loss: { label: "Vegetation Loss", icon: "🍃" },
      flood: { label: "Flood", icon: "🌊" },
      drought: { label: "Drought", icon: "🏜️" },
      urbanization: { label: "Urbanization", icon: "🏙️" },
      wildfire: { label: "Wildfire", icon: "🔥" },
    };
    return types[type?.toLowerCase()] || { label: type || "Analysis", icon: "📊" };
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "increasing":
        return <TrendingUp className="h-5 w-5 text-destructive" />;
      case "decreasing":
        return <TrendingDown className="h-5 w-5 text-green-500" />;
      default:
        return <Minus className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getRiskBadge = (percent: number) => {
    const absChange = Math.abs(percent);
    if (absChange >= 25) return <Badge variant="destructive">Critical Risk</Badge>;
    if (absChange >= 15) return <Badge className="bg-orange-500">High Risk</Badge>;
    if (absChange >= 8) return <Badge className="bg-yellow-500 text-black">Moderate Risk</Badge>;
    if (absChange >= 3) return <Badge className="bg-green-500">Low Risk</Badge>;
    return <Badge variant="secondary">Minimal Risk</Badge>;
  };

  const downloadPDF = () => {
    if (!report) return;

    const data = report.report_data;
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    let yPos = margin;

    // Header
    pdf.setFillColor(8, 145, 178);
    pdf.rect(0, 0, pageWidth, 40, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(24);
    pdf.setFont("helvetica", "bold");
    pdf.text("GEOPULSE", margin, 25);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text("Shared Comparison Report", margin, 33);

    yPos = 55;

    // Title
    pdf.setTextColor(17, 24, 39);
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text(report.title, margin, yPos);
    yPos += 15;

    // Location & Event
    pdf.setFontSize(11);
    pdf.setTextColor(75, 85, 99);
    pdf.text(`Location: ${report.location_name}`, margin, yPos);
    yPos += 8;
    pdf.text(`Event Type: ${getEventTypeInfo(report.event_type).label}`, margin, yPos);
    yPos += 15;

    // Period 1
    pdf.setFontSize(12);
    pdf.setTextColor(17, 24, 39);
    pdf.setFont("helvetica", "bold");
    pdf.text("Period 1 (Before)", margin, yPos);
    yPos += 8;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(75, 85, 99);
    pdf.text(`Date Range: ${data.period1?.range}`, margin, yPos);
    yPos += 6;
    pdf.text(`Change Detected: ${data.period1?.changePercent?.toFixed(1)}%`, margin, yPos);
    yPos += 15;

    // Period 2
    pdf.setFontSize(12);
    pdf.setTextColor(17, 24, 39);
    pdf.setFont("helvetica", "bold");
    pdf.text("Period 2 (After)", margin, yPos);
    yPos += 8;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(75, 85, 99);
    pdf.text(`Date Range: ${data.period2?.range}`, margin, yPos);
    yPos += 6;
    pdf.text(`Change Detected: ${data.period2?.changePercent?.toFixed(1)}%`, margin, yPos);
    yPos += 15;

    // Comparison
    pdf.setFontSize(12);
    pdf.setTextColor(17, 24, 39);
    pdf.setFont("helvetica", "bold");
    pdf.text("Trend Analysis", margin, yPos);
    yPos += 8;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(75, 85, 99);
    pdf.text(`Trend: ${data.comparison?.trend?.toUpperCase()}`, margin, yPos);
    yPos += 6;
    pdf.text(`Difference: ${data.comparison?.difference}%`, margin, yPos);
    yPos += 10;

    const insight = pdf.splitTextToSize(data.comparison?.insight || "", pageWidth - margin * 2);
    pdf.text(insight, margin, yPos);

    pdf.save(`GeoPulse_Shared_Report_${shareId}.pdf`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading shared report...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Report Not Found</h1>
          <p className="text-muted-foreground mb-6">
            {error || "This report may have expired or been removed."}
          </p>
          <Link to="/">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go to Homepage
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const data = report.report_data;
  const eventInfo = getEventTypeInfo(report.event_type);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-6">
        <div className="container max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary-foreground/80 text-sm mb-1">GeoPulse Shared Report</p>
              <h1 className="text-2xl font-bold">{report.title}</h1>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={downloadPDF}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-4xl mx-auto px-4 py-8">
        {/* Meta Info */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>{report.location_name}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-lg">{eventInfo.icon}</span>
            <span>{eventInfo.label}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Shared {new Date(report.created_at).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Info className="h-4 w-4" />
            <span>{report.view_count} views</span>
          </div>
        </div>

        {/* Trend Status */}
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {getTrendIcon(data.comparison?.trend)}
              <div>
                <h2 className="text-xl font-bold capitalize">{data.comparison?.trend} Trend</h2>
                <p className="text-muted-foreground">{data.comparison?.difference}% change between periods</p>
              </div>
            </div>
            {getRiskBadge(Math.max(data.period1?.changePercent || 0, data.period2?.changePercent || 0))}
          </div>
          <p className="text-muted-foreground">{data.comparison?.insight}</p>
        </Card>

        {/* Period Comparison */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <Card className="p-6 border-l-4 border-l-primary">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="font-semibold text-primary">Period 1 (Before)</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{data.period1?.range}</p>
            <p className="text-4xl font-bold mb-2">{data.period1?.changePercent?.toFixed(1)}%</p>
            <p className="text-sm text-muted-foreground">Change detected</p>
            <div className="mt-3">
              {getRiskBadge(data.period1?.changePercent || 0)}
            </div>
          </Card>

          <Card className="p-6 border-l-4 border-l-secondary">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-secondary" />
              <span className="font-semibold text-secondary">Period 2 (After)</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{data.period2?.range}</p>
            <p className="text-4xl font-bold mb-2">{data.period2?.changePercent?.toFixed(1)}%</p>
            <p className="text-sm text-muted-foreground">Change detected</p>
            <div className="mt-3">
              {getRiskBadge(data.period2?.changePercent || 0)}
            </div>
          </Card>
        </div>

        {/* Chart */}
        {data.chartData && (
          <Card className="p-6 mb-6">
            <h3 className="font-bold mb-4">Period Comparison Chart</h3>
            <ComparisonChart data={data.chartData} title="" />
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground pt-6 border-t">
          <p>
            Powered by <span className="font-semibold text-primary">GeoPulse</span> Environmental Intelligence Platform
          </p>
          <Link to="/" className="text-primary hover:underline mt-2 inline-block">
            Learn more about GeoPulse →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SharedReport;
