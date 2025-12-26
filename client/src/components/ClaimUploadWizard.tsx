import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileText,
  FolderPlus,
  Link2,
  Check,
  Clock,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useUploadQueue,
  useUploadQueueStats,
  subscribeToCompletions,
  type DocumentUploadType,
  type UploadQueueItem,
} from "@/lib/uploadQueue";
import { UploadQueueRow } from "./UploadQueueRow";
import { getClaims, type Claim } from "@/lib/api";

type UploadMode = "new-claim" | "existing-claim";

interface ClaimUploadWizardProps {
  className?: string;
  onUploadComplete?: () => void;
  onClaimCreated?: (claimId: string) => void;
}

interface ProcessingProgress {
  totalPages: number;
  pagesProcessed: number;
  percentComplete: number;
  stage: string;
  currentPage: number;
}

interface FnolState {
  file: File | null;
  status: "idle" | "uploading" | "classifying" | "processing" | "completed" | "failed";
  error?: string;
  claimId?: string;
  claimNumber?: string;
  progress?: ProcessingProgress;
}

export function ClaimUploadWizard({ 
  className, 
  onUploadComplete,
  onClaimCreated 
}: ClaimUploadWizardProps) {
  const [mode, setMode] = useState<UploadMode>("new-claim");
  const [selectedClaimId, setSelectedClaimId] = useState<string>("");
  const [fnolState, setFnolState] = useState<FnolState>({ file: null, status: "idle" });
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDraggingFnol, setIsDraggingFnol] = useState(false);
  const [isDraggingSupporting, setIsDraggingSupporting] = useState(false);
  
  const fnolInputRef = useRef<HTMLInputElement>(null);
  const supportingInputRef = useRef<HTMLInputElement>(null);
  const pendingCompletionRef = useRef(false);

  const { 
    queue, 
    addToQueue, 
    removeFromQueue, 
    retryFailed,
    retryAllFailed,
    clearCompleted, 
  } = useUploadQueue();
  
  const stats = useUploadQueueStats();

  const { data: claimsData, isLoading: isLoadingClaims } = useQuery({
    queryKey: ["claims", "for-upload"],
    queryFn: () => getClaims({ limit: 100, includeClosed: false }),
    staleTime: 30000,
  });

  const claims = claimsData?.claims || [];

  useEffect(() => {
    const unsubscribe = subscribeToCompletions(() => {
      pendingCompletionRef.current = true;
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!stats.isActive && pendingCompletionRef.current) {
      pendingCompletionRef.current = false;
      onUploadComplete?.();
    }
  }, [stats.isActive, onUploadComplete]);

  const handleFnolDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFnol(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setFnolState({ file: files[0], status: "idle" });
    }
  }, []);

  const handleFnolSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setFnolState({ file: files[0], status: "idle" });
    }
    if (fnolInputRef.current) {
      fnolInputRef.current.value = "";
    }
  }, []);

  const handleSupportingDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingSupporting(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setSupportingFiles(prev => [...prev, ...files]);
    }
  }, []);

  const handleSupportingSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSupportingFiles(prev => [...prev, ...files]);
    }
    if (supportingInputRef.current) {
      supportingInputRef.current.value = "";
    }
  }, []);

  const removeSupportingFile = useCallback((index: number) => {
    setSupportingFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const pollForClaimCreation = useCallback(async (documentId: string): Promise<{ claimId: string; claimNumber: string } | null> => {
    const maxAttempts = 60;
    const pollInterval = 3000;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`/api/documents/${documentId}/status`, {
          credentials: "include",
        });
        
        if (response.status === 401) {
          throw new Error("Authentication expired");
        }
        
        if (response.ok) {
          const data = await response.json();
          
          // Update progress in state if available
          if (data.progress) {
            setFnolState(prev => ({ 
              ...prev, 
              progress: data.progress,
            }));
          }
          
          if (data.processingStatus === "completed" && data.claimId) {
            return { claimId: data.claimId, claimNumber: data.claimNumber || data.claimId };
          }
          
          if (data.processingStatus === "failed") {
            throw new Error(data.error || "Document processing failed");
          }
        }
      } catch (error: any) {
        if (error.message === "Authentication expired") {
          throw error;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    return null;
  }, []);

  const startNewClaimUpload = useCallback(async () => {
    if (!fnolState.file) return;

    setFnolState(prev => ({ ...prev, status: "uploading" }));

    try {
      const formData = new FormData();
      formData.append("file", fnolState.file);
      formData.append("type", "fnol");
      formData.append("processAI", "true");

      const response = await fetch("/api/documents", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result = await response.json();
      const documentId = result.id;

      setFnolState(prev => ({ ...prev, status: "classifying" }));

      await new Promise(resolve => setTimeout(resolve, 2000));

      setFnolState(prev => ({ ...prev, status: "processing" }));

      const claimResult = await pollForClaimCreation(documentId);

      if (claimResult) {
        setFnolState(prev => ({ 
          ...prev, 
          status: "completed", 
          claimId: claimResult.claimId,
          claimNumber: claimResult.claimNumber,
        }));

        onClaimCreated?.(claimResult.claimId);

        if (supportingFiles.length > 0) {
          addToQueue(supportingFiles, { 
            claimId: claimResult.claimId,
            claimNumber: claimResult.claimNumber,
            type: "auto" as DocumentUploadType,
          });
          setSupportingFiles([]);
        }
      } else {
        throw new Error("Claim creation timed out");
      }

    } catch (error: any) {
      setFnolState(prev => ({ ...prev, status: "failed", error: error.message }));
    }
  }, [fnolState.file, supportingFiles, addToQueue, pollForClaimCreation, onClaimCreated]);

  const startExistingClaimUpload = useCallback(() => {
    if (!selectedClaimId || supportingFiles.length === 0) return;

    const selectedClaim = claims.find(c => c.id === selectedClaimId);
    const claimNumber = selectedClaim?.claimNumber || selectedClaim?.claimId || selectedClaimId;

    addToQueue(supportingFiles, {
      claimId: selectedClaimId,
      claimNumber,
      type: "auto" as DocumentUploadType,
    });
    
    setSupportingFiles([]);
  }, [selectedClaimId, supportingFiles, claims, addToQueue]);

  const canStartNewClaim = fnolState.file && fnolState.status === "idle";
  const canStartExisting = selectedClaimId && supportingFiles.length > 0;
  const isUploading = fnolState.status !== "idle" && fnolState.status !== "completed" && fnolState.status !== "failed";

  const renderFnolStatus = () => {
    const progress = fnolState.progress;
    
    switch (fnolState.status) {
      case "uploading":
        return (
          <div className="flex items-center gap-2 text-blue-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Uploading FNOL...</span>
          </div>
        );
      case "classifying":
        return (
          <div className="flex items-center gap-2 text-amber-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Classifying document...</span>
          </div>
        );
      case "processing":
        return (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-purple-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">
                {progress ? (
                  progress.stage === 'finalizing' 
                    ? 'Creating claim...' 
                    : `Extracting page ${progress.pagesProcessed}/${progress.totalPages}`
                ) : (
                  'Processing FNOL...'
                )}
              </span>
            </div>
            {progress && progress.totalPages > 0 && (
              <div className="flex items-center gap-2 ml-6">
                <Progress value={progress.percentComplete} className="h-1.5 w-24" />
                <span className="text-xs text-muted-foreground">{progress.percentComplete}%</span>
              </div>
            )}
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center gap-2 text-green-600">
            <Check className="h-4 w-4" />
            <span className="text-sm">
              Claim {fnolState.claimNumber} created
            </span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{fnolState.error || "Failed to process FNOL"}</span>
          </div>
        );
      default:
        return null;
    }
  };

  const queueForCurrentMode = mode === "new-claim" && fnolState.claimId
    ? queue.filter(item => item.claimId === fnolState.claimId)
    : mode === "existing-claim" && selectedClaimId
    ? queue.filter(item => item.claimId === selectedClaimId)
    : queue;

  return (
    <Card className={cn("overflow-hidden", className)} data-testid="claim-upload-wizard">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-primary" />
            Upload Documents
            {stats.isActive && (
              <Badge variant="secondary" className="ml-2">
                {stats.uploading + stats.processing} active
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {queue.length > 0 && (
              <>
                {stats.completed > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearCompleted}
                    className="h-7 text-xs"
                    data-testid="button-clear-completed"
                  >
                    Clear done
                  </Button>
                )}
                {stats.failed > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={retryAllFailed}
                    className="h-7 text-xs"
                    data-testid="button-retry-all"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry all
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setIsExpanded(!isExpanded)}
                  data-testid="button-toggle-queue"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-4">
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as UploadMode)}
          className="flex gap-4"
          data-testid="upload-mode-toggle"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="new-claim" id="new-claim" disabled={isUploading} />
            <Label htmlFor="new-claim" className="cursor-pointer text-sm">
              New Claim
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="existing-claim" id="existing-claim" disabled={isUploading} />
            <Label htmlFor="existing-claim" className="cursor-pointer text-sm">
              Existing Claim
            </Label>
          </div>
        </RadioGroup>

        {mode === "new-claim" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">1. FNOL Document</span>
                {fnolState.status !== "idle" && renderFnolStatus()}
              </div>
              
              {fnolState.status === "idle" && (
                <div
                  className={cn(
                    "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all",
                    isDraggingFnol ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50",
                    fnolState.file && "border-primary bg-primary/5"
                  )}
                  onDragEnter={(e) => { e.preventDefault(); setIsDraggingFnol(true); }}
                  onDragLeave={(e) => { e.preventDefault(); if (e.currentTarget === e.target) setIsDraggingFnol(false); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFnolDrop}
                  onClick={() => fnolInputRef.current?.click()}
                  data-testid="fnol-dropzone"
                >
                  <input
                    ref={fnolInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleFnolSelect}
                    className="hidden"
                  />
                  {fnolState.file ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium truncate max-w-[200px]">
                        {fnolState.file.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFnolState({ file: null, status: "idle" });
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Upload className="h-5 w-5" />
                      <span className="text-sm">Drop FNOL document or click to browse</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">2. Supporting Documents</span>
                <span className="text-xs text-muted-foreground">(policies, endorsements, photos)</span>
              </div>
              
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all",
                  isDraggingSupporting ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                )}
                onDragEnter={(e) => { e.preventDefault(); setIsDraggingSupporting(true); }}
                onDragLeave={(e) => { e.preventDefault(); if (e.currentTarget === e.target) setIsDraggingSupporting(false); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleSupportingDrop}
                onClick={() => supportingInputRef.current?.click()}
                data-testid="supporting-dropzone"
              >
                <input
                  ref={supportingInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"
                  onChange={handleSupportingSelect}
                  className="hidden"
                />
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Upload className="h-5 w-5" />
                  <span className="text-sm">
                    {supportingFiles.length > 0 
                      ? `${supportingFiles.length} file(s) ready`
                      : "Drop supporting documents or click to browse"
                    }
                  </span>
                </div>
              </div>

              {supportingFiles.length > 0 && (
                <div className="space-y-1 mt-2">
                  {supportingFiles.map((file, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between text-sm px-2 py-1 bg-muted/50 rounded"
                    >
                      <span className="truncate max-w-[250px]">{file.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => removeSupportingFile(index)}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              className="w-full"
              disabled={!canStartNewClaim || isUploading}
              onClick={startNewClaimUpload}
              data-testid="button-start-new-claim-upload"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Create Claim & Upload
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select Claim</Label>
              <Select
                value={selectedClaimId}
                onValueChange={setSelectedClaimId}
                disabled={isLoadingClaims}
              >
                <SelectTrigger data-testid="select-existing-claim">
                  <SelectValue placeholder={isLoadingClaims ? "Loading claims..." : "Choose a claim"} />
                </SelectTrigger>
                <SelectContent>
                  {claims.map((claim) => (
                    <SelectItem key={claim.id} value={claim.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{claim.claimNumber || claim.claimId}</span>
                        {claim.policyholder && (
                          <span className="text-muted-foreground">- {claim.policyholder}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                  {claims.length === 0 && !isLoadingClaims && (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      No claims found. Create a new claim first.
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Documents to Attach</Label>
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all",
                  isDraggingSupporting ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                )}
                onDragEnter={(e) => { e.preventDefault(); setIsDraggingSupporting(true); }}
                onDragLeave={(e) => { e.preventDefault(); if (e.currentTarget === e.target) setIsDraggingSupporting(false); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleSupportingDrop}
                onClick={() => supportingInputRef.current?.click()}
                data-testid="existing-claim-dropzone"
              >
                <input
                  ref={supportingInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"
                  onChange={handleSupportingSelect}
                  className="hidden"
                />
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Upload className="h-5 w-5" />
                  <span className="text-sm">
                    {supportingFiles.length > 0 
                      ? `${supportingFiles.length} file(s) ready`
                      : "Drop documents or click to browse"
                    }
                  </span>
                </div>
              </div>

              {supportingFiles.length > 0 && (
                <div className="space-y-1 mt-2">
                  {supportingFiles.map((file, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between text-sm px-2 py-1 bg-muted/50 rounded"
                    >
                      <span className="truncate max-w-[250px]">{file.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => removeSupportingFile(index)}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              className="w-full"
              disabled={!canStartExisting}
              onClick={startExistingClaimUpload}
              data-testid="button-attach-to-claim"
            >
              <Upload className="h-4 w-4 mr-2" />
              Attach to Claim
            </Button>
          </div>
        )}

        {stats.isActive && (
          <div className="pt-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Overall progress</span>
              <span>{stats.completed} of {stats.total} complete</span>
            </div>
            <Progress value={stats.total > 0 ? (stats.completed / stats.total) * 100 : 0} className="h-2" />
          </div>
        )}

        {queueForCurrentMode.length > 0 && isExpanded && (
          <ScrollArea className="max-h-[400px]">
            <div className="rounded-lg border border-border overflow-hidden">
              {queueForCurrentMode.map((item) => (
                <UploadQueueRow
                  key={item.id}
                  item={item}
                  onRemove={() => removeFromQueue(item.id)}
                  onRetry={() => retryFailed(item.id)}
                  variant="full"
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
