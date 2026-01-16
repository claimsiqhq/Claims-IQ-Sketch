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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Flow Definitions</h1>
          <p className="text-muted-foreground">
            Define inspection workflows for different peril types
          </p>
        </div>
        <Button onClick={onCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Flow
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search flows..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterPeril} onValueChange={setFilterPeril}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by peril" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Perils</SelectItem>
            {PERIL_TYPES.map((peril) => (
              <SelectItem key={peril.value} value={peril.value}>
                {peril.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={loadFlows}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

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
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Peril</th>
                <th className="text-left p-3 font-medium">Property</th>
                <th className="text-center p-3 font-medium">Phases</th>
                <th className="text-center p-3 font-medium">Movements</th>
                <th className="text-center p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Updated</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFlows.map((flow) => (
                <tr
                  key={flow.id}
                  className="border-t hover:bg-muted/30 cursor-pointer"
                  onClick={() => onEdit(flow.id)}
                >
                  <td className="p-3">
                    <div className="font-medium">{flow.name}</div>
                    {flow.description && (
                      <div className="text-sm text-muted-foreground truncate max-w-xs">
                        {flow.description}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline">
                      {PERIL_TYPES.find((p) => p.value === flow.perilType)?.label || flow.perilType}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">
                      {PROPERTY_TYPES.find((p) => p.value === flow.propertyType)?.label ||
                        flow.propertyType}
                    </Badge>
                  </td>
                  <td className="p-3 text-center">{flow.phaseCount}</td>
                  <td className="p-3 text-center">{flow.movementCount}</td>
                  <td className="p-3 text-center">
                    <Badge variant={flow.isActive ? "default" : "secondary"}>
                      {flow.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {new Date(flow.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Phases</h3>
          <Button variant="ghost" size="icon" onClick={onAddPhase}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {phases.map((phase, index) => (
            <div
              key={phase.id}
              className={`group p-2 rounded-md cursor-pointer flex items-center gap-2 ${
                selectedPhaseId === phase.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
              onClick={() => onSelectPhase(phase.id)}
            >
              <GripVertical className="h-4 w-4 opacity-50" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{phase.name}</div>
                <div
                  className={`text-xs ${
                    selectedPhaseId === phase.id ? "text-primary-foreground/70" : "text-muted-foreground"
                  }`}
                >
                  {phase.movements.length} movements
                </div>
              </div>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={index === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMovePhase(phase.id, "up");
                  }}
                >
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={index === phases.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMovePhase(phase.id, "down");
                  }}
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="h-3 w-3" />
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
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Movements</h3>
          <Button variant="ghost" size="icon" onClick={onAddMovement}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        {movements.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No movements in this phase</p>
            <Button variant="link" size="sm" onClick={onAddMovement}>
              Add Movement
            </Button>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {movements.map((movement, index) => (
              <div
                key={movement.id}
                className={`group p-2 rounded-md cursor-pointer ${
                  selectedMovementId === movement.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
                onClick={() => onSelectMovement(movement.id)}
              >
                <div className="flex items-start gap-2">
                  <GripVertical className="h-4 w-4 mt-1 opacity-50" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${getCriticalityColor(movement.criticality)}`}
                      />
                      <span className="font-medium text-sm truncate">{movement.name}</span>
                    </div>
                    <div
                      className={`text-xs flex items-center gap-2 mt-1 ${
                        selectedMovementId === movement.id
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        <Camera className="h-3 w-3" />
                        {movement.evidence_requirements.length}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {movement.estimated_minutes}m
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveMovement(movement.id, "up");
                      }}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={index === movements.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        onMoveMovement(movement.id, "down");
                      }}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="h-3 w-3" />
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
      <div className="p-4 space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <h3 className="font-semibold">Movement Details</h3>
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
          <h3 className="font-semibold">Guidance</h3>
          <div className="space-y-3">
            <div>
              <Label htmlFor="guidance-instruction">Instruction</Label>
              <Textarea
                id="guidance-instruction"
                value={movement.guidance.instruction}
                onChange={(e) =>
                  onUpdate({
                    guidance: { ...movement.guidance, instruction: e.target.value },
                  })
                }
                rows={3}
                placeholder="Full instruction text for the adjuster..."
              />
            </div>
            <div>
              <Label htmlFor="guidance-tts">TTS Text</Label>
              <Textarea
                id="guidance-tts"
                value={movement.guidance.tts_text}
                onChange={(e) =>
                  onUpdate({
                    guidance: { ...movement.guidance, tts_text: e.target.value },
                  })
                }
                rows={2}
                placeholder="Optimized text for voice reading..."
              />
            </div>
            <div>
              <Label>Tips</Label>
              <div className="space-y-2 mt-1">
                {movement.guidance.tips.map((tip, index) => (
                  <div key={index} className="flex gap-2">
                    <Input value={tip} readOnly className="flex-1" />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveTip(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={newTip}
                    onChange={(e) => setNewTip(e.target.value)}
                    placeholder="Add a tip..."
                    onKeyDown={(e) => e.key === "Enter" && handleAddTip()}
                  />
                  <Button variant="outline" onClick={handleAddTip}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
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
    <div className="p-4 space-y-4 border-b">
      <h3 className="font-semibold">Phase Settings</h3>
      <div className="grid grid-cols-2 gap-3">
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
        setFlowName(flow.name);
        setFlowDescription(flow.description || "");
        setPerilType(flow.perilType);
        setPropertyType(flow.propertyType);
        setIsActive(flow.isActive);
        setFlowJson(flow.flowJson);
        setSelectedPhaseId(flow.flowJson.phases[0]?.id || null);
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load flow",
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
    <div className="flex flex-col h-full">
      {/* Top Toolbar */}
      <div className="p-3 border-b flex items-center gap-4 bg-white">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex-1 flex items-center gap-4">
          <div className="w-64">
            <Input
              value={flowName}
              onChange={(e) => {
                setFlowName(e.target.value);
                setIsDirty(true);
              }}
              className="font-semibold"
              placeholder="Flow name..."
            />
          </div>
          <Select value={perilType} onValueChange={(v) => { setPerilType(v); setIsDirty(true); }}>
            <SelectTrigger className="w-32">
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
            <SelectTrigger className="w-36">
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
          <div className="flex items-center gap-2">
            <Switch
              checked={isActive}
              onCheckedChange={(v) => { setIsActive(v); setIsDirty(true); }}
            />
            <Label>Active</Label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleValidate} disabled={validating}>
            {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            <span className="ml-2">Validate</span>
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="ml-2">Save</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EditorTab)} className="flex-1 flex flex-col">
        <div className="border-b px-3">
          <TabsList className="bg-transparent">
            <TabsTrigger value="editor" className="data-[state=active]:bg-muted">
              <Layers className="h-4 w-4 mr-2" />
              Editor
            </TabsTrigger>
            <TabsTrigger value="gates" className="data-[state=active]:bg-muted">
              <Target className="h-4 w-4 mr-2" />
              Gates ({flowJson.gates.length})
            </TabsTrigger>
            <TabsTrigger value="json" className="data-[state=active]:bg-muted">
              <Code className="h-4 w-4 mr-2" />
              JSON
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="editor" className="flex-1 m-0">
          <div className="flex h-full">
            {/* Left Sidebar: Phases */}
            <div className="w-56 border-r bg-white">
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

            {/* Center: Movements */}
            <div className="w-72 border-r bg-white flex flex-col">
              {selectedPhase && (
                <>
                  <PhaseEditor phase={selectedPhase} onUpdate={handleUpdatePhase} />
                  <div className="flex-1">
                    <MovementList
                      movements={selectedPhase.movements}
                      selectedMovementId={selectedMovementId}
                      onSelectMovement={setSelectedMovementId}
                      onAddMovement={handleAddMovement}
                      onDeleteMovement={handleDeleteMovement}
                      onMoveMovement={handleMoveMovement}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Right: Movement Editor */}
            <div className="flex-1 bg-white">
              {selectedMovement ? (
                <MovementEditor
                  movement={selectedMovement}
                  onUpdate={handleUpdateMovement}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select a movement to edit</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="gates" className="flex-1 m-0 overflow-auto">
          <GatesEditor
            gates={flowJson.gates}
            phases={flowJson.phases}
            onUpdate={handleUpdateGates}
          />
        </TabsContent>

        <TabsContent value="json" className="flex-1 m-0">
          <JsonEditor
            flowJson={flowJson}
            onImport={handleImportJson}
            validation={validation}
          />
        </TabsContent>
      </Tabs>

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
      <div className="h-full">
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
