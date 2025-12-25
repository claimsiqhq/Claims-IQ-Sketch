/**
 * Inspection Workflow Panel Component
 *
 * Mobile-first, interactive inspection workflow management with:
 * - Pre-generation wizard for gathering context
 * - Phase-based step navigation
 * - Photo capture and findings documentation
 * - Progress tracking and statistics
 * - Room management and custom step addition
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  ClipboardCheck,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  PlayCircle,
  CheckCircle2,
  Circle,
  AlertCircle,
  Clock,
  Camera,
  Ruler,
  FileText,
  Shield,
  Wrench,
  Users,
  Eye,
  Plus,
  Home,
  Layers,
  MapPin,
  Package,
  HelpCircle,
  SkipForward,
  Ban,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import {
  getClaimWorkflow,
  generateInspectionWorkflow,
  getWorkflowStatus,
  regenerateWorkflow as apiRegenerateWorkflow,
  updateWorkflowStep,
  addWorkflowRoom,
  expandWorkflowRooms,
  addWorkflowStep,
  getClaim,
  type FullWorkflow,
  type InspectionWorkflowStep,
  type InspectionPhase,
  type InspectionStepType,
  type InspectionStepStatus,
} from "@/lib/api";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// Import new workflow components
import { WorkflowWizard, type WizardData } from "./workflow/workflow-wizard";
import { StepCompletionDialog, type StepData, type StepCompletionData } from "./workflow/step-completion-dialog";

interface WorkflowPanelProps {
  claimId: string;
  className?: string;
}

// Phase labels and icons
const PHASE_CONFIG: Record<InspectionPhase, { label: string; icon: React.ReactNode; color: string }> = {
  pre_inspection: { label: "Pre-Inspection", icon: <ClipboardCheck className="h-4 w-4" />, color: "text-blue-600" },
  initial_walkthrough: { label: "Walkthrough", icon: <MapPin className="h-4 w-4" />, color: "text-purple-600" },
  exterior: { label: "Exterior", icon: <Home className="h-4 w-4" />, color: "text-green-600" },
  interior: { label: "Interior", icon: <Layers className="h-4 w-4" />, color: "text-orange-600" },
  documentation: { label: "Documentation", icon: <FileText className="h-4 w-4" />, color: "text-cyan-600" },
  wrap_up: { label: "Wrap Up", icon: <CheckCircle2 className="h-4 w-4" />, color: "text-emerald-600" },
};

// Step type icons
const STEP_TYPE_ICONS: Record<InspectionStepType, React.ReactNode> = {
  photo: <Camera className="h-4 w-4" />,
  measurement: <Ruler className="h-4 w-4" />,
  checklist: <ClipboardCheck className="h-4 w-4" />,
  observation: <Eye className="h-4 w-4" />,
  documentation: <FileText className="h-4 w-4" />,
  safety_check: <Shield className="h-4 w-4" />,
  equipment: <Wrench className="h-4 w-4" />,
  interview: <Users className="h-4 w-4" />,
};

// Status icons and colors
const STATUS_CONFIG: Record<InspectionStepStatus, { icon: React.ReactNode; color: string; bg: string }> = {
  pending: { icon: <Circle className="h-4 w-4" />, color: "text-muted-foreground", bg: "bg-muted" },
  in_progress: { icon: <PlayCircle className="h-4 w-4" />, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-950" },
  completed: { icon: <CheckCircle2 className="h-4 w-4" />, color: "text-green-600", bg: "bg-green-100 dark:bg-green-950" },
  skipped: { icon: <SkipForward className="h-4 w-4" />, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-950" },
  blocked: { icon: <Ban className="h-4 w-4" />, color: "text-red-600", bg: "bg-red-100 dark:bg-red-950" },
};

export function WorkflowPanel({ claimId, className }: WorkflowPanelProps) {
  const [workflow, setWorkflow] = useState<FullWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<InspectionPhase | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [staleStatus, setStaleStatus] = useState<{ shouldRegenerate: boolean; reason?: string } | null>(null);

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardData, setWizardData] = useState<WizardData | null>(null);
  const [claimInfo, setClaimInfo] = useState<{
    claimNumber: string;
    primaryPeril: string;
    propertyAddress?: string;
  } | null>(null);

  // Step completion dialog state
  const [completingStep, setCompletingStep] = useState<StepData | null>(null);
  const [isSubmittingStep, setIsSubmittingStep] = useState(false);

  // Dialog states
  const [showAddRoomDialog, setShowAddRoomDialog] = useState(false);
  const [showAddStepDialog, setShowAddStepDialog] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomLevel, setNewRoomLevel] = useState("");
  const [newStepPhase, setNewStepPhase] = useState<InspectionPhase>("interior");
  const [newStepType, setNewStepType] = useState<InspectionStepType>("observation");
  const [newStepTitle, setNewStepTitle] = useState("");
  const [newStepInstructions, setNewStepInstructions] = useState("");
  const [addingRoom, setAddingRoom] = useState(false);
  const [addingStep, setAddingStep] = useState(false);

  // Fetch claim info for wizard
  const fetchClaimInfo = useCallback(async () => {
    try {
      const claim = await getClaim(claimId);
      if (claim) {
        setClaimInfo({
          claimNumber: claim.claimNumber,
          primaryPeril: claim.primaryPeril || "unknown",
          propertyAddress: [claim.propertyAddress, claim.propertyCity, claim.propertyState].filter(Boolean).join(", "),
        });
      }
    } catch (err) {
      console.error("Failed to fetch claim info:", err);
    }
  }, [claimId]);

  const fetchWorkflow = useCallback(async () => {
    if (!claimId) return;
    setLoading(true);
    setError(null);

    try {
      const [data, statusData] = await Promise.all([
        getClaimWorkflow(claimId),
        getWorkflowStatus(claimId).catch(() => null),
      ]);

      setWorkflow(data);
      setStaleStatus(statusData);

      // Set initial active phase to first phase with pending steps
      if (data && data.workflow.workflowJson.phases.length > 0) {
        const firstPhaseWithPending = data.workflow.workflowJson.phases.find(p =>
          data.steps.some(s => s.phase === p.phase && s.status === 'pending')
        );
        setActivePhase(firstPhaseWithPending?.phase || data.workflow.workflowJson.phases[0].phase);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow');
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => {
    fetchWorkflow();
    fetchClaimInfo();
  }, [fetchWorkflow, fetchClaimInfo]);

  // Handle wizard completion - generate workflow with context
  const handleWizardComplete = async (data: WizardData) => {
    setWizardData(data);
    setGenerating(true);
    setError(null);

    try {
      // Generate workflow with wizard context
      // The backend will use this context to create a more tailored workflow
      await generateInspectionWorkflow(claimId, false, data);
      await fetchWorkflow();
      setShowWizard(false);
      toast.success('Workflow generated successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate workflow';
      setError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = async () => {
    if (!claimId || !staleStatus?.reason) return;
    setGenerating(true);
    setError(null);

    try {
      await apiRegenerateWorkflow(claimId, staleStatus.reason);
      await fetchWorkflow();
      toast.success('Workflow regenerated successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to regenerate workflow';
      setError(message);
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  // Handle step completion with findings
  const handleStepComplete = async (data: StepCompletionData) => {
    if (!workflow) return;
    setIsSubmittingStep(true);

    try {
      await updateWorkflowStep(workflow.workflow.id, data.stepId, {
        status: data.status,
        notes: data.findings,
        actualMinutes: data.actualMinutes,
      });

      // Update local state
      setWorkflow(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: prev.steps.map(s =>
            s.id === data.stepId
              ? { ...s, status: data.status, notes: data.findings, actualMinutes: data.actualMinutes }
              : s
          ),
          stats: {
            ...prev.stats,
            completedSteps: data.status === 'completed'
              ? prev.stats.completedSteps + 1
              : prev.stats.completedSteps,
            pendingSteps: prev.steps.find(s => s.id === data.stepId)?.status === 'pending'
              ? prev.stats.pendingSteps - 1
              : prev.stats.pendingSteps,
          },
        };
      });

      setCompletingStep(null);
      toast.success(`Step completed: ${data.findings ? 'with findings' : 'successfully'}`);

      // Auto-advance to next pending step in same phase
      if (activePhase && workflow) {
        const phaseSteps = workflow.steps.filter(s => s.phase === activePhase);
        const currentIdx = phaseSteps.findIndex(s => s.id === data.stepId);
        const nextPending = phaseSteps.slice(currentIdx + 1).find(s => s.status === 'pending');
        if (nextPending) {
          setExpandedSteps(new Set([nextPending.id]));
        }
      }
    } catch (err) {
      toast.error('Failed to complete step');
    } finally {
      setIsSubmittingStep(false);
    }
  };

  // Handle step skip
  const handleStepSkip = async (stepId: string, reason: string) => {
    if (!workflow) return;
    setIsSubmittingStep(true);

    try {
      await updateWorkflowStep(workflow.workflow.id, stepId, {
        status: 'skipped',
        notes: `Skipped: ${reason}`,
      });

      // Update local state
      setWorkflow(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: prev.steps.map(s =>
            s.id === stepId ? { ...s, status: 'skipped', notes: `Skipped: ${reason}` } : s
          ),
        };
      });

      setCompletingStep(null);
      toast.success('Step skipped');
    } catch (err) {
      toast.error('Failed to skip step');
    } finally {
      setIsSubmittingStep(false);
    }
  };

  // Quick status change (for non-required steps)
  const handleQuickStatusChange = async (step: InspectionWorkflowStep, newStatus: InspectionStepStatus) => {
    if (!workflow) return;

    // For completing required steps, open the completion dialog
    if (newStatus === 'completed' && step.required) {
      setCompletingStep({
        id: step.id,
        title: step.title,
        instructions: step.instructions || undefined,
        stepType: step.stepType,
        estimatedMinutes: step.estimatedMinutes || 5,
        required: step.required,
        roomName: step.roomName || undefined,
        assets: step.assets?.map(a => ({
          assetType: a.assetType,
          label: a.label,
          required: a.required,
        })),
      });
      return;
    }

    try {
      await updateWorkflowStep(workflow.workflow.id, step.id, { status: newStatus });
      // Update local state
      setWorkflow(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: prev.steps.map(s =>
            s.id === step.id ? { ...s, status: newStatus } : s
          ),
          stats: {
            ...prev.stats,
            completedSteps: newStatus === 'completed'
              ? prev.stats.completedSteps + 1
              : (step.status === 'completed' ? prev.stats.completedSteps - 1 : prev.stats.completedSteps),
            pendingSteps: newStatus === 'pending'
              ? prev.stats.pendingSteps + 1
              : (step.status === 'pending' ? prev.stats.pendingSteps - 1 : prev.stats.pendingSteps),
          },
        };
      });
      toast.success(`Step marked as ${newStatus}`);
    } catch (err) {
      toast.error('Failed to update step');
    }
  };

  const handleAddRoom = async () => {
    if (!workflow || !newRoomName.trim()) return;
    setAddingRoom(true);

    try {
      await addWorkflowRoom(workflow.workflow.id, {
        name: newRoomName.trim(),
        level: newRoomLevel || undefined,
      });
      // Expand room with template steps
      await expandWorkflowRooms(workflow.workflow.id, [newRoomName.trim()]);
      await fetchWorkflow();
      setShowAddRoomDialog(false);
      setNewRoomName("");
      setNewRoomLevel("");
      toast.success(`Room "${newRoomName}" added with inspection steps`);
    } catch (err) {
      toast.error('Failed to add room');
    } finally {
      setAddingRoom(false);
    }
  };

  const handleAddStep = async () => {
    if (!workflow || !newStepTitle.trim()) return;
    setAddingStep(true);

    try {
      await addWorkflowStep(workflow.workflow.id, {
        phase: newStepPhase,
        stepType: newStepType,
        title: newStepTitle.trim(),
        instructions: newStepInstructions || undefined,
      });
      await fetchWorkflow();
      setShowAddStepDialog(false);
      setNewStepTitle("");
      setNewStepInstructions("");
      toast.success('Step added successfully');
    } catch (err) {
      toast.error('Failed to add step');
    } finally {
      setAddingStep(false);
    }
  };

  const toggleStepExpanded = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  // Start step (open completion dialog)
  const startStep = (step: InspectionWorkflowStep) => {
    setCompletingStep({
      id: step.id,
      title: step.title,
      instructions: step.instructions || undefined,
      stepType: step.stepType,
      estimatedMinutes: step.estimatedMinutes || 5,
      required: step.required,
      roomName: step.roomName || undefined,
      assets: step.assets?.map(a => ({
        assetType: a.assetType,
        label: a.label,
        required: a.required,
      })),
    });
  };

  // Group steps by phase
  const stepsByPhase = workflow?.steps.reduce((acc, step) => {
    const phase = step.phase as InspectionPhase;
    if (!acc[phase]) acc[phase] = [];
    acc[phase].push(step);
    return acc;
  }, {} as Record<InspectionPhase, typeof workflow.steps>) || {};

  const progressPercent = workflow
    ? Math.round((workflow.stats.completedSteps / workflow.stats.totalSteps) * 100)
    : 0;

  // Show wizard for new workflow
  if (showWizard && claimInfo) {
    return (
      <WorkflowWizard
        claimId={claimId}
        claimNumber={claimInfo.claimNumber}
        primaryPeril={claimInfo.primaryPeril}
        propertyAddress={claimInfo.propertyAddress}
        onComplete={handleWizardComplete}
        onCancel={() => setShowWizard(false)}
        isGenerating={generating}
      />
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-purple-500" />
          <h3 className="text-lg font-semibold">Inspection Workflow</h3>
          {workflow && (
            <Badge variant="outline">v{workflow.workflow.version}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {workflow && (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(workflow.workflow.updatedAt), { addSuffix: true })}
            </span>
          )}
          {!workflow && !loading && (
            <Button
              size="sm"
              onClick={() => setShowWizard(true)}
              disabled={generating || !claimInfo}
            >
              <Wand2 className="h-4 w-4 mr-1" />
              Start Workflow
            </Button>
          )}
          {workflow && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowWizard(true)}
              disabled={generating}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Regenerate
            </Button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && !loading && !workflow && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4">
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* No workflow - Welcome state */}
      {!loading && !workflow && !error && (
        <Card className="border-dashed border-2">
          <CardContent className="py-12 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <h4 className="text-lg font-semibold mb-2">Create Your Inspection Workflow</h4>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Answer a few questions about the property and damage, and we'll generate
              a tailored inspection checklist for your field work.
            </p>
            <Button
              size="lg"
              onClick={() => setShowWizard(true)}
              disabled={!claimInfo}
              className="gap-2"
            >
              <Wand2 className="h-5 w-5" />
              Start Workflow Wizard
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Workflow content */}
      {workflow && !loading && (
        <>
          {/* Stale Workflow Alert */}
          {staleStatus?.shouldRegenerate && (
            <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-200">Workflow Update Recommended</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">{staleStatus.reason}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-400 text-amber-700 hover:bg-amber-100"
                    onClick={handleRegenerate}
                    disabled={generating}
                  >
                    {generating ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Update
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Progress and Stats */}
          <Card>
            <CardContent className="py-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Progress</span>
                  <span className="text-muted-foreground">
                    {workflow.stats.completedSteps} / {workflow.stats.totalSteps} steps
                  </span>
                </div>
                <Progress value={progressPercent} className="h-3" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {workflow.stats.estimatedMinutes} min est.
                    </span>
                    {workflow.stats.actualMinutes > 0 && (
                      <span>{workflow.stats.actualMinutes} min actual</span>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {workflow.workflow.primaryPeril || 'Unknown Peril'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowAddRoomDialog(true)}>
              <Home className="h-4 w-4 mr-1" />
              Add Room
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddStepDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Step
            </Button>
          </div>

          {/* Phase Navigation */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {workflow.workflow.workflowJson.phases.map((phase) => {
              const config = PHASE_CONFIG[phase.phase];
              if (!config) return null;
              const phaseSteps = stepsByPhase[phase.phase] || [];
              const completedInPhase = phaseSteps.filter(s => s.status === 'completed').length;
              const isActive = activePhase === phase.phase;

              return (
                <Button
                  key={phase.phase}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className={cn("flex-shrink-0", !isActive && config.color)}
                  onClick={() => setActivePhase(phase.phase)}
                >
                  {config.icon}
                  <span className="ml-1 hidden sm:inline">{config.label}</span>
                  <Badge variant={isActive ? "secondary" : "outline"} className="ml-1 text-xs">
                    {completedInPhase}/{phaseSteps.length}
                  </Badge>
                </Button>
              );
            })}
          </div>

          {/* Steps for active phase */}
          {activePhase && (
            <ScrollArea className="h-[calc(100vh-500px)] min-h-[250px] md:h-[calc(100vh-450px)]">
              <div className="space-y-3 pr-4">
                {(stepsByPhase[activePhase] || []).map((step, index) => {
                  const statusConfig = STATUS_CONFIG[step.status as InspectionStepStatus];
                  const typeIcon = STEP_TYPE_ICONS[step.stepType as InspectionStepType];
                  const isExpanded = expandedSteps.has(step.id);

                  return (
                    <Card
                      key={step.id}
                      className={cn(
                        "transition-all overflow-hidden",
                        statusConfig?.bg,
                        step.status === 'pending' && "border-l-4 border-l-primary"
                      )}
                    >
                      <CardHeader
                        className="py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => toggleStepExpanded(step.id)}
                      >
                        <div className="flex items-start gap-3">
                          {/* Step number & Status */}
                          <div className={cn(
                            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                            step.status === 'completed'
                              ? "bg-green-500 text-white"
                              : step.status === 'skipped'
                              ? "bg-amber-500 text-white"
                              : "bg-muted text-muted-foreground"
                          )}>
                            {step.status === 'completed' ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : step.status === 'skipped' ? (
                              <SkipForward className="h-4 w-4" />
                            ) : (
                              index + 1
                            )}
                          </div>

                          {/* Step info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-muted-foreground">{typeIcon}</span>
                              <CardTitle className="text-sm font-medium line-clamp-1">
                                {step.title}
                              </CardTitle>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {step.required && (
                                <Badge variant="destructive" className="text-xs">Required</Badge>
                              )}
                              {step.roomName && (
                                <Badge variant="secondary" className="text-xs">
                                  {step.roomName}
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {step.estimatedMinutes} min
                              </span>
                            </div>
                          </div>

                          {/* Expand indicator */}
                          <div className="text-muted-foreground flex-shrink-0">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </div>
                        </div>
                      </CardHeader>

                      {isExpanded && (
                        <CardContent className="pt-0 pb-4 border-t">
                          {/* Instructions */}
                          {step.instructions && (
                            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                              <p className="text-sm text-muted-foreground">{step.instructions}</p>
                            </div>
                          )}

                          {/* Required assets */}
                          {step.assets && step.assets.length > 0 && (
                            <div className="mb-4">
                              <h5 className="text-xs font-medium mb-2 text-muted-foreground uppercase tracking-wide">
                                Evidence Required
                              </h5>
                              <div className="flex flex-wrap gap-2">
                                {step.assets.map((asset, i) => (
                                  <Badge
                                    key={i}
                                    variant={asset.status === 'captured' ? 'default' : 'outline'}
                                    className="text-xs"
                                  >
                                    {asset.status === 'captured' ? (
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                    ) : (
                                      <Circle className="h-3 w-3 mr-1" />
                                    )}
                                    {asset.label}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Notes if completed */}
                          {step.notes && step.status === 'completed' && (
                            <div className="mb-4 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                              <h5 className="text-xs font-medium mb-1 text-green-700 dark:text-green-400">
                                Findings
                              </h5>
                              <p className="text-sm text-green-800 dark:text-green-300">{step.notes}</p>
                            </div>
                          )}

                          {/* Action buttons */}
                          <div className="flex flex-wrap gap-2">
                            {step.status === 'pending' && (
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startStep(step);
                                }}
                                className="flex-1 sm:flex-none"
                              >
                                <PlayCircle className="h-4 w-4 mr-1" />
                                Start & Complete
                              </Button>
                            )}
                            {step.status === 'in_progress' && (
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startStep(step);
                                }}
                                className="flex-1 sm:flex-none"
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Complete Step
                              </Button>
                            )}
                            {step.status !== 'skipped' && step.status !== 'completed' && !step.required && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickStatusChange(step, 'skipped');
                                }}
                              >
                                <SkipForward className="h-4 w-4 mr-1" />
                                Skip
                              </Button>
                            )}
                            {step.status === 'completed' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickStatusChange(step, 'pending');
                                }}
                              >
                                Undo
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}

                {(stepsByPhase[activePhase] || []).length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No steps in this phase yet.
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          {/* Tools and Equipment */}
          {workflow.workflow.workflowJson.tools_and_equipment?.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Tools & Equipment
                      <ChevronDown className="h-4 w-4 ml-auto" />
                    </CardTitle>
                  </CardHeader>
                </Card>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Card className="mt-2">
                  <CardContent className="py-3">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {workflow.workflow.workflowJson.tools_and_equipment.map((category, i) => (
                        <div key={i}>
                          <h5 className="text-sm font-medium mb-2">{category.category}</h5>
                          <ul className="space-y-1">
                            {category.items.map((item, j) => (
                              <li key={j} className="text-sm flex items-center gap-2">
                                {item.required ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-600 flex-shrink-0" />
                                ) : (
                                  <Circle className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                )}
                                <span>{item.name}</span>
                                {item.purpose && (
                                  <span className="text-xs text-muted-foreground">- {item.purpose}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Open Questions */}
          {workflow.workflow.workflowJson.open_questions && workflow.workflow.workflowJson.open_questions.length > 0 && (
            <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-700 dark:text-amber-300">
                  <HelpCircle className="h-4 w-4" />
                  Questions to Address
                  <Badge variant="secondary">{workflow.workflow.workflowJson.open_questions.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <ul className="space-y-2">
                  {workflow.workflow.workflowJson.open_questions.map((q, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <Badge
                        variant={q.priority === 'high' ? 'destructive' : q.priority === 'medium' ? 'secondary' : 'outline'}
                        className="text-xs mt-0.5 flex-shrink-0"
                      >
                        {q.priority}
                      </Badge>
                      <div>
                        <span className="font-medium">{q.question}</span>
                        {q.context && (
                          <p className="text-xs text-muted-foreground mt-0.5">{q.context}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Step Completion Dialog */}
      <StepCompletionDialog
        step={completingStep}
        open={!!completingStep}
        onOpenChange={(open) => !open && setCompletingStep(null)}
        onComplete={handleStepComplete}
        onSkip={handleStepSkip}
        isSubmitting={isSubmittingStep}
      />

      {/* Add Room Dialog */}
      <Dialog open={showAddRoomDialog} onOpenChange={setShowAddRoomDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Room to Workflow</DialogTitle>
            <DialogDescription>
              Add a room to expand the workflow with room-specific inspection steps.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="roomName">Room Name</Label>
              <Input
                id="roomName"
                placeholder="e.g., Living Room, Master Bedroom"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="roomLevel">Floor Level (optional)</Label>
              <Select value={newRoomLevel} onValueChange={setNewRoomLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basement">Basement</SelectItem>
                  <SelectItem value="main">Main Floor</SelectItem>
                  <SelectItem value="upper">Upper Floor</SelectItem>
                  <SelectItem value="attic">Attic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRoomDialog(false)}>Cancel</Button>
            <Button onClick={handleAddRoom} disabled={!newRoomName.trim() || addingRoom}>
              {addingRoom ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Step Dialog */}
      <Dialog open={showAddStepDialog} onOpenChange={setShowAddStepDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Step</DialogTitle>
            <DialogDescription>
              Add a custom inspection step to the workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="stepPhase">Phase</Label>
              <Select value={newStepPhase} onValueChange={(v) => setNewStepPhase(v as InspectionPhase)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PHASE_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        {config.icon}
                        {config.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="stepType">Step Type</Label>
              <Select value={newStepType} onValueChange={(v) => setNewStepType(v as InspectionStepType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STEP_TYPE_ICONS).map(([key, icon]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        {icon}
                        {key.replace('_', ' ')}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="stepTitle">Title</Label>
              <Input
                id="stepTitle"
                placeholder="e.g., Check attic insulation"
                value={newStepTitle}
                onChange={(e) => setNewStepTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="stepInstructions">Instructions (optional)</Label>
              <Textarea
                id="stepInstructions"
                placeholder="Detailed instructions for this step..."
                value={newStepInstructions}
                onChange={(e) => setNewStepInstructions(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddStepDialog(false)}>Cancel</Button>
            <Button onClick={handleAddStep} disabled={!newStepTitle.trim() || addingStep}>
              {addingStep ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default WorkflowPanel;
