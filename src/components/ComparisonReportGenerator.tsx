import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, FileText, Loader2, Share2, Copy, Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";

export interface ComparisonResult {
  location: string;
  eventType: string;
  period1: {
    range: string;
    changePercent: number;
    area: string;
    sensor: string;
  };
  period2: {
    range: string;
    changePercent: number;
    area: string;
    sensor: string;
  };
  comparison: {
    trend: "higher" | "lower" | "similar";
    difference: string;
    insight: string;
  };
  chartData: { name: string; before: number; after: number }[];
}

interface ComparisonReportGeneratorProps {
  comparisonResult: ComparisonResult;
}

const formatRequestedCategory = (eventType: string): string =>
  eventType
    ? eventType.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Unavailable";

const ComparisonReportGenerator = ({ comparisonResult }: ComparisonReportGeneratorProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const generateComparisonPDF = async () => {
    if (!comparisonResult) {
      toast.error("No comparison data available");
      return;
    }

    setIsGenerating(true);
    toast.info("Generating comparison report...");

    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      let yPos = margin;
      const contentWidth = pageWidth - margin * 2;

      const reportDate = new Date();
      const reportId = `GP-CMP-${reportDate.getFullYear()}${String(reportDate.getMonth() + 1).padStart(2, '0')}${String(reportDate.getDate()).padStart(2, '0')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const periodDifference = comparisonResult.period2.changePercent - comparisonResult.period1.changePercent;
      if (!Number.isFinite(comparisonResult.period1.changePercent) || !Number.isFinite(comparisonResult.period2.changePercent)) {
        toast.error("The comparison report requires finite measured NDVI values for both periods.");
        return;
      }
      const difference = Math.abs(periodDifference).toFixed(1);
      const trendLabel = periodDifference > 0 ? "higher" : periodDifference < 0 ? "lower" : "equal";
      const requestedCategory = formatRequestedCategory(comparisonResult.eventType);
      const comparisonPhrase = trendLabel === "equal"
        ? "equal to period 1"
        : `${trendLabel} than period 1`;

      // Helper functions
      const addWrappedText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number = 4.5): number => {
        const lines = pdf.splitTextToSize(text, maxWidth);
        const maxLines = Math.floor((pageHeight - y - 30) / lineHeight);
        const displayLines = lines.slice(0, Math.min(lines.length, maxLines));
        pdf.text(displayLines, x, y);
        return y + (displayLines.length * lineHeight);
      };

      const addSectionTitle = (title: string, y: number): number => {
        pdf.setFillColor(8, 145, 178);
        pdf.rect(margin, y, 3, 7, "F");
        pdf.setTextColor(17, 24, 39);
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.text(title, margin + 6, y + 5);
        return y + 12;
      };

      const checkPageBreak = (requiredSpace: number): void => {
        if (yPos > pageHeight - requiredSpace) {
          pdf.addPage();
          yPos = margin;
          pdf.setFontSize(7);
          pdf.setTextColor(156, 163, 175);
          pdf.text(`GeoPulse Comparison Report ${reportId}`, margin, 10);
          pdf.text(`Page ${pdf.getNumberOfPages()}`, pageWidth - margin - 12, 10);
          yPos = 18;
        }
      };

      // ============= COVER PAGE =============
      // Header gradient
      pdf.setFillColor(8, 145, 178);
      pdf.rect(0, 0, pageWidth, 85, "F");
      
      // Accent stripe
      pdf.setFillColor(6, 182, 212);
      pdf.rect(0, 80, pageWidth, 5, "F");

      // Branding
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(26);
      pdf.setFont("helvetica", "bold");
      pdf.text("GEOPULSE", margin, 32);
      
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.text("Satellite Measurement Report", margin, 42);

      // Report type badge
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(margin, 50, 50, 7, 2, 2, "F");
      pdf.setTextColor(8, 145, 178);
      pdf.setFontSize(7);
      pdf.setFont("helvetica", "bold");
      pdf.text("COMPARATIVE ANALYSIS", margin + 3, 55);

      // Report ID
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Report ID: ${reportId}`, pageWidth - margin - 45, 68);

      yPos = 95;

      // Main Title
      pdf.setTextColor(17, 24, 39);
      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.text("Before & After NDVI Change Comparison", margin, yPos);
      yPos += 8;

      pdf.setFontSize(11);
      pdf.setTextColor(107, 114, 128);
      pdf.setFont("helvetica", "normal");
      const eventLabel = pdf.splitTextToSize(`Requested category: ${requestedCategory}`, contentWidth)[0];
      pdf.text(eventLabel, margin, yPos);
      yPos += 15;

      // Location & Date Box
      pdf.setFillColor(249, 250, 251);
      pdf.roundedRect(margin, yPos, contentWidth, 22, 3, 3, "F");
      
      pdf.setTextColor(75, 85, 99);
      pdf.setFontSize(7);
      pdf.text("LOCATION", margin + 6, yPos + 8);
      pdf.setTextColor(17, 24, 39);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      const locationText = pdf.splitTextToSize(comparisonResult.location, contentWidth / 2 - 10)[0];
      pdf.text(locationText, margin + 6, yPos + 16);

      pdf.setTextColor(75, 85, 99);
      pdf.setFontSize(7);
      pdf.setFont("helvetica", "normal");
      pdf.text("REPORT DATE", pageWidth - margin - 45, yPos + 8);
      pdf.setTextColor(17, 24, 39);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "bold");
      pdf.text(reportDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), pageWidth - margin - 45, yPos + 16);

      yPos += 28;

      // The banner reports direction only; NDVI change is not an event-risk rating.
      pdf.setFillColor(8, 145, 178);
      pdf.roundedRect(margin, yPos, contentWidth, 18, 3, 3, "F");
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.text("MEASURED NDVI CHANGE", margin + 6, yPos + 7);
      
      pdf.setFontSize(12);
      pdf.text(`PERIOD 2 ${trendLabel.toUpperCase()}`, margin + 52, yPos + 7);
      
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${difference} percentage-point difference`, margin + 6, yPos + 14);

      yPos += 25;

      // ============= PERIOD COMPARISON BOXES =============
      const boxWidth = (contentWidth - 6) / 2;
      const boxHeight = 48;

      // Period 1 Box (Before)
      pdf.setFillColor(243, 244, 246);
      pdf.roundedRect(margin, yPos, boxWidth, boxHeight, 3, 3, "F");
      
      pdf.setFillColor(8, 145, 178);
      pdf.roundedRect(margin, yPos, boxWidth, 10, 3, 3, "F");
      pdf.rect(margin, yPos + 5, boxWidth, 5, "F");
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.text("PERIOD 1 • BEFORE", margin + 4, yPos + 7);

      pdf.setTextColor(17, 24, 39);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      const period1Range = pdf.splitTextToSize(comparisonResult.period1.range, boxWidth - 8)[0];
      pdf.text(period1Range, margin + 4, yPos + 18);

      pdf.setFontSize(22);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${comparisonResult.period1.changePercent.toFixed(1)}%`, margin + 4, yPos + 34);

      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Sensor: ${comparisonResult.period1.sensor}`, margin + 4, yPos + 43);

      // Period 2 Box (After)
      pdf.setFillColor(243, 244, 246);
      pdf.roundedRect(margin + boxWidth + 6, yPos, boxWidth, boxHeight, 3, 3, "F");
      
      pdf.setFillColor(8, 145, 178);
      pdf.roundedRect(margin + boxWidth + 6, yPos, boxWidth, 10, 3, 3, "F");
      pdf.rect(margin + boxWidth + 6, yPos + 5, boxWidth, 5, "F");
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.text("PERIOD 2 • AFTER", margin + boxWidth + 10, yPos + 7);

      pdf.setTextColor(17, 24, 39);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      const period2Range = pdf.splitTextToSize(comparisonResult.period2.range, boxWidth - 8)[0];
      pdf.text(period2Range, margin + boxWidth + 10, yPos + 18);

      pdf.setFontSize(22);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${comparisonResult.period2.changePercent.toFixed(1)}%`, margin + boxWidth + 10, yPos + 34);

      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Sensor: ${comparisonResult.period2.sensor}`, margin + boxWidth + 10, yPos + 43);

      yPos += boxHeight + 10;

      // ============= PAGE 2 - DETAILED ANALYSIS =============
      pdf.addPage();
      yPos = margin;
      
      pdf.setFontSize(7);
      pdf.setTextColor(156, 163, 175);
      pdf.text(`GeoPulse Comparison Report ${reportId}`, margin, 10);
      pdf.text(`Page ${pdf.getNumberOfPages()}`, pageWidth - margin - 12, 10);
      yPos = 20;

      // Executive Summary
      yPos = addSectionTitle("EXECUTIVE SUMMARY", yPos);
      
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(55, 65, 81);
      
      const executiveSummary =
        `This report compares measured NDVI change at ${comparisonResult.location}. ` +
        `Period 1 (${comparisonResult.period1.range}): ${comparisonResult.period1.changePercent.toFixed(1)}%. ` +
        `Period 2 (${comparisonResult.period2.range}): ${comparisonResult.period2.changePercent.toFixed(1)}%. ` +
        `The period 2 value is ${comparisonPhrase}, with an absolute difference of ${difference} percentage points. ` +
        `The requested category (${requestedCategory}) is not validated by these measurements.`;
      
      yPos = addWrappedText(executiveSummary, margin, yPos, contentWidth, 4.5);
      yPos += 12;

      // Comparative Insight
      yPos = addSectionTitle("MEASURED COMPARISON", yPos);
      
      pdf.setFillColor(249, 250, 251);
      pdf.roundedRect(margin, yPos - 2, contentWidth, 22, 3, 3, "F");
      
      pdf.setTextColor(55, 65, 81);
      pdf.setFontSize(9);
      yPos = addWrappedText(
        `Period 2 is ${comparisonPhrase}; the absolute difference is ${difference} percentage points.`,
        margin + 4,
        yPos + 4,
        contentWidth - 8,
        4.5
      );
      yPos += 12;

      // Detailed Period Analysis
      yPos = addSectionTitle("PERIOD 1 ANALYSIS (BEFORE)", yPos);
      
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(55, 65, 81);
      
      const period1Summary =
        `Measured NDVI change: ${comparisonResult.period1.changePercent.toFixed(1)}%. ` +
        `Sensor: ${comparisonResult.period1.sensor}.`;
      
      yPos = addWrappedText(period1Summary, margin, yPos, contentWidth, 4.5);
      yPos += 10;

      checkPageBreak(40);
      yPos = addSectionTitle("PERIOD 2 ANALYSIS (AFTER)", yPos);
      
      const period2Summary =
        `Measured NDVI change: ${comparisonResult.period2.changePercent.toFixed(1)}%. ` +
        `Sensor: ${comparisonResult.period2.sensor}.`;
      
      yPos = addWrappedText(period2Summary, margin, yPos, contentWidth, 4.5);
      yPos += 12;

      // Key Findings
      checkPageBreak(50);
      yPos = addSectionTitle("KEY FINDINGS", yPos);

      const findings = [
        { type: "PERIOD 1", detail: `${comparisonResult.period1.changePercent.toFixed(1)}% measured NDVI change (${comparisonResult.period1.range}); sensor: ${comparisonResult.period1.sensor}.` },
        { type: "PERIOD 2", detail: `${comparisonResult.period2.changePercent.toFixed(1)}% measured NDVI change (${comparisonResult.period2.range}); sensor: ${comparisonResult.period2.sensor}.` },
        { type: "DIFFERENCE", detail: `${difference} percentage points; period 2 is ${comparisonPhrase}.` },
      ];

      findings.forEach((finding, index) => {
        checkPageBreak(18);
        
        pdf.setFillColor(249, 250, 251);
        pdf.roundedRect(margin, yPos - 3, contentWidth, 16, 2, 2, "F");
        
        pdf.setFillColor(8, 145, 178);
        pdf.circle(margin + 5, yPos + 3, 2.5, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "bold");
        pdf.text(String(index + 1), margin + 3.8, yPos + 4.5);
        
        pdf.setTextColor(17, 24, 39);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        pdf.text(finding.type, margin + 12, yPos + 2);
        
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(55, 65, 81);
        pdf.setFontSize(8);
        const wrappedFinding = pdf.splitTextToSize(finding.detail, contentWidth - 16);
        pdf.text(wrappedFinding[0] || '', margin + 12, yPos + 9);
        
        yPos += 18;
      });

      // ============= PAGE 3 - LIMITATIONS =============
      pdf.addPage();
      yPos = margin;
      
      pdf.setFontSize(7);
      pdf.setTextColor(156, 163, 175);
      pdf.text(`GeoPulse Comparison Report ${reportId}`, margin, 10);
      pdf.text(`Page ${pdf.getNumberOfPages()}`, pageWidth - margin - 12, 10);
      yPos = 20;

      yPos = addSectionTitle("INTERPRETATION LIMITS", yPos);
      const limitations = [
        "NDVI change is a vegetation-index metric and is not, by itself, proof of deforestation or another selected event.",
        "A higher or lower percentage is a numerical comparison, not a severity, risk, or recovery classification.",
        "Values from different sensors may not be directly comparable. The sensor used for each period is listed below.",
        "Satellite measurements are area aggregates; they do not identify exact affected pixels or establish cause.",
      ];
      limitations.forEach((limitation) => {
        checkPageBreak(18);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(55, 65, 81);
        yPos = addWrappedText(`• ${limitation}`, margin, yPos, contentWidth, 4.5);
        yPos += 5;
      });
      yPos += 5;

      // Data Sources
      checkPageBreak(45);
      yPos = addSectionTitle("DATA SOURCES & METHODOLOGY", yPos);
      
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(75, 85, 99);
      
      const methodology =
        "The comparison subtracts the period 1 NDVI change percentage from the period 2 value. " +
        "The difference is expressed in percentage points. No event attribution, thermal analysis, risk rating, or confidence score is inferred by this report.";
      
      yPos = addWrappedText(methodology, margin, yPos, contentWidth, 4);
      yPos += 8;

      const sources = [
        `• Period 1 sensor: ${comparisonResult.period1.sensor}`,
        `• Period 2 sensor: ${comparisonResult.period2.sensor}`,
        "• Analysis metric: satellite-derived NDVI change",
      ];

      sources.forEach(source => {
        pdf.text(source, margin, yPos);
        yPos += 4;
      });

      yPos += 10;

      // Footer
      pdf.setFillColor(8, 145, 178);
      pdf.rect(0, pageHeight - 16, pageWidth, 16, "F");
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(7);
      pdf.setFont("helvetica", "normal");
      pdf.text("GeoPulse — satellite measurement comparison", margin, pageHeight - 9);
      pdf.text(`Generated: ${reportDate.toISOString().split('T')[0]}`, margin, pageHeight - 5);
      
      pdf.setFont("helvetica", "bold");
      pdf.text("GeoPulse", pageWidth - margin - 16, pageHeight - 7);

      // Save PDF
      const filename = `GeoPulse_Comparison_${comparisonResult.location.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20)}_${reportDate.toISOString().split("T")[0]}.pdf`;
      pdf.save(filename);

      toast.success("Comparison report downloaded successfully!");
    } catch (error) {
      console.error("Report generation error:", error);
      toast.error("Failed to generate report. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateShareLink = async () => {
    setIsSharing(true);
    setShareUrl(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        toast.error("Please sign in to share reports");
        setIsSharing(false);
        return;
      }

      const title = `NDVI measurement comparison - ${comparisonResult.location}`;

      const { data, error } = await supabase
        .from("shared_reports")
        .insert({
          report_type: "comparison",
          title,
          location_name: comparisonResult.location,
          event_type: comparisonResult.eventType,
          report_data: {
            location: comparisonResult.location,
            eventType: comparisonResult.eventType,
            period1: { ...comparisonResult.period1 },
            period2: { ...comparisonResult.period2 },
            comparison: { ...comparisonResult.comparison },
            chartData: comparisonResult.chartData.map((item) => ({ ...item })),
          },
          created_by: session.user.id,
        })
        .select("share_id")
        .single();

      if (error) {
        console.error("Share error:", error);
        toast.error("Failed to create share link");
        return;
      }

      const baseUrl = window.location.origin;
      const url = `${baseUrl}/shared/${data.share_id}`;
      setShareUrl(url);
      toast.success("Share link created!");
    } catch (error) {
      console.error("Share error:", error);
      toast.error("Failed to create share link");
    } finally {
      setIsSharing(false);
    }
  };

  const copyToClipboard = async () => {
    if (!shareUrl) return;
    
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  return (
    <div className="space-y-3 mt-4">
      <Button
        onClick={generateComparisonPDF}
        disabled={isGenerating}
        variant="outline"
        className="w-full"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generating Report...
          </>
        ) : (
          <>
            <FileText className="h-4 w-4 mr-2" />
            Download Comparison Report (PDF)
          </>
        )}
      </Button>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" className="w-full">
            <Share2 className="h-4 w-4 mr-2" />
            Share Report
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              Share Comparison Report
            </DialogTitle>
            <DialogDescription>
              Generate a public link to share these measured NDVI values.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!shareUrl ? (
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Create a shareable link for:
                </p>
                <div className="bg-muted rounded-lg p-4 mb-4">
                  <p className="font-semibold">{comparisonResult.location}</p>
                  <p className="text-sm text-muted-foreground">
                    Requested category: {formatRequestedCategory(comparisonResult.eventType)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {comparisonResult.period1.range} vs {comparisonResult.period2.range}
                  </p>
                </div>
                <Button onClick={generateShareLink} disabled={isSharing} className="w-full">
                  {isSharing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating Link...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" />
                      Generate Share Link
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={shareUrl}
                    className="font-mono text-sm"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={copyToClipboard}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Anyone with this link can view the report
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setShareUrl(null);
                    setShareDialogOpen(false);
                  }}
                >
                  Done
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ComparisonReportGenerator;
