import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, FileText, Loader2, Share2, Copy, Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";

interface ComparisonReportGeneratorProps {
  comparisonResult: {
    location: string;
    eventType: string;
    period1: {
      range: string;
      changePercent: number;
      area: string;
      summary: string;
    };
    period2: {
      range: string;
      changePercent: number;
      area: string;
      summary: string;
    };
    comparison: {
      trend: string;
      difference: string;
      insight: string;
    };
    chartData?: any[];
  };
}

const ComparisonReportGenerator = ({ comparisonResult }: ComparisonReportGeneratorProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const getEventTypeInfo = (type: string) => {
    const types: Record<string, { label: string; icon: string; category: string }> = {
      deforestation: { label: "Deforestation Analysis", icon: "🌳", category: "Land Cover Change" },
      vegetation_loss: { label: "Vegetation Loss Analysis", icon: "🍃", category: "Land Cover Change" },
      flood: { label: "Flood Impact Assessment", icon: "🌊", category: "Natural Disaster" },
      drought: { label: "Drought Conditions Analysis", icon: "🏜️", category: "Climate Impact" },
      urbanization: { label: "Urban Expansion Analysis", icon: "🏙️", category: "Land Use Change" },
      wildfire: { label: "Wildfire Damage Assessment", icon: "🔥", category: "Natural Disaster" },
    };
    return types[type?.toLowerCase()] || { label: type || "Environmental Analysis", icon: "📊", category: "Comparative Assessment" };
  };

  const getRiskLevel = (changePercent: number): { level: string; color: [number, number, number]; bgColor: [number, number, number]; description: string } => {
    const absChange = Math.abs(changePercent);
    if (absChange >= 25) return { level: "CRITICAL", color: [220, 38, 38], bgColor: [254, 226, 226], description: "Immediate intervention required" };
    if (absChange >= 15) return { level: "HIGH", color: [234, 88, 12], bgColor: [255, 237, 213], description: "Urgent attention recommended" };
    if (absChange >= 8) return { level: "MODERATE", color: [202, 138, 4], bgColor: [254, 249, 195], description: "Monitoring and assessment needed" };
    if (absChange >= 3) return { level: "LOW", color: [22, 163, 74], bgColor: [220, 252, 231], description: "Within acceptable parameters" };
    return { level: "MINIMAL", color: [59, 130, 246], bgColor: [219, 234, 254], description: "No significant concern" };
  };

  const getTrendAnalysis = (trend: string, difference: string, p1: number, p2: number): { status: string; color: [number, number, number]; interpretation: string } => {
    if (trend === "increasing") {
      return {
        status: "ESCALATING",
        color: [220, 38, 38],
        interpretation: `Environmental impact has increased by ${difference}% between the two periods, indicating deteriorating conditions that require attention.`
      };
    } else if (trend === "decreasing") {
      return {
        status: "IMPROVING",
        color: [22, 163, 74],
        interpretation: `Environmental impact has decreased by ${difference}% between the two periods, suggesting recovery or successful intervention measures.`
      };
    }
    return {
      status: "STABLE",
      color: [59, 130, 246],
      interpretation: `Environmental conditions have remained relatively stable between the two periods with minimal change detected.`
    };
  };

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
      const eventInfo = getEventTypeInfo(comparisonResult.eventType);
      const period1Risk = getRiskLevel(comparisonResult.period1.changePercent);
      const period2Risk = getRiskLevel(comparisonResult.period2.changePercent);
      const trendAnalysis = getTrendAnalysis(
        comparisonResult.comparison.trend,
        comparisonResult.comparison.difference,
        comparisonResult.period1.changePercent,
        comparisonResult.period2.changePercent
      );

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
      pdf.text("Environmental Intelligence Platform", margin, 42);

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
      pdf.text("Before & After Environmental Analysis", margin, yPos);
      yPos += 8;

      pdf.setFontSize(11);
      pdf.setTextColor(107, 114, 128);
      pdf.setFont("helvetica", "normal");
      const eventLabel = pdf.splitTextToSize(`${eventInfo.label} • ${eventInfo.category}`, contentWidth)[0];
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

      // Trend Status Banner
      pdf.setFillColor(trendAnalysis.color[0], trendAnalysis.color[1], trendAnalysis.color[2]);
      pdf.roundedRect(margin, yPos, contentWidth, 18, 3, 3, "F");
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.text("TREND STATUS", margin + 6, yPos + 7);
      
      pdf.setFontSize(12);
      pdf.text(trendAnalysis.status, margin + 45, yPos + 7);
      
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${comparisonResult.comparison.difference}% change between periods`, margin + 6, yPos + 14);

      yPos += 25;

      // ============= PERIOD COMPARISON BOXES =============
      const boxWidth = (contentWidth - 6) / 2;
      const boxHeight = 48;

      // Period 1 Box (Before)
      pdf.setFillColor(period1Risk.bgColor[0], period1Risk.bgColor[1], period1Risk.bgColor[2]);
      pdf.roundedRect(margin, yPos, boxWidth, boxHeight, 3, 3, "F");
      
      pdf.setFillColor(period1Risk.color[0], period1Risk.color[1], period1Risk.color[2]);
      pdf.roundedRect(margin, yPos, boxWidth, 10, 3, 3, "F");
      pdf.rect(margin, yPos + 5, boxWidth, 5, "F");
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.text("PERIOD 1 • BEFORE", margin + 4, yPos + 7);

      pdf.setTextColor(period1Risk.color[0], period1Risk.color[1], period1Risk.color[2]);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      const period1Range = pdf.splitTextToSize(comparisonResult.period1.range, boxWidth - 8)[0];
      pdf.text(period1Range, margin + 4, yPos + 18);

      pdf.setFontSize(22);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${comparisonResult.period1.changePercent.toFixed(1)}%`, margin + 4, yPos + 34);

      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Risk: ${period1Risk.level}`, margin + 4, yPos + 43);

      // Period 2 Box (After)
      pdf.setFillColor(period2Risk.bgColor[0], period2Risk.bgColor[1], period2Risk.bgColor[2]);
      pdf.roundedRect(margin + boxWidth + 6, yPos, boxWidth, boxHeight, 3, 3, "F");
      
      pdf.setFillColor(period2Risk.color[0], period2Risk.color[1], period2Risk.color[2]);
      pdf.roundedRect(margin + boxWidth + 6, yPos, boxWidth, 10, 3, 3, "F");
      pdf.rect(margin + boxWidth + 6, yPos + 5, boxWidth, 5, "F");
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.text("PERIOD 2 • AFTER", margin + boxWidth + 10, yPos + 7);

      pdf.setTextColor(period2Risk.color[0], period2Risk.color[1], period2Risk.color[2]);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      const period2Range = pdf.splitTextToSize(comparisonResult.period2.range, boxWidth - 8)[0];
      pdf.text(period2Range, margin + boxWidth + 10, yPos + 18);

      pdf.setFontSize(22);
      pdf.setFont("helvetica", "bold");
      pdf.text(`${comparisonResult.period2.changePercent.toFixed(1)}%`, margin + boxWidth + 10, yPos + 34);

      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.text(`Risk: ${period2Risk.level}`, margin + boxWidth + 10, yPos + 43);

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
        `This comparative analysis examines ${eventInfo.label.toLowerCase()} at ${comparisonResult.location}. ` +
        `Period 1 (${comparisonResult.period1.range}) measured ${comparisonResult.period1.changePercent.toFixed(1)}%. ` +
        `Period 2 (${comparisonResult.period2.range}) changed to ${comparisonResult.period2.changePercent.toFixed(1)}%, a ${comparisonResult.comparison.difference}% ${comparisonResult.comparison.trend === "increasing" ? "increase" : comparisonResult.comparison.trend === "decreasing" ? "decrease" : "variation"}. ` +
        `Overall trend: ${trendAnalysis.status}.`;
      
      yPos = addWrappedText(executiveSummary, margin, yPos, contentWidth, 4.5);
      yPos += 12;

      // Comparative Insight
      yPos = addSectionTitle("TREND INTERPRETATION", yPos);
      
      pdf.setFillColor(249, 250, 251);
      pdf.roundedRect(margin, yPos - 2, contentWidth, 22, 3, 3, "F");
      
      pdf.setTextColor(55, 65, 81);
      pdf.setFontSize(9);
      yPos = addWrappedText(trendAnalysis.interpretation, margin + 4, yPos + 4, contentWidth - 8, 4.5);
      yPos += 8;

      pdf.setTextColor(107, 114, 128);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "italic");
      const insightText = pdf.splitTextToSize(comparisonResult.comparison.insight, contentWidth - 8);
      pdf.text(insightText.slice(0, 2), margin + 4, yPos);
      yPos += (Math.min(insightText.length, 2) * 4) + 10;

      // Detailed Period Analysis
      yPos = addSectionTitle("PERIOD 1 ANALYSIS (BEFORE)", yPos);
      
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(55, 65, 81);
      
      const period1Summary = comparisonResult.period1.summary || 
        `During ${comparisonResult.period1.range}, satellite analysis detected ${comparisonResult.period1.changePercent.toFixed(1)}% change. ` +
        `Area: ${comparisonResult.period1.area || "designated region"}. Baseline for comparison.`;
      
      yPos = addWrappedText(period1Summary, margin, yPos, contentWidth, 4.5);
      yPos += 10;

      checkPageBreak(40);
      yPos = addSectionTitle("PERIOD 2 ANALYSIS (AFTER)", yPos);
      
      const period2Summary = comparisonResult.period2.summary || 
        `During ${comparisonResult.period2.range}, satellite analysis detected ${comparisonResult.period2.changePercent.toFixed(1)}% change. ` +
        `Area: ${comparisonResult.period2.area || "designated region"}. Trend: ${comparisonResult.comparison.trend}.`;
      
      yPos = addWrappedText(period2Summary, margin, yPos, contentWidth, 4.5);
      yPos += 12;

      // Key Findings
      checkPageBreak(50);
      yPos = addSectionTitle("KEY FINDINGS", yPos);

      const findings = [
        {
          type: "CHANGE",
          detail: `Absolute change: ${comparisonResult.comparison.difference}% (${parseFloat(comparisonResult.comparison.difference) > 10 ? "significant" : "moderate"} variation).`
        },
        {
          type: "TREND",
          detail: `Impact is ${comparisonResult.comparison.trend}. Period 2 shows ${comparisonResult.comparison.trend === "increasing" ? "higher" : comparisonResult.comparison.trend === "decreasing" ? "lower" : "similar"} levels.`
        },
        {
          type: "RISK",
          detail: `Period 1: ${period1Risk.level}. Period 2: ${period2Risk.level}.`
        },
        {
          type: "ACTION",
          detail: comparisonResult.comparison.trend === "decreasing" 
            ? "Positive trend - continue current measures."
            : comparisonResult.comparison.trend === "increasing"
            ? "Escalating - intervention needed."
            : "Stable - maintain current approach."
        }
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

      // ============= PAGE 3 - RECOMMENDATIONS =============
      pdf.addPage();
      yPos = margin;
      
      pdf.setFontSize(7);
      pdf.setTextColor(156, 163, 175);
      pdf.text(`GeoPulse Comparison Report ${reportId}`, margin, 10);
      pdf.text(`Page ${pdf.getNumberOfPages()}`, pageWidth - margin - 12, 10);
      yPos = 20;

      yPos = addSectionTitle("RECOMMENDATIONS", yPos);

      const recommendations = comparisonResult.comparison.trend === "increasing" ? [
        { priority: "HIGH", action: "Implement monitoring protocols", timeline: "2 weeks" },
        { priority: "HIGH", action: "Ground-truth verification", timeline: "1 month" },
        { priority: "MEDIUM", action: "Develop intervention strategy", timeline: "2 months" },
        { priority: "LOW", action: "Follow-up comparative analysis", timeline: "Quarterly" }
      ] : comparisonResult.comparison.trend === "decreasing" ? [
        { priority: "MEDIUM", action: "Document successful strategies", timeline: "1 month" },
        { priority: "MEDIUM", action: "Continue current practices", timeline: "Ongoing" },
        { priority: "LOW", action: "Analyze contributing factors", timeline: "2 months" },
        { priority: "LOW", action: "Plan sustainability assessment", timeline: "6 months" }
      ] : [
        { priority: "MEDIUM", action: "Maintain monitoring frequency", timeline: "Ongoing" },
        { priority: "LOW", action: "Review management protocols", timeline: "3 months" },
        { priority: "LOW", action: "Periodic assessments", timeline: "Semi-annually" }
      ];

      recommendations.forEach((rec, index) => {
        checkPageBreak(18);
        
        const priorityColors: Record<string, [number, number, number]> = {
          "HIGH": [220, 38, 38],
          "MEDIUM": [234, 179, 8],
          "LOW": [59, 130, 246]
        };
        
        pdf.setFillColor(249, 250, 251);
        pdf.roundedRect(margin, yPos - 2, contentWidth, 14, 2, 2, "F");
        
        pdf.setFillColor(...priorityColors[rec.priority]);
        pdf.roundedRect(margin + 3, yPos, 20, 5, 1, 1, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(6);
        pdf.setFont("helvetica", "bold");
        pdf.text(rec.priority, margin + 5, yPos + 3.5);
        
        pdf.setTextColor(17, 24, 39);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        const actionText = pdf.splitTextToSize(rec.action, contentWidth - 70)[0];
        pdf.text(actionText, margin + 28, yPos + 3.5);
        
        pdf.setTextColor(107, 114, 128);
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "normal");
        pdf.text(rec.timeline, margin + 28, yPos + 9);
        
        yPos += 16;
      });

      yPos += 8;

      // Data Sources
      checkPageBreak(45);
      yPos = addSectionTitle("DATA SOURCES & METHODOLOGY", yPos);
      
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(75, 85, 99);
      
      const methodology = 
        "Comparative analysis uses multi-spectral satellite imagery with advanced change detection. " +
        "Environmental indicators derived from NDVI, NDWI, and thermal analysis. AI-powered pattern recognition with 85%+ confidence.";
      
      yPos = addWrappedText(methodology, margin, yPos, contentWidth, 4);
      yPos += 8;

      const sources = [
        "• Sentinel-2 Multi-Spectral Imagery",
        "• MODIS Terra/Aqua Products",
        "• GeoPulse AI Engine v2.0"
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
      pdf.text("GeoPulse Environmental Intelligence Platform", margin, pageHeight - 9);
      pdf.text(`Generated: ${reportDate.toISOString().split('T')[0]}`, margin, pageHeight - 5);
      
      pdf.setFont("helvetica", "bold");
      pdf.text("www.geopulse.ai", pageWidth - margin - 28, pageHeight - 7);

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

      const eventInfo = getEventTypeInfo(comparisonResult.eventType);
      const title = `${eventInfo.label} - ${comparisonResult.location}`;

      const { data, error } = await supabase
        .from("shared_reports")
        .insert({
          report_type: "comparison",
          title,
          location_name: comparisonResult.location,
          event_type: comparisonResult.eventType,
          report_data: comparisonResult,
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
              Generate a public link to share this comparison analysis with stakeholders.
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
                    {getEventTypeInfo(comparisonResult.eventType).label}
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
