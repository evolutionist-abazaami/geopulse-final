import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Image, Loader2, Download, X, CheckCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface FileUploadAnalysisProps {
  onAnalysisComplete?: (result: any) => void;
}

const generateLocalFileAnalysis = (fileList: File[], type: "professional" | "simple") => {
  const isSimple = type === "simple";
  const fileNames = fileList.map(f => f.name).join(", ");

  return {
    summary: isSimple
      ? `The analysis service is unreachable, so this is a placeholder summary for ${fileList.length} uploaded document(s) (${fileNames}) - it does not reflect their actual content.`
      : `The analysis service is unreachable. This is placeholder text, not a real analysis of the uploaded datasets (${fileNames}).`,
    findings: fileList.map((file) =>
      `File "${file.name}" (${(file.size / 1024).toFixed(1)} KB) was received, but not analyzed - the AI analysis service was unavailable.`
    ),
    detailedAnalysis: `The file analysis service could not be reached, so no real inspection of "${fileNames}" was performed. Retry once the service is available for an actual analysis.`,
    recommendations: [
      `Retry the analysis once the AI analysis service is reachable.`,
      `If this persists, check your connection or try again in a few minutes.`,
    ],
    confidenceLevel: 0,
    dataSources: [],
    methodology: "None - analysis service unavailable, this is placeholder text only",
    severity: "low",
    filesAnalyzed: fileList.map(f => ({ name: f.name, type: f.type, size: `${(f.size / 1024).toFixed(1)} KB` })),
    reportType: type,
    timestamp: new Date().toISOString(),
    dataProvenance: {
      analysisMethod: "unavailable",
      disclaimer: "The AI analysis service could not be reached, so this is placeholder text - it is not a real analysis of your uploaded file(s). Please retry shortly.",
    },
  };
};

const FileUploadAnalysis = ({ onAnalysisComplete }: FileUploadAnalysisProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [reportType, setReportType] = useState<"professional" | "simple">("simple");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedTypes = [
    "image/jpeg",
    "image/png",
    "image/tiff",
    "image/webp",
    "application/pdf",
    "text/csv",
    "application/json",
    "application/geo+json",
  ];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles = selectedFiles.filter((file) => {
      if (!acceptedTypes.some((type) => file.type.includes(type.split("/")[1]))) {
        toast.error(`${file.name} is not a supported file type`);
        return false;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 20MB limit`);
        return false;
      }
      return true;
    });

    setFiles((prev) => [...prev, ...validFiles].slice(0, 5));
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith("image/")) return <Image className="h-5 w-5" />;
    return <FileText className="h-5 w-5" />;
  };

  const analyzeFiles = async () => {
    if (files.length === 0) {
      toast.error("Please upload at least one file");
      return;
    }

    setIsAnalyzing(true);
    toast.info("Analyzing uploaded files...");

    try {
      // Convert files to base64 for analysis
      const fileData = await Promise.all(
        files.map(async (file) => {
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          return {
            name: file.name,
            type: file.type,
            size: file.size,
            data: base64,
          };
        })
      );

      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-files`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim()}`,
          },
          body: JSON.stringify({
            files: fileData,
            reportType,
          }),
        }
      );

      let result;
      if (!response.ok) {
        console.warn(`File analysis API returned ${response.status}. Using GeoPulse Local File Engine.`);
        result = generateLocalFileAnalysis(files, reportType);
      } else {
        result = await response.json();
      }

      setAnalysisResult(result);
      onAnalysisComplete?.(result);
      toast.success("Analysis complete!");
    } catch (error) {
      console.warn("File analysis API unreachable. Engaging local file analyzer:", error);
      const fallbackResult = generateLocalFileAnalysis(files, reportType);
      setAnalysisResult(fallbackResult);
      onAnalysisComplete?.(fallbackResult);
      toast.success("Analysis complete (GeoPulse File Engine)");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const downloadReport = () => {
    if (!analysisResult) return;

    const report = `
GEOPULSE ENVIRONMENTAL ANALYSIS REPORT
=======================================
Generated: ${new Date().toLocaleString()}
Report Type: ${reportType === "professional" ? "Professional" : "Simple Summary"}

FILES ANALYZED
--------------
${files.map((f) => `• ${f.name} (${(f.size / 1024).toFixed(1)} KB)`).join("\n")}

SUMMARY
-------
${analysisResult.summary}

KEY FINDINGS
------------
${analysisResult.findings?.map((f: string, i: number) => `${i + 1}. ${f}`).join("\n") || "No specific findings"}

${reportType === "professional" ? `
DETAILED ANALYSIS
-----------------
${analysisResult.detailedAnalysis || "N/A"}

METHODOLOGY
-----------
${analysisResult.methodology || "AI-powered image and data analysis using satellite imagery interpretation algorithms."}

DATA QUALITY ASSESSMENT
-----------------------
Confidence Level: ${analysisResult.confidenceLevel || 85}%
Data Sources: ${analysisResult.dataSources?.join(", ") || "Uploaded files"}
` : ""}

RECOMMENDATIONS
---------------
${analysisResult.recommendations?.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n") || "No specific recommendations"}

---
Report generated by GeoPulse AI Environmental Analysis System
    `.trim();

    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `geopulse-analysis-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Report downloaded!");
  };

  return (
    <Card className="p-4 md:p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" />
          File Upload Analysis
        </h3>
        <p className="text-sm text-muted-foreground">
          Upload satellite images, geospatial data, or environmental datasets for AI analysis
        </p>
      </div>

      {/* File Drop Zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-border rounded-lg p-6 md:p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
      >
        <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-medium">Click to upload or drag and drop</p>
        <p className="text-xs text-muted-foreground mt-1">
          Images (JPG, PNG, TIFF), PDF, CSV, GeoJSON • Max 20MB each • Up to 5 files
        </p>
        <Input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.tiff,.tif,.webp,.pdf,.csv,.json,.geojson"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Selected Files ({files.length}/5)</Label>
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
              >
                {getFileIcon(file)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={() => removeFile(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report Type Selection */}
      <div>
        <Label className="text-sm font-medium mb-2 block">Report Type</Label>
        <Select value={reportType} onValueChange={(v) => setReportType(v as "professional" | "simple")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="simple">
              <span className="flex items-center gap-2">
                <span>📝</span> Simple Summary - Easy to understand
              </span>
            </SelectItem>
            <SelectItem value="professional">
              <span className="flex items-center gap-2">
                <span>📊</span> Professional Report - Detailed technical analysis
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Analyze Button */}
      <Button
        className="w-full bg-gradient-ocean hover:opacity-90"
        onClick={analyzeFiles}
        disabled={isAnalyzing || files.length === 0}
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Analyzing Files...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" />
            Analyze Files
          </>
        )}
      </Button>

      {/* Analysis Results */}
      {analysisResult && (
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle className="h-5 w-5" />
            <h4 className="font-semibold">Analysis Complete</h4>
          </div>

          {analysisResult.dataProvenance?.disclaimer && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">{analysisResult.dataProvenance.disclaimer}</p>
            </div>
          )}

          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm font-medium mb-2">Summary</p>
            <p className="text-sm text-muted-foreground">{analysisResult.summary}</p>
          </div>

          {analysisResult.findings && analysisResult.findings.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Key Findings</p>
              <ul className="space-y-2">
                {analysisResult.findings.map((finding: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <span className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    {finding}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
            <span className="text-sm">Confidence Level</span>
            <span className="font-semibold text-primary">
              {analysisResult.confidenceLevel || 85}%
            </span>
          </div>

          <Button variant="outline" className="w-full" onClick={downloadReport}>
            <Download className="h-4 w-4 mr-2" />
            Download Report
          </Button>
        </div>
      )}
    </Card>
  );
};

export default FileUploadAnalysis;
