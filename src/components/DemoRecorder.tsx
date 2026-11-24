import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Video,
  Square,
  Download,
  Circle,
  Monitor,
  Camera,
  Upload,
  Cloud,
  Trash2,
  Share2,
  Copy,
  Check,
  Loader2,
  FolderOpen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

type RecordingState = "idle" | "recording" | "paused" | "stopped";

interface SavedRecording {
  id: string;
  title: string;
  description: string | null;
  file_path: string;
  file_size: number;
  duration_seconds: number;
  created_at: string;
  is_public: boolean;
  share_id: string | null;
}

const DemoRecorder = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingType, setRecordingType] = useState<"screen" | "tab">("tab");
  const [activeTab, setActiveTab] = useState("record");
  
  // Cloud storage state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [savedRecordings, setSavedRecordings] = useState<SavedRecording[]>([]);
  const [isLoadingRecordings, setIsLoadingRecordings] = useState(false);
  const [recordingTitle, setRecordingTitle] = useState("");
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { toast } = useToast();

  // Check auth state
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user ? { id: user.id } : null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id } : null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load saved recordings when tab changes
  useEffect(() => {
    if (activeTab === "library" && user) {
      loadSavedRecordings();
    }
  }, [activeTab, loadSavedRecordings, user]);

  const loadSavedRecordings = useCallback(async () => {
    if (!user) return;
    
    setIsLoadingRecordings(true);
    try {
      const { data, error } = await supabase
        .from("demo_recordings")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSavedRecordings(data || []);
    } catch (error) {
      console.error("Error loading recordings:", error);
      toast({
        title: "Failed to load recordings",
        description: "Could not fetch your saved recordings.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingRecordings(false);
    }
  }, [toast, user]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const startRecording = useCallback(async () => {
    try {
      chunksRef.current = [];
      setRecordedBlob(null);

      const displayMediaOptions: DisplayMediaStreamOptions = {
        video: {
          displaySurface: recordingType === "tab" ? "browser" : "monitor",
          frameRate: 30,
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      };

      const stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
      streamRef.current = stream;

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        toast({
          title: "Audio not captured",
          description: "Recording video only. Enable 'Share audio' for sound.",
          variant: "default",
        });
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9",
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setRecordedBlob(blob);
        setRecordingState("stopped");
        setRecordingTitle(`GeoPulse Demo - ${new Date().toLocaleDateString()}`);

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }

        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };

      stream.getVideoTracks()[0].onended = () => {
        if (recordingState === "recording") {
          mediaRecorderRef.current?.stop();
        }
      };

      mediaRecorder.start(1000);
      setRecordingState("recording");
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      toast({
        title: "Recording started",
        description: "Your screen is now being recorded.",
      });
    } catch (error) {
      console.error("Error starting recording:", error);
      toast({
        title: "Recording failed",
        description: "Could not start screen recording. Please try again.",
        variant: "destructive",
      });
    }
  }, [recordingType, toast, recordingState]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recordingState === "recording") {
      mediaRecorderRef.current.stop();

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      toast({
        title: "Recording stopped",
        description: "Your demo video is ready to save or download.",
      });
    }
  }, [recordingState, toast]);

  const downloadRecording = useCallback(() => {
    if (recordedBlob) {
      const url = URL.createObjectURL(recordedBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${recordingTitle || "GeoPulse-Demo"}-${new Date().toISOString().slice(0, 10)}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download started",
        description: "Your demo video is being downloaded.",
      });
    }
  }, [recordedBlob, recordingTitle, toast]);

  const uploadToCloud = useCallback(async () => {
    if (!recordedBlob || !user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save recordings to the cloud.",
        variant: "destructive",
      });
      return;
    }

    if (!recordingTitle.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a title for your recording.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const fileName = `${Date.now()}-${recordingTitle.replace(/[^a-zA-Z0-9]/g, "-")}.webm`;
      const filePath = `${user.id}/${fileName}`;

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("demo-recordings")
        .upload(filePath, recordedBlob, {
          contentType: "video/webm",
          upsert: false,
        });

      clearInterval(progressInterval);

      if (uploadError) throw uploadError;

      setUploadProgress(95);

      // Save metadata to database
      const { error: dbError } = await supabase.from("demo_recordings").insert({
        user_id: user.id,
        title: recordingTitle.trim(),
        file_path: filePath,
        file_size: recordedBlob.size,
        duration_seconds: recordingTime,
      });

      if (dbError) throw dbError;

      setUploadProgress(100);

      toast({
        title: "Upload complete!",
        description: "Your recording has been saved to the cloud.",
      });

      // Reset state and switch to library
      resetRecording();
      setActiveTab("library");
      loadSavedRecordings();
    } catch (error) {
      console.error("Error uploading recording:", error);
      toast({
        title: "Upload failed",
        description: "Could not save recording to cloud. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [loadSavedRecordings, recordedBlob, resetRecording, user, recordingTitle, recordingTime, toast]);

  const deleteRecording = async (recording: SavedRecording) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("demo-recordings")
        .remove([recording.file_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from("demo_recordings")
        .delete()
        .eq("id", recording.id);

      if (dbError) throw dbError;

      toast({
        title: "Recording deleted",
        description: "The recording has been removed.",
      });

      loadSavedRecordings();
    } catch (error) {
      console.error("Error deleting recording:", error);
      toast({
        title: "Delete failed",
        description: "Could not delete the recording.",
        variant: "destructive",
      });
    }
  };

  const toggleShareRecording = async (recording: SavedRecording) => {
    try {
      const newShareId = recording.is_public ? null : crypto.randomUUID().slice(0, 12);
      
      const { error } = await supabase
        .from("demo_recordings")
        .update({
          is_public: !recording.is_public,
          share_id: newShareId,
        })
        .eq("id", recording.id);

      if (error) throw error;

      toast({
        title: recording.is_public ? "Sharing disabled" : "Sharing enabled",
        description: recording.is_public
          ? "The recording is now private."
          : "Copy the share link to share this recording.",
      });

      loadSavedRecordings();
    } catch (error) {
      console.error("Error toggling share:", error);
      toast({
        title: "Failed to update sharing",
        variant: "destructive",
      });
    }
  };

  const copyShareLink = async (recording: SavedRecording) => {
    if (!recording.share_id) return;

    try {
      // Generate a signed URL for sharing (valid for 24 hours)
      const { data, error } = await supabase.storage
        .from("demo-recordings")
        .createSignedUrl(recording.file_path, 86400); // 24 hours

      if (error || !data) {
        toast({
          title: "Failed to generate share link",
          description: "Could not create a share URL.",
          variant: "destructive",
        });
        return;
      }

      navigator.clipboard.writeText(data.signedUrl);
      setCopiedShareId(recording.id);

      toast({
        title: "Link copied!",
        description: "Share link has been copied to clipboard (valid for 24 hours).",
      });

      setTimeout(() => setCopiedShareId(null), 2000);
    } catch (error) {
      console.error("Error generating share link:", error);
      toast({
        title: "Failed to generate share link",
        variant: "destructive",
      });
    }
  };

  const playRecording = async (recording: SavedRecording) => {
    try {
      // Generate a signed URL for playback (valid for 1 hour)
      const { data, error } = await supabase.storage
        .from("demo-recordings")
        .createSignedUrl(recording.file_path, 3600); // 1 hour

      if (error || !data) {
        toast({
          title: "Failed to load recording",
          description: "Could not generate playback URL.",
          variant: "destructive",
        });
        return;
      }

      window.open(data.signedUrl, "_blank");
    } catch (error) {
      console.error("Error playing recording:", error);
      toast({
        title: "Playback failed",
        variant: "destructive",
      });
    }
  };

  const resetRecording = useCallback(() => {
    setRecordingState("idle");
    setRecordingTime(0);
    setRecordedBlob(null);
    setRecordingTitle("");
    chunksRef.current = [];
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="fixed bottom-24 right-6 z-50 h-12 w-12 rounded-full shadow-lg bg-background/95 backdrop-blur border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all duration-300"
            >
              {recordingState === "recording" ? (
                <Circle className="h-5 w-5 fill-destructive text-destructive animate-pulse" />
              ) : (
                <Video className="h-5 w-5" />
              )}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>Record Demo Video</p>
        </TooltipContent>
      </Tooltip>

      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" />
            Demo Video Recorder
          </DialogTitle>
          <DialogDescription>
            Record, save, and share your GeoPulse demos.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="record" className="gap-2">
              <Camera className="h-4 w-4" />
              Record
            </TabsTrigger>
            <TabsTrigger value="library" className="gap-2">
              <FolderOpen className="h-4 w-4" />
              Library
            </TabsTrigger>
          </TabsList>

          <TabsContent value="record" className="flex-1 overflow-auto mt-4">
            <div className="space-y-6">
              {/* Recording Type Selection */}
              {recordingState === "idle" && (
                <div className="space-y-3">
                  <Label>Recording Mode</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant={recordingType === "tab" ? "default" : "outline"}
                      className="flex flex-col h-auto py-4 gap-2"
                      onClick={() => setRecordingType("tab")}
                    >
                      <Camera className="h-5 w-5" />
                      <span className="text-xs">Browser Tab</span>
                    </Button>
                    <Button
                      variant={recordingType === "screen" ? "default" : "outline"}
                      className="flex flex-col h-auto py-4 gap-2"
                      onClick={() => setRecordingType("screen")}
                    >
                      <Monitor className="h-5 w-5" />
                      <span className="text-xs">Full Screen</span>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {recordingType === "tab"
                      ? "Record only the GeoPulse browser tab for focused demos."
                      : "Record your entire screen including other applications."}
                  </p>
                </div>
              )}

              {/* Recording Status */}
              {recordingState === "recording" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                    <div className="flex items-center gap-3">
                      <Circle className="h-4 w-4 fill-destructive text-destructive animate-pulse" />
                      <span className="font-medium text-destructive">Recording in progress</span>
                    </div>
                    <span className="font-mono text-lg font-bold">{formatTime(recordingTime)}</span>
                  </div>
                  <Progress value={(recordingTime % 60) * 1.67} className="h-1" />
                  <p className="text-xs text-muted-foreground text-center">
                    Navigate through GeoPulse features to create a comprehensive demo.
                  </p>
                </div>
              )}

              {/* Recording Complete */}
              {recordingState === "stopped" && recordedBlob && (
                <div className="space-y-4">
                  <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                    <div className="flex items-center gap-3">
                      <Video className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-primary">Recording complete!</p>
                        <p className="text-xs text-muted-foreground">
                          Duration: {formatTime(recordingTime)} • Size: {formatFileSize(recordedBlob.size)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Video Preview */}
                  <div className="rounded-lg overflow-hidden border bg-muted/30">
                    <video
                      src={URL.createObjectURL(recordedBlob)}
                      controls
                      className="w-full max-h-40 object-contain"
                    />
                  </div>

                  {/* Title Input */}
                  <div className="space-y-2">
                    <Label htmlFor="title">Recording Title</Label>
                    <Input
                      id="title"
                      placeholder="Enter a title for your recording"
                      value={recordingTitle}
                      onChange={(e) => setRecordingTitle(e.target.value)}
                    />
                  </div>

                  {/* Upload Progress */}
                  {isUploading && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Uploading to cloud...</span>
                        <span className="font-medium">{uploadProgress}%</span>
                      </div>
                      <Progress value={uploadProgress} className="h-2" />
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                {recordingState === "idle" && (
                  <Button onClick={startRecording} className="flex-1 gap-2">
                    <Circle className="h-4 w-4" />
                    Start Recording
                  </Button>
                )}

                {recordingState === "recording" && (
                  <Button onClick={stopRecording} variant="destructive" className="flex-1 gap-2">
                    <Square className="h-4 w-4" />
                    Stop Recording
                  </Button>
                )}

                {recordingState === "stopped" && (
                  <>
                    <Button
                      onClick={uploadToCloud}
                      className="flex-1 gap-2"
                      disabled={isUploading || !user}
                    >
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Cloud className="h-4 w-4" />
                      )}
                      {user ? "Save to Cloud" : "Sign in to Save"}
                    </Button>
                    <Button onClick={downloadRecording} variant="outline" className="gap-2">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button onClick={resetRecording} variant="ghost" size="icon">
                      <Video className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>

              {/* Tips */}
              {recordingState === "idle" && (
                <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium">Recording Tips:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Enable "Share audio" for narration capture</li>
                    <li>Use Browser Tab mode for cleaner demos</li>
                    <li>Close this dialog after starting to record</li>
                    <li>Recordings save as WebM format</li>
                  </ul>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="library" className="flex-1 overflow-hidden mt-4">
            {!user ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Cloud className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground mb-2">Sign in to access your recordings</p>
                <Button variant="outline" onClick={() => window.location.href = "/auth"}>
                  Sign In
                </Button>
              </div>
            ) : isLoadingRecordings ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : savedRecordings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground mb-2">No recordings yet</p>
                <p className="text-xs text-muted-foreground">
                  Record a demo and save it to the cloud
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-3">
                  {savedRecordings.map((recording) => (
                    <div
                      key={recording.id}
                      className="p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => playRecording(recording)}
                        >
                          <h4 className="font-medium text-sm truncate">{recording.title}</h4>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(recording.created_at)} • {formatTime(recording.duration_seconds)} •{" "}
                            {formatFileSize(recording.file_size)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {recording.is_public && recording.share_id && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => copyShareLink(recording)}
                            >
                              {copiedShareId === recording.id ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleShareRecording(recording)}
                          >
                            <Share2
                              className={`h-4 w-4 ${recording.is_public ? "text-primary" : ""}`}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => deleteRecording(recording)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default DemoRecorder;