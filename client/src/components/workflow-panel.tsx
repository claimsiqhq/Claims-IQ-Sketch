/**
 * Inspection Workflow Panel Component
 *
 * Displays AI-generated inspection workflows with the following features:
 * - Phase navigation (pre-inspection, walkthrough, exterior, interior, documentation, wrap-up)
 * - Step cards with status, instructions, and required assets
 * - Progress tracking and statistics
 * - Add rooms to expand workflow with room-specific steps
 * - Mobile-first responsive design
 */

import { useState, useEffect, useCallback } from "react";
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
  ArrowRight,
  Package,
  HelpCircle,
  SkipForward,
  Ban,
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
  type FullWorkflow,
  type InspectionWorkflowStep,
  type InspectionPhase,
  type InspectionStepType,
  type InspectionStepStatus,
} from "@/lib/api";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface WorkflowPanelProps {
  claimId: string;
  className?: string;
}

// Phase labels and icons
const PHASE_CONFIG: Record<InspectionPhase, { label: string; icon: React.ReactNode; color: string }> = {
  pre_inspection: { label: "Pre-Inspection", icon: <ClipboardCheck className="h-4 w-4" />, color: "text-blue-600" },
  initial_walkthrough: { label: "Initial Walkthrough", icon: <MapPin className="h-4 w-4" />, color: "text-purple-600" },
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
  in_progress: { icon: <PlayCircle className="h-4 w-4" />, color: "text-blue-600", bg: "bg-blue-100" },
  completed: { icon: <CheckCircle2 className="h-4 w-4" />, color: "text-green-600", bg: "bg-green-100" },
  skipped: { icon: <SkipForward className="h-4 w-4" />, color: "text-amber-600", bg: "bg-amber-100" },
  blocked: { icon: <Ban className="h-4 w-4" />, color: "text-red-600", bg: "bg-red-100" },
};

export function WorkflowPanel({ claimId, className }: WorkflowPanelProps) {
  const [workflow, setWorkflow] = useState<FullWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePhase, setActivePhase] = useState<InspectionPhase | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [staleStatus, setStaleStatus] = useState<{ shouldRegenerate: boolean; reason?: string } | null>(null);

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
  }, [fetchWorkflow]);

  const handleGenerate = async (force: boolean = false) => {
    if (!claimId) return;
    setGenerating(true);
    setError(null);

    try {
      await generateInspectionWorkflow(claimId, force);
      await fetchWorkflow();
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

  const handleStepStatusChange = async (step: InspectionWorkflowStep, newStatus: InspectionStepStatus) => {
    if (!workflow) return;

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
          <Button
            size="sm"
            variant={workflow ? "outline" : "default"}
            onClick={() => handleGenerate(workflow !== null)}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Generating...
              </>
            ) : workflow ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1" />
                Regenerate
              </>
            ) : (
              <>
                <ClipboardCheck className="h-4 w-4 mr-1" />
                Generate Workflow
              </>
            )}
          </Button>
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

      {/* No workflow state */}
      {!loading && !workflow && !error && (
        <Card>
          <CardContent className="py-8 text-center">
            <ClipboardCheck className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">
              No workflow generated yet. Click "Generate Workflow" to create an AI-powered inspection checklist.
            </p>
            <Button onClick={() => handleGenerate(false)} disabled={generating}>
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Generate Workflow
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Workflow content */}
      {workflow && !loading && (
        <>
          {/* Stale Workflow Alert */}
          {staleStatus?.shouldRegenerate && (
            <Card className="border-amber-300 bg-amber-50">
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                    <div>
                      <p className="font-medium text-amber-800">Workflow Update Recommended</p>
                      <p className="text-sm text-amber-700">{staleStatus.reason}</p>
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
                    Update Workflow
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
                <Progress value={progressPercent} className="h-2" />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {workflow.stats.estimatedMinutes} min estimated
                    </span>
                    {workflow.stats.actualMinutes > 0 && (
                      <span>{workflow.stats.actualMinutes} min actual</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {workflow.workflow.primaryPeril || 'Unknown Peril'}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowAddRoomDialog(true)}>
              <Home className="h-4 w-4 mr-1" />
              <span className="hidden xs:inline">Add</span> Room
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddStepDialog(true)}>
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden xs:inline">Add</span> Step
            </Button>
          </div>

          {/* Phase Navigation */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {workflow.workflow.workflowJson.phases.map((phase) => {
              const config = PHASE_CONFIG[phase.phase];
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
            <ScrollArea className="h-[calc(100vh-480px)] min-h-[200px] md:h-[calc(100vh-450px)]">
              <div className="space-y-3 pr-4">
                {(stepsByPhase[activePhase] || []).map((step) => {
                  const statusConfig = STATUS_CONFIG[step.status as InspectionStepStatus];
                  const typeIcon = STEP_TYPE_ICONS[step.stepType as InspectionStepType];
                  const isExpanded = expandedSteps.has(step.id);

                  return (
                    <Card key={step.id} className={cn("transition-all", statusConfig.bg)}>
                      <CardHeader
                        className="py-3 cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleStepExpanded(step.id)}
                      >
                        <div className="flex items-start gap-3">
                          {/* Status indicator */}
                          <div className={cn("mt-0.5", statusConfig.color)}>
                            {statusConfig.icon}
                          </div>

                          {/* Step info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-muted-foreground">{typeIcon}</span>
                              <CardTitle className="text-sm font-medium">
                                {step.title}
                              </CardTitle>
                              {step.required && (
                                <Badge variant="destructive" className="text-xs">Required</Badge>
                              )}
                              {step.roomName && (
                                <Badge variant="secondary" className="text-xs">
                                  <Home className="h-3 w-3 mr-1" />
                                  {step.roomName}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {step.estimatedMinutes} min
                              </span>
                              {step.assets && step.assets.length > 0 && (
                                <span className="flex items-center gap-1">
                                  <Camera className="h-3 w-3" />
                                  {step.assets.length} asset{step.assets.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Expand indicator */}
                          <div className="text-muted-foreground">
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </div>
                        </div>
                      </CardHeader>

                      {isExpanded && (
                        <CardContent className="pt-0 pb-3">
                          {/* Instructions */}
                          {step.instructions && (
                            <div className="mb-3 text-sm text-muted-foreground">
                              {step.instructions}
                            </div>
                          )}

                          {/* Required assets */}
                          {step.assets && step.assets.length > 0 && (
                            <div className="mb-3">
                              <h5 className="text-xs font-medium mb-1">Required Assets:</h5>
                              <div className="flex flex-wrap gap-1">
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

                          {/* Status actions */}
                          <div className="flex flex-wrap gap-2">
                            {step.status !== 'completed' && (
                              <Button
                                size="sm"
                                variant="default"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStepStatusChange(step, 'completed');
                                }}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Complete
                              </Button>
                            )}
                            {step.status === 'pending' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStepStatusChange(step, 'in_progress');
                                }}
                              >
                                <PlayCircle className="h-4 w-4 mr-1" />
                                Start
                              </Button>
                            )}
                            {step.status !== 'skipped' && step.status !== 'completed' && !step.required && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStepStatusChange(step, 'skipped');
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
                                  handleStepStatusChange(step, 'pending');
                                }}
                              >
                                Undo
                              </Button>
                            )}
                          </div>

                          {/* Notes */}
                          {step.notes && (
                            <div className="mt-3 p-2 bg-muted rounded text-sm">
                              <strong>Notes:</strong> {step.notes}
                            </div>
                          )}
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
                <Card className="cursor-pointer hover:bg-muted/50">
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
                                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                                ) : (
                                  <Circle className="h-3 w-3 text-muted-foreground" />
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
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-700">
                  <HelpCircle className="h-4 w-4" />
                  Open Questions
                  <Badge variant="secondary">{workflow.workflow.workflowJson.open_questions.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <ul className="space-y-2">
                  {workflow.workflow.workflowJson.open_questions.map((q, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <Badge
                        variant={q.priority === 'high' ? 'destructive' : q.priority === 'medium' ? 'secondary' : 'outline'}
                        className="text-xs mt-0.5"
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
