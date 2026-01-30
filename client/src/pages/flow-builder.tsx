/**
 * Flow Definition Builder
 *
 * UI for creating and editing flow definitions that define inspection movements
 * for specific peril types.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import Layout from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Trash2,
  Copy,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Save,
  X,
  Eye,
  Code,
  FileJson,
  Upload,
  Download,
  Check,
  AlertCircle,
  AlertTriangle,
  Play,
  Pause,
  GripVertical,
  Search,
  Filter,
  RefreshCw,
  ArrowLeft,
  Loader2,
  Settings,
  Layers,
  Target,
  Clock,
  Camera,
  Mic,
  Ruler,
  Workflow,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getFlowDefinitions,
  getFlowDefinition,
  createFlowDefinition,
  updateFlowDefinition,
  deleteFlowDefinition,
  duplicateFlowDefinition,
  toggleFlowDefinitionActive,
  validateFlowJson,
  getFlowTemplate,
  type FlowDefinitionSummary,
  type FlowDefinition,
  type FlowJson,
  type FlowJsonPhase,
  type FlowJsonMovement,
  type FlowJsonGate,
  type FlowJsonEvidenceRequirement,
  type FlowValidationResult,
} from "@/lib/api";

// ============================================================================
// CONSTANTS
// ============================================================================

const PERIL_TYPES = [
  { value: "water", label: "Water" },
  { value: "fire", label: "Fire" },
  { value: "wind", label: "Wind" },
  { value: "hail", label: "Hail" },
  { value: "wind_hail", label: "Wind/Hail" },
  { value: "flood", label: "Flood" },
  { value: "smoke", label: "Smoke" },
  { value: "mold", label: "Mold" },
  { value: "impact", label: "Impact" },
  { value: "other", label: "Other" },
];

const PROPERTY_TYPES = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
];

const CRITICALITY_LEVELS = [
  { value: "high", label: "High", color: "bg-red-500" },
  { value: "medium", label: "Medium", color: "bg-yellow-500" },
  { value: "low", label: "Low", color: "bg-green-500" },
];

const EVIDENCE_TYPES = [
  { value: "photo", label: "Photo", icon: Camera },
  { value: "voice_note", label: "Voice Note", icon: Mic },
  { value: "measurement", label: "Measurement", icon: Ruler },
];

const GATE_TYPES = [
  { value: "blocking", label: "Blocking" },
  { value: "advisory", label: "Advisory" },
];

const EVALUATION_TYPES = [
  { value: "simple", label: "Simple Rules" },
  { value: "ai", label: "AI Evaluation" },
];

const SIMPLE_CONDITIONS = [
  { value: "all_movements_complete", label: "All Movements Complete" },
  { value: "critical_evidence_present", label: "Critical Evidence Present" },
  { value: "required_movements_complete", label: "Required Movements Complete" },
];

// ============================================================================
// TYPES
// ============================================================================

type EditorTab = "editor" | "gates" | "json";

interface EditorState {
  flowJson: FlowJson;
  selectedPhaseId: string | null;
  selectedMovementId: string | null;
  isDirty: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(prefix: string, existingIds: Set<string>): string {
  let num = 1;
  let id = `${prefix}_${String(num).padStart(2, "0")}`;
  while (existingIds.has(id)) {
    num++;
    id = `${prefix}_${String(num).padStart(2, "0")}`;
  }
  return id;
}

function createEmptyMovement(phaseId: string, sequenceOrder: number, existingIds: Set<string>): FlowJsonMovement {
  return {
    id: generateId(phaseId, existingIds),
    name: "New Movement",
    description: "",
    sequence_order: sequenceOrder,
    is_required: true,
    criticality: "medium",
    guidance: {
      instruction: "",
      tts_text: "",
      tips: [],
    },
    evidence_requirements: [],
    estimated_minutes: 5,
  };
}

function createEmptyPhase(sequenceOrder: number, existingIds: Set<string>): FlowJsonPhase {
  const id = generateId("phase", existingIds);
  return {
    id,
    name: "New Phase",
    description: "",
    sequence_order: sequenceOrder,
    movements: [],
  };
}

function createEmptyGate(fromPhase: string, toPhase: string, existingIds: Set<string>): FlowJsonGate {
  return {
    id: generateId("gate", existingIds),
    name: "New Gate",
    from_phase: fromPhase,
    to_phase: toPhase,
    gate_type: "advisory",
    evaluation_criteria: {
      type: "simple",
      simple_rules: {
        condition: "all_movements_complete",
      },
    },
  };
}

function createEmptyEvidenceRequirement(): FlowJsonEvidenceRequirement {
  return {
    type: "photo",
    description: "",
    is_required: true,
    quantity_min: 1,
    quantity_max: 5,
  };
}

function getAllMovementIds(flowJson: FlowJson): Set<string> {
  const ids = new Set<string>();
  flowJson.phases.forEach((phase) => {
    phase.movements.forEach((movement) => {
      ids.add(movement.id);
    });
  });
  return ids;
}

function getAllPhaseIds(flowJson: FlowJson): Set<string> {
  return new Set(flowJson.phases.map((p) => p.id));
}

function getAllGateIds(flowJson: FlowJson): Set<string> {
  return new Set(flowJson.gates.map((g) => g.id));
}

// ============================================================================
// FLOW LIST VIEW COMPONENT
// ============================================================================

function FlowListView({
  onCreateNew,
  onEdit,
}: {
  onCreateNew: () => void;
  onEdit: (id: string) => void;
}) {
  const { toast } = useToast();
  const [flows, setFlows] = useState<FlowDefinitionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPeril, setFilterPeril] = useState<string>("all");
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateFlowId, setDuplicateFlowId] = useState<string | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  const loadFlows = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getFlowDefinitions();
      setFlows(data);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load flow definitions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadFlows();
  }, [loadFlows]);

  const filteredFlows = useMemo(() => {
    return flows.filter((flow) => {
      const matchesSearch =
        flow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        flow.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPeril = filterPeril === "all" || flow.perilType === filterPeril;
      return matchesSearch && matchesPeril;
    });
  }, [flows, searchTerm, filterPeril]);

  const handleToggleActive = async (flow: FlowDefinitionSummary) => {
    try {
      await toggleFlowDefinitionActive(flow.id);
      loadFlows();
      toast({
        title: flow.isActive ? "Deactivated" : "Activated",
        description: `${flow.name} has been ${flow.isActive ? "deactivated" : "activated"}.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to toggle status",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (flow: FlowDefinitionSummary) => {
    try {
      await deleteFlowDefinition(flow.id);
      loadFlows();
      toast({
        title: "Deleted",
        description: `${flow.name} has been deleted.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete flow",
        variant: "destructive",
      });
    }
  };

  const handleDuplicate = async () => {
    if (!duplicateFlowId || !duplicateName.trim()) return;
    try {
      setDuplicating(true);
      await duplicateFlowDefinition(duplicateFlowId, duplicateName.trim());
      loadFlows();
      setDuplicateDialogOpen(false);
      setDuplicateFlowId(null);
      setDuplicateName("");
      toast({
        title: "Duplicated",
        description: "Flow has been duplicated successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to duplicate flow",
        variant: "destructive",
      });
    } finally {
      setDuplicating(false);
    }
  };

  const openDuplicateDialog = (flow: FlowDefinitionSummary) => {
    setDuplicateFlowId(flow.id);
    setDuplicateName(`${flow.name} (Copy)`);
    setDuplicateDialogOpen(true);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredFlows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Workflow className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Flow Definitions</h3>
            <p className="text-muted-foreground mb-4">
              {flows.length === 0
                ? "Create your first flow definition to get started."
                : "No flows match your search criteria."}
            </p>
            {flows.length === 0 && (
              <Button onClick={onCreateNew}>
                <Plus className="h-4 w-4 mr-2" />
                Create Flow
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredFlows.map((flow) => (
            <Card
              key={flow.id}
              className="group hover:shadow-lg transition-all duration-200 cursor-pointer border-2 hover:border-primary/50 bg-gradient-to-br from-background to-muted/20"
              onClick={() => onEdit(flow.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg font-semibold mb-1 line-clamp-1 group-hover:text-primary transition-colors">
                      {flow.name}
                    </CardTitle>
                    {flow.description && (
                      <CardDescription className="line-clamp-2 text-xs">
                        {flow.description}
                      </CardDescription>
                    )}
                  </div>
                  <Badge 
                    variant={flow.isActive ? "default" : "secondary"}
                    className="shrink-0"
                  >
                    {flow.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                    {PERIL_TYPES.find((p) => p.value === flow.perilType)?.label || flow.perilType}
                  </Badge>
                  <Badge variant="outline" className="bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800">
                    {PROPERTY_TYPES.find((p) => p.value === flow.propertyType)?.label || flow.propertyType}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm pt-2 border-t">
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5" />
                      <span className="font-medium">{flow.phaseCount}</span>
                      <span className="text-xs">phases</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Target className="h-3.5 w-3.5" />
                      <span className="font-medium">{flow.movementCount}</span>
                      <span className="text-xs">movements</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">
                    Updated {new Date(flow.updatedAt).toLocaleDateString()}
                  </span>
                  <div onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(flow.id)}>
                          <Settings className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openDuplicateDialog(flow)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleActive(flow)}>
                          {flow.isActive ? (
                            <>
                              <Pause className="h-4 w-4 mr-2" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" />
                              Activate
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              className="text-destructive"
                              onSelect={(e) => e.preventDefault()}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Flow Definition?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete "{flow.name}". This action cannot be
                                undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(flow)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Duplicate Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Flow</DialogTitle>
            <DialogDescription>Enter a name for the duplicated flow.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="duplicate-name">Flow Name</Label>
            <Input
              id="duplicate-name"
              value={duplicateName}
              onChange={(e) => setDuplicateName(e.target.value)}
              placeholder="Enter flow name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDuplicate} disabled={duplicating || !duplicateName.trim()}>
              {duplicating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// PHASE LIST COMPONENT
// ============================================================================

function PhaseList({
  phases,
  selectedPhaseId,
  onSelectPhase,
  onAddPhase,
  onDeletePhase,
  onMovePhase,
}: {
  phases: FlowJsonPhase[];
  selectedPhaseId: string | null;
  onSelectPhase: (id: string) => void;
  onAddPhase: () => void;
  onDeletePhase: (id: string) => void;
  onMovePhase: (id: string, direction: "up" | "down") => void;
}) {
  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-background to-muted/10">
      <div className="p-4 border-b bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base">Phases</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{phases.length} total</p>
          </div>
          <Button variant="default" size="sm" onClick={onAddPhase} className="shadow-sm">
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Add Phase</span>
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {phases.map((phase, index) => (
            <div
              key={phase.id}
              className={`group relative p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                selectedPhaseId === phase.id
                  ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20"
                  : "bg-card hover:bg-muted/50 border border-border hover:border-primary/30 hover:shadow-sm"
              }`}
              onClick={() => onSelectPhase(phase.id)}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${selectedPhaseId === phase.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  <GripVertical className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`font-semibold text-sm ${selectedPhaseId === phase.id ? "text-primary-foreground" : ""}`}>
                      {phase.name}
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${
                        selectedPhaseId === phase.id 
                          ? "bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground" 
                          : "bg-muted"
                      }`}
                    >
                      {index + 1}
                    </Badge>
                  </div>
                  <div className={`text-xs flex items-center gap-2 ${
                    selectedPhaseId === phase.id ? "text-primary-foreground/70" : "text-muted-foreground"
                  }`}>
                    <Target className="h-3 w-3" />
                    <span>{phase.movements.length} movement{phase.movements.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 ${
                      selectedPhaseId === phase.id 
                        ? "hover:bg-primary-foreground/20 text-primary-foreground" 
                        : ""
                    }`}
                    disabled={index === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMovePhase(phase.id, "up");
                    }}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 ${
                      selectedPhaseId === phase.id 
                        ? "hover:bg-primary-foreground/20 text-primary-foreground" 
                        : ""
                    }`}
                    disabled={index === phases.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMovePhase(phase.id, "down");
                    }}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={`h-7 w-7 ${
                          selectedPhaseId === phase.id 
                            ? "hover:bg-destructive/20 text-primary-foreground" 
                            : "text-destructive hover:text-destructive"
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Phase?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete "{phase.name}" and all its movements.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDeletePhase(phase.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ============================================================================
// MOVEMENT LIST COMPONENT
// ============================================================================

function MovementList({
  movements,
  selectedMovementId,
  onSelectMovement,
  onAddMovement,
  onDeleteMovement,
  onMoveMovement,
}: {
  movements: FlowJsonMovement[];
  selectedMovementId: string | null;
  onSelectMovement: (id: string) => void;
  onAddMovement: () => void;
  onDeleteMovement: (id: string) => void;
  onMoveMovement: (id: string, direction: "up" | "down") => void;
}) {
  const getCriticalityColor = (criticality: string) => {
    switch (criticality) {
      case "high":
        return "bg-red-500";
      case "medium":
        return "bg-yellow-500";
      case "low":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-background to-muted/10">
      <div className="p-4 border-b bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base">Movements</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{movements.length} total</p>
          </div>
          <Button variant="default" size="sm" onClick={onAddMovement} className="shadow-sm">
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        {movements.length === 0 ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <Target className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium mb-1">No movements in this phase</p>
            <p className="text-xs text-muted-foreground mb-4">Add movements to define inspection steps</p>
            <Button variant="outline" size="sm" onClick={onAddMovement}>
              <Plus className="h-4 w-4 mr-2" />
              Add Movement
            </Button>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {movements.map((movement, index) => (
              <div
                key={movement.id}
                className={`group relative p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                  selectedMovementId === movement.id
                    ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20"
                    : "bg-card hover:bg-muted/50 border border-border hover:border-primary/30 hover:shadow-sm"
                }`}
                onClick={() => onSelectMovement(movement.id)}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${selectedMovementId === movement.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    <GripVertical className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                          movement.criticality === "high" ? "bg-red-500" :
                          movement.criticality === "medium" ? "bg-yellow-500" :
                          "bg-green-500"
                        }`}
                      />
                      <span className={`font-semibold text-sm truncate ${
                        selectedMovementId === movement.id ? "text-primary-foreground" : ""
                      }`}>
                        {movement.name}
                      </span>
                      <Badge 
                        variant="outline" 
                        className={`text-xs shrink-0 ${
                          selectedMovementId === movement.id 
                            ? "bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground" 
                            : "bg-muted"
                        }`}
                      >
                        {index + 1}
                      </Badge>
                    </div>
                    {movement.description && (
                      <p className={`text-xs mb-2 line-clamp-1 ${
                        selectedMovementId === movement.id 
                          ? "text-primary-foreground/80" 
                          : "text-muted-foreground"
                      }`}>
                        {movement.description}
                      </p>
                    )}
                    <div className={`flex items-center gap-3 text-xs ${
                      selectedMovementId === movement.id 
                        ? "text-primary-foreground/70" 
                        : "text-muted-foreground"
                    }`}>
                      <div className="flex items-center gap-1">
                        <Camera className="h-3 w-3" />
                        <span>{movement.evidence_requirements.length} evidence</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{movement.estimated_minutes}m</span>
                      </div>
                      {movement.is_required && (
                        <Badge variant="outline" className="text-xs h-4 px-1.5">
                          Required
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 ${
                        selectedMovementId === movement.id 
                          ? "hover:bg-primary-foreground/20 text-primary-foreground" 
                          : ""
                      }`}
                      disabled={index === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveMovement(movement.id, "up");
                      }}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 ${
                        selectedMovementId === movement.id 
                          ? "hover:bg-primary-foreground/20 text-primary-foreground" 
                          : ""
                      }`}
                      disabled={index === movements.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveMovement(movement.id, "down");
                      }}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${
                            selectedMovementId === movement.id 
                              ? "hover:bg-destructive/20 text-primary-foreground" 
                              : "text-destructive hover:text-destructive"
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Movement?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will delete "{movement.name}".
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onDeleteMovement(movement.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ============================================================================
// MOVEMENT EDITOR COMPONENT
// ============================================================================

function MovementEditor({
  movement,
  onUpdate,
}: {
  movement: FlowJsonMovement;
  onUpdate: (updates: Partial<FlowJsonMovement>) => void;
}) {
  const [newTip, setNewTip] = useState("");

  const handleAddTip = () => {
    if (newTip.trim()) {
      onUpdate({
        guidance: {
          ...movement.guidance,
          tips: [...movement.guidance.tips, newTip.trim()],
        },
      });
      setNewTip("");
    }
  };

  const handleRemoveTip = (index: number) => {
    const newTips = movement.guidance.tips.filter((_, i) => i !== index);
    onUpdate({
      guidance: {
        ...movement.guidance,
        tips: newTips,
      },
    });
  };

  const handleAddEvidence = () => {
    onUpdate({
      evidence_requirements: [...movement.evidence_requirements, createEmptyEvidenceRequirement()],
    });
  };

  const handleUpdateEvidence = (index: number, updates: Partial<FlowJsonEvidenceRequirement>) => {
    const newRequirements = [...movement.evidence_requirements];
    newRequirements[index] = { ...newRequirements[index], ...updates };
    onUpdate({ evidence_requirements: newRequirements });
  };

  const handleRemoveEvidence = (index: number) => {
    const newRequirements = movement.evidence_requirements.filter((_, i) => i !== index);
    onUpdate({ evidence_requirements: newRequirements });
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 md:p-6 space-y-6 bg-gradient-to-b from-background to-muted/5">
        {/* Basic Info */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-1 w-8 bg-gradient-to-r from-primary to-primary/50 rounded-full" />
            <h3 className="font-semibold text-base">Movement Details</h3>
          </div>
          <div className="space-y-3">
            <div>
              <Label htmlFor="movement-name">Name</Label>
              <Input
                id="movement-name"
                value={movement.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="movement-description">Description</Label>
              <Textarea
                id="movement-description"
                value={movement.description}
                onChange={(e) => onUpdate({ description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="movement-criticality">Criticality</Label>
                <Select
                  value={movement.criticality}
                  onValueChange={(value: "high" | "medium" | "low") =>
                    onUpdate({ criticality: value })
                  }
                >
                  <SelectTrigger id="movement-criticality">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRITICALITY_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${level.color}`} />
                          {level.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="movement-time">Est. Minutes</Label>
                <Input
                  id="movement-time"
                  type="number"
                  min={1}
                  value={movement.estimated_minutes}
                  onChange={(e) =>
                    onUpdate({ estimated_minutes: parseInt(e.target.value) || 1 })
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="movement-required"
                checked={movement.is_required}
                onCheckedChange={(checked) => onUpdate({ is_required: !!checked })}
              />
              <Label htmlFor="movement-required">Required Movement</Label>
            </div>
          </div>
        </div>

        <Separator />

        {/* Guidance */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-1 w-8 bg-gradient-to-r from-primary to-primary/50 rounded-full" />
            <h3 className="font-semibold text-base">Guidance & Instructions</h3>
          </div>
          <div className="space-y-4">
            <Card className="bg-gradient-to-br from-blue-50/50 to-blue-100/30 dark:from-blue-950/20 dark:to-blue-900/10 border-blue-200 dark:border-blue-800">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <Label htmlFor="guidance-instruction" className="text-sm font-medium">Instruction</Label>
                </div>
                <Textarea
                  id="guidance-instruction"
                  value={movement.guidance.instruction}
                  onChange={(e) =>
                    onUpdate({
                      guidance: { ...movement.guidance, instruction: e.target.value },
                    })
                  }
                  rows={3}
                  placeholder="Full instruction text displayed to the adjuster..."
                  className="bg-background/80 resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  This text appears in the UI when the adjuster reaches this movement
                </p>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-purple-50/50 to-purple-100/30 dark:from-purple-950/20 dark:to-purple-900/10 border-purple-200 dark:border-purple-800">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Mic className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <Label htmlFor="guidance-tts" className="text-sm font-medium">TTS Text (Voice)</Label>
                </div>
                <Textarea
                  id="guidance-tts"
                  value={movement.guidance.tts_text}
                  onChange={(e) =>
                    onUpdate({
                      guidance: { ...movement.guidance, tts_text: e.target.value },
                    })
                  }
                  rows={2}
                  placeholder="Optimized text for text-to-speech playback..."
                  className="bg-background/80 resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  This text is spoken during voice-guided inspections. Leave empty to use instruction text.
                </p>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-amber-50/50 to-amber-100/30 dark:from-amber-950/20 dark:to-amber-900/10 border-amber-200 dark:border-amber-800">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <Label className="text-sm font-medium">Tips & Best Practices</Label>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {movement.guidance.tips.length} tip{movement.guidance.tips.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {movement.guidance.tips.length > 0 ? (
                    movement.guidance.tips.map((tip, index) => (
                      <div 
                        key={index} 
                        className="flex items-start gap-2 p-2.5 rounded-md bg-background/80 border border-amber-200/50 dark:border-amber-800/50"
                      >
                        <div className="mt-0.5 shrink-0">
                          <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        </div>
                        <Input 
                          value={tip} 
                          readOnly 
                          className="flex-1 border-0 bg-transparent p-0 h-auto text-sm focus-visible:ring-0" 
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveTip(index)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No tips added yet</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Input
                      value={newTip}
                      onChange={(e) => setNewTip(e.target.value)}
                      placeholder="Add a helpful tip for adjusters..."
                      onKeyDown={(e) => e.key === "Enter" && handleAddTip()}
                      className="bg-background/80"
                    />
                    <Button 
                      variant="outline" 
                      onClick={handleAddTip}
                      className="shrink-0"
                      disabled={!newTip.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tips appear as helpful hints in the UI and are included in AI-generated guidance
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <Separator />

        {/* Evidence Requirements */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Evidence Requirements</h3>
            <Button variant="outline" size="sm" onClick={handleAddEvidence}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
          {movement.evidence_requirements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No evidence requirements defined.</p>
          ) : (
            <div className="space-y-4">
              {movement.evidence_requirements.map((req, index) => (
                <Card key={index}>
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {EVIDENCE_TYPES.find((t) => t.value === req.type)?.icon && (
                          <div className="h-6 w-6 rounded bg-muted flex items-center justify-center">
                            {(() => {
                              const IconComponent = EVIDENCE_TYPES.find(
                                (t) => t.value === req.type
                              )?.icon;
                              return IconComponent ? <IconComponent className="h-3 w-3" /> : null;
                            })()}
                          </div>
                        )}
                        <Select
                          value={req.type}
                          onValueChange={(value: "photo" | "voice_note" | "measurement") =>
                            handleUpdateEvidence(index, { type: value })
                          }
                        >
                          <SelectTrigger className="w-32 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EVIDENCE_TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleRemoveEvidence(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <div>
                      <Input
                        value={req.description}
                        onChange={(e) =>
                          handleUpdateEvidence(index, { description: e.target.value })
                        }
                        placeholder="Description..."
                        className="text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={req.is_required}
                          onCheckedChange={(checked) =>
                            handleUpdateEvidence(index, { is_required: !!checked })
                          }
                        />
                        <Label className="text-sm">Required</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">Qty:</Label>
                        <Input
                          type="number"
                          min={0}
                          value={req.quantity_min}
                          onChange={(e) =>
                            handleUpdateEvidence(index, {
                              quantity_min: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-16 h-8 text-sm"
                        />
                        <span className="text-sm">-</span>
                        <Input
                          type="number"
                          min={0}
                          value={req.quantity_max}
                          onChange={(e) =>
                            handleUpdateEvidence(index, {
                              quantity_max: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-16 h-8 text-sm"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}

// ============================================================================
// PHASE EDITOR COMPONENT
// ============================================================================

function PhaseEditor({
  phase,
  onUpdate,
}: {
  phase: FlowJsonPhase;
  onUpdate: (updates: Partial<FlowJsonPhase>) => void;
}) {
  return (
    <div className="p-4 md:p-6 space-y-4 border-b bg-gradient-to-br from-background to-muted/10">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-1 w-8 bg-gradient-to-r from-primary to-primary/50 rounded-full" />
        <h3 className="font-semibold text-base">Phase Settings</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="phase-name">Phase Name</Label>
          <Input
            id="phase-name"
            value={phase.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="phase-id">Phase ID</Label>
          <Input
            id="phase-id"
            value={phase.id}
            onChange={(e) => onUpdate({ id: e.target.value })}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="phase-description">Description</Label>
        <Textarea
          id="phase-description"
          value={phase.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          rows={2}
        />
      </div>
    </div>
  );
}

// ============================================================================
// GATES EDITOR COMPONENT
// ============================================================================

function GatesEditor({
  gates,
  phases,
  onUpdate,
}: {
  gates: FlowJsonGate[];
  phases: FlowJsonPhase[];
  onUpdate: (gates: FlowJsonGate[]) => void;
}) {
  const handleAddGate = () => {
    if (phases.length < 2) return;
    const existingIds = new Set(gates.map((g) => g.id));
    const newGate = createEmptyGate(phases[0].id, phases[1].id, existingIds);
    onUpdate([...gates, newGate]);
  };

  const handleUpdateGate = (index: number, updates: Partial<FlowJsonGate>) => {
    const newGates = [...gates];
    newGates[index] = { ...newGates[index], ...updates };
    onUpdate(newGates);
  };

  const handleRemoveGate = (index: number) => {
    const newGates = gates.filter((_, i) => i !== index);
    onUpdate(newGates);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Gates</h3>
          <p className="text-sm text-muted-foreground">
            Define checkpoints between phases
          </p>
        </div>
        <Button onClick={handleAddGate} disabled={phases.length < 2}>
          <Plus className="h-4 w-4 mr-2" />
          Add Gate
        </Button>
      </div>

      {gates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Gates Defined</h3>
            <p className="text-muted-foreground mb-4 text-center">
              Gates act as checkpoints between phases, ensuring requirements are met before
              proceeding.
            </p>
            {phases.length >= 2 && (
              <Button onClick={handleAddGate}>
                <Plus className="h-4 w-4 mr-2" />
                Add First Gate
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {gates.map((gate, index) => (
            <Card key={gate.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    <Input
                      value={gate.name}
                      onChange={(e) => handleUpdateGate(index, { name: e.target.value })}
                      className="font-semibold"
                    />
                  </CardTitle>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Gate?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete the gate "{gate.name}".
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRemoveGate(index)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>From Phase</Label>
                    <Select
                      value={gate.from_phase}
                      onValueChange={(value) => handleUpdateGate(index, { from_phase: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {phases.map((phase) => (
                          <SelectItem key={phase.id} value={phase.id}>
                            {phase.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>To Phase</Label>
                    <Select
                      value={gate.to_phase}
                      onValueChange={(value) => handleUpdateGate(index, { to_phase: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {phases.map((phase) => (
                          <SelectItem key={phase.id} value={phase.id}>
                            {phase.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Gate Type</Label>
                    <Select
                      value={gate.gate_type}
                      onValueChange={(value: "blocking" | "advisory") =>
                        handleUpdateGate(index, { gate_type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GATE_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Evaluation Type</Label>
                    <Select
                      value={gate.evaluation_criteria.type}
                      onValueChange={(value: "ai" | "simple") =>
                        handleUpdateGate(index, {
                          evaluation_criteria: {
                            ...gate.evaluation_criteria,
                            type: value,
                          },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EVALUATION_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {gate.evaluation_criteria.type === "ai" && (
                  <div>
                    <Label>AI Prompt Key</Label>
                    <Input
                      value={gate.evaluation_criteria.ai_prompt_key || ""}
                      onChange={(e) =>
                        handleUpdateGate(index, {
                          evaluation_criteria: {
                            ...gate.evaluation_criteria,
                            ai_prompt_key: e.target.value,
                          },
                        })
                      }
                      placeholder="flow.gate_evaluation"
                    />
                  </div>
                )}

                {gate.evaluation_criteria.type === "simple" && (
                  <div>
                    <Label>Condition</Label>
                    <Select
                      value={gate.evaluation_criteria.simple_rules?.condition || ""}
                      onValueChange={(value) =>
                        handleUpdateGate(index, {
                          evaluation_criteria: {
                            ...gate.evaluation_criteria,
                            simple_rules: {
                              ...gate.evaluation_criteria.simple_rules,
                              condition: value,
                            },
                          },
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SIMPLE_CONDITIONS.map((cond) => (
                          <SelectItem key={cond.value} value={cond.value}>
                            {cond.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// JSON EDITOR COMPONENT
// ============================================================================

function JsonEditor({
  flowJson,
  onImport,
  validation,
}: {
  flowJson: FlowJson;
  onImport: (json: FlowJson) => void;
  validation: FlowValidationResult | null;
}) {
  const [jsonText, setJsonText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    setJsonText(JSON.stringify(flowJson, null, 2));
  }, [flowJson]);

  const handleImport = () => {
    try {
      const parsed = JSON.parse(jsonText);
      onImport(parsed);
      setImportError(null);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(flowJson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flow-${flowJson.metadata.name.toLowerCase().replace(/\s+/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-3 border-b flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleImport}>
          <Upload className="h-4 w-4 mr-2" />
          Import JSON
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export JSON
        </Button>
        {importError && (
          <div className="flex items-center gap-2 text-destructive text-sm ml-2">
            <AlertCircle className="h-4 w-4" />
            {importError}
          </div>
        )}
      </div>

      {/* Validation Messages */}
      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="p-3 border-b space-y-2">
          {validation.errors.map((error, i) => (
            <div key={`error-${i}`} className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <span>
                <strong>{error.path}:</strong> {error.message}
              </span>
            </div>
          ))}
          {validation.warnings.map((warning, i) => (
            <div key={`warning-${i}`} className="flex items-start gap-2 text-sm text-yellow-600">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <span>
                <strong>{warning.path}:</strong> {warning.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* JSON Editor */}
      <div className="flex-1 relative">
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          className="absolute inset-0 w-full h-full p-4 font-mono text-sm resize-none focus:outline-none border-0 bg-muted/30"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

// ============================================================================
// FLOW EDITOR VIEW COMPONENT
// ============================================================================

function FlowEditorView({
  flowId,
  onBack,
}: {
  flowId: string | null;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(!!flowId);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTab>("editor");
  const [validation, setValidation] = useState<FlowValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  // Flow metadata
  const [flowName, setFlowName] = useState("New Flow");
  const [flowDescription, setFlowDescription] = useState("");
  const [perilType, setPerilType] = useState("water");
  const [propertyType, setPropertyType] = useState("residential");
  const [isActive, setIsActive] = useState(true);

  // Editor state
  const [flowJson, setFlowJson] = useState<FlowJson>({
    schema_version: "1.0",
    metadata: {
      name: "New Flow",
      description: "",
      estimated_duration_minutes: 60,
      primary_peril: "water",
      secondary_perils: [],
    },
    phases: [
      {
        id: "arrival",
        name: "Arrival",
        description: "Initial property documentation",
        sequence_order: 1,
        movements: [],
      },
    ],
    gates: [],
  });
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>("arrival");
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Load flow definition if editing
  useEffect(() => {
    async function loadFlow() {
      if (!flowId) {
        // Load template for new flow
        try {
          const template = await getFlowTemplate();
          setFlowJson(template);
          setFlowName(template.metadata.name);
          setFlowDescription(template.metadata.description);
          setPerilType(template.metadata.primary_peril || "water");
          setSelectedPhaseId(template.phases[0]?.id || null);
        } catch (error) {
          console.error("Failed to load template:", error);
        }
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const flow = await getFlowDefinition(flowId);
        
        // Validate flow structure before setting state
        if (!flow.flowJson) {
          throw new Error('Flow definition is missing flowJson data');
        }
        
        if (!Array.isArray(flow.flowJson.phases)) {
          throw new Error('Flow definition has invalid phases structure');
        }
        
        if (!Array.isArray(flow.flowJson.gates)) {
          throw new Error('Flow definition has invalid gates structure');
        }
        
        setFlowName(flow.name);
        setFlowDescription(flow.description || "");
        setPerilType(flow.perilType);
        setPropertyType(flow.propertyType);
        setIsActive(flow.isActive);
        setFlowJson(flow.flowJson);
        setSelectedPhaseId(flow.flowJson.phases[0]?.id || null);
      } catch (error) {
        console.error('[FlowBuilder] Error loading flow:', error);
        toast({
          title: "Error Loading Flow",
          description: error instanceof Error ? error.message : "Failed to load flow definition. The flow may be corrupted.",
          variant: "destructive",
        });
        onBack();
      } finally {
        setLoading(false);
      }
    }

    loadFlow();
  }, [flowId, toast, onBack]);

  // Mark as dirty when changes are made
  const updateFlowJson = useCallback((updates: Partial<FlowJson>) => {
    setFlowJson((prev) => ({ ...prev, ...updates }));
    setIsDirty(true);
  }, []);

  // Get selected phase and movement
  const selectedPhase = useMemo(() => {
    return flowJson.phases.find((p) => p.id === selectedPhaseId) || null;
  }, [flowJson.phases, selectedPhaseId]);

  const selectedMovement = useMemo(() => {
    if (!selectedPhase || !selectedMovementId) return null;
    return selectedPhase.movements.find((m) => m.id === selectedMovementId) || null;
  }, [selectedPhase, selectedMovementId]);

  // Phase operations
  const handleAddPhase = () => {
    const existingIds = getAllPhaseIds(flowJson);
    const newPhase = createEmptyPhase(flowJson.phases.length + 1, existingIds);
    updateFlowJson({
      phases: [...flowJson.phases, newPhase],
    });
    setSelectedPhaseId(newPhase.id);
    setSelectedMovementId(null);
  };

  const handleDeletePhase = (phaseId: string) => {
    const newPhases = flowJson.phases
      .filter((p) => p.id !== phaseId)
      .map((p, index) => ({ ...p, sequence_order: index + 1 }));
    updateFlowJson({ phases: newPhases });
    if (selectedPhaseId === phaseId) {
      setSelectedPhaseId(newPhases[0]?.id || null);
      setSelectedMovementId(null);
    }
  };

  const handleMovePhase = (phaseId: string, direction: "up" | "down") => {
    const index = flowJson.phases.findIndex((p) => p.id === phaseId);
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === flowJson.phases.length - 1)
    ) {
      return;
    }

    const newPhases = [...flowJson.phases];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newPhases[index], newPhases[targetIndex]] = [newPhases[targetIndex], newPhases[index]];

    // Update sequence orders
    newPhases.forEach((p, i) => {
      p.sequence_order = i + 1;
    });

    updateFlowJson({ phases: newPhases });
  };

  const handleUpdatePhase = (updates: Partial<FlowJsonPhase>) => {
    if (!selectedPhaseId) return;
    const newPhases = flowJson.phases.map((p) =>
      p.id === selectedPhaseId ? { ...p, ...updates } : p
    );
    updateFlowJson({ phases: newPhases });
  };

  // Movement operations
  const handleAddMovement = () => {
    if (!selectedPhase) return;
    const existingIds = getAllMovementIds(flowJson);
    const newMovement = createEmptyMovement(
      selectedPhase.id,
      selectedPhase.movements.length + 1,
      existingIds
    );
    const newPhases = flowJson.phases.map((p) =>
      p.id === selectedPhaseId
        ? { ...p, movements: [...p.movements, newMovement] }
        : p
    );
    updateFlowJson({ phases: newPhases });
    setSelectedMovementId(newMovement.id);
  };

  const handleDeleteMovement = (movementId: string) => {
    if (!selectedPhase) return;
    const newMovements = selectedPhase.movements
      .filter((m) => m.id !== movementId)
      .map((m, index) => ({ ...m, sequence_order: index + 1 }));
    const newPhases = flowJson.phases.map((p) =>
      p.id === selectedPhaseId ? { ...p, movements: newMovements } : p
    );
    updateFlowJson({ phases: newPhases });
    if (selectedMovementId === movementId) {
      setSelectedMovementId(newMovements[0]?.id || null);
    }
  };

  const handleMoveMovement = (movementId: string, direction: "up" | "down") => {
    if (!selectedPhase) return;
    const index = selectedPhase.movements.findIndex((m) => m.id === movementId);
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === selectedPhase.movements.length - 1)
    ) {
      return;
    }

    const newMovements = [...selectedPhase.movements];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newMovements[index], newMovements[targetIndex]] = [
      newMovements[targetIndex],
      newMovements[index],
    ];

    // Update sequence orders
    newMovements.forEach((m, i) => {
      m.sequence_order = i + 1;
    });

    const newPhases = flowJson.phases.map((p) =>
      p.id === selectedPhaseId ? { ...p, movements: newMovements } : p
    );
    updateFlowJson({ phases: newPhases });
  };

  const handleUpdateMovement = (updates: Partial<FlowJsonMovement>) => {
    if (!selectedPhase || !selectedMovementId) return;
    const newMovements = selectedPhase.movements.map((m) =>
      m.id === selectedMovementId ? { ...m, ...updates } : m
    );
    const newPhases = flowJson.phases.map((p) =>
      p.id === selectedPhaseId ? { ...p, movements: newMovements } : p
    );
    updateFlowJson({ phases: newPhases });
  };

  // Gates operations
  const handleUpdateGates = (gates: FlowJsonGate[]) => {
    updateFlowJson({ gates });
  };

  // Save operations
  const handleSave = async () => {
    try {
      setSaving(true);

      // Update metadata in flowJson
      const updatedFlowJson: FlowJson = {
        ...flowJson,
        metadata: {
          ...flowJson.metadata,
          name: flowName,
          description: flowDescription,
          primary_peril: perilType,
        },
      };

      // Calculate estimated duration
      let totalMinutes = 0;
      updatedFlowJson.phases.forEach((phase) => {
        phase.movements.forEach((movement) => {
          totalMinutes += movement.estimated_minutes || 0;
        });
      });
      updatedFlowJson.metadata.estimated_duration_minutes = totalMinutes;

      if (flowId) {
        // Update existing
        await updateFlowDefinition(flowId, {
          name: flowName,
          description: flowDescription,
          perilType,
          propertyType,
          flowJson: updatedFlowJson,
          isActive,
        });
      } else {
        // Create new
        const created = await createFlowDefinition({
          name: flowName,
          description: flowDescription,
          perilType,
          propertyType,
          flowJson: updatedFlowJson,
          isActive,
        });
        setLocation(`/flow-builder/${created.id}`);
      }

      setFlowJson(updatedFlowJson);
      setIsDirty(false);
      toast({
        title: "Saved",
        description: "Flow definition saved successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save flow",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    try {
      setValidating(true);
      const result = await validateFlowJson(flowJson);
      setValidation(result);
      if (result.isValid) {
        toast({
          title: "Valid",
          description: "Flow JSON is valid.",
        });
      } else {
        toast({
          title: "Invalid",
          description: `${result.errors.length} errors found.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Validation failed",
        variant: "destructive",
      });
    } finally {
      setValidating(false);
    }
  };

  const handleImportJson = (json: FlowJson) => {
    setFlowJson(json);
    setFlowName(json.metadata.name);
    setFlowDescription(json.metadata.description);
    setPerilType(json.metadata.primary_peril || perilType);
    setSelectedPhaseId(json.phases[0]?.id || null);
    setSelectedMovementId(null);
    setIsDirty(true);
    toast({
      title: "Imported",
      description: "JSON imported successfully. Remember to save your changes.",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-background via-background to-muted/10">
      {/* Top Toolbar */}
      <div className="p-3 md:p-4 border-b bg-gradient-to-r from-background via-background to-primary/5 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Separator orientation="vertical" className="h-6 hidden lg:block" />
            <div className="flex-1 min-w-0">
              <Input
                value={flowName}
                onChange={(e) => {
                  setFlowName(e.target.value);
                  setIsDirty(true);
                }}
                className="font-semibold text-base md:text-lg border-0 bg-transparent p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="Flow name..."
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:gap-3 flex-1 lg:justify-end">
            <Select value={perilType} onValueChange={(v) => { setPerilType(v); setIsDirty(true); }}>
              <SelectTrigger className="w-full sm:w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIL_TYPES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={propertyType} onValueChange={(v) => { setPropertyType(v); setIsDirty(true); }}>
              <SelectTrigger className="w-full sm:w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 px-2">
              <Switch
                checked={isActive}
                onCheckedChange={(v) => { setIsActive(v); setIsDirty(true); }}
              />
              <Label className="text-sm whitespace-nowrap">Active</Label>
            </div>
            <Separator orientation="vertical" className="h-6 hidden lg:block" />
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleValidate} disabled={validating} size="sm" className="h-9">
                {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                <span className="ml-2 hidden sm:inline">Validate</span>
              </Button>
              <Button onClick={handleSave} disabled={saving} size="sm" className="h-9 shadow-sm">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="ml-2 hidden sm:inline">Save</span>
              </Button>
            </div>
          </div>
        </div>
        {isDirty && (
          <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            <span>You have unsaved changes</span>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Sidebar - Phases */}
        <div className="w-full lg:w-64 xl:w-72 border-r flex flex-col bg-background/50 shrink-0">
          <PhaseList
            phases={flowJson.phases}
            selectedPhaseId={selectedPhaseId}
            onSelectPhase={(id) => {
              setSelectedPhaseId(id);
              setSelectedMovementId(null);
            }}
            onAddPhase={handleAddPhase}
            onDeletePhase={handleDeletePhase}
            onMovePhase={handleMovePhase}
          />
        </div>

        {/* Middle - Movements */}
        {selectedPhase && (
          <div className="w-full lg:w-64 xl:w-72 border-r flex flex-col bg-background/30 shrink-0">
            <PhaseEditor phase={selectedPhase} onUpdate={handleUpdatePhase} />
            <div className="flex-1 min-h-0">
              <MovementList
                movements={selectedPhase.movements}
                selectedMovementId={selectedMovementId}
                onSelectMovement={setSelectedMovementId}
                onAddMovement={handleAddMovement}
                onDeleteMovement={handleDeleteMovement}
                onMoveMovement={handleMoveMovement}
              />
            </div>
          </div>
        )}

        {/* Right - Editor */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EditorTab)} className="flex-1 flex flex-col">
            <div className="border-b bg-background/80 backdrop-blur-sm px-4 pt-4">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="editor" className="flex-1 sm:flex-none">
                  <Settings className="h-4 w-4 mr-2" />
                  Editor
                </TabsTrigger>
                <TabsTrigger value="gates" className="flex-1 sm:flex-none">
                  <Layers className="h-4 w-4 mr-2" />
                  Gates ({flowJson.gates.length})
                </TabsTrigger>
                <TabsTrigger value="json" className="flex-1 sm:flex-none">
                  <Code className="h-4 w-4 mr-2" />
                  JSON
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="editor" className="flex-1 overflow-hidden mt-0 p-0">
              {selectedMovement ? (
                <MovementEditor movement={selectedMovement} onUpdate={handleUpdateMovement} />
              ) : selectedPhase ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Target className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Select a Movement</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Choose a movement from the middle panel to edit its details, guidance, and evidence requirements.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Workflow className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Select a Phase or Movement</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Choose a phase from the left sidebar to view its movements, or select a movement to edit its details.
                  </p>
                </div>
              )}
            </TabsContent>
            <TabsContent value="gates" className="flex-1 overflow-hidden mt-0 p-0">
              <GatesEditor
                gates={flowJson.gates}
                phases={flowJson.phases}
                onUpdate={handleUpdateGates}
              />
            </TabsContent>
            <TabsContent value="json" className="flex-1 overflow-hidden mt-0 p-0">
              <JsonEditor
                flowJson={flowJson}
                onImport={handleImportJson}
                validation={validation}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Dirty indicator */}
      {isDirty && (
        <div className="absolute bottom-4 right-4 bg-yellow-100 border border-yellow-300 text-yellow-800 px-3 py-1 rounded-full text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Unsaved changes
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN FLOW BUILDER COMPONENT
// ============================================================================

export default function FlowBuilder() {
  const [, params] = useRoute("/flow-builder/:id");
  const [, setLocation] = useLocation();

  // Determine if we're in list view or editor view
  const flowId = params?.id;
  const isEditing = flowId !== undefined;

  const handleCreateNew = () => {
    setLocation("/flow-builder/new");
  };

  const handleEdit = (id: string) => {
    setLocation(`/flow-builder/${id}`);
  };

  const handleBack = () => {
    setLocation("/flow-builder");
  };

  return (
    <Layout>
      <div className="h-full flex flex-col bg-gradient-to-br from-background via-background to-muted/20">
        {isEditing ? (
          <FlowEditorView
            flowId={flowId === "new" ? null : flowId}
            onBack={handleBack}
          />
        ) : (
          <FlowListView onCreateNew={handleCreateNew} onEdit={handleEdit} />
        )}
      </div>
    </Layout>
  );
}
