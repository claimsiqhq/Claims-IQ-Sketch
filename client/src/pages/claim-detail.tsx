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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Home,
  PenTool,
  ClipboardList,
  ClipboardCheck,
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
  ChevronLeft,
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
  ArrowLeft,
  Archive,
  ZoomIn,
  ZoomOut,
  User,
  Shield,
  Clock,
  Calendar,
  CalendarPlus,
  CloudRain,
  CloudSnow,
  Cloud,
  Sun,
  Wind,
  Thermometer,
  Droplets
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
  getClaimEndorsementExtractions,
  getDocumentDownloadUrl,
  deleteClaim,
  updateClaim,
  submitEstimate,
  downloadEstimatePdf,
  downloadEstimateExport,
  type EsxExportFormat,
  getEstimateLockStatus,
  getScopeItems,
  addScopeItem,
  updateScopeItem as apiUpdateScopeItem,
  deleteScopeItem as apiDeleteScopeItem,
  getClaimContext,
  getCoverageAnalysisSummary,
  getClaimPhotos,
  uploadPhoto,
  deletePhoto,
  updatePhoto,
  reanalyzePhoto,
  type Claim,
  type Document,
  type EndorsementExtraction,
  type SubmissionResult,
  type ValidationIssue,
  type EstimateLockStatus,
  type ScopeItem,
  type UnifiedClaimContext,
  type CoverageAnalysisSummary,
  type CoverageAlert,
  type ClaimPhoto,
} from "@/lib/api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PhotoAlbum } from "@/features/voice-sketch/components/PhotoAlbum";
import type { SketchPhoto } from "@/features/voice-sketch/types/geometry";

import { VoiceSketchController } from "@/features/voice-sketch/components/VoiceSketchController";
import { SketchToolbar } from "@/features/voice-sketch/components/SketchToolbar";
import { useGeometryEngine } from "@/features/voice-sketch/services/geometry-engine";
import { saveClaimRooms, getClaimRooms, type ClaimRoom, type ClaimDamageZone } from "@/lib/api";
import type { RoomGeometry } from "@/features/voice-sketch/types/geometry";
import DamageZoneModal from "@/components/damage-zone-modal";
import OpeningModal from "@/components/opening-modal";
import LineItemPicker from "@/components/line-item-picker";
import DocumentViewer from "@/components/document-viewer";
import { VoiceScopeController } from "@/features/voice-scope";
import { PerilBadgeGroup, PerilAdvisoryBanner, PerilHint } from "@/components/peril-badge";
import { InspectionTipsPanel } from "@/components/inspection-tips-panel";
import { BriefingPanel } from "@/components/briefing-panel";
import { ClaimFlowSection } from "@/components/flow";
import { CarrierGuidancePanel } from "@/components/carrier-guidance-panel";
import ClaimChecklistPanel from "@/components/claim-checklist";
import { Room, RoomOpening, Peril, PERIL_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DoorOpen } from "lucide-react";
import { useUploadQueue } from "@/lib/uploadQueue";

// Helper to convert ClaimPhoto to SketchPhoto for PhotoAlbum compatibility
interface ExtendedSketchPhoto extends SketchPhoto {
  claimId?: string | null;
  taxonomyPrefix?: string | null;
}

function claimPhotoToSketchPhoto(cp: ClaimPhoto): ExtendedSketchPhoto {
  return {
    id: cp.id,
    label: cp.label || 'Photo',
    hierarchyPath: cp.hierarchyPath || 'Unassigned',
    storageUrl: cp.publicUrl,
    localUri: cp.publicUrl,
    storagePath: cp.storagePath,
    latitude: cp.latitude,
    longitude: cp.longitude,
    geoAddress: cp.geoAddress,
    uploadedBy: cp.uploadedBy,
    claimId: cp.claimId,
    taxonomyPrefix: cp.taxonomyPrefix,
    aiAnalysis: cp.aiAnalysis && Object.keys(cp.aiAnalysis).length > 0 ? {
      quality: cp.aiAnalysis.quality || { score: 5, issues: [], suggestions: [] },
      content: cp.aiAnalysis.content || { description: '', damageDetected: false, damageTypes: [], damageLocations: [], materials: [], recommendedLabel: '' },
      metadata: cp.aiAnalysis.metadata || { lighting: 'fair', focus: 'acceptable', angle: 'acceptable', coverage: 'partial' },
    } : null,
    capturedAt: cp.capturedAt || new Date().toISOString(),
    analyzedAt: cp.analyzedAt || undefined,
    structureId: cp.structureId || undefined,
    roomId: cp.roomId || undefined,
    subRoomId: cp.damageZoneId || undefined,
    analysisStatus: cp.analysisStatus || null,
    analysisError: cp.analysisError || null,
  };
}

export default function ClaimDetail() {
  const [, params] = useRoute("/claim/:id");
  const [, setLocation] = useLocation();
  const { layoutMode, isMobile, isTablet } = useDeviceMode();
  const isMobileLayout = layoutMode === "mobile";

  // Early return if no claim ID
  if (!params?.id) {
    return (
      <Layout>
        <div className="p-4">
          <div className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Claim Not Found</h2>
            <p className="text-muted-foreground mb-4">No claim ID provided in the URL.</p>
            <Button onClick={() => setLocation('/claims')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Claims
            </Button>
          </div>
        </div>
      </Layout>
    );
  }
  const {
    activeClaim: claim,
    setActiveClaim,
    ensureClaim,
    addRoom,
    updateRoom,
    deleteRoom,
    addDamageZone,
    regions,
    carriers,
    estimateSettings,
    calculatedEstimate,
    isCalculating,
    estimateError,
    loadRegionsAndCarriers,
    setEstimateSettings,
    calculateEstimate,
    authUser,
  } = useStore();

  // API Claim Data
  const [apiClaim, setApiClaim] = useState<Claim | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [endorsements, setEndorsements] = useState<EndorsementExtraction[]>([]);
  const [scopeItems, setScopeItems] = useState<ScopeItem[]>([]);
  const [savedRooms, setSavedRooms] = useState<ClaimRoom[]>([]);
  const [savedDamageZones, setSavedDamageZones] = useState<ClaimDamageZone[]>([]);
  const [loadingApiData, setLoadingApiData] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [savingScopeItem, setSavingScopeItem] = useState(false);

  // Unified Claim Context (merged FNOL + Policy + Endorsements)
  const [claimContext, setClaimContext] = useState<UnifiedClaimContext | null>(null);
  const [coverageSummary, setCoverageSummary] = useState<CoverageAnalysisSummary | null>(null);

  // Bulk upload queue integration
  const { addToQueue } = useUploadQueue();

  // Geometry engine state for SketchToolbar
  const { rooms: geometryRooms } = useGeometryEngine();

  // Handler for SketchToolbar room updates
  const handleGeometryRoomsChange = useCallback((updatedRooms: RoomGeometry[]) => {
    useGeometryEngine.setState({ rooms: updatedRooms });
  }, []);

  // React Query client for cache management
  const queryClient = useQueryClient();

  // Photo upload state
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Fetch claim photos using react-query
  const { data: claimPhotos = [], refetch: refetchPhotos } = useQuery({
    queryKey: ['claimPhotos', params?.id],
    queryFn: () => getClaimPhotos(params!.id),
    enabled: !!params?.id,
    refetchInterval: (query) => {
      // Poll every 3 seconds if any photos are pending/analyzing
      const photos = query.state.data || [];
      const needsPolling = photos.some((p: ClaimPhoto) =>
        p.analysisStatus === 'pending' || p.analysisStatus === 'analyzing'
      );
      
      // Stop polling after 5 minutes to prevent infinite polling
      const startTime = query.state.dataUpdatedAt || Date.now();
      const elapsed = Date.now() - startTime;
      if (elapsed > 5 * 60 * 1000) {
        return false;
      }
      
      return needsPolling ? 3000 : false;
    },
    retry: 3, // Retry failed requests up to 3 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });

  // Convert ClaimPhotos to SketchPhotos for PhotoAlbum
  const sketchPhotos: ExtendedSketchPhoto[] = useMemo(() => {
    return claimPhotos.map(claimPhotoToSketchPhoto);
  }, [claimPhotos]);

  // Photo delete mutation with optimistic updates
  const deletePhotoMutation = useMutation({
    mutationFn: deletePhoto,
    onMutate: async (photoId) => {
      await queryClient.cancelQueries({ queryKey: ['claimPhotos', params?.id] });
      const previousPhotos = queryClient.getQueryData<ClaimPhoto[]>(['claimPhotos', params?.id]);
      queryClient.setQueryData<ClaimPhoto[]>(['claimPhotos', params?.id], (old = []) =>
        old.filter(p => p.id !== photoId)
      );
      return { previousPhotos };
    },
    onSuccess: () => {
      toast.success('Photo deleted');
    },
    onError: (error, _photoId, context) => {
      if (context?.previousPhotos) {
        queryClient.setQueryData(['claimPhotos', params?.id], context.previousPhotos);
      }
      toast.error('Failed to delete photo: ' + (error as Error).message);
    },
  });

  // Photo update mutation with optimistic updates
  const updatePhotoMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: { label?: string; hierarchyPath?: string; claimId?: string | null } }) =>
      updatePhoto(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['claimPhotos', params?.id] });
      const previousPhotos = queryClient.getQueryData<ClaimPhoto[]>(['claimPhotos', params?.id]);
      queryClient.setQueryData<ClaimPhoto[]>(['claimPhotos', params?.id], (old = []) =>
        old.map(p => p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p)
      );
      return { previousPhotos };
    },
    onSuccess: () => {
      toast.success('Photo updated');
    },
    onError: (error, _variables, context) => {
      if (context?.previousPhotos) {
        queryClient.setQueryData(['claimPhotos', params?.id], context.previousPhotos);
      }
      toast.error('Failed to update photo: ' + (error as Error).message);
    },
  });

  // Photo reanalyze mutation
  const reanalyzePhotoMutation = useMutation({
    mutationFn: reanalyzePhoto,
    onSuccess: () => {
      toast.success('Photo re-analysis started');
      queryClient.invalidateQueries({ queryKey: ['claimPhotos', params?.id] });
    },
    onError: (error) => {
      toast.error('Failed to re-analyze photo: ' + (error as Error).message);
    },
  });

  // Photo upload mutation (uses proper photo API with AI analysis) with optimistic updates
  const uploadPhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      // Get GPS coordinates if available
      let latitude: number | undefined;
      let longitude: number | undefined;

      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
          });
        });
        latitude = position.coords.latitude;
        longitude = position.coords.longitude;
      } catch (e) {
        // GPS not available - continue without coordinates
      }

      return uploadPhoto({
        file,
        claimId: params?.id,
        label: 'Photo',
        hierarchyPath: 'Exterior',
        latitude,
        longitude,
      });
    },
    onMutate: async (file) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['claimPhotos', params?.id] });

      // Snapshot previous value
      const previousPhotos = queryClient.getQueryData<ClaimPhoto[]>(['claimPhotos', params?.id]);

      // Optimistically add photo
      const optimisticPhoto: ClaimPhoto = {
        id: `temp-${Date.now()}`,
        claimId: params?.id || null,
        label: 'Photo',
        hierarchyPath: 'Exterior',
        publicUrl: URL.createObjectURL(file),
        storagePath: '',
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        analysisStatus: 'pending',
        aiAnalysis: {},
        damageDetected: false,
        qualityScore: undefined,
        capturedAt: new Date().toISOString(),
        analyzedAt: null,
        uploadedBy: authUser?.id || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        latitude,
        longitude,
        geoAddress: null,
        analysisError: null,
        structureId: null,
        roomId: null,
        damageZoneId: null,
      };

      // Optimistically update cache
      queryClient.setQueryData<ClaimPhoto[]>(['claimPhotos', params?.id], (old = []) => [
        ...old,
        optimisticPhoto,
      ]);

      return { previousPhotos };
    },
    onSuccess: async () => {
      toast.success('Photo uploaded - AI analysis in progress');
      queryClient.invalidateQueries({ queryKey: ['claimPhotos', params?.id] });
    },
    onError: (error, _file, context) => {
      // Rollback optimistic update
      if (context?.previousPhotos) {
        queryClient.setQueryData(['claimPhotos', params?.id], context.previousPhotos);
      }
      toast.error('Failed to upload photo: ' + (error as Error).message);
    },
  });

  // Photo action handlers
  const handleDeletePhoto = (photoId: string) => {
    if (confirm('Are you sure you want to delete this photo?')) {
      deletePhotoMutation.mutate(photoId);
    }
  };

  const handleUpdatePhoto = (photoId: string, updates: { label?: string; hierarchyPath?: string; claimId?: string | null }) => {
    updatePhotoMutation.mutate({ id: photoId, updates });
  };

  const handleReanalyzePhoto = (photoId: string) => {
    reanalyzePhotoMutation.mutate(photoId);
  };

  // Handle photo upload for Photos tab (uses proper photo API)
  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !params?.id) return;

    setIsUploadingPhoto(true);

    try {
      // Upload each file sequentially
      for (const file of Array.from(files)) {
        await uploadPhotoMutation.mutateAsync(file);
      }
    } finally {
      setIsUploadingPhoto(false);
      // Clear the input so the same files can be re-selected if needed
      event.target.value = '';
    }
  };

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [isDamageModalOpen, setIsDamageModalOpen] = useState(false);
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [editingOpening, setEditingOpening] = useState<RoomOpening | undefined>(undefined);
  const [isLineItemPickerOpen, setIsLineItemPickerOpen] = useState(false);
  const [isEstimateSettingsOpen, setIsEstimateSettingsOpen] = useState(false);
  const [isScheduleInspectionOpen, setIsScheduleInspectionOpen] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleFormData, setScheduleFormData] = useState({
    date: '',
    time: '09:00',
    duration: 60,
    notes: '',
  });
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

  // Sketch-to-Scope transition state
  const [showScopeSuggestionPrompt, setShowScopeSuggestionPrompt] = useState(false);
  const [savedDamageZoneCount, setSavedDamageZoneCount] = useState(0);

  // Xactimate hierarchy state
  const [isAddZoneDialogOpen, setIsAddZoneDialogOpen] = useState(false);
  const [isAddMissingWallDialogOpen, setIsAddMissingWallDialogOpen] = useState(false);
  const [expandedStructures, setExpandedStructures] = useState<Set<string>>(new Set());
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [selectedZoneForLineItem, setSelectedZoneForLineItem] = useState<string | null>(null);
  const [newZoneData, setNewZoneData] = useState<Partial<CreateZoneInput>>({});
  const [newMissingWallData, setNewMissingWallData] = useState<Partial<CreateMissingWallInput>>({});
  const [selectedAreaForNewZone, setSelectedAreaForNewZone] = useState<string | null>(null);

  // Delete/close claim state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Document preview state
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewDocName, setPreviewDocName] = useState<string>("");
  const [previewImageData, setPreviewImageData] = useState<{ pages: number; images: string[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewZoom, setPreviewZoom] = useState(100);

  // Estimate finalization state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isExporting, setIsExporting] = useState<EsxExportFormat | null>(null);
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
      const [claimData, docsData, endorsementsData, scopeData, roomsData, contextData, coverageData] = await Promise.all([
        getClaim(params.id),
        getClaimDocuments(params.id),
        getClaimEndorsementExtractions(params.id).catch(() => []), // Don't fail if endorsements fail
        getScopeItems(params.id).catch(() => []), // Don't fail if scope items fail
        getClaimRooms(params.id).catch(() => ({ rooms: [], damageZones: [] })), // Don't fail if rooms fail
        getClaimContext(params.id).catch(() => null), // Don't fail if context not available
        getCoverageAnalysisSummary(params.id).catch(() => null), // Don't fail if coverage analysis not available
      ]);
      setApiClaim(claimData);
      setDocuments(docsData);
      setEndorsements(endorsementsData);
      setScopeItems(scopeData);
      setSavedRooms(roomsData.rooms || []);
      setSavedDamageZones(roomsData.damageZones || []);
      setClaimContext(contextData);
      setCoverageSummary(coverageData);
      // Ensure the claim exists in the store for sketch operations
      // Cast the API Claim to the store's Partial<Claim> type (status field is compatible)
      ensureClaim(params.id, claimData as any);
    } catch (err) {
      setApiError((err as Error).message);
    } finally {
      setLoadingApiData(false);
    }
  }, [params?.id, ensureClaim]);

  useEffect(() => {
    loadApiData();
  }, [loadApiData]);

  // Initialize estimate settings from claim data when claim loads
  useEffect(() => {
    if (apiClaim?.regionId && regions.length > 0 && !estimateSettings.regionId) {
      // Set region from claim if available and settings don't have a region yet
      setEstimateSettings({ regionId: apiClaim.regionId });
    }
  }, [apiClaim?.regionId, regions, estimateSettings.regionId, setEstimateSettings]);

  // Load estimate lock status
  const loadLockStatus = useCallback(async () => {
    if (!params?.id) return;
    try {
      const status = await getEstimateLockStatus(params.id);
      setEstimateLockStatus(status);
    } catch {
      // Estimate may not exist yet - that's ok
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

  // Handle ESX/CSV export
  const handleExport = async (format: EsxExportFormat, includePhotos?: boolean) => {
    if (!params?.id || isExporting) return;

    setIsExporting(format);
    try {
      await downloadEstimateExport(params.id, format, { includePhotos });
      const formatLabels: Record<EsxExportFormat, string> = {
        'esx-zip': 'ESX',
        'esx-xml': 'ESX (XML)',
        'csv': 'CSV'
      };
      toast.success(`${formatLabels[format]} exported successfully`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Failed to export ${format}`;
      toast.error(errorMessage);
      console.error('Export error:', err);
    } finally {
      setIsExporting(null);
    }
  };

  // Handle document preview
  const handleDocumentPreview = async (docId: string, docName: string) => {
    setPreviewDocId(docId);
    setPreviewDocName(docName);
    setPreviewLoading(true);
    setPreviewPage(1);
    setPreviewZoom(100);
    setPreviewImageData(null);

    try {
      const response = await fetch(`/api/documents/${docId}/images`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setPreviewImageData(data);
      }
    } catch (error) {
      console.error('Failed to load document preview:', error);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closeDocumentPreview = () => {
    setPreviewDocId(null);
    setPreviewImageData(null);
  };

  // Scope item handlers (persist to database via API)
  const handleAddScopeItem = async (item: {
    code: string;
    description: string;
    category?: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    roomName?: string;
  }) => {
    if (!params?.id) return;
    
    setSavingScopeItem(true);
    try {
      const newItem = await addScopeItem(params.id, {
        lineItemCode: item.code,
        description: item.description,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        roomName: item.roomName,
      });
      setScopeItems(prev => [...prev, newItem]);
      toast.success('Line item added');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add line item';
      toast.error(errorMessage);
    } finally {
      setSavingScopeItem(false);
    }
  };

  const handleUpdateScopeItem = async (itemId: string, data: { quantity?: number; notes?: string }) => {
    try {
      const updated = await apiUpdateScopeItem(itemId, data);
      setScopeItems(prev => prev.map(item => item.id === itemId ? updated : item));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update line item';
      toast.error(errorMessage);
    }
  };

  const handleDeleteScopeItem = async (itemId: string) => {
    try {
      await apiDeleteScopeItem(itemId);
      setScopeItems(prev => prev.filter(item => item.id !== itemId));
      toast.success('Line item removed');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete line item';
      toast.error(errorMessage);
    }
  };

  // Handle document upload - uses background queue with auto-classification
  const handleDocumentUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !params?.id) return;

    const fileArray = Array.from(files);

    // Add files to the upload queue with auto-classification
    // The queue handles concurrent uploads, progress tracking, and AI processing
    addToQueue(fileArray, {
      claimId: params.id,
      claimNumber: apiClaim?.claimNumber,
      type: 'auto', // Auto-classify document type using AI
    });

    // Show feedback to user
    const fileCount = fileArray.length;
    toast.success(
      fileCount === 1
        ? `Uploading ${fileArray[0].name}...`
        : `Uploading ${fileCount} documents...`,
      { description: 'Documents will be processed in the background' }
    );

    // Clear the input so the same files can be re-selected if needed
    event.target.value = '';
  };

  // Handle delete claim
  const handleDeleteClaim = async () => {
    if (!params?.id) return;
    
    setIsDeleting(true);
    try {
      await deleteClaim(params.id);
      setActiveClaim(null);
      
      // Invalidate all claim-related queries before navigation
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      queryClient.invalidateQueries({ queryKey: ['claim', params.id] });
      queryClient.invalidateQueries({ queryKey: ['claimStats'] });
      
      toast.success("Claim deleted successfully");
      
      // Small delay to ensure cache invalidation completes before navigation
      await new Promise(resolve => setTimeout(resolve, 100));
      
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

  const handleCloseClaim = async () => {
    if (!params?.id) return;
    
    setIsClosing(true);
    try {
      await updateClaim(params.id, { status: 'closed' });
      setApiClaim(prev => prev ? { ...prev, status: 'closed' } : null);
      toast.success("Claim closed successfully", {
        description: "This claim is now hidden from the main list. Use 'Show closed' to view it."
      });
      setIsCloseDialogOpen(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to close claim";
      toast.error(errorMessage);
      console.error("Close claim error:", err);
    } finally {
      setIsClosing(false);
    }
  };

  const selectedRoom = (claim?.rooms || []).find(r => r.id === selectedRoomId);

  const handleSaveOpening = (openingData: Omit<RoomOpening, "id">) => {
    if (!selectedRoom || !claim) return;

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
    if (!selectedRoom || !claim) return;
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
    if (!claim) return;
    if (scopeItems.length === 0) {
      setIsEstimateSettingsOpen(true);
      return;
    }
    const result = await calculateEstimate(claim.id);
    if (result) {
      setActiveTab("estimate");
    }
  };

  // Helper functions for voice sketch save
  const inferRoomType = (name: string): string => {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('bedroom') || nameLower.includes('master')) return 'Bedroom';
    if (nameLower.includes('bathroom') || nameLower.includes('bath')) return 'Bathroom';
    if (nameLower.includes('kitchen')) return 'Kitchen';
    if (nameLower.includes('living') || nameLower.includes('family')) return 'Living Room';
    if (nameLower.includes('dining')) return 'Dining Room';
    if (nameLower.includes('office') || nameLower.includes('study')) return 'Office';
    if (nameLower.includes('garage')) return 'Garage';
    if (nameLower.includes('basement')) return 'Basement';
    if (nameLower.includes('laundry')) return 'Laundry';
    if (nameLower.includes('closet')) return 'Closet';
    if (nameLower.includes('hall')) return 'Hallway';
    return 'Room';
  };

  const handleSaveVoiceSketch = async () => {
    if (!claim) return;
    
    const geometryState = useGeometryEngine.getState();
    const confirmedRooms = geometryState.rooms;
    const currentRoomState = geometryState.currentRoom;
    
    if (confirmedRooms.length === 0 && !currentRoomState) {
      toast.error('No rooms to save', {
        description: 'Create and confirm at least one room first.',
      });
      return;
    }

    const roomsToSave = currentRoomState
      ? [...confirmedRooms, currentRoomState]
      : confirmedRooms;

    const claimRooms: ClaimRoom[] = [];
    const claimDamageZones: ClaimDamageZone[] = [];

    roomsToSave.forEach((voiceRoom: RoomGeometry) => {
      const claimRoom: ClaimRoom = {
        id: voiceRoom.id,
        name: voiceRoom.name.replace(/_/g, ' '),
        roomType: inferRoomType(voiceRoom.name),
        widthFt: String(voiceRoom.width_ft),
        lengthFt: String(voiceRoom.length_ft),
        ceilingHeightFt: String(voiceRoom.ceiling_height_ft),
        originXFt: '0',
        originYFt: '0',
        shape: 'rectangular',
      };
      claimRooms.push(claimRoom);

      voiceRoom.damageZones.forEach((vDamage) => {
        const claimDamage: ClaimDamageZone = {
          id: vDamage.id,
          roomId: voiceRoom.id,
          damageType: vDamage.type,
          severity: vDamage.category || 'medium',
          affectedWalls: vDamage.affected_walls,
          floorAffected: vDamage.floor_affected,
          ceilingAffected: vDamage.ceiling_affected,
          extentFt: String(vDamage.extent_ft),
          source: vDamage.source || '',
          notes: vDamage.notes || '',
          isFreeform: vDamage.is_freeform || false,
        };
        claimDamageZones.push(claimDamage);
      });
    });

    try {
      const result = await saveClaimRooms(claim.id, claimRooms, claimDamageZones);

      toast.success('Rooms saved to claim!', {
        description: `Saved ${result.roomsSaved} room(s) and ${result.damageZonesSaved} damage zone(s).`,
      });

      // Reset the geometry engine
      useGeometryEngine.getState().resetSession();

      // Reload the claim data
      if (params?.id) {
        const updatedClaim = await getClaim(params.id);
        if (updatedClaim) {
          setApiClaim(updatedClaim);
          // Force refresh by toggling active claim
          setActiveClaim(null);
          setActiveClaim(params.id);

          // Show scope suggestion prompt if damage zones were saved
          if (claimDamageZones.length > 0) {
            setSavedDamageZoneCount(claimDamageZones.length);
            setShowScopeSuggestionPrompt(true);
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save rooms';
      toast.error('Failed to save rooms', { description: message });
    }
  };

  const handleGenerateAISuggestions = async () => {
    if (!claim) return;
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
      const suggestions = result.suggestions || [];
      setAiSuggestions(suggestions);

      // Auto-switch to Scope tab if suggestions were generated
      if (suggestions.length > 0) {
        setActiveTab("scope");
        toast.success(`Generated ${suggestions.length} scope suggestions`, {
          description: "Review and add items to your estimate.",
        });
      } else {
        toast.info("No suggestions generated", {
          description: "Try adding more detailed damage zones.",
        });
      }
    } catch (error) {
      console.error("AI suggestion error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate AI suggestions");
    } finally {
      setIsGeneratingAISuggestions(false);
    }
  };

  const handleAddAISuggestion = async (suggestion: typeof aiSuggestions extends (infer T)[] | null ? T : never) => {
    if (!suggestion) return;

    await handleAddScopeItem({
      code: suggestion.lineItemCode,
      description: suggestion.description,
      quantity: suggestion.quantity,
      unit: suggestion.unit,
      unitPrice: suggestion.unitPrice || 0,
      category: "AI Suggested",
    });

    // Remove from suggestions
    setAiSuggestions(prev => prev?.filter(s => s.lineItemCode !== suggestion.lineItemCode) || null);
  };

  const handleAddAllAISuggestions = async () => {
    if (!aiSuggestions) return;

    for (const suggestion of aiSuggestions) {
      await handleAddScopeItem({
        code: suggestion.lineItemCode,
        description: suggestion.description,
        quantity: suggestion.quantity,
        unit: suggestion.unit,
        unitPrice: suggestion.unitPrice || 0,
        category: "AI Suggested",
      });
    }

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
  const localSubtotal = scopeItems.reduce((sum, item) => sum + item.total, 0);
  const displaySubtotal = calculatedEstimate?.subtotal ?? localSubtotal;
  const displayOverhead = calculatedEstimate?.overheadAmount ?? (localSubtotal * (estimateSettings.overheadPct / 100));
  const displayProfit = calculatedEstimate?.profitAmount ?? (localSubtotal * (estimateSettings.profitPct / 100));
  const displayTax = calculatedEstimate?.taxAmount ?? 0;
  const displayTotal = calculatedEstimate?.grandTotal ?? (displaySubtotal + displayOverhead + displayProfit + displayTax);

  const tabs = [
    { id: "info", label: "Info", icon: Home },
    { id: "briefing", label: "Briefing", icon: Sparkles },
    { id: "workflow", label: "Workflow", icon: ClipboardCheck },
    { id: "checklist", label: "Checklist", icon: Check },
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
  if (apiError || !apiClaim || !claim) {
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
            {/* Close Claim Button */}
            {apiClaim?.status !== 'closed' && apiClaim?.status !== 'draft' && (
              <AlertDialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden md:flex"
                    data-testid="button-close-claim"
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Close Claim
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Close Claim</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will mark the claim as closed. Closed claims are hidden from the main claims list but can still be viewed by enabling "Show closed" in the filters. You can reopen the claim later if needed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isClosing}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleCloseClaim}
                      disabled={isClosing}
                      data-testid="button-confirm-close"
                    >
                      {isClosing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Closing...
                        </>
                      ) : (
                        "Close Claim"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            
            {/* Delete Claim Button */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex text-destructive hover:text-destructive hover:bg-destructive/10"
                  data-testid="button-delete-claim"
                >
                  <Trash2 className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Delete</span>
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
              onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                setScheduleFormData(prev => ({ ...prev, date: today }));
                setIsScheduleInspectionOpen(true);
              }}
              data-testid="button-schedule-inspection"
            >
              <CalendarPlus className="h-4 w-4 mr-2" />
              Schedule Inspection
            </Button>
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
              disabled={isCalculating || scopeItems.length === 0}
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
                  <div className="space-y-1">
                    <h2 className="text-2xl font-bold">{apiClaim?.policyholder || 'Unknown Policyholder'}</h2>
                    <p className="text-muted-foreground">Claim ID: {apiClaim?.claimId || params?.id}</p>
                    {/* Peril badges - display primary and secondary perils */}
                    {apiClaim?.primaryPeril && (
                      <PerilBadgeGroup
                        primaryPeril={apiClaim.primaryPeril}
                        secondaryPerils={apiClaim.secondaryPerils}
                        size="md"
                        className="mt-2"
                      />
                    )}
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

                {/* Peril Advisory Banner - shows coverage warnings for flood/mold */}
                {apiClaim?.primaryPeril && (
                  <PerilAdvisoryBanner peril={apiClaim.primaryPeril} />
                )}

                {/* Inspection Tips Panel - peril-specific inspection guidance */}
                {apiClaim?.primaryPeril && (
                  <InspectionTipsPanel
                    peril={apiClaim.primaryPeril}
                    secondaryPerils={apiClaim.secondaryPerils}
                    claimId={apiClaim.id}
                    defaultExpanded={false}
                  />
                )}

                {/* Carrier Guidance Panel - carrier-specific requirements (read-only) */}
                {apiClaim?.id && (
                  <CarrierGuidancePanel
                    claimId={apiClaim.id}
                    defaultExpanded={false}
                  />
                )}

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
                        <Label className="text-xs text-muted-foreground uppercase">Property Address</Label>
                        <p className="font-medium">{apiClaim?.propertyAddress || apiClaim?.riskLocation || '-'}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase">Date of Loss</Label>
                          <p className="font-medium">{apiClaim?.dateOfLoss || '-'}</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase">Peril / Cause of Loss</Label>
                          {apiClaim?.primaryPeril ? (
                            <div className="space-y-1">
                              <PerilBadgeGroup
                                primaryPeril={apiClaim.primaryPeril}
                                secondaryPerils={apiClaim.secondaryPerils}
                                size="sm"
                                showIcons={true}
                              />
                              {/* Subtle peril-specific hint */}
                              <PerilHint peril={apiClaim.primaryPeril} />
                            </div>
                          ) : (
                            <Badge variant="outline" className="font-medium">
                              {apiClaim?.causeOfLoss || '-'}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <Separator />
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground uppercase">Loss Description</Label>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <p className="text-sm text-amber-900">{apiClaim?.lossDescription || 'No description provided'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* ============================================ */}
                  {/* INSURED INFORMATION CARD */}
                  {/* ============================================ */}
                  {apiClaim?.extractedPolicy && (apiClaim.extractedPolicy.namedInsured || apiClaim.extractedPolicy.insuredEmail || apiClaim.extractedPolicy.insuredPhone) && (
                    <Card className="border-emerald-200">
                      <CardHeader className="pb-3 bg-emerald-50 rounded-t-lg">
                        <CardTitle className="text-lg flex items-center gap-2 text-emerald-800">
                          <User className="w-5 h-5 text-emerald-600" />
                          Insured Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 bg-emerald-50/30">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {apiClaim.extractedPolicy.namedInsured && (
                            <div className="bg-white rounded-lg p-3 border border-emerald-100">
                              <Label className="text-xs text-emerald-600 uppercase">Named Insured</Label>
                              <p className="font-medium text-emerald-900">{apiClaim.extractedPolicy.namedInsured}</p>
                            </div>
                          )}
                          {apiClaim.extractedPolicy.insuredName2 && (
                            <div className="bg-white rounded-lg p-3 border border-emerald-100">
                              <Label className="text-xs text-emerald-600 uppercase">Co-Insured</Label>
                              <p className="font-medium text-emerald-900">{apiClaim.extractedPolicy.insuredName2}</p>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {apiClaim.extractedPolicy.insuredPhone && (
                            <div className="bg-white rounded-lg p-3 border border-emerald-100">
                              <Label className="text-xs text-emerald-600 uppercase">Phone</Label>
                              <p className="font-medium text-emerald-900">{apiClaim.extractedPolicy.insuredPhone}</p>
                            </div>
                          )}
                          {apiClaim.extractedPolicy.insuredEmail && (
                            <div className="bg-white rounded-lg p-3 border border-emerald-100">
                              <Label className="text-xs text-emerald-600 uppercase">Email</Label>
                              <p className="font-medium text-sm break-all text-emerald-900">{apiClaim.extractedPolicy.insuredEmail}</p>
                            </div>
                          )}
                        </div>
                        {apiClaim.extractedPolicy.mailingAddress && (
                          <div className="bg-white rounded-lg p-3 border border-emerald-100">
                            <Label className="text-xs text-emerald-600 uppercase">Mailing Address</Label>
                            <p className="font-medium text-sm text-emerald-900">{apiClaim.extractedPolicy.mailingAddress}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* ============================================ */}
                  {/* POLICY & COVERAGE DETAILS CARD */}
                  {/* ============================================ */}
                  <Card className="lg:col-span-2">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Shield className="w-5 h-5" />
                        Policy & Coverage Details
                        {apiClaim?.extractedPolicy && (
                          <Badge variant="outline" className="ml-2 text-xs text-green-600 border-green-300">Extracted</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Policy Info Row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase">Policy Number</Label>
                          <p className="font-mono font-medium text-sm" data-testid="policy-number">
                            {apiClaim?.extractedPolicy?.policyNumber || apiClaim?.policyNumber || '-'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase">Policy Type</Label>
                          <p className="font-medium text-sm">{apiClaim?.extractedPolicy?.policyType || '-'}</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase">Effective</Label>
                          <p className="font-medium text-sm">{apiClaim?.extractedPolicy?.effectiveDate || '-'}</p>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground uppercase">Status</Label>
                          <p className="font-medium text-sm">{apiClaim?.extractedPolicy?.policyStatus || '-'}</p>
                        </div>
                      </div>

                      <Separator />

                      {/* Primary Coverages (A-F) */}
                      <div>
                        <h4 className="text-sm font-semibold text-muted-foreground mb-3">PRIMARY COVERAGES</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <Label className="text-xs text-green-700 uppercase">Coverage A</Label>
                            <p className="text-lg font-bold text-green-700" data-testid="dwelling-limit">
                              {apiClaim?.extractedPolicy?.dwellingLimit || '-'}
                            </p>
                            <p className="text-xs text-green-600">Dwelling</p>
                          </div>
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <Label className="text-xs text-blue-700 uppercase">Coverage B</Label>
                            <p className="text-lg font-bold text-blue-700" data-testid="coverage-b">
                              {apiClaim?.extractedPolicy?.otherStructuresLimit || '-'}
                            </p>
                            <p className="text-xs text-blue-600">Other Structures</p>
                          </div>
                          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                            <Label className="text-xs text-purple-700 uppercase">Coverage C</Label>
                            <p className="text-lg font-bold text-purple-700" data-testid="coverage-c">
                              {apiClaim?.extractedPolicy?.personalPropertyLimit || '-'}
                            </p>
                            <p className="text-xs text-purple-600">Personal Property</p>
                          </div>
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                            <Label className="text-xs text-orange-700 uppercase">Coverage D</Label>
                            <p className="text-lg font-bold text-orange-700" data-testid="coverage-d">
                              {apiClaim?.extractedPolicy?.lossOfUseLimit || '-'}
                            </p>
                            <p className="text-xs text-orange-600">Loss of Use</p>
                          </div>
                          <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                            <Label className="text-xs text-teal-700 uppercase">Coverage E</Label>
                            <p className="text-lg font-bold text-teal-700">
                              {apiClaim?.extractedPolicy?.personalLiabilityLimit || '-'}
                            </p>
                            <p className="text-xs text-teal-600">Liability</p>
                          </div>
                          <div className="bg-pink-50 border border-pink-200 rounded-lg p-3">
                            <Label className="text-xs text-pink-700 uppercase">Coverage F</Label>
                            <p className="text-lg font-bold text-pink-700">
                              {apiClaim?.extractedPolicy?.medicalPaymentsLimit || '-'}
                            </p>
                            <p className="text-xs text-pink-600">Medical</p>
                          </div>
                        </div>
                      </div>

                      {/* Deductibles */}
                      <div>
                        <h4 className="text-sm font-semibold text-muted-foreground mb-3">DEDUCTIBLES</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <Label className="text-xs text-amber-700 uppercase">AOP Deductible</Label>
                            <p className="text-lg font-bold text-amber-700" data-testid="deductible">
                              {apiClaim?.extractedPolicy?.deductible || '-'}
                            </p>
                          </div>
                          {apiClaim?.extractedPolicy?.perilSpecificDeductibles?.wind_hail && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                              <Label className="text-xs text-red-700 uppercase">Wind/Hail</Label>
                              <p className="text-lg font-bold text-red-700" data-testid="wind-hail-deductible">
                                {apiClaim.extractedPolicy.perilSpecificDeductibles.wind_hail}
                              </p>
                            </div>
                          )}
                          {apiClaim?.extractedPolicy?.perilSpecificDeductibles?.hurricane && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                              <Label className="text-xs text-red-700 uppercase">Hurricane</Label>
                              <p className="text-lg font-bold text-red-700">
                                {apiClaim.extractedPolicy.perilSpecificDeductibles.hurricane}
                              </p>
                            </div>
                          )}
                          {apiClaim?.extractedPolicy?.perilSpecificDeductibles?.flood && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                              <Label className="text-xs text-blue-700 uppercase">Flood</Label>
                              <p className="text-lg font-bold text-blue-700">
                                {apiClaim.extractedPolicy.perilSpecificDeductibles.flood}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Additional Coverages */}
                      {apiClaim?.extractedPolicy?.additionalCoverages && Object.keys(apiClaim.extractedPolicy.additionalCoverages).length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-muted-foreground mb-3">ADDITIONAL COVERAGES</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                            {Object.entries(apiClaim.extractedPolicy.additionalCoverages).map(([key, value]) => (
                              <div key={key} className="bg-gray-50 border rounded-lg p-2">
                                <Label className="text-xs text-muted-foreground uppercase">
                                  {key.replace(/_/g, ' ')}
                                </Label>
                                <p className="font-semibold text-sm">
                                  {value.limit || value.percentage || '-'}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Third Party Interest */}
                      {apiClaim?.extractedPolicy?.thirdPartyInterest && (
                        <>
                          <Separator />
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <Label className="text-xs text-yellow-700 uppercase">Mortgagee / Third Party Interest</Label>
                            <p className="font-medium text-sm text-yellow-800">{apiClaim.extractedPolicy.thirdPartyInterest}</p>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* ============================================ */}
                  {/* PROPERTY DETAILS CARD */}
                  {/* ============================================ */}
                  <Card className="border-slate-200">
                    <CardHeader className="pb-3 bg-slate-50 rounded-t-lg">
                      <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
                        <Home className="w-5 h-5 text-slate-600" />
                        Property Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 bg-slate-50/30">
                      {apiClaim?.extractedPolicy?.propertyAddress && (
                        <div className="bg-white rounded-lg p-3 border border-slate-100">
                          <Label className="text-xs text-slate-500 uppercase">Risk Address</Label>
                          <p className="font-medium text-sm text-slate-800">{apiClaim.extractedPolicy.propertyAddress}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="bg-white rounded-lg p-3 border border-slate-100">
                          <Label className="text-xs text-slate-500 uppercase">Year Built</Label>
                          <p className="font-medium text-slate-800">{apiClaim?.extractedPolicy?.yearBuilt || '-'}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-slate-100">
                          <Label className="text-xs text-slate-500 uppercase">Stories</Label>
                          <p className="font-medium text-slate-800">{apiClaim?.extractedPolicy?.numberOfStories || '-'}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-slate-100">
                          <Label className="text-xs text-slate-500 uppercase">Year Roof Installed</Label>
                          <p className="font-medium text-slate-800">{apiClaim?.extractedPolicy?.yearRoofInstalled || '-'}</p>
                        </div>
                      </div>
                      <Separator className="bg-slate-200" />
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white rounded-lg p-3 border border-slate-100">
                          <Label className="text-xs text-slate-500 uppercase">Roof Damage</Label>
                          <p className="font-medium text-slate-800">{apiClaim?.extractedPolicy?.roofDamage || '-'}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-slate-100">
                          <Label className="text-xs text-slate-500 uppercase">Wood Roof</Label>
                          <p className="font-medium text-slate-800">{apiClaim?.extractedPolicy?.woodRoof || '-'}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white rounded-lg p-3 border border-slate-100">
                          <Label className="text-xs text-slate-500 uppercase">Exterior Damages</Label>
                          <p className="font-medium text-slate-800">{apiClaim?.extractedPolicy?.exteriorDamages || '-'}</p>
                        </div>
                        <div className="bg-white rounded-lg p-3 border border-slate-100">
                          <Label className="text-xs text-slate-500 uppercase">Interior Damages</Label>
                          <p className="font-medium text-slate-800">{apiClaim?.extractedPolicy?.interiorDamages || '-'}</p>
                        </div>
                      </div>
                      {apiClaim?.extractedPolicy?.droneEligible && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <Label className="text-xs text-blue-700 uppercase">Drone Eligible at FNOL</Label>
                          <p className="font-medium text-blue-800">{apiClaim.extractedPolicy.droneEligible}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* ============================================ */}
                  {/* DAMAGE DESCRIPTION CARD */}
                  {/* ============================================ */}
                  {(apiClaim?.extractedPolicy?.damageDescription || apiClaim?.lossDescription) && (
                    <Card className="border-amber-200">
                      <CardHeader className="pb-3 bg-amber-50 rounded-t-lg">
                        <CardTitle className="text-lg flex items-center gap-2 text-amber-800">
                          <AlertTriangle className="w-5 h-5 text-amber-600" />
                          Loss Description
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="bg-amber-50/50 space-y-3">
                        <p className="text-sm text-amber-900">{apiClaim?.extractedPolicy?.damageDescription || apiClaim?.lossDescription || 'No description provided'}</p>
                        
                        {/* Historical Weather at Date of Loss */}
                        {apiClaim?.dolWeather && (
                          apiClaim.dolWeather.summary || 
                          apiClaim.dolWeather.temperature != null || 
                          apiClaim.dolWeather.conditions ||
                          apiClaim.dolWeather.windSpeed != null ||
                          apiClaim.dolWeather.windGust != null ||
                          apiClaim.dolWeather.precipAmount != null ||
                          apiClaim.dolWeather.hailSize != null ||
                          apiClaim.dolWeather.humidity != null
                        ) && (
                          <div className="border-t border-amber-200 pt-3 mt-3">
                            <div className="flex items-center gap-1 text-xs text-amber-700 mb-2">
                              <Cloud className="w-3 h-3" />
                              <span className="font-medium">Weather on Date of Loss:</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              {apiClaim.dolWeather.temperature !== null && apiClaim.dolWeather.temperature !== undefined && (
                                <span className="font-semibold text-amber-900">
                                  {apiClaim.dolWeather.temperature}°F
                                </span>
                              )}
                              {apiClaim.dolWeather.conditions && (
                                <span className="text-amber-800">{apiClaim.dolWeather.conditions}</span>
                              )}
                              {apiClaim.dolWeather.hailSize && (
                                <Badge variant="outline" className="bg-amber-100 border-amber-400 text-amber-800 text-xs">
                                  Hail {apiClaim.dolWeather.hailSize}"
                                </Badge>
                              )}
                              {(apiClaim.dolWeather.windGust && apiClaim.dolWeather.windGust > 20) && (
                                <span className="text-amber-800">
                                  {apiClaim.dolWeather.windGust} mph gusts
                                </span>
                              )}
                              {apiClaim.dolWeather.precipAmount && apiClaim.dolWeather.precipAmount > 0 && (
                                <span className="text-amber-800">
                                  {apiClaim.dolWeather.precipAmount}" precip
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* ============================================ */}
                  {/* PRODUCER / AGENT CARD */}
                  {/* ============================================ */}
                  {apiClaim?.extractedPolicy?.producer && (
                    <Card className="border-indigo-200">
                      <CardHeader className="pb-3 bg-indigo-50 rounded-t-lg">
                        <CardTitle className="text-lg flex items-center gap-2 text-indigo-800">
                          <Building2 className="w-5 h-5 text-indigo-600" />
                          Producer / Agent
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 bg-indigo-50/30">
                        {apiClaim.extractedPolicy.producer.name && (
                          <div className="bg-white rounded-lg p-3 border border-indigo-100">
                            <Label className="text-xs text-indigo-600 uppercase">Name</Label>
                            <p className="font-medium text-indigo-900">{apiClaim.extractedPolicy.producer.name}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {apiClaim.extractedPolicy.producer.phone && (
                            <div className="bg-white rounded-lg p-3 border border-indigo-100">
                              <Label className="text-xs text-indigo-600 uppercase">Phone</Label>
                              <p className="font-medium text-indigo-900">{apiClaim.extractedPolicy.producer.phone}</p>
                            </div>
                          )}
                          {apiClaim.extractedPolicy.producer.email && (
                            <div className="bg-white rounded-lg p-3 border border-indigo-100">
                              <Label className="text-xs text-indigo-600 uppercase">Email</Label>
                              <p className="font-medium text-sm break-all text-indigo-900">{apiClaim.extractedPolicy.producer.email}</p>
                            </div>
                          )}
                        </div>
                        {apiClaim.extractedPolicy.producer.address && (
                          <div className="bg-white rounded-lg p-3 border border-indigo-100">
                            <Label className="text-xs text-indigo-600 uppercase">Address</Label>
                            <p className="font-medium text-sm text-indigo-900">{apiClaim.extractedPolicy.producer.address}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* ============================================ */}
                  {/* REPORT METADATA CARD */}
                  {/* ============================================ */}
                  {(apiClaim?.extractedPolicy?.reportedBy || apiClaim?.extractedPolicy?.reportedDate) && (
                    <Card className="border-cyan-200">
                      <CardHeader className="pb-3 bg-cyan-50 rounded-t-lg">
                        <CardTitle className="text-lg flex items-center gap-2 text-cyan-800">
                          <Clock className="w-5 h-5 text-cyan-600" />
                          Report Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="bg-cyan-50/30">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {apiClaim.extractedPolicy.reportedBy && (
                            <div className="bg-white rounded-lg p-3 border border-cyan-100">
                              <Label className="text-xs text-cyan-600 uppercase">Reported By</Label>
                              <p className="font-medium text-cyan-900">{apiClaim.extractedPolicy.reportedBy}</p>
                            </div>
                          )}
                          {apiClaim.extractedPolicy.reportedDate && (
                            <div className="bg-white rounded-lg p-3 border border-cyan-100">
                              <Label className="text-xs text-cyan-600 uppercase">Reported Date</Label>
                              <p className="font-medium text-cyan-900">{apiClaim.extractedPolicy.reportedDate}</p>
                            </div>
                          )}
                          {apiClaim.extractedPolicy.reportMethod && (
                            <div className="bg-white rounded-lg p-3 border border-cyan-100">
                              <Label className="text-xs text-cyan-600 uppercase">Report Method</Label>
                              <p className="font-medium text-cyan-900">{apiClaim.extractedPolicy.reportMethod}</p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Coverage Alerts Card - Show if there are alerts */}
                  {claimContext?.alerts && claimContext.alerts.length > 0 && (
                    <Card className="lg:col-span-2">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <AlertCircle className="w-5 h-5" />
                          Coverage Alerts
                          <Badge variant={claimContext.alerts.some(a => a.severity === 'critical') ? 'destructive' : 'secondary'} className="ml-2">
                            {claimContext.alerts.length}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {claimContext.alerts.map((alert, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "rounded-lg p-3 border",
                              alert.severity === 'critical' && "bg-red-50 border-red-200",
                              alert.severity === 'warning' && "bg-amber-50 border-amber-200",
                              alert.severity === 'info' && "bg-blue-50 border-blue-200"
                            )}
                          >
                            <div className="flex items-start gap-2">
                              {alert.severity === 'critical' && <XCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />}
                              {alert.severity === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />}
                              {alert.severity === 'info' && <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <p className={cn(
                                  "font-medium text-sm",
                                  alert.severity === 'critical' && "text-red-700",
                                  alert.severity === 'warning' && "text-amber-700",
                                  alert.severity === 'info' && "text-blue-700"
                                )}>
                                  {alert.title}
                                </p>
                                <p className={cn(
                                  "text-xs mt-1",
                                  alert.severity === 'critical' && "text-red-600",
                                  alert.severity === 'warning' && "text-amber-600",
                                  alert.severity === 'info' && "text-blue-600"
                                )}>
                                  {alert.description}
                                </p>
                                {alert.actionRequired && (
                                  <p className="text-xs mt-2 font-medium text-gray-700">
                                    Action: {alert.actionRequired}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {/* Coverage Analysis Summary Card */}
                  {coverageSummary && (
                    <Card className="lg:col-span-2">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Calculator className="w-5 h-5" />
                          Coverage Analysis
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {/* Alert Counts */}
                          <div className="text-center p-3 bg-muted/50 rounded-lg">
                            <p className="text-2xl font-bold text-red-600">{coverageSummary.criticalAlerts}</p>
                            <p className="text-xs text-muted-foreground">Critical</p>
                          </div>
                          <div className="text-center p-3 bg-muted/50 rounded-lg">
                            <p className="text-2xl font-bold text-amber-600">{coverageSummary.warningAlerts}</p>
                            <p className="text-xs text-muted-foreground">Warnings</p>
                          </div>
                          <div className="text-center p-3 bg-muted/50 rounded-lg">
                            <p className="text-2xl font-bold text-blue-600">{coverageSummary.infoAlerts}</p>
                            <p className="text-xs text-muted-foreground">Info</p>
                          </div>
                          {/* Roof Payment Percentage */}
                          {coverageSummary.roofPaymentPct !== undefined && (
                            <div className="text-center p-3 bg-muted/50 rounded-lg">
                              <p className="text-2xl font-bold text-green-600">{coverageSummary.roofPaymentPct}%</p>
                              <p className="text-xs text-muted-foreground">Roof Payment</p>
                            </div>
                          )}
                        </div>
                        {/* Applicable Deductible */}
                        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-sm font-medium text-amber-800">
                            Applicable Deductible: {coverageSummary.applicableDeductible}
                          </p>
                        </div>
                        {/* Top Recommendations */}
                        {coverageSummary.topRecommendations.length > 0 && (
                          <div className="mt-4">
                            <p className="text-sm font-medium text-muted-foreground mb-2">Key Recommendations</p>
                            <ul className="space-y-1">
                              {coverageSummary.topRecommendations.slice(0, 3).map((rec, idx) => (
                                <li key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                  {rec}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Endorsement Impacts Card - Show if context has endorsement impacts */}
                  {claimContext?.endorsements?.extracted && claimContext.endorsements.extracted.length > 0 && (
                    <Card className="lg:col-span-2">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FileText className="w-5 h-5" />
                          Endorsement Impact Analysis
                          <Badge variant="outline" className="ml-2 text-xs text-green-600 border-green-300">
                            {claimContext.endorsements.extracted.length} analyzed
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {claimContext.endorsements.extracted.slice(0, 5).map((impact, idx) => (
                          <div key={idx} className="bg-muted/50 rounded-lg p-4 border border-muted">
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                                impact.hasRoofSchedule ? "bg-amber-100" : "bg-primary/10"
                              )}>
                                <FileText className={cn(
                                  "w-4 h-4",
                                  impact.hasRoofSchedule ? "text-amber-600" : "text-primary"
                                )} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-mono font-semibold text-sm">{impact.formCode}</p>
                                  <Badge variant="secondary" className="text-xs capitalize">
                                    {impact.category.replace(/_/g, ' ')}
                                  </Badge>
                                  {impact.hasRoofSchedule && (
                                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                                      Roof Schedule
                                    </Badge>
                                  )}
                                  {impact.hasMetalFunctionalLanguage && (
                                    <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                                      Metal Functional
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">{impact.title}</p>

                                {/* Impacts */}
                                {impact.impacts.length > 0 && (
                                  <div className="mt-2">
                                    <p className="text-xs font-medium text-muted-foreground">Key Impacts:</p>
                                    <ul className="mt-1 space-y-0.5">
                                      {impact.impacts.slice(0, 2).map((imp, i) => (
                                        <li key={i} className="text-xs text-gray-600">• {imp}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {/* Inspection Requirements */}
                                {impact.inspectionRequirements.length > 0 && (
                                  <div className="mt-2">
                                    <p className="text-xs font-medium text-amber-700">Inspection Requirements:</p>
                                    <ul className="mt-1 space-y-0.5">
                                      {impact.inspectionRequirements.slice(0, 2).map((req, i) => (
                                        <li key={i} className="text-xs text-amber-600">• {req}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {claimContext.endorsements.extracted.length > 5 && (
                          <p className="text-xs text-muted-foreground text-center">
                            +{claimContext.endorsements.extracted.length - 5} more endorsements analyzed
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Roof Depreciation Card - Show if scheduled basis */}
                  {claimContext?.lossSettlement?.roofing?.isScheduled && (
                    <Card className="lg:col-span-2">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Home className="w-5 h-5" />
                          Roof Depreciation Schedule
                          <Badge variant="outline" className="ml-2 text-xs text-amber-600 border-amber-300">
                            Scheduled Basis
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs text-amber-700 font-medium">Roof Age</p>
                              <p className="text-lg font-bold text-amber-900">{claimContext.property.roof.age || '-'} years</p>
                            </div>
                            <div>
                              <p className="text-xs text-amber-700 font-medium">Material</p>
                              <p className="text-lg font-bold text-amber-900">{claimContext.property.roof.material || 'Unknown'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-amber-700 font-medium">Schedule Form</p>
                              <p className="text-lg font-bold text-amber-900">{claimContext.lossSettlement.roofing.scheduleFormCode || '-'}</p>
                            </div>
                            {claimContext.insights?.estimatedRoofPaymentPct && (
                              <div>
                                <p className="text-xs text-amber-700 font-medium">Est. Payment</p>
                                <p className="text-lg font-bold text-amber-900">{claimContext.insights.estimatedRoofPaymentPct}%</p>
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-amber-600 mt-3">
                            This policy uses a roof payment schedule that adjusts payments based on roof age and material.
                            Verify roof age with permit records or manufacturer date stamps.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Metal Functional Requirement Card - Show if applicable */}
                  {claimContext?.lossSettlement?.roofing?.metalFunctionalRequirement && (
                    <Card className="lg:col-span-2">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-blue-600" />
                          Metal Component Requirement
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <p className="text-sm text-blue-800 font-medium">Functional Damage Required</p>
                          <p className="text-xs text-blue-600 mt-2">
                            This policy requires metal components (gutters, vents, flashing, etc.) to have <span className="font-medium">functional damage</span> -
                            not just cosmetic dents. Document actual penetration, water intrusion, or impaired function before including in scope.
                          </p>
                          <ul className="mt-3 space-y-1 text-xs text-blue-700">
                            <li>• Take close-up photos showing any penetration</li>
                            <li>• Document water staining or intrusion evidence</li>
                            <li>• Note if components still function properly</li>
                            <li>• Cosmetic denting alone may not be covered</li>
                          </ul>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Endorsements Card */}
                  <Card className="lg:col-span-2">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <ClipboardList className="w-5 h-5" />
                        Endorsements
                        <Badge variant="secondary" className="ml-2">
                          {endorsements.length || (apiClaim?.extractedEndorsements?.length || 0)}
                        </Badge>
                        {(apiClaim?.extractedEndorsements && apiClaim.extractedEndorsements.length > 0) && (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-300">Extracted</Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Comprehensive Endorsement Extractions */}
                      {(endorsements.length > 0 || (apiClaim?.extractedEndorsements?.length || 0) > 0) ? (
                        <div className="space-y-4">
                          <h4 className="text-sm font-medium text-muted-foreground">Endorsement Documents</h4>
                          <div className="space-y-4">
                            {/* Use extractedEndorsements from claim if available, otherwise fall back to separate API call */}
                            {(endorsements.length > 0 ? endorsements : (apiClaim?.extractedEndorsements || []).map((e, idx) => ({
                              ...e,
                              id: e.id || `extracted-${idx}`,
                              form_code: e.formCode,
                              edition_date: e.editionDate,
                              endorsement_type: e.endorsementType,
                              extraction_status: e.extractionStatus,
                            }))).map((endorsement: any) => {
                              const mods = endorsement.modifications || {};
                              const hasModifications = Object.keys(mods).some(k => {
                                const val = mods[k as keyof typeof mods];
                                if (!val) return false;
                                return Object.values(val).some(arr => Array.isArray(arr) && arr.length > 0);
                              });

                              return (
                                <div key={endorsement.id} className="bg-muted/50 rounded-lg p-4 border border-muted" data-testid={`endorsement-card-${endorsement.id}`}>
                                  <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                      <FileText className="w-4 h-4 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-mono font-semibold text-sm" data-testid={`endorsement-form-code-${endorsement.id}`}>{endorsement.form_code}</p>
                                        {endorsement.jurisdiction && (
                                          <Badge variant="outline" className="text-xs" data-testid={`endorsement-jurisdiction-${endorsement.id}`}>
                                            {endorsement.jurisdiction}
                                          </Badge>
                                        )}
                                        {endorsement.edition_date && (
                                          <Badge variant="secondary" className="text-xs" data-testid={`endorsement-edition-${endorsement.id}`}>
                                            {endorsement.edition_date}
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-sm text-muted-foreground" data-testid={`endorsement-title-${endorsement.id}`}>
                                        {endorsement.title || endorsement.summary || 'No title'}
                                      </p>

                                      {/* Modifications Section */}
                                      {hasModifications && (
                                        <div className="mt-3 space-y-2" data-testid={`endorsement-modifications-${endorsement.id}`}>
                                          <p className="text-xs font-medium text-muted-foreground uppercase">Policy Modifications</p>
                                          
                                          {/* Definitions */}
                                          {mods.definitions?.added && mods.definitions.added.length > 0 && (
                                            <div className="bg-green-50 rounded-md p-2 border border-green-200" data-testid={`endorsement-definitions-added-${endorsement.id}`}>
                                              <p className="text-xs font-medium text-green-700">Added Definitions</p>
                                              {mods.definitions.added.map((def, idx) => (
                                                <p key={idx} className="text-xs text-green-600 mt-1">
                                                  <span className="font-medium">{def.term}:</span> {def.definition?.substring(0, 100) || ''}...
                                                </p>
                                              ))}
                                            </div>
                                          )}
                                          
                                          {/* Exclusions */}
                                          {mods.exclusions?.added && mods.exclusions.added.length > 0 && (
                                            <div className="bg-red-50 rounded-md p-2 border border-red-200" data-testid={`endorsement-exclusions-added-${endorsement.id}`}>
                                              <p className="text-xs font-medium text-red-700">Added Exclusions</p>
                                              {mods.exclusions.added.slice(0, 3).map((exc, idx) => (
                                                <p key={idx} className="text-xs text-red-600 mt-1">• {(exc as string)?.substring?.(0, 80) || String(exc).substring(0, 80)}...</p>
                                              ))}
                                              {mods.exclusions.added.length > 3 && (
                                                <p className="text-xs text-red-500 mt-1">+{mods.exclusions.added.length - 3} more</p>
                                              )}
                                            </div>
                                          )}
                                          
                                          {/* Coverages */}
                                          {mods.coverages?.modified && mods.coverages.modified.length > 0 && (
                                            <div className="bg-amber-50 rounded-md p-2 border border-amber-200" data-testid={`endorsement-coverages-modified-${endorsement.id}`}>
                                              <p className="text-xs font-medium text-amber-700">Coverage Modifications</p>
                                              {mods.coverages.modified.slice(0, 3).map((cov, idx) => (
                                                <p key={idx} className="text-xs text-amber-600 mt-1">
                                                  <span className="font-medium">{cov.coverage}:</span> {cov.details?.substring?.(0, 60) || ''}...
                                                </p>
                                              ))}
                                            </div>
                                          )}
                                          
                                          {/* Loss Settlement */}
                                          {mods.lossSettlement?.replacedSections && mods.lossSettlement.replacedSections.length > 0 && (
                                            <div className="bg-blue-50 rounded-md p-2 border border-blue-200" data-testid={`endorsement-loss-settlement-${endorsement.id}`}>
                                              <p className="text-xs font-medium text-blue-700">Loss Settlement Changes</p>
                                              {mods.lossSettlement.replacedSections.map((sec, idx) => (
                                                <p key={idx} className="text-xs text-blue-600 mt-1">
                                                  <span className="font-medium">{sec.policySection}:</span> {sec.newRule?.substring?.(0, 80) || ''}...
                                                </p>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Roof Payment Schedule from extractionData */}
                                      {endorsement.extractionData?.roof_surface_payment_schedule?.complete_schedule && (
                                        <div className="mt-3 bg-amber-50 rounded-md p-3 border border-amber-200">
                                          <p className="text-xs font-medium text-amber-700 uppercase mb-2">Roof Payment Schedule</p>
                                          <p className="text-xs text-amber-600 mb-2">{endorsement.extractionData.roof_surface_payment_schedule.scope}</p>
                                          <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr className="border-b border-amber-200">
                                                  <th className="text-left py-1 pr-2 text-amber-700">Age</th>
                                                  <th className="text-right py-1 px-1 text-amber-700">Arch.</th>
                                                  <th className="text-right py-1 px-1 text-amber-700">Other</th>
                                                  <th className="text-right py-1 px-1 text-amber-700">Metal</th>
                                                  <th className="text-right py-1 px-1 text-amber-700">Tile</th>
                                                  <th className="text-right py-1 pl-1 text-amber-700">Wood</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {endorsement.extractionData.roof_surface_payment_schedule.complete_schedule.slice(0, 6).map((row: any, idx: number) => (
                                                  <tr key={idx} className="border-b border-amber-100">
                                                    <td className="py-1 pr-2 font-medium">{row.roof_age_years}yr</td>
                                                    <td className="text-right py-1 px-1">{row.architectural_shingle_pct}%</td>
                                                    <td className="text-right py-1 px-1">{row.other_composition_pct}%</td>
                                                    <td className="text-right py-1 px-1">{row.metal_pct}%</td>
                                                    <td className="text-right py-1 px-1">{row.tile_pct}%</td>
                                                    <td className="text-right py-1 pl-1">{row.wood_pct}%</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                          {endorsement.extractionData.roof_surface_payment_schedule.hail_functional_requirement && (
                                            <p className="text-xs text-amber-700 mt-2 font-medium">
                                              Metal Requirement: {endorsement.extractionData.roof_surface_payment_schedule.hail_functional_requirement}
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No endorsements extracted for this claim
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

            {/* TAB: BRIEFING */}
            <TabsContent value="briefing" className="h-full p-4 md:p-6 m-0 overflow-auto">
              <div className="max-w-4xl mx-auto">
                {apiClaim?.id ? (
                  <BriefingPanel claimId={apiClaim.id} />
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    Loading claim data...
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB: WORKFLOW */}
            <TabsContent value="workflow" className="h-full p-4 md:p-6 m-0 overflow-auto">
              <div className="max-w-4xl mx-auto space-y-6">
                {apiClaim?.id ? (
                  <>
                    {/* Flow Engine Section - New movement-based inspection flow */}
                    <ClaimFlowSection
                      claimId={apiClaim.id}
                      perilType={apiClaim.primaryPeril || apiClaim.lossType}
                    />
                  </>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    Loading claim data...
                  </div>
                )}
              </div>
            </TabsContent>

            {/* TAB: CHECKLIST */}
            <TabsContent value="checklist" className="h-full p-4 md:p-6 m-0 overflow-auto">
              <div className="max-w-4xl mx-auto">
                {apiClaim?.id ? (
                  <ClaimChecklistPanel claimId={apiClaim.id} />
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    Loading claim data...
                  </div>
                )}
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
                      <Button asChild>
                        <span>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Documents
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
                                {doc.createdAt ? formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true }) : 'Recently'}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => handleDocumentPreview(doc.id, doc.name || doc.fileName)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
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

            {/* TAB: SKETCH - Uses the same Voice Sketch controller as the hamburger menu */}
            <TabsContent value="sketch" className="h-full m-0 flex flex-col">
              {/* Sketch Editing Toolbar */}
              <div className="border-b bg-background px-4 py-2">
                <div className="flex items-center justify-between gap-4">
                  <SketchToolbar
                    rooms={geometryRooms}
                    onRoomsChange={handleGeometryRoomsChange}
                  />
                  {/* Prominent AI Suggestions Button - visible when damage zones exist */}
                  {(claim?.damageZones || []).length > 0 && (
                    <Button
                      onClick={handleGenerateAISuggestions}
                      disabled={isGeneratingAISuggestions}
                      className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md"
                    >
                      {isGeneratingAISuggestions ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-4 w-4 mr-2" />
                          AI Scope Suggestions
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
              <VoiceSketchController
                userName={authUser?.username}
                onRoomConfirmed={(roomData) => {
                  toast.success('Room confirmed!', {
                    description: 'Room has been added to your sketch session.',
                  });
                }}
                claimId={claim?.id}
                onSave={handleSaveVoiceSketch}
                className="h-full"
              />
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
                          {/* Saved Rooms Section */}
                          {savedRooms.length > 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4" data-testid="saved-rooms-section">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <Square className="h-5 w-5 text-blue-600" />
                                  <h3 className="font-semibold text-blue-900">Saved Rooms ({savedRooms.length})</h3>
                                </div>
                                <Link href={`/voice-sketch/${params?.id}`}>
                                  <Button size="sm" variant="outline" className="text-blue-600 border-blue-300 hover:bg-blue-100" data-testid="button-edit-sketch">
                                    <PenTool className="h-4 w-4 mr-2" />
                                    Edit Sketch
                                  </Button>
                                </Link>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {savedRooms.map((room) => (
                                  <div key={room.id} className="bg-white border border-blue-100 rounded p-2 text-sm" data-testid={`room-card-${room.id}`}>
                                    <p className="font-medium truncate">{room.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {parseFloat(String(room.widthFt)).toFixed(0)}' × {parseFloat(String(room.lengthFt)).toFixed(0)}'
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* No rooms yet - show button to create sketch */}
                          {savedRooms.length === 0 && (
                            <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed">
                              <Square className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                              <h3 className="font-medium text-muted-foreground mb-2">No Room Sketches Yet</h3>
                              <p className="text-sm text-muted-foreground mb-4">Create a sketch to document room dimensions and damage</p>
                              <Link href={`/voice-sketch/${params?.id}`}>
                                <Button variant="outline" data-testid="button-create-sketch">
                                  <PenTool className="h-4 w-4 mr-2" />
                                  Create Sketch
                                </Button>
                              </Link>
                            </div>
                          )}
                          
                          {/* Voice Scope Controller */}
                          {isVoiceScopeOpen && (
                            <VoiceScopeController
                              claimId={params?.id}
                              onClose={() => setIsVoiceScopeOpen(false)}
                              onLineItemAdded={(item) => {
                                handleAddScopeItem({
                                  code: item.code,
                                  description: item.description,
                                  quantity: item.quantity,
                                  unit: item.unit,
                                  unitPrice: 0,
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

                            {scopeItems.length === 0 ? (
                              <div className="p-8 text-center text-muted-foreground">
                                <ClipboardList className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                                <p>No line items added yet.</p>
                                <p className="text-sm mt-1">Use "Add Item" or "AI Suggest" to start building the scope.</p>
                              </div>
                            ) : (
                              <div className="divide-y">
                                {scopeItems.map((item) => (
                                  <div key={item.id} className="grid grid-cols-12 gap-2 md:gap-4 p-4 text-sm items-center hover:bg-slate-50 group">
                                    <div className="col-span-3 md:col-span-2 font-mono text-slate-600 text-xs md:text-sm">{item.lineItemCode}</div>
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
                                            const newQty = Math.max(0.01, item.quantity - 1);
                                            handleUpdateScopeItem(item.id, { quantity: newQty });
                                          }}
                                        >
                                          -
                                        </Button>
                                        <Input
                                          type="number"
                                          min="0.01"
                                          step="any"
                                          value={item.quantity}
                                          onChange={(e) => {
                                            const newQty = Math.max(0.01, Number(e.target.value) || 1);
                                            handleUpdateScopeItem(item.id, { quantity: newQty });
                                          }}
                                          className="h-8 w-14 text-center border-0 rounded-none focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-8 w-8 p-0 rounded-l-none"
                                          onClick={() => {
                                            const newQty = item.quantity + 1;
                                            handleUpdateScopeItem(item.id, { quantity: newQty });
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
                                        onClick={() => handleDeleteScopeItem(item.id)}
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
                      handleAddScopeItem({
                        code: item.code,
                        description: item.description,
                        quantity: item.quantity,
                        unit: item.unit,
                        unitPrice: 0,
                        category: "Voice Added",
                      });
                    }}
                  />
                )}

                {/* Mobile Line Items */}
                <div className="space-y-2">
                  {scopeItems.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ClipboardList className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                      <p>No line items yet</p>
                    </div>
                  ) : (
                    scopeItems.map((item) => (
                      <div key={item.id} className="bg-white border rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-xs text-slate-500">{item.lineItemCode}</span>
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
                    {/* Export dropdown - always visible */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isDownloadingPdf || !!isExporting}
                        >
                          {(isDownloadingPdf || isExporting) ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Download className="h-4 w-4 mr-2" />
                          )}
                          Export
                          <ChevronDown className="h-4 w-4 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleExport('esx-zip', true)}
                          disabled={isExporting === 'esx-zip'}
                        >
                          <Archive className="h-4 w-4 mr-2" />
                          Export ESX (with photos)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleExport('esx-xml')}
                          disabled={isExporting === 'esx-xml'}
                        >
                          <File className="h-4 w-4 mr-2" />
                          Export ESX (XML only)
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleExport('csv')}
                          disabled={isExporting === 'csv'}
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Export CSV
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={handleDownloadPdf}
                          disabled={isDownloadingPdf}
                        >
                          <FileDown className="h-4 w-4 mr-2" />
                          Download PDF
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

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
                    <p>{apiClaim?.propertyAddress ? `${apiClaim.propertyAddress}, ${apiClaim.propertyCity || ''}, ${apiClaim.propertyState || ''} ${apiClaim.propertyZip || ''}`.replace(/,\s*,/g, ',').trim() : (claim?.riskLocation || 'Address not provided')}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold uppercase text-slate-500 mb-2">Claim Info</h3>
                    <p><span className="text-muted-foreground">Claim #:</span> {(apiClaim?.claimNumber || claim?.id || '').toUpperCase()}</p>
                    <p><span className="text-muted-foreground">Policy #:</span> {apiClaim?.policyNumber || claim?.policyNumber || 'N/A'}</p>
                    <p><span className="text-muted-foreground">Loss Date:</span> {(apiClaim?.dateOfLoss || claim?.dateOfLoss) ? new Date(apiClaim?.dateOfLoss || claim?.dateOfLoss || '').toLocaleDateString() : 'Not specified'}</p>
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
                        {scopeItems.map((item) => (
                          <tr key={item.id}>
                            <td className="py-3 font-mono text-slate-600">{item.lineItemCode}</td>
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
              <div className="max-w-6xl mx-auto space-y-4">
                {/* Upload button header */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Claim Photos</h2>
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="claim-photo-upload"
                      className={cn(
                        "inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-colors",
                        "bg-primary text-primary-foreground hover:bg-primary/90",
                        isUploadingPhoto && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {isUploadingPhoto ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                      {isUploadingPhoto ? 'Uploading...' : 'Add Photo'}
                    </label>
                    <input
                      id="claim-photo-upload"
                      type="file"
                      accept="image/*"
                      multiple
                      capture="environment"
                      className="hidden"
                      onChange={handlePhotoUpload}
                      disabled={isUploadingPhoto}
                    />
                  </div>
                </div>

                {/* Photo Album with AI analysis and proper dialog */}
                <PhotoAlbum
                  photos={sketchPhotos}
                  onDeletePhoto={handleDeletePhoto}
                  onUpdatePhoto={handleUpdatePhoto}
                  onReanalyzePhoto={handleReanalyzePhoto}
                  isReanalyzing={reanalyzePhotoMutation.isPending}
                />
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
          onSave={(zone) => {
            const newZone = { ...zone, id: `dz${Date.now()}`, photos: [] };
            addDamageZone(claim.id, newZone);
          }}
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
          handleAddScopeItem({
            code: item.code,
            description: item.description,
            category: item.category,
            quantity: item.quantity ?? 1,
            unit: item.unit,
            unitPrice: item.unitPrice,
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
              disabled={isCalculating || scopeItems.length === 0}
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

      {/* Document Preview Modal */}
      {previewDocId && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex flex-col"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDocumentPreview();
          }}
        >
          {/* Mobile-friendly close button - positioned below the header bar */}
          <Button 
            variant="ghost" 
            size="lg"
            onClick={closeDocumentPreview} 
            className="fixed top-24 right-3 z-[60] text-white bg-black/60 hover:bg-black/80 rounded-full w-14 h-14 p-0 md:hidden shadow-lg border border-white/30"
            data-testid="btn-close-preview-mobile"
          >
            <X className="w-7 h-7" />
          </Button>
          
          <div className="flex items-center justify-between p-2 md:p-4 text-white">
            {/* Page navigation - left side */}
            <div className="flex items-center gap-1 md:gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setPreviewPage(p => Math.max(1, p - 1))} 
                disabled={previewPage <= 1} 
                className="text-white hover:bg-white/20 p-1 md:p-2"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <span className="text-xs md:text-sm whitespace-nowrap">
                Page {previewPage}/{previewImageData?.pages || 1}
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setPreviewPage(p => Math.min(previewImageData?.pages || 1, p + 1))} 
                disabled={!previewImageData || previewPage >= previewImageData.pages} 
                className="text-white hover:bg-white/20 p-1 md:p-2"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
            {/* Controls - right side */}
            <div className="flex items-center gap-1 md:gap-4">
              {/* Zoom controls - hidden on mobile to save space */}
              <div className="hidden md:flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setPreviewZoom(z => Math.max(50, z - 25))} 
                  disabled={previewZoom <= 50} 
                  className="text-white hover:bg-white/20"
                >
                  <ZoomOut className="w-5 h-5" />
                </Button>
                <span className="text-sm w-14 text-center">{previewZoom}%</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setPreviewZoom(z => Math.min(200, z + 25))} 
                  disabled={previewZoom >= 200} 
                  className="text-white hover:bg-white/20"
                >
                  <ZoomIn className="w-5 h-5" />
                </Button>
              </div>
              <span className="text-sm opacity-75 max-w-[200px] truncate hidden md:inline">{previewDocName}</span>
              {/* Desktop close button */}
              <Button 
                variant="default" 
                size="sm" 
                onClick={closeDocumentPreview} 
                className="hidden md:flex bg-white text-black hover:bg-gray-200 font-medium"
                data-testid="btn-close-preview"
              >
                <X className="w-4 h-4 mr-1" />
                Close
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            {previewLoading ? (
              <div className="flex flex-col items-center text-white">
                <Loader2 className="w-8 h-8 animate-spin mb-4" />
                <p>Loading document...</p>
              </div>
            ) : previewImageData && previewImageData.images.length > 0 ? (
              <img
                src={previewImageData.images[previewPage - 1]}
                alt={`${previewDocName} - Page ${previewPage}`}
                style={{ width: previewZoom > 100 ? `${previewZoom}%` : undefined, maxWidth: previewZoom > 100 ? 'none' : undefined }}
                className={previewZoom <= 100 ? "max-h-full max-w-full object-contain" : ""}
              />
            ) : (
              <div className="flex flex-col items-center text-white">
                <FileText className="w-16 h-16 mb-4 opacity-50" />
                <p>Unable to load document preview</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Schedule Inspection Dialog */}
      <Dialog open={isScheduleInspectionOpen} onOpenChange={setIsScheduleInspectionOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" />
              Schedule Inspection
            </DialogTitle>
            <DialogDescription>
              Schedule a field inspection for this claim. The appointment will sync to your Microsoft 365 calendar if connected.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="inspection-date" className="text-right">
                Date
              </Label>
              <Input
                id="inspection-date"
                type="date"
                value={scheduleFormData.date}
                onChange={(e) => setScheduleFormData(prev => ({ ...prev, date: e.target.value }))}
                className="col-span-3"
                data-testid="input-inspection-date"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="inspection-time" className="text-right">
                Time
              </Label>
              <Input
                id="inspection-time"
                type="time"
                value={scheduleFormData.time}
                onChange={(e) => setScheduleFormData(prev => ({ ...prev, time: e.target.value }))}
                className="col-span-3"
                data-testid="input-inspection-time"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="inspection-duration" className="text-right">
                Duration
              </Label>
              <Select
                value={scheduleFormData.duration.toString()}
                onValueChange={(value) => setScheduleFormData(prev => ({ ...prev, duration: parseInt(value) }))}
              >
                <SelectTrigger className="col-span-3" data-testid="select-inspection-duration">
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="180">3 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="inspection-notes" className="text-right">
                Notes
              </Label>
              <Input
                id="inspection-notes"
                placeholder="Optional notes..."
                value={scheduleFormData.notes}
                onChange={(e) => setScheduleFormData(prev => ({ ...prev, notes: e.target.value }))}
                className="col-span-3"
                data-testid="input-inspection-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsScheduleInspectionOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!scheduleFormData.date || !scheduleFormData.time) {
                  return;
                }
                setIsScheduling(true);
                try {
                  const startDateTime = new Date(`${scheduleFormData.date}T${scheduleFormData.time}`);
                  const endDateTime = new Date(startDateTime.getTime() + scheduleFormData.duration * 60000);
                  
                  const location = apiClaim?.propertyAddress 
                    ? `${apiClaim.propertyAddress}${apiClaim.propertyCity ? `, ${apiClaim.propertyCity}` : ''}${apiClaim.propertyState ? `, ${apiClaim.propertyState}` : ''} ${apiClaim.propertyZip || ''}`
                    : (apiClaim?.riskLocation || undefined);
                  
                  const response = await fetch('/api/calendar/appointments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                      claimId: params?.id,
                      title: `Inspection: ${apiClaim?.policyholder || 'Claim'} - ${apiClaim?.claimId || params?.id}`,
                      description: scheduleFormData.notes || `Field inspection for claim ${apiClaim?.claimId || params?.id}`,
                      location,
                      scheduledStart: startDateTime.toISOString(),
                      scheduledEnd: endDateTime.toISOString(),
                      durationMinutes: scheduleFormData.duration,
                      appointmentType: 'initial_inspection',
                      syncToMs365: true,
                    }),
                  });
                  
                  if (response.ok) {
                    setIsScheduleInspectionOpen(false);
                    setScheduleFormData({ date: '', time: '09:00', duration: 60, notes: '' });
                  } else {
                    console.error('Failed to schedule inspection');
                  }
                } catch (error) {
                  console.error('Failed to schedule inspection:', error);
                } finally {
                  setIsScheduling(false);
                }
              }}
              disabled={isScheduling || !scheduleFormData.date || !scheduleFormData.time}
              data-testid="button-confirm-schedule"
            >
              {isScheduling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scheduling...
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Estimate Settings Dialog */}
      <Dialog open={isEstimateSettingsOpen} onOpenChange={setIsEstimateSettingsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              Estimate Settings
            </DialogTitle>
            <DialogDescription>
              Configure region, carrier profile, overhead, and profit percentages for estimate calculations.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Region Selection */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="estimate-region" className="text-right">
                Region
              </Label>
              <Select
                value={estimateSettings.regionId || ''}
                onValueChange={(value) => setEstimateSettings({ regionId: value })}
              >
                <SelectTrigger className="col-span-3" id="estimate-region">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((region) => (
                    <SelectItem key={region.id} value={region.id}>
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Carrier Profile Selection */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="estimate-carrier" className="text-right">
                Carrier
              </Label>
              <Select
                value={estimateSettings.carrierProfileId || ''}
                onValueChange={(value) => setEstimateSettings({ carrierProfileId: value || null })}
              >
                <SelectTrigger className="col-span-3" id="estimate-carrier">
                  <SelectValue placeholder="Select carrier (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {carriers.map((carrier) => (
                    <SelectItem key={carrier.id} value={carrier.id}>
                      {carrier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Overhead Percentage */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="estimate-overhead" className="text-right">
                Overhead %
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <Input
                  id="estimate-overhead"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={estimateSettings.overheadPct}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0;
                    setEstimateSettings({ overheadPct: value });
                  }}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>

            {/* Profit Percentage */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="estimate-profit" className="text-right">
                Profit %
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <Input
                  id="estimate-profit"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={estimateSettings.profitPct}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0;
                    setEstimateSettings({ profitPct: value });
                  }}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEstimateSettingsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setIsEstimateSettingsOpen(false);
                toast.success('Estimate settings saved');
              }}
            >
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scope Suggestion Prompt Dialog - Shown after saving rooms with damage zones */}
      <Dialog open={showScopeSuggestionPrompt} onOpenChange={setShowScopeSuggestionPrompt}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Sketch Saved Successfully
            </DialogTitle>
            <DialogDescription>
              {savedDamageZoneCount === 1
                ? `1 damage zone has been saved.`
                : `${savedDamageZoneCount} damage zones have been saved.`}
              {' '}Would you like to generate AI-powered scope suggestions based on your sketch?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h4 className="font-medium text-purple-900 mb-2 flex items-center gap-2">
                <Wand2 className="h-4 w-4" />
                What this does
              </h4>
              <ul className="text-sm text-purple-700 space-y-1">
                <li>• Analyzes your damage zones and room data</li>
                <li>• Suggests appropriate line items and quantities</li>
                <li>• Helps build your estimate faster</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowScopeSuggestionPrompt(false);
                setActiveTab("scope");
              }}
            >
              Skip, Go to Scope
            </Button>
            <Button
              onClick={async () => {
                setShowScopeSuggestionPrompt(false);
                await handleGenerateAISuggestions();
              }}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Suggestions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
