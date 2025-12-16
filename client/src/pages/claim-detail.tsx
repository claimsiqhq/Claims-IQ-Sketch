import { useEffect, useState, useCallback, useMemo } from "react";
import { useRoute } from "wouter";
import { useStore } from "@/lib/store";
import Layout from "@/components/layout";
import { useDeviceMode } from "@/contexts/DeviceModeContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Home,
  PenTool,
  ClipboardList,
  FileText,
  Image as ImageIcon,
  Save,
  Plus,
  Trash2,
  Camera,
  Move,
  X,
  Mic,
  Loader2,
  Settings2,
  Sparkles,
  Wand2,
  Upload,
  Download,
  File,
  Eye,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Building2,
  Layers,
  Square,
  Ruler,
  Calculator,
  DollarSign,
  LayoutGrid,
  Check,
  Play,
  Lock,
  FileDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft
} from "lucide-react";
import {
  useEstimateBuilder,
  DIMENSION_LABELS,
  ZONE_TYPE_LABELS,
  ZONE_STATUS_LABELS,
  getDimensionsForZoneType,
  type ZoneWithChildren,
  type StructureWithChildren,
  type AreaWithChildren,
  type CreateZoneInput,
  type CreateMissingWallInput,
  type AddLineItemInput,
} from "@/hooks/useEstimateBuilder";
import { Link, useLocation } from "wouter";
import {
  getClaim,
  getClaimDocuments,
  getClaimEndorsements,
  uploadDocument,
  getDocumentDownloadUrl,
  deleteClaim,
  submitEstimate,
  downloadEstimatePdf,
  getEstimateLockStatus,
  type Claim,
  type Document,
  type Endorsement,
  type SubmissionResult,
  type ValidationIssue,
  type EstimateLockStatus,
} from "@/lib/api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

import SketchCanvas from "@/components/sketch-canvas";
import DamageZoneModal from "@/components/damage-zone-modal";
import OpeningModal from "@/components/opening-modal";
import LineItemPicker from "@/components/line-item-picker";
import DocumentViewer from "@/components/document-viewer";
import { VoiceScopeController } from "@/features/voice-scope";
import { Room, RoomOpening } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DoorOpen } from "lucide-react";

export default function ClaimDetail() {
  const [, params] = useRoute("/claim/:id");
  const [, setLocation] = useLocation();
  const { layoutMode, isMobile, isTablet } = useDeviceMode();
  const isMobileLayout = layoutMode === "mobile";
  const {
    activeClaim: claim,
    setActiveClaim,
    ensureClaim,
    addRoom,
    updateRoom,
    deleteRoom,
    addDamageZone,
    addLineItem,
    updateLineItem,
    deleteLineItem,
    regions,
    carriers,
    estimateSettings,
    calculatedEstimate,
    isCalculating,
    estimateError,
    loadRegionsAndCarriers,
    setEstimateSettings,
    calculateEstimate,
  } = useStore();

  // API Claim Data
  const [apiClaim, setApiClaim] = useState<Claim | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
  const [loadingApiData, setLoadingApiData] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [isDamageModalOpen, setIsDamageModalOpen] = useState(false);
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [editingOpening, setEditingOpening] = useState<RoomOpening | undefined>(undefined);
  const [isLineItemPickerOpen, setIsLineItemPickerOpen] = useState(false);
  const [isEstimateSettingsOpen, setIsEstimateSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("info");
  const [isVoiceScopeOpen, setIsVoiceScopeOpen] = useState(false);
  const [isGeneratingAISuggestions, setIsGeneratingAISuggestions] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Array<{
    lineItemCode: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice?: number;
    reasoning: string;
    priority: string;
  }> | null>(null);

  // Xactimate hierarchy state
  const [isAddZoneDialogOpen, setIsAddZoneDialogOpen] = useState(false);
  const [isAddMissingWallDialogOpen, setIsAddMissingWallDialogOpen] = useState(false);
  const [expandedStructures, setExpandedStructures] = useState<Set<string>>(new Set());
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [selectedZoneForLineItem, setSelectedZoneForLineItem] = useState<string | null>(null);
  const [newZoneData, setNewZoneData] = useState<Partial<CreateZoneInput>>({});
  const [newMissingWallData, setNewMissingWallData] = useState<Partial<CreateMissingWallInput>>({});
  const [selectedAreaForNewZone, setSelectedAreaForNewZone] = useState<string | null>(null);

  // Delete claim state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Estimate finalization state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [estimateLockStatus, setEstimateLockStatus] = useState<EstimateLockStatus | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationIssue[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<ValidationIssue[]>([]);
  const [showValidationDialog, setShowValidationDialog] = useState(false);

  // Derived lock state
  const isEstimateLocked = estimateLockStatus?.isLocked || false;

  // Initialize estimate builder hook with claim id as estimate id
  const estimateBuilder = useEstimateBuilder(params?.id || "");

  // Derive claimId for use throughout component
  const claimId = apiClaim?.id || params?.id || "";

  // Cleanup: clear active claim when leaving the page
  useEffect(() => {
    return () => setActiveClaim(null);
  }, [setActiveClaim]);

  // Load regions and carriers on mount
  useEffect(() => {
    loadRegionsAndCarriers();
  }, [loadRegionsAndCarriers]);

  // Load claim data from API
  const loadApiData = useCallback(async () => {
    if (!params?.id) return;

    setLoadingApiData(true);
    setApiError(null);

    try {
      const [claimData, docsData, endorsementsData] = await Promise.all([
        getClaim(params.id),
        getClaimDocuments(params.id),
        getClaimEndorsements(params.id).catch(() => []) // Don't fail if endorsements fail
      ]);
      setApiClaim(claimData);
      setDocuments(docsData);
      setEndorsements(endorsementsData);
      // Ensure the claim exists in the store for sketch operations
      ensureClaim(params.id, claimData);
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setLoadingApiData(false);
    }
  }, [params?.id, ensureClaim]);

  useEffect(() => {
    loadApiData();
  }, [loadApiData]);

  // Load estimate lock status
  const loadLockStatus = useCallback(async () => {
    if (!params?.id) return;
    try {
      const status = await getEstimateLockStatus(params.id);
      setEstimateLockStatus(status);
    } catch (err) {
      // Estimate may not exist yet - that's ok
      console.log('Could not load lock status:', err);
    }
  }, [params?.id]);

  useEffect(() => {
    loadLockStatus();
  }, [loadLockStatus]);

  // Handle estimate finalization (submit)
  const handleFinalizeEstimate = async () => {
    if (!params?.id || isSubmitting || isEstimateLocked) return;

    setIsSubmitting(true);
    setValidationErrors([]);
    setValidationWarnings([]);

    try {
      const result = await submitEstimate(params.id);

      if (result.success) {
        // Success - estimate is now locked
        toast.success(result.message);
        setEstimateLockStatus({
          isLocked: true,
          status: result.status,
          submittedAt: result.submittedAt,
        });

        // Show any warnings
        if (result.validation.warnings.length > 0) {
          setValidationWarnings(result.validation.warnings);
          setShowValidationDialog(true);
        }
      } else {
        // Validation errors - show them
        setValidationErrors(result.validation.errors);
        setValidationWarnings(result.validation.warnings);
        setShowValidationDialog(true);
        toast.error(`Submission blocked: ${result.validation.errorCount} error(s)`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit estimate';
      toast.error(errorMessage);
      console.error('Finalize estimate error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle PDF download
  const handleDownloadPdf = async () => {
    if (!params?.id || isDownloadingPdf) return;

    setIsDownloadingPdf(true);
    try {
      await downloadEstimatePdf(params.id);
      toast.success('PDF downloaded successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to download PDF';
      toast.error(errorMessage);
      console.error('Download PDF error:', err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Handle document upload
  const handleDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !params?.id) return;

    setUploadingDocument(true);
    try {
      for (const file of Array.from(files)) {
        await uploadDocument(file, {
          claimId: params.id,
          type: 'photo',
          name: file.name
        });
      }
      // Reload documents
      const docsData = await getClaimDocuments(params.id);
      setDocuments(docsData);
    } catch (err) {
      console.error('Failed to upload document:', err);
    } finally {
      setUploadingDocument(false);
    }
  };

  // Handle delete claim
  const handleDeleteClaim = async () => {
    if (!params?.id) return;
    
    setIsDeleting(true);
    try {
      await deleteClaim(params.id);
      setActiveClaim(null);
      toast.success("Claim deleted successfully");
      setLocation("/");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete claim";
      toast.error(errorMessage);
      console.error("Delete claim error:", err);
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const selectedRoom = (claim?.rooms || []).find(r => r.id === selectedRoomId);

  const handleAddRoom = () => {
    addRoom(claimId, {
      id: `r${Date.now()}`,
      name: "New Room",
      type: "Bedroom",
      width: 12,
      height: 12,
      x: 0,
      y: 0,
      ceilingHeight: 8
    });
  };

  const handleSaveOpening = (openingData: Omit<RoomOpening, "id">) => {
    if (!selectedRoom) return;

    const existingOpenings = selectedRoom.openings || [];

    if (editingOpening) {
      // Update existing opening
      const updatedOpenings = existingOpenings.map((o) =>
        o.id === editingOpening.id ? { ...openingData, id: editingOpening.id } : o
      );
      updateRoom(claim.id, selectedRoom.id, { openings: updatedOpenings });
    } else {
      // Add new opening
      const newOpening: RoomOpening = {
        ...openingData,
        id: `op${Date.now()}`,
      };
      updateRoom(claim.id, selectedRoom.id, { openings: [...existingOpenings, newOpening] });
    }

    setEditingOpening(undefined);
  };

  const handleDeleteOpening = (openingId: string) => {
    if (!selectedRoom) return;
    const updatedOpenings = (selectedRoom.openings || []).filter((o) => o.id !== openingId);
    updateRoom(claim.id, selectedRoom.id, { openings: updatedOpenings });
  };

  const handleEditOpening = (opening: RoomOpening) => {
    setEditingOpening(opening);
    setIsOpeningModalOpen(true);
  };

  const handleAddOpeningClick = () => {
    setEditingOpening(undefined);
    setIsOpeningModalOpen(true);
  };

  const handleGenerateEstimate = async () => {
    if ((claim.lineItems || []).length === 0) {
      setIsEstimateSettingsOpen(true);
      return;
    }
    const result = await calculateEstimate(claim.id);
    if (result) {
      setActiveTab("estimate");
    }
  };

  const handleGenerateAISuggestions = async () => {
    if ((claim.damageZones || []).length === 0) {
      alert("Please add damage zones first in the Sketch tab before generating AI suggestions.");
      return;
    }

    setIsGeneratingAISuggestions(true);
    setAiSuggestions(null);

    try {
      // Transform damage zones to the format expected by the API
      const damageZones = (claim.damageZones || []).map(dz => {
        const room = (claim.rooms || []).find(r => r.id === dz.roomId);
        return {
          id: dz.id,
          roomName: room?.name || "Unknown Room",
          roomType: room?.type,
          damageType: dz.type.toLowerCase(),
          damageSeverity: dz.severity,
          squareFootage: dz.affectedArea,
          notes: dz.notes,
        };
      });

      const response = await fetch("/api/ai/suggest-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          damageZones,
          regionId: estimateSettings.regionId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate suggestions");
      }

      const result = await response.json();
      setAiSuggestions(result.suggestions || []);
    } catch (error) {
      console.error("AI suggestion error:", error);
      alert(error instanceof Error ? error.message : "Failed to generate AI suggestions");
    } finally {
      setIsGeneratingAISuggestions(false);
    }
  };

  const handleAddAISuggestion = (suggestion: typeof aiSuggestions extends (infer T)[] | null ? T : never) => {
    if (!suggestion) return;

    addLineItem(claim.id, {
      id: `li${Date.now()}`,
      code: suggestion.lineItemCode,
      description: suggestion.description,
      quantity: suggestion.quantity,
      unit: suggestion.unit,
      unitPrice: suggestion.unitPrice || 0,
      total: (suggestion.unitPrice || 0) * suggestion.quantity,
      category: "AI Suggested",
    });

    // Remove from suggestions
    setAiSuggestions(prev => prev?.filter(s => s.lineItemCode !== suggestion.lineItemCode) || null);
  };

  const handleAddAllAISuggestions = () => {
    if (!aiSuggestions) return;

    aiSuggestions.forEach(suggestion => {
      addLineItem(claim.id, {
        id: `li${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        code: suggestion.lineItemCode,
        description: suggestion.description,
        quantity: suggestion.quantity,
        unit: suggestion.unit,
        unitPrice: suggestion.unitPrice || 0,
        total: (suggestion.unitPrice || 0) * suggestion.quantity,
        category: "AI Suggested",
      });
    });

    setAiSuggestions(null);
  };

  // Estimate Builder Helper Functions
  const handleInitializeHierarchy = async () => {
    try {
      await estimateBuilder.initialize({
        structureName: "Main Building",
        includeInterior: true,
        includeExterior: true,
        includeRoofing: true,
      });
    } catch (error) {
      console.error("Failed to initialize hierarchy:", error);
    }
  };

  const toggleStructure = (structureId: string) => {
    setExpandedStructures(prev => {
      const newSet = new Set(Array.from(prev));
      if (newSet.has(structureId)) {
        newSet.delete(structureId);
      } else {
        newSet.add(structureId);
      }
      return newSet;
    });
  };

  const toggleArea = (areaId: string) => {
    setExpandedAreas(prev => {
      const newSet = new Set(Array.from(prev));
      if (newSet.has(areaId)) {
        newSet.delete(areaId);
      } else {
        newSet.add(areaId);
      }
      return newSet;
    });
  };

  const handleAddZone = async () => {
    if (!selectedAreaForNewZone || !newZoneData.name) return;
    try {
      await estimateBuilder.createZone(selectedAreaForNewZone, {
        name: newZoneData.name,
        zoneType: newZoneData.zoneType || 'room',
        lengthFt: newZoneData.lengthFt,
        widthFt: newZoneData.widthFt,
        heightFt: newZoneData.heightFt || 8,
        roomType: newZoneData.roomType,
        notes: newZoneData.notes,
      });
      setIsAddZoneDialogOpen(false);
      setNewZoneData({});
      setSelectedAreaForNewZone(null);
    } catch (error) {
      console.error("Failed to create zone:", error);
    }
  };

  const handleAddMissingWall = async () => {
    const zoneId = estimateBuilder.activeZoneId;
    if (!zoneId || !newMissingWallData.widthFt || !newMissingWallData.heightFt) return;
    try {
      await estimateBuilder.createMissingWall(zoneId, {
        name: newMissingWallData.name,
        openingType: newMissingWallData.openingType || 'opening',
        widthFt: newMissingWallData.widthFt,
        heightFt: newMissingWallData.heightFt,
        quantity: newMissingWallData.quantity || 1,
        opensInto: newMissingWallData.opensInto,
      });
      // Recalculate zone dimensions after adding missing wall
      await estimateBuilder.recalcZoneDimensions(zoneId);
      setIsAddMissingWallDialogOpen(false);
      setNewMissingWallData({});
    } catch (error) {
      console.error("Failed to add missing wall:", error);
    }
  };

  const handleAddLineItemToZone = async (lineItemCode: string, quantity: number) => {
    const zoneId = selectedZoneForLineItem || estimateBuilder.activeZoneId;
    if (!zoneId) return;
    try {
      await estimateBuilder.addLineItem(zoneId, {
        lineItemCode,
        quantity,
      });
    } catch (error) {
      console.error("Failed to add line item:", error);
    }
  };

  const getZoneStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-slate-100 text-slate-600';
      case 'measured': return 'bg-blue-100 text-blue-600';
      case 'scoped': return 'bg-amber-100 text-amber-600';
      case 'complete': return 'bg-green-100 text-green-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  // Calculate totals from hierarchy
  const hierarchyTotals = useMemo(() => {
    if (!estimateBuilder.hierarchy) return { rcv: 0, acv: 0, depreciation: 0, lineItems: 0, zones: 0 };

    let rcv = 0, acv = 0, lineItems = 0, zones = 0;

    estimateBuilder.hierarchy.structures.forEach(structure => {
      structure.areas.forEach(area => {
        area.zones.forEach(zone => {
          zones++;
          rcv += zone.zoneTotals.rcvTotal;
          acv += zone.zoneTotals.acvTotal;
          lineItems += zone.lineItemCount;
        });
      });
    });

    return { rcv, acv, depreciation: rcv - acv, lineItems, zones };
  }, [estimateBuilder.hierarchy]);

  // Calculate display totals - use API result if available, otherwise use local subtotal
  const localSubtotal = (claim?.lineItems || []).reduce((sum, item) => sum + item.total, 0);
  const displaySubtotal = calculatedEstimate?.subtotal ?? localSubtotal;
  const displayOverhead = calculatedEstimate?.overheadAmount ?? (localSubtotal * (estimateSettings.overheadPct / 100));
  const displayProfit = calculatedEstimate?.profitAmount ?? (localSubtotal * (estimateSettings.profitPct / 100));
  const displayTax = calculatedEstimate?.taxAmount ?? 0;
  const displayTotal = calculatedEstimate?.grandTotal ?? (displaySubtotal + displayOverhead + displayProfit + displayTax);

  const tabs = [
    { id: "info", label: "Info", icon: Home },
    { id: "documents", label: "Documents", icon: File },
    { id: "sketch", label: "Sketch", icon: PenTool },
    { id: "scope", label: "Scope", icon: ClipboardList },
    { id: "estimate", label: "Estimate", icon: FileText },
    { id: "photos", label: "Photos", icon: ImageIcon },
  ];

  // Show loading state while API data is being fetched
  if (loadingApiData) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-muted-foreground">Loading claim...</span>
          </div>
        </div>
      </Layout>
    );
  }

  // Show error state if claim couldn't be loaded
  if (apiError || !apiClaim) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold">Claim Not Found</h2>
          <p className="text-muted-foreground">{apiError || "Could not load claim data"}</p>
          <Link href="/">
            <Button>Back to Claims</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout hideNav={isMobileLayout}>
      <div className="flex flex-col h-full relative">
        {/* Header */}
        <div className="bg-white border-b border-border px-4 md:px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile Back Button */}
            {isMobileLayout && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setLocation("/")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg md:text-xl font-display font-bold text-slate-900 truncate max-w-[180px] md:max-w-none">{claim.policyholder || 'Unknown'}</h1>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-xs font-medium text-slate-600 border border-slate-200 hidden md:inline-block">
                  {claim.status.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-muted-foreground font-mono mt-0.5 hidden md:block">{claim.policyNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden md:flex text-destructive hover:text-destructive hover:bg-destructive/10"
                  data-testid="button-delete-claim"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Claim</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this claim? This action cannot be undone and will permanently remove all associated data including documents, estimates, and endorsements.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteClaim}
                    disabled={isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid="button-confirm-delete"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Delete Claim"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              variant="outline"
              size="sm"
              className="hidden md:flex"
              onClick={() => setIsEstimateSettingsOpen(true)}
            >
              <Settings2 className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button
              size="sm"
              onClick={handleGenerateEstimate}
              disabled={isCalculating || (claim.lineItems || []).length === 0}
            >
              {isCalculating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              <span className="hidden md:inline">Generate </span>Estimate
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden pb-nav-safe md:pb-0">
          {/* Desktop Tabs */}
          <div className="hidden md:block px-6 pt-2 bg-white border-b border-border">
            <TabsList className="bg-transparent h-auto p-0 space-x-6">
              {tabs.map((tab) => (
                <TabsTrigger 
                  key={tab.id} 
                  value={tab.id}
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-0 py-3 text-muted-foreground data-[state=active]:text-primary transition-all"
                >
                  <tab.icon className="h-4 w-4 mr-2" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Content Area */}
          <div className="flex-1 bg-muted/20 overflow-hidden relative">
            
            {/* TAB: FNOL INFO */}
            <TabsContent value="info" className="h-full p-4 md:p-6 m-0 overflow-auto">
              <div className="max-w-6xl mx-auto space-y-6">
                {/* FNOL Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">{apiClaim?.policyholder || 'Unknown Policyholder'}</h2>
                    <p className="text-muted-foreground">Claim ID: {apiClaim?.claimId || params?.id}</p>
                  </div>
                  <Badge className={cn(
                    "text-sm px-3 py-1",
                    apiClaim?.status === 'fnol' && "bg-purple-100 text-purple-700",
                    apiClaim?.status === 'open' && "bg-blue-100 text-blue-700",
                    apiClaim?.status === 'in_progress' && "bg-cyan-100 text-cyan-700",
                    apiClaim?.status === 'review' && "bg-amber-100 text-amber-700",
                    apiClaim?.status === 'approved' && "bg-green-100 text-green-700",
                    apiClaim?.status === 'closed' && "bg-slate-100 text-slate-700"
                  )}>
                    {(apiClaim?.status || 'fnol').replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* FNOL Details Card */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        FNOL Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase">Claim ID</Label>
                          <p className="font-mono font-medium">{apiClaim?.claimId || '-'}</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase">Policyholder</Label>
                          <p className="font-medium">{apiClaim?.policyholder || '-'}</p>
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase">Risk Location</Label>
                        <p className="font-medium">{apiClaim?.riskLocation || '-'}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase">Date of Loss</Label>
                          <p className="font-medium">{apiClaim?.dateOfLoss || '-'}</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase">Cause of Loss</Label>
                          <Badge variant="outline" className="font-medium">
                            {apiClaim?.causeOfLoss || '-'}
                          </Badge>
                        </div>
                      </div>
                      <Separator />
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase">Loss Description</Label>
                        <p className="text-sm bg-muted/50 rounded p-3">{apiClaim?.lossDescription || 'No description provided'}</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Policy Details Card */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Home className="w-5 h-5" />
                        Policy Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase">Policy Number</Label>
                          <p className="font-mono font-medium">{apiClaim?.policyNumber || '-'}</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase">State</Label>
                          <p className="font-medium">{apiClaim?.state || '-'}</p>
                        </div>
                      </div>
                      <Separator />
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase">Dwelling Limit</Label>
                          <p className="text-lg font-bold text-green-600">{apiClaim?.dwellingLimit || '-'}</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase">Wind/Hail Deductible</Label>
                          <p className="text-lg font-bold text-amber-600">{apiClaim?.windHailDeductible || '-'}</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase">Year Roof Installed</Label>
                        <p className="font-medium">{apiClaim?.yearRoofInstall || '-'}</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Endorsements Card */}
                  <Card className="lg:col-span-2">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <ClipboardList className="w-5 h-5" />
                        Endorsements
                        <Badge variant="secondary" className="ml-2">
                          {endorsements.length > 0 ? endorsements.length : (apiClaim?.endorsementsListed?.length || 0)}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Detailed Endorsement Records (from endorsements table) */}
                      {endorsements.length > 0 ? (
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium text-muted-foreground">Endorsement Documents</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {endorsements.map((endorsement) => (
                              <div key={endorsement.id} className="bg-muted/50 rounded-lg p-4 border border-muted">
                                <div className="flex items-start gap-3">
                                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <FileText className="w-4 h-4 text-primary" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-mono font-semibold text-sm">{endorsement.form_number}</p>
                                    <p className="text-sm text-muted-foreground truncate">
                                      {endorsement.document_title || 'No title'}
                                    </p>
                                    {endorsement.description && (
                                      <p className="text-xs text-muted-foreground mt-1">{endorsement.description}</p>
                                    )}
                                  </div>
                                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : apiClaim?.endorsementsListed && apiClaim.endorsementsListed.length > 0 ? (
                        /* Fallback to simple endorsements list from claim */
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium text-muted-foreground">Listed Endorsements</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {apiClaim.endorsementsListed.map((endorsement, idx) => (
                              <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
                                <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                                <span className="text-sm">{endorsement}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No endorsements listed for this claim
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Document Viewer */}
                  <div className="lg:col-span-2">
                    <DocumentViewer documents={documents} claimId={params?.id || ''} />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB: DOCUMENTS */}
            <TabsContent value="documents" className="h-full p-4 md:p-6 m-0 overflow-auto">
              <div className="max-w-5xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Claim Documents</h2>
                    <p className="text-sm text-muted-foreground">
                      {documents.length} document{documents.length !== 1 ? 's' : ''} attached
                    </p>
                  </div>
                  <div>
                    <input
                      type="file"
                      id="document-upload"
                      className="hidden"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={handleDocumentUpload}
                    />
                    <label htmlFor="document-upload">
                      <Button asChild disabled={uploadingDocument}>
                        <span>
                          {uploadingDocument ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-2" />
                          )}
                          Upload Document
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>

                {loadingApiData ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : apiError ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">Failed to load documents</h3>
                    <p className="text-slate-500 mb-4">{apiError}</p>
                    <Button onClick={loadApiData}>Try Again</Button>
                  </div>
                ) : documents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
                    <File className="h-12 w-12 text-slate-300 mb-4" />
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No documents yet</h3>
                    <p className="text-slate-500 mb-4">
                      Upload documents to attach them to this claim
                    </p>
                    <label htmlFor="document-upload">
                      <Button asChild variant="outline">
                        <span>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Document
                        </span>
                      </Button>
                    </label>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {documents.map((doc) => (
                      <Card key={doc.id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                              doc.type === 'fnol' && "bg-purple-100 text-purple-600",
                              doc.type === 'policy' && "bg-blue-100 text-blue-600",
                              doc.type === 'endorsement' && "bg-green-100 text-green-600",
                              doc.type === 'photo' && "bg-amber-100 text-amber-600",
                              doc.type === 'estimate' && "bg-orange-100 text-orange-600",
                              doc.type === 'correspondence' && "bg-slate-100 text-slate-600"
                            )}>
                              {doc.type === 'photo' ? (
                                <ImageIcon className="h-5 w-5" />
                              ) : (
                                <FileText className="h-5 w-5" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{doc.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {doc.type.toUpperCase()} • {(doc.fileSize / 1024).toFixed(1)} KB
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {(doc.createdAt || doc.created_at) ? formatDistanceToNow(new Date(doc.createdAt || doc.created_at), { addSuffix: true }) : 'Recently'}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              asChild
                            >
                              <a href={getDocumentDownloadUrl(doc.id)} target="_blank" rel="noopener noreferrer">
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </a>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              asChild
                            >
                              <a href={getDocumentDownloadUrl(doc.id)} download>
                                <Download className="h-4 w-4 mr-1" />
                                Download
                              </a>
                            </Button>
                          </div>
                          {doc.processingStatus === 'completed' && doc.extractedData && (
                            <div className="mt-3 pt-3 border-t">
                              <Badge variant="outline" className="text-green-600 border-green-200">
                                AI Extracted
                              </Badge>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB: SKETCH */}
            <TabsContent value="sketch" className="h-full m-0 flex flex-col">
              {/* Mobile View: Optimized for small screens */}
              <div className="md:hidden flex-1 flex flex-col overflow-hidden">
                {/* Canvas Area - Takes most of the space */}
                <div className="flex-1 min-h-0 relative border-b border-border overflow-hidden">
                   {/* Floating Toolbar - Compact */}
                   <div className="absolute top-2 left-2 right-2 flex justify-center z-30 pointer-events-none">
                     <div className="bg-white/95 backdrop-blur border shadow-sm rounded-full px-3 py-1.5 flex gap-1 pointer-events-auto">
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setSelectedRoomId(null)}>
                          <Move className="h-4 w-4" />
                        </Button>
                        <Separator orientation="vertical" className="h-6 my-auto" />
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={handleAddRoom}>
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Separator orientation="vertical" className="h-6 my-auto" />
                        <Link href={`/voice-sketch/${claim.id}`}>
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-primary">
                            <Mic className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                    <SketchCanvas
                      rooms={claim.rooms || []}
                      damageZones={claim.damageZones}
                      selectedRoomId={selectedRoomId}
                      onSelectRoom={setSelectedRoomId}
                      onUpdateRoom={(id, data) => updateRoom(claim.id, id, data)}
                    />
                </div>
                {/* Room Details Panel - Collapsible */}
                <div className={cn(
                  "bg-white transition-all duration-200 overflow-auto",
                  selectedRoom ? "h-auto max-h-[40%]" : "h-12"
                )}>
                    {selectedRoom ? (
                      <div className="p-3 space-y-3">
                         <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-sm">{selectedRoom.name}</h3>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setSelectedRoomId(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                         </div>
                         <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Name</Label>
                              <Input
                                className="h-9"
                                value={selectedRoom.name}
                                onChange={(e) => updateRoom(claim.id, selectedRoom.id, { name: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Width (ft)</Label>
                              <Input
                                className="h-9"
                                type="number"
                                value={selectedRoom.width}
                                onChange={(e) => updateRoom(claim.id, selectedRoom.id, { width: Number(e.target.value) })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Length (ft)</Label>
                              <Input
                                className="h-9"
                                type="number"
                                value={selectedRoom.height}
                                onChange={(e) => updateRoom(claim.id, selectedRoom.id, { height: Number(e.target.value) })}
                              />
                            </div>
                          </div>
                          {/* Openings summary for mobile */}
                          {(selectedRoom.openings?.length ?? 0) > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {selectedRoom.openings?.map((o) => (
                                <Badge key={o.id} variant="outline" className="text-amber-600 border-amber-200 text-xs">
                                  {o.type.replace("_", " ")} ({o.wall})
                                </Badge>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button className="flex-1 h-9" variant="outline" onClick={handleAddOpeningClick}>
                              <DoorOpen className="h-4 w-4 mr-1" /> Door/Window
                            </Button>
                            <Button className="flex-1 h-9" variant="destructive" onClick={() => setIsDamageModalOpen(true)}>
                              Add Damage
                            </Button>
                            <Button
                              variant="ghost"
                              className="h-9 px-3 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                deleteRoom(claim.id, selectedRoom.id);
                                setSelectedRoomId(null);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                      </div>
                    ) : (
                      <div className="p-3 text-center text-muted-foreground text-sm flex items-center justify-center h-full">
                        <span>Tap a room to edit • Pinch to zoom • Drag to pan</span>
                      </div>
                    )}
                </div>
              </div>

              {/* Desktop View: Resizable */}
              <div className="hidden md:block h-full">
                <ResizablePanelGroup direction="horizontal">
                  <ResizablePanel defaultSize={65}>
                    <div className="h-full relative flex flex-col overflow-hidden">
                      <div className="absolute top-4 left-4 right-4 flex justify-center z-10 pointer-events-none">
                        <div className="bg-white/90 backdrop-blur border shadow-sm rounded-full px-4 py-2 flex gap-2 pointer-events-auto">
                          <Button size="sm" variant="ghost" onClick={() => setSelectedRoomId(null)}>
                            <Move className="h-4 w-4 mr-2" /> Select
                          </Button>
                          <Separator orientation="vertical" className="h-6" />
                          <Button size="sm" variant="ghost" onClick={handleAddRoom}>
                            <Plus className="h-4 w-4 mr-2" /> Add Room
                          </Button>
                          <Separator orientation="vertical" className="h-6" />
                          <Link href={`/voice-sketch/${claim.id}`}>
                            <Button size="sm" variant="ghost" className="text-primary">
                              <Mic className="h-4 w-4 mr-2" /> Voice Sketch
                            </Button>
                          </Link>
                        </div>
                      </div>
                      <SketchCanvas 
                        rooms={claim.rooms || []} 
                        damageZones={claim.damageZones}
                        selectedRoomId={selectedRoomId}
                        onSelectRoom={setSelectedRoomId}
                        onUpdateRoom={(id, data) => updateRoom(claim.id, id, data)}
                      />
                    </div>
                  </ResizablePanel>
                  
                  <ResizableHandle />
                  
                  <ResizablePanel defaultSize={35} minSize={20}>
                    <div className="h-full bg-white border-l border-border flex flex-col">
                      <div className="p-4 border-b border-border bg-slate-50">
                        <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-500">
                          {selectedRoom ? "Room Properties" : "Property Summary"}
                        </h3>
                      </div>
                      
                      <ScrollArea className="flex-1 p-4">
                        {selectedRoom ? (
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <Label>Room Name</Label>
                              <Input 
                                value={selectedRoom.name} 
                                onChange={(e) => updateRoom(claim.id, selectedRoom.id, { name: e.target.value })} 
                              />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Width (ft)</Label>
                                <Input 
                                  type="number" 
                                  value={selectedRoom.width} 
                                  onChange={(e) => updateRoom(claim.id, selectedRoom.id, { width: Number(e.target.value) })} 
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Length (ft)</Label>
                                <Input 
                                  type="number" 
                                  value={selectedRoom.height} 
                                  onChange={(e) => updateRoom(claim.id, selectedRoom.id, { height: Number(e.target.value) })} 
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label>Type</Label>
                              <Select 
                                value={selectedRoom.type} 
                                onValueChange={(v) => updateRoom(claim.id, selectedRoom.id, { type: v })}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["Kitchen", "Bedroom", "Bathroom", "Living Room", "Dining Room", "Hallway", "Garage"].map(t => (
                                    <SelectItem key={t} value={t}>{t}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label>Ceiling Height</Label>
                              <Select 
                                value={String(selectedRoom.ceilingHeight)} 
                                onValueChange={(v) => updateRoom(claim.id, selectedRoom.id, { ceilingHeight: Number(v) })}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["8", "9", "10", "12", "14"].map(h => (
                                    <SelectItem key={h} value={h}>{h} ft</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <Separator />

                            {/* Openings (Doors/Windows) */}
                            <div>
                              <h4 className="font-medium mb-3 flex items-center gap-2">
                                <DoorOpen className="h-4 w-4" />
                                Doors & Windows
                              </h4>
                              <div className="space-y-2 mb-3">
                                {(selectedRoom.openings || []).length === 0 ? (
                                  <p className="text-sm text-muted-foreground text-center py-2">No openings added yet</p>
                                ) : (
                                  selectedRoom.openings?.map((opening) => (
                                    <div
                                      key={opening.id}
                                      className="bg-amber-50 border border-amber-100 p-2 rounded text-sm flex items-center justify-between cursor-pointer hover:bg-amber-100 transition-colors"
                                      onClick={() => handleEditOpening(opening)}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="capitalize">{opening.type.replace("_", " ")}</span>
                                        <span className="text-muted-foreground">•</span>
                                        <span className="text-muted-foreground capitalize">{opening.wall}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-amber-600 bg-white border-amber-200">
                                          {opening.width}' × {opening.height}'
                                        </Badge>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteOpening(opening.id);
                                          }}
                                        >
                                          <X className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                              <Button className="w-full" variant="outline" onClick={handleAddOpeningClick}>
                                <Plus className="h-4 w-4 mr-2" /> Add Door / Window
                              </Button>
                            </div>

                            <Separator />

                            <div>
                              <h4 className="font-medium mb-3">Damage Zones</h4>
                              <div className="space-y-2 mb-3">
                                {(claim.damageZones || []).filter(dz => dz.roomId === selectedRoom.id).map(dz => (
                                  <div key={dz.id} className="bg-red-50 border border-red-100 p-2 rounded text-sm flex items-center justify-between">
                                    <span>{dz.type} - {dz.severity}</span>
                                    <Badge variant="outline" className="text-red-600 bg-white border-red-200">{dz.affectedArea} SF</Badge>
                                  </div>
                                ))}
                              </div>
                              <Button className="w-full" variant="destructive" onClick={() => setIsDamageModalOpen(true)}>
                                Add Damage Zone
                              </Button>
                            </div>

                            <div className="pt-4">
                              <Button 
                                variant="ghost" 
                                className="w-full text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  deleteRoom(claim.id, selectedRoom.id);
                                  setSelectedRoomId(null);
                                }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete Room
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-6 text-center py-10">
                            <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-4 text-slate-400">
                              <Move className="h-6 w-6" />
                            </div>
                            <p className="text-muted-foreground">
                              Select a room on the canvas to view details or add damage info.
                            </p>
                            <div className="p-4 bg-slate-50 rounded-lg border text-left space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Total Rooms:</span>
                                <span className="font-medium">{(claim.rooms || []).length}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Total Area:</span>
                                <span className="font-medium">
                                  {(claim.rooms || []).reduce((acc, r) => acc + (r.width * r.height), 0).toFixed(0)} SF
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </TabsContent>

            {/* TAB: SCOPE - Enhanced with Xactimate Hierarchy */}
            <TabsContent value="scope" className="h-full m-0 overflow-hidden">
              <div className="h-full hidden md:block">
                <ResizablePanelGroup direction="horizontal">
                  {/* Left Panel: Structure Tree */}
                  <ResizablePanel defaultSize={30} minSize={20}>
                    <div className="h-full bg-white border-r flex flex-col">
                      <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-500" />
                          <h3 className="font-semibold text-sm">Structure</h3>
                        </div>
                        {!estimateBuilder.hierarchy?.structures?.length ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleInitializeHierarchy}
                            disabled={estimateBuilder.isInitializing}
                          >
                            {estimateBuilder.isInitializing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => estimateBuilder.recalculate()}
                            disabled={estimateBuilder.isRecalculating}
                          >
                            {estimateBuilder.isRecalculating ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Calculator className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>

                      <ScrollArea className="flex-1 p-2">
                        {estimateBuilder.isLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          </div>
                        ) : !estimateBuilder.hierarchy?.structures?.length ? (
                          <div className="text-center py-8 px-4">
                            <LayoutGrid className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-sm text-muted-foreground mb-3">
                              Initialize the estimate hierarchy to start building your scope
                            </p>
                            <Button size="sm" onClick={handleInitializeHierarchy} disabled={estimateBuilder.isInitializing}>
                              {estimateBuilder.isInitializing ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Plus className="h-4 w-4 mr-2" />
                              )}
                              Initialize Structure
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {estimateBuilder.hierarchy.structures.map((structure) => (
                              <Collapsible
                                key={structure.id}
                                open={expandedStructures.has(structure.id)}
                                onOpenChange={() => toggleStructure(structure.id)}
                              >
                                <CollapsibleTrigger asChild>
                                  <button className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-slate-100 text-left">
                                    {expandedStructures.has(structure.id) ? (
                                      <ChevronDown className="h-4 w-4 text-slate-400" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-slate-400" />
                                    )}
                                    <Building2 className="h-4 w-4 text-slate-500" />
                                    <span className="font-medium text-sm flex-1 truncate">{structure.name}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {structure.areas.reduce((sum, a) => sum + a.zones.length, 0)}
                                    </Badge>
                                  </button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="ml-6 border-l pl-2 space-y-1">
                                    {structure.areas.map((area) => (
                                      <Collapsible
                                        key={area.id}
                                        open={expandedAreas.has(area.id)}
                                        onOpenChange={() => toggleArea(area.id)}
                                      >
                                        <CollapsibleTrigger asChild>
                                          <button className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-slate-100 text-left">
                                            {expandedAreas.has(area.id) ? (
                                              <ChevronDown className="h-3 w-3 text-slate-400" />
                                            ) : (
                                              <ChevronRight className="h-3 w-3 text-slate-400" />
                                            )}
                                            <Layers className="h-4 w-4 text-blue-500" />
                                            <span className="text-sm flex-1 truncate">{area.name}</span>
                                            <Badge variant="outline" className="text-xs">
                                              {area.zones.length}
                                            </Badge>
                                          </button>
                                        </CollapsibleTrigger>
                                        <CollapsibleContent>
                                          <div className="ml-5 space-y-1 mt-1">
                                            {area.zones.map((zone) => (
                                              <button
                                                key={zone.id}
                                                onClick={() => estimateBuilder.setActiveZoneId(zone.id)}
                                                className={cn(
                                                  "w-full flex items-center gap-2 p-2 rounded-md text-left transition-colors",
                                                  estimateBuilder.activeZoneId === zone.id
                                                    ? "bg-primary/10 border border-primary/20"
                                                    : "hover:bg-slate-100"
                                                )}
                                              >
                                                <Square className="h-3 w-3 text-amber-500" />
                                                <div className="flex-1 min-w-0">
                                                  <p className="text-sm truncate">{zone.name}</p>
                                                  <p className="text-xs text-muted-foreground">
                                                    {ZONE_TYPE_LABELS[zone.zoneType as keyof typeof ZONE_TYPE_LABELS] || zone.zoneType}
                                                  </p>
                                                </div>
                                                <Badge className={cn("text-[10px]", getZoneStatusColor(zone.status))}>
                                                  {zone.status}
                                                </Badge>
                                              </button>
                                            ))}
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="w-full justify-start text-muted-foreground"
                                              onClick={() => {
                                                setSelectedAreaForNewZone(area.id);
                                                setIsAddZoneDialogOpen(true);
                                              }}
                                              disabled={isEstimateLocked}
                                              title={isEstimateLocked ? "Estimate is finalized" : undefined}
                                            >
                                              <Plus className="h-3 w-3 mr-2" />
                                              Add Zone
                                            </Button>
                                          </div>
                                        </CollapsibleContent>
                                      </Collapsible>
                                    ))}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            ))}
                          </div>
                        )}
                      </ScrollArea>

                      {/* Summary Footer */}
                      {estimateBuilder.hierarchy?.structures?.length ? (
                        <div className="p-3 border-t bg-slate-50 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Zones</span>
                            <span className="font-medium">{hierarchyTotals.zones}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Line Items</span>
                            <span className="font-medium">{hierarchyTotals.lineItems}</span>
                          </div>
                          <Separator className="my-2" />
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">RCV Total</span>
                            <span className="font-semibold text-green-600">${hierarchyTotals.rcv.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">ACV Total</span>
                            <span className="font-semibold">${hierarchyTotals.acv.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Depreciation</span>
                            <span className="font-semibold text-amber-600">${hierarchyTotals.depreciation.toFixed(2)}</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </ResizablePanel>

                  <ResizableHandle />

                  {/* Right Panel: Zone Details & Line Items */}
                  <ResizablePanel defaultSize={70}>
                    <div className="h-full flex flex-col overflow-hidden">
                      {/* Toolbar */}
                      <div className="p-4 border-b bg-white flex items-center justify-between gap-3 flex-wrap">
                        <h2 className="text-lg font-semibold">Scope of Work</h2>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleGenerateAISuggestions}
                            disabled={isGeneratingAISuggestions || (claim.damageZones || []).length === 0}
                            className="text-purple-600 border-purple-200 hover:bg-purple-50"
                          >
                            {isGeneratingAISuggestions ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Wand2 className="h-4 w-4 mr-2" />
                            )}
                            AI Suggest
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsVoiceScopeOpen(!isVoiceScopeOpen)}
                            className={cn(isVoiceScopeOpen && "bg-primary/10 border-primary")}
                          >
                            <Mic className="h-4 w-4 mr-2" />
                            Voice
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setIsLineItemPickerOpen(true)}
                            disabled={isEstimateLocked}
                            title={isEstimateLocked ? "Estimate is finalized" : undefined}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Item
                          </Button>
                        </div>
                      </div>

                      <ScrollArea className="flex-1 p-4">
                        <div className="space-y-6">
                          {/* Voice Scope Controller */}
                          {isVoiceScopeOpen && (
                            <VoiceScopeController
                              onClose={() => setIsVoiceScopeOpen(false)}
                              onLineItemAdded={(item) => {
                                addLineItem(claim.id, {
                                  id: `li${Date.now()}`,
                                  code: item.code,
                                  description: item.description,
                                  quantity: item.quantity,
                                  unit: item.unit,
                                  unitPrice: 0,
                                  total: 0,
                                  category: "Voice Added",
                                });
                              }}
                              className="max-h-[350px]"
                            />
                          )}

                          {/* AI Suggestions Panel */}
                          {aiSuggestions && aiSuggestions.length > 0 && (
                            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="h-5 w-5 text-purple-600" />
                                  <h3 className="font-semibold text-purple-900">AI Suggestions ({aiSuggestions.length})</h3>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button size="sm" variant="outline" onClick={() => setAiSuggestions(null)} className="text-purple-600">
                                    Dismiss
                                  </Button>
                                  <Button size="sm" onClick={handleAddAllAISuggestions} className="bg-purple-600 hover:bg-purple-700">
                                    Add All
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-2 max-h-[200px] overflow-auto">
                                {aiSuggestions.map((suggestion, index) => (
                                  <div
                                    key={`${suggestion.lineItemCode}-${index}`}
                                    className="bg-white border border-purple-100 rounded p-3 flex items-center justify-between gap-3"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-xs text-purple-600">{suggestion.lineItemCode}</span>
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            "text-xs",
                                            suggestion.priority === "required" && "border-red-300 text-red-600",
                                            suggestion.priority === "recommended" && "border-amber-300 text-amber-600",
                                            suggestion.priority === "optional" && "border-slate-300 text-slate-600"
                                          )}
                                        >
                                          {suggestion.priority}
                                        </Badge>
                                      </div>
                                      <p className="text-sm font-medium truncate">{suggestion.description}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {suggestion.quantity} {suggestion.unit}
                                        {suggestion.unitPrice && ` • $${(suggestion.unitPrice * suggestion.quantity).toFixed(2)}`}
                                      </p>
                                    </div>
                                    <Button size="sm" variant="ghost" onClick={() => handleAddAISuggestion(suggestion)}>
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Active Zone Details */}
                          {estimateBuilder.activeZone && (
                            <Card>
                              <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                  <CardTitle className="text-base flex items-center gap-2">
                                    <Square className="h-4 w-4 text-amber-500" />
                                    {estimateBuilder.activeZone.name}
                                  </CardTitle>
                                  <Badge className={getZoneStatusColor(estimateBuilder.activeZone.status)}>
                                    {ZONE_STATUS_LABELS[estimateBuilder.activeZone.status as keyof typeof ZONE_STATUS_LABELS] || estimateBuilder.activeZone.status}
                                  </Badge>
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                {/* Zone Dimensions */}
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-medium flex items-center gap-2">
                                      <Ruler className="h-4 w-4 text-slate-500" />
                                      Dimensions
                                    </h4>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => estimateBuilder.recalcZoneDimensions(estimateBuilder.activeZone!.id)}
                                    >
                                      <Calculator className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {estimateBuilder.activeZone.dimensions &&
                                      getDimensionsForZoneType(estimateBuilder.activeZone.zoneType as any).map((key) => {
                                        const value = estimateBuilder.activeZone!.dimensions[key as keyof typeof estimateBuilder.activeZone.dimensions];
                                        if (value === null || value === undefined || value === 0) return null;
                                        return (
                                          <div key={key} className="bg-slate-50 p-2 rounded text-center">
                                            <p className="text-xs text-muted-foreground">{DIMENSION_LABELS[key as keyof typeof DIMENSION_LABELS]}</p>
                                            <p className="font-semibold text-sm">{typeof value === 'number' ? value.toFixed(2) : value}</p>
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>

                                {/* Missing Walls */}
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-medium flex items-center gap-2">
                                      <DoorOpen className="h-4 w-4 text-slate-500" />
                                      Missing Walls / Openings
                                    </h4>
                                    <Button size="sm" variant="outline" onClick={() => setIsAddMissingWallDialogOpen(true)}>
                                      <Plus className="h-4 w-4 mr-1" /> Add
                                    </Button>
                                  </div>
                                  {estimateBuilder.activeZone.missingWalls.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-2">No openings defined</p>
                                  ) : (
                                    <div className="space-y-1">
                                      {estimateBuilder.activeZone.missingWalls.map((wall) => (
                                        <div
                                          key={wall.id}
                                          className="flex items-center justify-between p-2 bg-amber-50 border border-amber-100 rounded text-sm"
                                        >
                                          <div>
                                            <span className="font-medium">{wall.name || wall.openingType}</span>
                                            {wall.opensInto && (
                                              <span className="text-muted-foreground ml-2">→ {wall.opensInto}</span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-amber-600 border-amber-200">
                                              {wall.widthFt}' × {wall.heightFt}' = {(Number(wall.widthFt) * Number(wall.heightFt)).toFixed(0)} SF
                                            </Badge>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                              onClick={() => estimateBuilder.deleteMissingWall(wall.id)}
                                            >
                                              <X className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Zone Totals */}
                                <div className="bg-slate-50 p-3 rounded-lg">
                                  <div className="grid grid-cols-3 gap-4 text-center">
                                    <div>
                                      <p className="text-xs text-muted-foreground">RCV</p>
                                      <p className="font-semibold text-green-600">${estimateBuilder.activeZone.zoneTotals.rcvTotal.toFixed(2)}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">ACV</p>
                                      <p className="font-semibold">${estimateBuilder.activeZone.zoneTotals.acvTotal.toFixed(2)}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Line Items</p>
                                      <p className="font-semibold">{estimateBuilder.activeZone.lineItemCount}</p>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          )}

                          {/* Line Items Table (Legacy + Zone) */}
                          <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                            <div className="grid grid-cols-12 gap-2 md:gap-4 p-4 bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wider">
                              <div className="col-span-3 md:col-span-2">Code</div>
                              <div className="col-span-4 md:col-span-3">Description</div>
                              <div className="col-span-2 text-center">Qty</div>
                              <div className="hidden md:block col-span-2 text-right">Unit Price</div>
                              <div className="col-span-2 text-right">Total</div>
                              <div className="col-span-1"></div>
                            </div>

                            {(claim.lineItems || []).length === 0 ? (
                              <div className="p-8 text-center text-muted-foreground">
                                <ClipboardList className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                                <p>No line items added yet.</p>
                                <p className="text-sm mt-1">Use "Add Item" or "AI Suggest" to start building the scope.</p>
                              </div>
                            ) : (
                              <div className="divide-y">
                                {(claim?.lineItems || []).map((item) => (
                                  <div key={item.id} className="grid grid-cols-12 gap-2 md:gap-4 p-4 text-sm items-center hover:bg-slate-50 group">
                                    <div className="col-span-3 md:col-span-2 font-mono text-slate-600 text-xs md:text-sm">{item.code}</div>
                                    <div className="col-span-4 md:col-span-3">
                                      <p className="font-medium truncate">{item.description}</p>
                                      <p className="text-xs text-muted-foreground">{item.category}</p>
                                    </div>
                                    <div className="col-span-2 flex items-center justify-center gap-1">
                                      <div className="flex items-center border rounded-md">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-8 w-8 p-0 rounded-r-none"
                                          onClick={() => {
                                            const newQty = Math.max(1, item.quantity - 1);
                                            updateLineItem(claim.id, item.id, { quantity: newQty, total: newQty * item.unitPrice });
                                          }}
                                        >
                                          -
                                        </Button>
                                        <Input
                                          type="number"
                                          min="1"
                                          value={item.quantity}
                                          onChange={(e) => {
                                            const newQty = Math.max(1, Number(e.target.value) || 1);
                                            updateLineItem(claim.id, item.id, { quantity: newQty, total: newQty * item.unitPrice });
                                          }}
                                          className="h-8 w-14 text-center border-0 rounded-none focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-8 w-8 p-0 rounded-l-none"
                                          onClick={() => {
                                            const newQty = item.quantity + 1;
                                            updateLineItem(claim.id, item.id, { quantity: newQty, total: newQty * item.unitPrice });
                                          }}
                                        >
                                          +
                                        </Button>
                                      </div>
                                    </div>
                                    <div className="hidden md:block col-span-2 text-right text-slate-600">
                                      ${item.unitPrice.toFixed(2)}
                                    </div>
                                    <div className="col-span-2 text-right font-semibold">
                                      ${item.total.toFixed(2)}
                                    </div>
                                    <div className="col-span-1 flex justify-end">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => deleteLineItem(claim.id, item.id)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="p-4 bg-slate-50 border-t flex justify-end">
                              <div className="w-full md:w-80 space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Subtotal (Local)</span>
                                  <span>${displaySubtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Overhead ({estimateSettings.overheadPct}%)</span>
                                  <span>${displayOverhead.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Profit ({estimateSettings.profitPct}%)</span>
                                  <span>${displayProfit.toFixed(2)}</span>
                                </div>
                                {displayTax > 0 && (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Tax</span>
                                    <span>${displayTax.toFixed(2)}</span>
                                  </div>
                                )}
                                <Separator />
                                <div className="flex justify-between font-bold text-lg">
                                  <span>Total</span>
                                  <span>${displayTotal.toFixed(2)}</span>
                                </div>
                                {estimateError && <p className="text-xs text-destructive">{estimateError}</p>}
                              </div>
                            </div>
                          </div>
                        </div>
                      </ScrollArea>
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>

              {/* Mobile Scope View */}
              <div className="md:hidden h-full overflow-auto p-4 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold">Scope</h2>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateAISuggestions}
                      disabled={isGeneratingAISuggestions || (claim.damageZones || []).length === 0}
                      className="text-purple-600 border-purple-200"
                    >
                      {isGeneratingAISuggestions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsVoiceScopeOpen(!isVoiceScopeOpen)}
                      className={cn(isVoiceScopeOpen && "bg-primary/10 border-primary")}
                    >
                      <Mic className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setIsLineItemPickerOpen(true)}
                      disabled={isEstimateLocked}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {isVoiceScopeOpen && (
                  <VoiceScopeController
                    onClose={() => setIsVoiceScopeOpen(false)}
                    onLineItemAdded={(item) => {
                      addLineItem(claim.id, {
                        id: `li${Date.now()}`,
                        code: item.code,
                        description: item.description,
                        quantity: item.quantity,
                        unit: item.unit,
                        unitPrice: 0,
                        total: 0,
                        category: "Voice Added",
                      });
                    }}
                  />
                )}

                {/* Mobile Line Items */}
                <div className="space-y-2">
                  {(claim.lineItems || []).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ClipboardList className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                      <p>No line items yet</p>
                    </div>
                  ) : (
                    (claim.lineItems || []).map((item) => (
                      <div key={item.id} className="bg-white border rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-xs text-slate-500">{item.code}</span>
                            <p className="font-medium text-sm truncate">{item.description}</p>
                          </div>
                          <Badge variant="outline">{item.quantity} {item.unit}</Badge>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm text-muted-foreground">${item.unitPrice.toFixed(2)} / {item.unit}</span>
                          <span className="font-semibold">${item.total.toFixed(2)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Mobile Total */}
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>${displaySubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">O&P ({estimateSettings.overheadPct + estimateSettings.profitPct}%)</span>
                      <span>${(displayOverhead + displayProfit).toFixed(2)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-bold">
                      <span>Total</span>
                      <span>${displayTotal.toFixed(2)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* TAB: ESTIMATE */}
            <TabsContent value="estimate" className="h-full p-4 md:p-6 m-0 overflow-auto">
              {/* Estimate Actions Bar */}
              <div className="max-w-4xl mx-auto mb-4">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 rounded-lg border">
                  <div className="flex items-center gap-2">
                    {isEstimateLocked ? (
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        <Lock className="h-3 w-3 mr-1" />
                        Finalized
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        Draft
                      </Badge>
                    )}
                    {estimateLockStatus?.submittedAt && (
                      <span className="text-sm text-muted-foreground">
                        Submitted {formatDistanceToNow(new Date(estimateLockStatus.submittedAt), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Download PDF button - always visible */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadPdf}
                      disabled={isDownloadingPdf}
                    >
                      {isDownloadingPdf ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FileDown className="h-4 w-4 mr-2" />
                      )}
                      Download PDF
                    </Button>

                    {/* Finalize button - only if not locked */}
                    {!isEstimateLocked && (
                      <Button
                        onClick={handleFinalizeEstimate}
                        disabled={isSubmitting}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {isSubmitting ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                        )}
                        Finalize Estimate
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="max-w-4xl mx-auto bg-white p-4 md:p-8 shadow-sm border min-h-[800px]">
                <div className="flex flex-col md:flex-row justify-between items-start mb-8 md:mb-12 gap-4">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-display font-bold text-primary mb-2">ESTIMATE</h1>
                    <p className="text-muted-foreground">Created: {new Date().toLocaleDateString()}</p>
                    {isEstimateLocked && (
                      <p className="text-sm text-green-600 font-medium mt-1">
                        <Lock className="h-3 w-3 inline mr-1" />
                        This estimate has been finalized
                      </p>
                    )}
                  </div>
                  <div className="text-left md:text-right">
                    <h2 className="text-xl font-bold">Claims IQ</h2>
                    <p className="text-sm text-muted-foreground">123 Insurance Way</p>
                    <p className="text-sm text-muted-foreground">New York, NY 10001</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                  <div>
                    <h3 className="text-sm font-semibold uppercase text-slate-500 mb-2">Insured</h3>
                    <p className="font-medium">{apiClaim?.insuredName || claim?.policyholder || 'Unknown'}</p>
                    <p>{apiClaim?.propertyAddress ? `${apiClaim.propertyAddress}, ${apiClaim.propertyCity}, ${apiClaim.propertyState} ${apiClaim.propertyZip}` : (claim?.riskLocation || 'Address not provided')}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold uppercase text-slate-500 mb-2">Claim Info</h3>
                    <p><span className="text-muted-foreground">Claim #:</span> {(apiClaim?.claimNumber || claim?.id || '').toUpperCase()}</p>
                    <p><span className="text-muted-foreground">Policy #:</span> {apiClaim?.policyNumber || claim?.policyNumber || 'N/A'}</p>
                    <p><span className="text-muted-foreground">Loss Date:</span> {(apiClaim?.dateOfLoss || claim?.dateOfLoss) ? new Date(apiClaim?.dateOfLoss || claim?.dateOfLoss).toLocaleDateString() : 'Not specified'}</p>
                  </div>
                </div>

                <Separator className="my-8" />

                <div className="space-y-8">
                  <h3 className="font-bold text-lg">Room: {(claim?.rooms || [])[0]?.name || "General"}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead>
                        <tr className="border-b-2 border-slate-900 text-left">
                          <th className="py-2 w-20">CODE</th>
                          <th className="py-2">DESCRIPTION</th>
                          <th className="py-2 w-20 text-right">QTY</th>
                          <th className="py-2 w-20 text-right">UNIT</th>
                          <th className="py-2 w-24 text-right">PRICE</th>
                          <th className="py-2 w-24 text-right">TOTAL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(claim?.lineItems || []).map((item) => (
                          <tr key={item.id}>
                            <td className="py-3 font-mono text-slate-600">{item.code}</td>
                            <td className="py-3">{item.description}</td>
                            <td className="py-3 text-right">{item.quantity}</td>
                            <td className="py-3 text-right">{item.unit}</td>
                            <td className="py-3 text-right">{item.unitPrice.toFixed(2)}</td>
                            <td className="py-3 text-right font-medium">{item.total.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </TabsContent>
            
            {/* TAB: PHOTOS */}
            <TabsContent value="photos" className="h-full p-4 md:p-6 m-0 overflow-auto">
               <div className="max-w-6xl mx-auto">
                 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                   <div className="aspect-square bg-slate-100 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 hover:border-primary/50 hover:text-primary cursor-pointer transition-colors">
                     <Camera className="h-8 w-8 mb-2" />
                     <span className="text-sm font-medium">Add Photo</span>
                   </div>
                   {/* Mock Photos */}
                   {[1, 2, 3].map((i) => (
                     <div key={i} className="aspect-square bg-slate-200 rounded-lg overflow-hidden relative group">
                       <img 
                         src={`https://images.unsplash.com/photo-158${i}578943-2c${i}2a4e2a?auto=format&fit=crop&w=300&q=80`} 
                         alt="Damage" 
                         className="w-full h-full object-cover"
                       />
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                         <p className="text-white text-xs truncate">Damage Detail {i}</p>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
            </TabsContent>

          </div>

          {/* Mobile Bottom Nav */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border z-50 flex items-center justify-around h-nav-safe">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors min-tap-target pb-safe",
                    isActive ? "text-primary" : "text-slate-400 active:text-slate-600"
                  )}
                >
                  <tab.icon className={cn("h-5 w-5", isActive && "fill-current")} />
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </Tabs>
      </div>

      {/* Modals */}
      {selectedRoomId && (
        <DamageZoneModal
          isOpen={isDamageModalOpen}
          onClose={() => setIsDamageModalOpen(false)}
          roomId={selectedRoomId}
          onSave={(zone) => addDamageZone(claim.id, { ...zone, id: `dz${Date.now()}`, photos: [] })}
        />
      )}

      {selectedRoomId && (
        <OpeningModal
          isOpen={isOpeningModalOpen}
          onClose={() => {
            setIsOpeningModalOpen(false);
            setEditingOpening(undefined);
          }}
          onSave={handleSaveOpening}
          existingOpening={editingOpening}
        />
      )}

      <LineItemPicker
        isOpen={isLineItemPickerOpen}
        onClose={() => setIsLineItemPickerOpen(false)}
        onSelect={(item) => {
          addLineItem(claim.id, {
            ...item,
            quantity: 1, // Default to 1
            total: item.unitPrice,
            id: `li${Date.now()}`
          });
          setIsLineItemPickerOpen(false);
        }}
      />

      {/* Add Zone Dialog */}
      <Dialog open={isAddZoneDialogOpen} onOpenChange={setIsAddZoneDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Zone</DialogTitle>
            <DialogDescription>
              Create a new zone (room, elevation, roof section, etc.) to scope.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="zone-name">Zone Name</Label>
              <Input
                id="zone-name"
                placeholder="e.g., Living Room, Front Elevation, Roof Section A"
                value={newZoneData.name || ""}
                onChange={(e) => setNewZoneData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="zone-type">Zone Type</Label>
                <Select
                  value={newZoneData.zoneType || "room"}
                  onValueChange={(value) => setNewZoneData(prev => ({ ...prev, zoneType: value as any }))}
                >
                  <SelectTrigger id="zone-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="room">Room</SelectItem>
                    <SelectItem value="elevation">Elevation</SelectItem>
                    <SelectItem value="roof">Roof</SelectItem>
                    <SelectItem value="deck">Deck</SelectItem>
                    <SelectItem value="linear">Linear</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="room-type">Room Type</Label>
                <Select
                  value={newZoneData.roomType || ""}
                  onValueChange={(value) => setNewZoneData(prev => ({ ...prev, roomType: value }))}
                >
                  <SelectTrigger id="room-type">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bedroom">Bedroom</SelectItem>
                    <SelectItem value="Bathroom">Bathroom</SelectItem>
                    <SelectItem value="Kitchen">Kitchen</SelectItem>
                    <SelectItem value="Living Room">Living Room</SelectItem>
                    <SelectItem value="Dining Room">Dining Room</SelectItem>
                    <SelectItem value="Hallway">Hallway</SelectItem>
                    <SelectItem value="Garage">Garage</SelectItem>
                    <SelectItem value="Utility">Utility</SelectItem>
                    <SelectItem value="Office">Office</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="zone-length">Length (ft)</Label>
                <Input
                  id="zone-length"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="0"
                  value={newZoneData.lengthFt || ""}
                  onChange={(e) => setNewZoneData(prev => ({ ...prev, lengthFt: Number(e.target.value) || undefined }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zone-width">Width (ft)</Label>
                <Input
                  id="zone-width"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="0"
                  value={newZoneData.widthFt || ""}
                  onChange={(e) => setNewZoneData(prev => ({ ...prev, widthFt: Number(e.target.value) || undefined }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zone-height">Height (ft)</Label>
                <Input
                  id="zone-height"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="8"
                  value={newZoneData.heightFt || ""}
                  onChange={(e) => setNewZoneData(prev => ({ ...prev, heightFt: Number(e.target.value) || undefined }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="zone-notes">Notes</Label>
              <Input
                id="zone-notes"
                placeholder="Optional notes..."
                value={newZoneData.notes || ""}
                onChange={(e) => setNewZoneData(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddZoneDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddZone} disabled={!newZoneData.name || estimateBuilder.isSaving}>
              {estimateBuilder.isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Zone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Missing Wall Dialog */}
      <Dialog open={isAddMissingWallDialogOpen} onOpenChange={setIsAddMissingWallDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Missing Wall / Opening</DialogTitle>
            <DialogDescription>
              Openings subtract from wall square footage calculations.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="opening-type">Opening Type</Label>
                <Select
                  value={newMissingWallData.openingType || "opening"}
                  onValueChange={(value) => setNewMissingWallData(prev => ({ ...prev, openingType: value }))}
                >
                  <SelectTrigger id="opening-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opening">Opening</SelectItem>
                    <SelectItem value="doorway">Doorway</SelectItem>
                    <SelectItem value="archway">Archway</SelectItem>
                    <SelectItem value="pass-through">Pass-Through</SelectItem>
                    <SelectItem value="window">Window</SelectItem>
                    <SelectItem value="missing_wall">Missing Wall</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="opening-name">Name (optional)</Label>
                <Input
                  id="opening-name"
                  placeholder="e.g., North Wall Opening"
                  value={newMissingWallData.name || ""}
                  onChange={(e) => setNewMissingWallData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="opening-width">Width (ft)</Label>
                <Input
                  id="opening-width"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="3"
                  value={newMissingWallData.widthFt || ""}
                  onChange={(e) => setNewMissingWallData(prev => ({ ...prev, widthFt: Number(e.target.value) || undefined }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="opening-height">Height (ft)</Label>
                <Input
                  id="opening-height"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="7"
                  value={newMissingWallData.heightFt || ""}
                  onChange={(e) => setNewMissingWallData(prev => ({ ...prev, heightFt: Number(e.target.value) || undefined }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="opening-qty">Qty</Label>
                <Input
                  id="opening-qty"
                  type="number"
                  min="1"
                  placeholder="1"
                  value={newMissingWallData.quantity || ""}
                  onChange={(e) => setNewMissingWallData(prev => ({ ...prev, quantity: Number(e.target.value) || undefined }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="opens-into">Opens Into (optional)</Label>
              <Input
                id="opens-into"
                placeholder="e.g., Hallway, Kitchen"
                value={newMissingWallData.opensInto || ""}
                onChange={(e) => setNewMissingWallData(prev => ({ ...prev, opensInto: e.target.value }))}
              />
            </div>
            {newMissingWallData.widthFt && newMissingWallData.heightFt && (
              <div className="bg-slate-50 p-3 rounded-lg text-center">
                <p className="text-sm text-muted-foreground">Deducted Area</p>
                <p className="text-xl font-bold text-amber-600">
                  {((newMissingWallData.widthFt || 0) * (newMissingWallData.heightFt || 0) * (newMissingWallData.quantity || 1)).toFixed(1)} SF
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddMissingWallDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddMissingWall}
              disabled={!newMissingWallData.widthFt || !newMissingWallData.heightFt || estimateBuilder.isSaving}
            >
              {estimateBuilder.isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Opening
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Estimate Settings Dialog */}
      <Dialog open={isEstimateSettingsOpen} onOpenChange={setIsEstimateSettingsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Estimate Settings</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="region">Region</Label>
              <Select
                value={estimateSettings.regionId}
                onValueChange={(value) => setEstimateSettings({ regionId: value })}
              >
                <SelectTrigger id="region">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem key={region.id} value={region.id}>
                      {region.name}{region.state ? `, ${region.state}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="carrier">Carrier Profile</Label>
              <Select
                value={estimateSettings.carrierProfileId || "none"}
                onValueChange={(value) => setEstimateSettings({ carrierProfileId: value === "none" ? null : value })}
              >
                <SelectTrigger id="carrier">
                  <SelectValue placeholder="Select carrier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No carrier profile</SelectItem>
                  {carriers.map((carrier) => (
                    <SelectItem key={carrier.id} value={carrier.id}>
                      {carrier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="overhead">Overhead %</Label>
                <Input
                  id="overhead"
                  type="number"
                  min="0"
                  max="50"
                  value={estimateSettings.overheadPct}
                  onChange={(e) => setEstimateSettings({ overheadPct: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profit">Profit %</Label>
                <Input
                  id="profit"
                  type="number"
                  min="0"
                  max="50"
                  value={estimateSettings.profitPct}
                  onChange={(e) => setEstimateSettings({ profitPct: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
            {estimateError && (
              <p className="text-sm text-destructive">{estimateError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEstimateSettingsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const result = await calculateEstimate(claim.id);
                if (result) {
                  setIsEstimateSettingsOpen(false);
                  setActiveTab("estimate");
                }
              }}
              disabled={isCalculating || (claim.lineItems || []).length === 0}
            >
              {isCalculating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Calculating...
                </>
              ) : (
                'Generate Estimate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validation Results Dialog */}
      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {validationErrors.length > 0 ? (
                <>
                  <XCircle className="h-5 w-5 text-red-500" />
                  Validation Errors
                </>
              ) : validationWarnings.length > 0 ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Estimate Submitted with Warnings
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Validation Results
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {validationErrors.length > 0
                ? `${validationErrors.length} error(s) must be resolved before submission.`
                : validationWarnings.length > 0
                ? `Your estimate has been submitted successfully. Please review ${validationWarnings.length} warning(s).`
                : 'Validation complete.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Errors */}
            {validationErrors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-red-600 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Errors ({validationErrors.length})
                </h4>
                <div className="space-y-2">
                  {validationErrors.map((error, idx) => (
                    <div key={idx} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="font-medium text-red-800">{error.message}</p>
                      {error.details && (
                        <p className="text-sm text-red-600 mt-1">{error.details}</p>
                      )}
                      {error.suggestion && (
                        <p className="text-sm text-red-700 mt-2 italic">
                          Suggestion: {error.suggestion}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {validationWarnings.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-amber-600 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Warnings ({validationWarnings.length})
                </h4>
                <div className="space-y-2">
                  {validationWarnings.map((warning, idx) => (
                    <div key={idx} className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="font-medium text-amber-800">{warning.message}</p>
                      {warning.details && (
                        <p className="text-sm text-amber-600 mt-1">{warning.details}</p>
                      )}
                      {warning.suggestion && (
                        <p className="text-sm text-amber-700 mt-2 italic">
                          Suggestion: {warning.suggestion}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowValidationDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
