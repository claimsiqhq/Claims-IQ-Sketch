import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload,
  FileText,
  Shield,
  FilePlus,
  X,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FileCheck,
  ArrowRight,
  ArrowLeft,
  Plus,
  Eye,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Image as ImageIcon
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uploadDocument, processDocument, createClaim, updateClaim, getMyOrganizations, getClaim, getClaimDocuments, type Document, type Claim } from "@/lib/api";

// Step types for the wizard
type WizardStep = 'fnol' | 'policy' | 'endorsements' | 'review';

interface UploadedDocument {
  file: File;
  type: 'fnol' | 'policy' | 'endorsement';
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  document?: Document;
  extractedData?: ExtractedData;
  error?: string;
}

// Coverage detail interface
interface CoverageDetail {
  code: string;
  name: string;
  limit?: string;
  percentage?: string;
  valuationMethod?: string;
  deductible?: string;
}

// Scheduled structure interface
interface ScheduledStructure {
  description: string;
  value: string;
  articleNumber?: string;
  valuationMethod?: string;
}

// Endorsement detail interface
interface EndorsementDetailItem {
  formNumber: string;
  name: string;
  additionalInfo?: string;
}

// HO Policy Form base structure interface
interface BaseStructure {
  sectionHeadings?: string[];
  definitionOfACV?: string;
}

// Default policy provision summary interface
interface DefaultPolicyProvisionSummary {
  windHailLossSettlement?: string;
  unoccupiedExclusionPeriod?: string;
}

// Extracted data from documents - comprehensive interface
interface ExtractedData {
  claimId?: string;
  policyholder?: string;
  policyholderSecondary?: string;
  contactPhone?: string;
  contactEmail?: string;
  dateOfLoss?: string;
  riskLocation?: string;
  propertyAddress?: string;
  propertyStreetAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyZipCode?: string;
  causeOfLoss?: string;
  lossDescription?: string;
  dwellingDamageDescription?: string;
  otherStructureDamageDescription?: string;
  damageLocation?: string;
  yearBuilt?: string;
  yearRoofInstall?: string;
  isWoodRoof?: boolean;
  // New property damage fields
  roofDamageReported?: string;
  numberOfStories?: string;
  policyNumber?: string;
  state?: string;
  carrier?: string;
  lineOfBusiness?: string;
  policyInceptionDate?: string;
  // New claim status field
  claimStatus?: string;
  policyDeductible?: string;
  windHailDeductible?: string;
  windHailDeductiblePercent?: string;
  coverages?: CoverageDetail[];
  dwellingLimit?: string;
  otherStructuresLimit?: string;
  personalPropertyLimit?: string;
  lossOfUseLimit?: string;
  liabilityLimit?: string;
  medicalLimit?: string;
  scheduledStructures?: ScheduledStructure[];
  unscheduledStructuresLimit?: string;
  additionalCoverages?: { name: string; limit?: string; deductible?: string }[];
  endorsementsListed?: string[];
  endorsementDetails?: EndorsementDetailItem[];
  mortgagee?: string;
  // New third party interest field
  thirdPartyInterest?: string;
  producer?: string;
  producerPhone?: string;
  producerEmail?: string;
  reportedBy?: string;
  reportedDate?: string;
  // New drone eligibility field
  droneEligibleAtFNOL?: string;
  policyDetails?: {
    policyNumber?: string;
    state?: string;
    yearRoofInstall?: string;
    windHailDeductible?: string;
    dwellingLimit?: string;
    endorsementsListed?: string[];
  };
  // HO Policy Form structure fields (new)
  documentType?: string;
  formNumber?: string;
  documentTitle?: string;
  baseStructure?: BaseStructure;
  defaultPolicyProvisionSummary?: DefaultPolicyProvisionSummary;
  // Full text extraction fields
  pageText?: string;
  pageTexts?: string[];
  fullText?: string;
  // Raw claims array from OpenAI response (for reference)
  claims?: any[];
}

// Endorsement record for database
interface EndorsementRecord {
  formNumber: string;
  documentTitle: string;
  description?: string;
  documentId?: string;
  fileName?: string;
}

// Collapsible section component for extracted data (hoisted outside NewClaim to preserve state)
const CollapsibleSection = ({ 
  title, 
  children, 
  defaultOpen = true,
  count,
  icon: Icon
}: { 
  title: string; 
  children: React.ReactNode; 
  defaultOpen?: boolean;
  count?: number;
  icon?: React.ComponentType<{ className?: string }>;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border-b border-slate-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-3 text-left hover:bg-slate-100/50 transition-colors rounded"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wide">
          {Icon && <Icon className="w-4 h-4" />}
          {title}
          {count !== undefined && (
            <Badge variant="secondary" className="text-xs ml-1">{count}</Badge>
          )}
        </span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      {isOpen && (
        <div className="pb-4">
          {children}
        </div>
      )}
    </div>
  );
};

// Document page viewer component for displaying PDF pages as images
const DocumentPageViewer = ({ 
  documentId, 
  documentName,
  onClose 
}: { 
  documentId: string; 
  documentName?: string;
  onClose?: () => void;
}) => {
  const [pageCount, setPageCount] = useState(0);
  const [pageBlobUrls, setPageBlobUrls] = useState<Map<number, string>>(new Map());
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Fetch preview URLs from Supabase on mount
  useEffect(() => {
    const loadPreviews = async () => {
      setLoading(true);
      try {
        // Try the new Supabase previews endpoint first
        const response = await fetch(`/api/documents/${documentId}/previews`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          
          // If previews aren't ready, trigger generation and poll
          if (data.previewStatus === 'pending' || data.previewStatus === 'processing') {
            // Trigger preview generation if pending
            if (data.previewStatus === 'pending') {
              await fetch(`/api/documents/${documentId}/generate-previews`, {
                method: 'POST',
                credentials: 'include'
              });
            }
            
            // Poll for completion (max 30 seconds)
            let attempts = 0;
            const maxAttempts = 15;
            while (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 2000));
              const pollResponse = await fetch(`/api/documents/${documentId}/previews`, {
                credentials: 'include'
              });
              if (pollResponse.ok) {
                const pollData = await pollResponse.json();
                if (pollData.previewStatus === 'completed' && pollData.urls.length > 0) {
                  setPageCount(pollData.pageCount);
                  // Store Supabase signed URLs directly
                  const urlMap = new Map<number, string>();
                  pollData.urls.forEach((url: string, idx: number) => {
                    urlMap.set(idx + 1, url);
                  });
                  setPageBlobUrls(urlMap);
                  return;
                }
                if (pollData.previewStatus === 'failed') {
                  break;
                }
              }
              attempts++;
            }
          } else if (data.previewStatus === 'completed' && data.urls.length > 0) {
            setPageCount(data.pageCount);
            // Store Supabase signed URLs directly
            const urlMap = new Map<number, string>();
            data.urls.forEach((url: string, idx: number) => {
              urlMap.set(idx + 1, url);
            });
            setPageBlobUrls(urlMap);
            return;
          }
        }
        
        // Fallback to legacy endpoint
        const legacyResponse = await fetch(`/api/documents/${documentId}/images`, {
          credentials: 'include'
        });
        if (legacyResponse.ok) {
          const legacyData = await legacyResponse.json();
          setPageCount(legacyData.pages);
        }
      } catch (error) {
        console.error('Failed to load document previews:', error);
      } finally {
        setLoading(false);
      }
    };
    loadPreviews();
  }, [documentId]);

  // Fetch page image if not already loaded (for legacy fallback only)
  useEffect(() => {
    if (pageCount === 0) return;
    
    // Check if we already have this page (from Supabase or previous load)
    if (pageBlobUrls.has(currentPage)) return;

    const loadPageImage = async () => {
      setPageLoading(true);
      try {
        const response = await fetch(`/api/documents/${documentId}/image/${currentPage}`, {
          credentials: 'include'
        });
        if (response.ok) {
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          setPageBlobUrls(prev => new Map(prev).set(currentPage, blobUrl));
        }
      } catch (error) {
        console.error('Failed to load page image:', error);
      } finally {
        setPageLoading(false);
      }
    };
    loadPageImage();
  }, [documentId, currentPage, pageCount, pageBlobUrls]);

  // Cleanup blob URLs on unmount (only for local blob: URLs, not Supabase signed URLs)
  useEffect(() => {
    return () => {
      pageBlobUrls.forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-100 rounded-lg">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (pageCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-slate-100 rounded-lg text-muted-foreground">
        <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
        <p className="text-sm">Unable to load document preview</p>
      </div>
    );
  }

  const currentImageUrl = pageBlobUrls.get(currentPage);

  // Fullscreen modal - shares state with inline viewer
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
        <div className="flex items-center justify-between p-4 text-white">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
              disabled={currentPage <= 1} 
              className="text-white hover:bg-white/20"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span>Page {currentPage} of {pageCount}</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))} 
              disabled={currentPage >= pageCount} 
              className="text-white hover:bg-white/20"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setZoom(z => Math.max(50, z - 25))} 
                disabled={zoom <= 50} 
                className="text-white hover:bg-white/20"
              >
                <ZoomOut className="w-5 h-5" />
              </Button>
              <span className="text-sm w-14 text-center">{zoom}%</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setZoom(z => Math.min(200, z + 25))} 
                disabled={zoom >= 200} 
                className="text-white hover:bg-white/20"
              >
                <ZoomIn className="w-5 h-5" />
              </Button>
            </div>
            <span className="text-sm opacity-75">{documentName || 'Document'}</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setFullscreen(false)} 
              className="text-white hover:bg-white/20"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center p-4">
          {pageLoading || !currentImageUrl ? (
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          ) : (
            <img
              src={currentImageUrl}
              alt={`${documentName || 'Document'} - Page ${currentPage}`}
              style={{ width: zoom > 100 ? `${zoom}%` : undefined, maxWidth: zoom > 100 ? 'none' : undefined }}
              className={zoom <= 100 ? "max-h-full max-w-full object-contain" : ""}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b bg-slate-50">
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
            disabled={currentPage <= 1}
            className="h-7 w-7 p-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs px-2">
            {currentPage} / {pageCount}
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))} 
            disabled={currentPage >= pageCount}
            className="h-7 w-7 p-0"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setZoom(z => Math.max(50, z - 25))} 
            disabled={zoom <= 50}
            className="h-7 w-7 p-0"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs w-10 text-center">{zoom}%</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setZoom(z => Math.min(200, z + 25))} 
            disabled={zoom >= 200}
            className="h-7 w-7 p-0"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setFullscreen(true)}
            className="h-7 w-7 p-0"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Image display */}
      <div className="overflow-auto p-4 bg-slate-100 max-h-[500px]">
        <div className="flex justify-center items-center min-h-[200px]">
          {pageLoading || !currentImageUrl ? (
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          ) : (
            <img
              src={currentImageUrl}
              alt={`${documentName || 'Document'} - Page ${currentPage}`}
              style={{ width: `${zoom}%`, maxWidth: 'none' }}
              className="shadow-lg bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default function NewClaim() {
  const [location, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState<WizardStep>('fnol');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);

  // Document state for each step
  const [fnolDoc, setFnolDoc] = useState<UploadedDocument | null>(null);
  const [policyDoc, setPolicyDoc] = useState<UploadedDocument | null>(null);
  const [endorsementDocs, setEndorsementDocs] = useState<UploadedDocument[]>([]);

  // Merged extracted data from all documents
  const [claimData, setClaimData] = useState<ExtractedData>({
    causeOfLoss: 'Hail',
    endorsementsListed: [],
  });

  // Endorsement records to be created
  const [endorsementRecords, setEndorsementRecords] = useState<EndorsementRecord[]>([]);

  // Draft claim - created early and updated as documents are processed
  const [draftClaim, setDraftClaim] = useState<Claim | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  // Current organization ID for claim creation
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);

  // Check for resume parameter to load an existing draft claim
  const resumeClaimId = new URLSearchParams(window.location.search).get('resume');

  // Load existing draft claim if resuming
  useEffect(() => {
    if (!resumeClaimId) return;
    
    const loadDraftClaim = async () => {
      setIsLoadingDraft(true);
      try {
        // Load the claim and its documents
        const [claim, documents] = await Promise.all([
          getClaim(resumeClaimId),
          getClaimDocuments(resumeClaimId),
        ]);
        
        if (claim.status !== 'draft') {
          // Not a draft claim, redirect to claim detail
          setLocation(`/claim/${resumeClaimId}`);
          return;
        }
        
        // Set the draft claim
        setDraftClaim(claim);
        
        // Populate claim data from the loaded claim
        const metadata = (claim as any).metadata || {};
        setClaimData({
          claimId: claim.claimNumber || '',
          policyholder: claim.insuredName || '',
          policyholderSecondary: metadata.policyholderSecondary,
          contactPhone: metadata.contactPhone,
          contactEmail: metadata.contactEmail,
          dateOfLoss: claim.dateOfLoss || '',
          riskLocation: claim.propertyAddress || '',
          causeOfLoss: claim.lossType || 'Hail',
          lossDescription: claim.lossDescription || '',
          policyNumber: claim.policyNumber || '',
          state: claim.propertyState || '',
          yearRoofInstall: claim.yearRoofInstall || metadata.yearRoofInstall,
          windHailDeductible: claim.windHailDeductible || '',
          dwellingLimit: claim.dwellingLimit || '',
          endorsementsListed: claim.endorsementsListed || [],
          dwellingDamageDescription: metadata.dwellingDamageDescription,
          otherStructureDamageDescription: metadata.otherStructureDamageDescription,
          damageLocation: metadata.damageLocation,
          carrier: metadata.carrier,
          coverages: metadata.coverages,
        });
        
        // Populate document state from loaded documents
        documents.forEach(doc => {
          const docType = doc.type as 'fnol' | 'policy' | 'endorsement';
          const uploadedDoc: UploadedDocument = {
            file: new File([], doc.name || doc.fileName || 'document'),
            type: docType,
            status: doc.processingStatus === 'completed' ? 'completed' : 
                   doc.processingStatus === 'failed' ? 'error' : 'pending',
            document: doc,
            extractedData: doc.extractedData as ExtractedData | undefined,
          };
          
          if (docType === 'fnol') {
            setFnolDoc(uploadedDoc);
          } else if (docType === 'policy') {
            setPolicyDoc(uploadedDoc);
          } else if (docType === 'endorsement') {
            setEndorsementDocs(prev => [...prev, uploadedDoc]);
          }
        });
        
        // Determine which step to start on based on what's already uploaded
        const hasFnol = documents.some(d => d.type === 'fnol');
        const hasPolicy = documents.some(d => d.type === 'policy');
        
        if (hasFnol && hasPolicy) {
          setCurrentStep('endorsements');
        } else if (hasFnol) {
          setCurrentStep('policy');
        } else {
          setCurrentStep('fnol');
        }
        
      } catch (err) {
        console.error('Failed to load draft claim:', err);
        setError('Failed to load the draft claim. Please try again.');
      } finally {
        setIsLoadingDraft(false);
      }
    };
    
    loadDraftClaim();
  }, [resumeClaimId, setLocation]);

  // Fetch current organization on mount
  useEffect(() => {
    const fetchOrg = async () => {
      try {
        const result = await getMyOrganizations();
        if (result.currentOrganizationId) {
          setCurrentOrgId(result.currentOrganizationId);
        } else if (result.organizations.length > 0) {
          setCurrentOrgId(result.organizations[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch organization:', err);
      }
    };
    fetchOrg();
  }, []);

  // Creating claim state
  const [isCreating, setIsCreating] = useState(false);

  const steps: { key: WizardStep; label: string; icon: React.ElementType }[] = [
    { key: 'fnol', label: 'FNOL Report', icon: FileText },
    { key: 'policy', label: 'HO Policy', icon: Shield },
    { key: 'endorsements', label: 'Endorsements', icon: FilePlus },
    { key: 'review', label: 'Review & Create', icon: CheckCircle2 },
  ];

  const currentStepIndex = steps.findIndex(s => s.key === currentStep);

  // Upload and process a single document
  const uploadAndProcessDocument = async (
    file: File,
    type: 'fnol' | 'policy' | 'endorsement'
  ): Promise<UploadedDocument> => {
    const uploadedDoc: UploadedDocument = {
      file,
      type,
      status: 'uploading',
    };

    try {
      // Upload the document
      const doc = await uploadDocument(file, {
        type,
        name: file.name,
      });
      uploadedDoc.document = doc;
      uploadedDoc.status = 'processing';

      // Process with AI
      try {
        const processResult = await processDocument(doc.id);
        uploadedDoc.extractedData = processResult.extractedData as ExtractedData;
        uploadedDoc.status = 'completed';
      } catch (processErr) {
        console.warn('AI extraction failed for', doc.name, processErr);
        uploadedDoc.status = 'completed'; // Still mark as completed, just no extraction
      }

      return uploadedDoc;
    } catch (err) {
      uploadedDoc.status = 'error';
      uploadedDoc.error = (err as Error).message;
      throw err;
    }
  };

  // Merge extracted data into claim data
  const mergeExtractedData = (extracted: ExtractedData | undefined) => {
    if (!extracted) return;

    setClaimData(prev => {
      const merged = { ...prev };
      const pd = extracted.policyDetails || {};

      // Basic claim info
      if (extracted.claimId && !merged.claimId) merged.claimId = extracted.claimId;
      if (extracted.policyholder && !merged.policyholder) merged.policyholder = extracted.policyholder;
      if (extracted.policyholderSecondary && !merged.policyholderSecondary) merged.policyholderSecondary = extracted.policyholderSecondary;
      if (extracted.contactPhone && !merged.contactPhone) merged.contactPhone = extracted.contactPhone;
      if (extracted.contactEmail && !merged.contactEmail) merged.contactEmail = extracted.contactEmail;
      if (extracted.dateOfLoss && !merged.dateOfLoss) merged.dateOfLoss = extracted.dateOfLoss;
      if (extracted.riskLocation && !merged.riskLocation) merged.riskLocation = extracted.riskLocation;
      if (extracted.causeOfLoss && extracted.causeOfLoss !== 'Hail') merged.causeOfLoss = extracted.causeOfLoss;
      if (extracted.lossDescription && !merged.lossDescription) merged.lossDescription = extracted.lossDescription;
      if (extracted.dwellingDamageDescription && !merged.dwellingDamageDescription) merged.dwellingDamageDescription = extracted.dwellingDamageDescription;
      if (extracted.otherStructureDamageDescription && !merged.otherStructureDamageDescription) merged.otherStructureDamageDescription = extracted.otherStructureDamageDescription;
      if (extracted.damageLocation && !merged.damageLocation) merged.damageLocation = extracted.damageLocation;

      // Property details
      if (extracted.yearBuilt && !merged.yearBuilt) merged.yearBuilt = extracted.yearBuilt;
      if ((extracted.yearRoofInstall || pd.yearRoofInstall) && !merged.yearRoofInstall)
        merged.yearRoofInstall = extracted.yearRoofInstall || pd.yearRoofInstall;
      if (extracted.isWoodRoof !== undefined && merged.isWoodRoof === undefined) merged.isWoodRoof = extracted.isWoodRoof;
      if (extracted.roofDamageReported && !merged.roofDamageReported) merged.roofDamageReported = extracted.roofDamageReported;
      if (extracted.numberOfStories && !merged.numberOfStories) merged.numberOfStories = extracted.numberOfStories;

      // Claim status
      if (extracted.claimStatus && !merged.claimStatus) merged.claimStatus = extracted.claimStatus;
      if (extracted.droneEligibleAtFNOL && !merged.droneEligibleAtFNOL) merged.droneEligibleAtFNOL = extracted.droneEligibleAtFNOL;

      // Policy details
      if ((extracted.policyNumber || pd.policyNumber) && !merged.policyNumber)
        merged.policyNumber = extracted.policyNumber || pd.policyNumber;
      if ((extracted.state || pd.state) && !merged.state)
        merged.state = extracted.state || pd.state;
      if (extracted.carrier && !merged.carrier) merged.carrier = extracted.carrier;
      if (extracted.lineOfBusiness && !merged.lineOfBusiness) merged.lineOfBusiness = extracted.lineOfBusiness;
      if (extracted.policyInceptionDate && !merged.policyInceptionDate) merged.policyInceptionDate = extracted.policyInceptionDate;

      // Deductibles
      if (extracted.policyDeductible && !merged.policyDeductible) merged.policyDeductible = extracted.policyDeductible;
      if ((extracted.windHailDeductible || pd.windHailDeductible) && !merged.windHailDeductible)
        merged.windHailDeductible = extracted.windHailDeductible || pd.windHailDeductible;
      if (extracted.windHailDeductiblePercent && !merged.windHailDeductiblePercent) merged.windHailDeductiblePercent = extracted.windHailDeductiblePercent;

      // Coverage limits
      if ((extracted.dwellingLimit || pd.dwellingLimit) && !merged.dwellingLimit)
        merged.dwellingLimit = extracted.dwellingLimit || pd.dwellingLimit;
      if (extracted.otherStructuresLimit && !merged.otherStructuresLimit) merged.otherStructuresLimit = extracted.otherStructuresLimit;
      if (extracted.personalPropertyLimit && !merged.personalPropertyLimit) merged.personalPropertyLimit = extracted.personalPropertyLimit;
      if (extracted.lossOfUseLimit && !merged.lossOfUseLimit) merged.lossOfUseLimit = extracted.lossOfUseLimit;
      if (extracted.liabilityLimit && !merged.liabilityLimit) merged.liabilityLimit = extracted.liabilityLimit;
      if (extracted.medicalLimit && !merged.medicalLimit) merged.medicalLimit = extracted.medicalLimit;
      if (extracted.unscheduledStructuresLimit && !merged.unscheduledStructuresLimit) merged.unscheduledStructuresLimit = extracted.unscheduledStructuresLimit;

      // Helper to enrich existing object with new data
      const enrichObj = <T extends Record<string, any>>(existing: T, source: T): T => {
        const result = { ...existing };
        for (const [k, v] of Object.entries(source)) {
          if (v !== null && v !== undefined && v !== '' && !result[k]) {
            (result as any)[k] = v;
          }
        }
        return result;
      };

      // Coverages array (merge and enrich existing entries)
      if (extracted.coverages && extracted.coverages.length > 0) {
        const byCode = new Map((merged.coverages || []).map(c => [c.code, c]));
        for (const cov of extracted.coverages) {
          const prev = byCode.get(cov.code);
          byCode.set(cov.code, prev ? enrichObj(prev, cov) : cov);
        }
        merged.coverages = Array.from(byCode.values());
      }

      // Scheduled structures (merge and enrich by description)
      if (extracted.scheduledStructures && extracted.scheduledStructures.length > 0) {
        const byDesc = new Map((merged.scheduledStructures || []).map(s => [s.description, s]));
        for (const str of extracted.scheduledStructures) {
          const prev = byDesc.get(str.description);
          byDesc.set(str.description, prev ? enrichObj(prev, str) : str);
        }
        merged.scheduledStructures = Array.from(byDesc.values());
      }

      // Additional coverages (merge and enrich by name)
      if (extracted.additionalCoverages && extracted.additionalCoverages.length > 0) {
        const byName = new Map((merged.additionalCoverages || []).map(c => [c.name, c]));
        for (const cov of extracted.additionalCoverages) {
          const prev = byName.get(cov.name);
          byName.set(cov.name, prev ? enrichObj(prev, cov) : cov);
        }
        merged.additionalCoverages = Array.from(byName.values());
      }

      // Endorsement details (merge and enrich by formNumber)
      if (extracted.endorsementDetails && extracted.endorsementDetails.length > 0) {
        const byForm = new Map((merged.endorsementDetails || []).map(e => [e.formNumber, e]));
        for (const end of extracted.endorsementDetails) {
          const prev = byForm.get(end.formNumber);
          byForm.set(end.formNumber, prev ? enrichObj(prev, end) : end);
        }
        merged.endorsementDetails = Array.from(byForm.values());
      }

      // Endorsements list
      const newEndorsements = extracted.endorsementsListed || pd.endorsementsListed || [];
      if (newEndorsements.length > 0) {
        merged.endorsementsListed = Array.from(new Set([...(merged.endorsementsListed || []), ...newEndorsements]));
      }

      // Third parties
      if (extracted.thirdPartyInterest && !merged.thirdPartyInterest) merged.thirdPartyInterest = extracted.thirdPartyInterest;
      if (extracted.mortgagee && !merged.mortgagee) merged.mortgagee = extracted.mortgagee;
      if (extracted.producer && !merged.producer) merged.producer = extracted.producer;
      if (extracted.producerPhone && !merged.producerPhone) merged.producerPhone = extracted.producerPhone;
      if (extracted.producerEmail && !merged.producerEmail) merged.producerEmail = extracted.producerEmail;

      // Reporting info
      if (extracted.reportedBy && !merged.reportedBy) merged.reportedBy = extracted.reportedBy;
      if (extracted.reportedDate && !merged.reportedDate) merged.reportedDate = extracted.reportedDate;

      return merged;
    });
  };

  // Build the claim payload from current data
  const buildClaimPayload = (currentClaimData: ExtractedData, currentDocs: { fnol?: UploadedDocument | null; policy?: UploadedDocument | null; endorsements: UploadedDocument[] }) => {
    const documentIds: string[] = [];
    if (currentDocs.fnol?.document?.id) documentIds.push(currentDocs.fnol.document.id);
    if (currentDocs.policy?.document?.id) documentIds.push(currentDocs.policy.document.id);
    currentDocs.endorsements.forEach(d => {
      if (d.document?.id) documentIds.push(d.document.id);
    });

    return {
      claimId: currentClaimData.claimId,
      policyholder: currentClaimData.policyholder,
      dateOfLoss: currentClaimData.dateOfLoss,
      riskLocation: currentClaimData.riskLocation,
      causeOfLoss: currentClaimData.causeOfLoss,
      lossDescription: currentClaimData.lossDescription,
      policyNumber: currentClaimData.policyNumber,
      state: currentClaimData.state,
      yearRoofInstall: currentClaimData.yearRoofInstall,
      windHailDeductible: currentClaimData.windHailDeductible,
      dwellingLimit: currentClaimData.dwellingLimit,
      endorsementsListed: currentClaimData.endorsementsListed,
      metadata: {
        documentIds,
        policyholderSecondary: currentClaimData.policyholderSecondary,
        contactPhone: currentClaimData.contactPhone,
        contactEmail: currentClaimData.contactEmail,
        yearBuilt: currentClaimData.yearBuilt,
        isWoodRoof: currentClaimData.isWoodRoof,
        // New property damage fields
        roofDamageReported: currentClaimData.roofDamageReported,
        numberOfStories: currentClaimData.numberOfStories,
        dwellingDamageDescription: currentClaimData.dwellingDamageDescription,
        otherStructureDamageDescription: currentClaimData.otherStructureDamageDescription,
        damageLocation: currentClaimData.damageLocation,
        carrier: currentClaimData.carrier,
        lineOfBusiness: currentClaimData.lineOfBusiness,
        policyInceptionDate: currentClaimData.policyInceptionDate,
        // New claim status fields
        claimStatus: currentClaimData.claimStatus,
        droneEligibleAtFNOL: currentClaimData.droneEligibleAtFNOL,
        policyDeductible: currentClaimData.policyDeductible,
        windHailDeductiblePercent: currentClaimData.windHailDeductiblePercent,
        otherStructuresLimit: currentClaimData.otherStructuresLimit,
        personalPropertyLimit: currentClaimData.personalPropertyLimit,
        lossOfUseLimit: currentClaimData.lossOfUseLimit,
        liabilityLimit: currentClaimData.liabilityLimit,
        medicalLimit: currentClaimData.medicalLimit,
        unscheduledStructuresLimit: currentClaimData.unscheduledStructuresLimit,
        coverages: currentClaimData.coverages,
        scheduledStructures: currentClaimData.scheduledStructures,
        additionalCoverages: currentClaimData.additionalCoverages,
        endorsementDetails: currentClaimData.endorsementDetails,
        // Third party fields
        thirdPartyInterest: currentClaimData.thirdPartyInterest,
        mortgagee: currentClaimData.mortgagee,
        producer: currentClaimData.producer,
        producerPhone: currentClaimData.producerPhone,
        producerEmail: currentClaimData.producerEmail,
        reportedBy: currentClaimData.reportedBy,
        reportedDate: currentClaimData.reportedDate,
      },
    };
  };

  // Save or update the draft claim
  const saveDraftClaim = async (mergedData: ExtractedData, docs: { fnol?: UploadedDocument | null; policy?: UploadedDocument | null; endorsements: UploadedDocument[] }) => {
    // Can't create claim without organization
    if (!currentOrgId && !draftClaim) {
      console.warn('No organization ID available for draft claim creation');
      return null;
    }
    
    setIsSavingDraft(true);
    try {
      const payload = buildClaimPayload(mergedData, docs);
      
      if (draftClaim) {
        // Update existing draft
        const updated = await updateClaim(draftClaim.id, payload);
        setDraftClaim(updated);
        return updated;
      } else {
        // Create new draft with organization ID
        const created = await createClaim({ 
          ...payload, 
          status: 'draft',
          organizationId: currentOrgId!,
        });
        setDraftClaim(created);
        return created;
      }
    } catch (err) {
      console.error('Failed to save draft claim:', err);
      // Don't throw - draft saving is best-effort
      return null;
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Handle FNOL file selection and create draft claim
  const handleFnolSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    setError(null);
    setIsProcessing(true);
    setFnolDoc({ file, type: 'fnol', status: 'uploading' });

    try {
      const result = await uploadAndProcessDocument(file, 'fnol');
      setFnolDoc(result);
      
      // Merge extracted data and get the updated merged data
      let mergedData = claimData;
      if (result.extractedData) {
        mergeExtractedData(result.extractedData);
        // Build merged data manually for immediate use (state update is async)
        mergedData = { ...claimData };
        const extracted = result.extractedData;
        const pd = extracted.policyDetails || {};
        if (extracted.claimId) mergedData.claimId = extracted.claimId;
        if (extracted.policyholder) mergedData.policyholder = extracted.policyholder;
        if (extracted.policyholderSecondary) mergedData.policyholderSecondary = extracted.policyholderSecondary;
        if (extracted.contactPhone) mergedData.contactPhone = extracted.contactPhone;
        if (extracted.contactEmail) mergedData.contactEmail = extracted.contactEmail;
        if (extracted.dateOfLoss) mergedData.dateOfLoss = extracted.dateOfLoss;
        if (extracted.riskLocation) mergedData.riskLocation = extracted.riskLocation;
        if (extracted.causeOfLoss && extracted.causeOfLoss !== 'Hail') mergedData.causeOfLoss = extracted.causeOfLoss;
        if (extracted.lossDescription) mergedData.lossDescription = extracted.lossDescription;
        if (extracted.policyNumber || pd.policyNumber) mergedData.policyNumber = extracted.policyNumber || pd.policyNumber;
        if (extracted.state || pd.state) mergedData.state = extracted.state || pd.state;
        if (extracted.yearRoofInstall || pd.yearRoofInstall) mergedData.yearRoofInstall = extracted.yearRoofInstall || pd.yearRoofInstall;
        if (extracted.windHailDeductible || pd.windHailDeductible) mergedData.windHailDeductible = extracted.windHailDeductible || pd.windHailDeductible;
        if (extracted.dwellingLimit) mergedData.dwellingLimit = extracted.dwellingLimit;
        const newEndorsements = extracted.endorsementsListed || pd.endorsementsListed || [];
        if (newEndorsements.length > 0) {
          mergedData.endorsementsListed = Array.from(new Set([...(mergedData.endorsementsListed || []), ...newEndorsements]));
        }
      }
      
      // Create the draft claim
      await saveDraftClaim(mergedData, { fnol: result, policy: policyDoc, endorsements: endorsementDocs });
    } catch (err) {
      setError((err as Error).message);
      setFnolDoc(prev => prev ? { ...prev, status: 'error', error: (err as Error).message } : null);
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  // Handle Policy file selection and update draft claim
  const handlePolicySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    setError(null);
    setIsProcessing(true);
    setPolicyDoc({ file, type: 'policy', status: 'uploading' });

    try {
      const result = await uploadAndProcessDocument(file, 'policy');
      setPolicyDoc(result);
      mergeExtractedData(result.extractedData);
      
      // Update the draft claim with new data
      // Use a timeout to ensure state has updated
      setTimeout(async () => {
        await saveDraftClaim(claimData, { fnol: fnolDoc, policy: result, endorsements: endorsementDocs });
      }, 100);
    } catch (err) {
      setError((err as Error).message);
      setPolicyDoc(prev => prev ? { ...prev, status: 'error', error: (err as Error).message } : null);
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  // Handle Endorsement file selection
  const handleEndorsementSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    setError(null);
    setIsProcessing(true);

    const tempDoc: UploadedDocument = { file, type: 'endorsement', status: 'uploading' };
    setEndorsementDocs(prev => [...prev, tempDoc]);

    try {
      const result = await uploadAndProcessDocument(file, 'endorsement');

      // Update the document in the list
      setEndorsementDocs(prev =>
        prev.map(d => d.file === file ? result : d)
      );

      // Merge any endorsement data extracted
      mergeExtractedData(result.extractedData);

      // Create an endorsement record from the extracted data
      const extracted = result.extractedData;
      const endorsementsList = extracted?.endorsementsListed || extracted?.policyDetails?.endorsementsListed || [];

      if (endorsementsList.length > 0) {
        // Parse endorsement strings into records (filter out non-strings)
        endorsementsList
          .filter((item): item is string => typeof item === 'string')
          .forEach(endorsementStr => {
          const parts = endorsementStr.split(' - ');
          const formNumber = parts[0]?.trim() || endorsementStr;
          const documentTitle = parts.slice(1).join(' - ').trim() || 'Endorsement';

          // Check if this endorsement already exists
          setEndorsementRecords(prev => {
            const exists = prev.some(r => r.formNumber === formNumber);
            if (exists) return prev;
            return [...prev, {
              formNumber,
              documentTitle,
              documentId: result.document?.id,
              fileName: file.name,
            }];
          });
        });
      } else {
        // If no specific endorsements extracted, create a generic record
        setEndorsementRecords(prev => [...prev, {
          formNumber: `END-${prev.length + 1}`,
          documentTitle: file.name.replace(/\.[^/.]+$/, ''),
          documentId: result.document?.id,
          fileName: file.name,
        }]);
      }
      
      // Update the draft claim with new endorsement data
      setTimeout(async () => {
        const updatedEndorsements = [...endorsementDocs.filter(d => d.file !== file), result];
        await saveDraftClaim(claimData, { fnol: fnolDoc, policy: policyDoc, endorsements: updatedEndorsements });
      }, 100);
    } catch (err) {
      setError((err as Error).message);
      setEndorsementDocs(prev =>
        prev.map(d => d.file === file ? { ...d, status: 'error', error: (err as Error).message } : d)
      );
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  // Remove an endorsement document
  const removeEndorsementDoc = (index: number) => {
    const doc = endorsementDocs[index];
    setEndorsementDocs(prev => prev.filter((_, i) => i !== index));

    // Also remove associated endorsement records
    if (doc.document?.id) {
      setEndorsementRecords(prev => prev.filter(r => r.documentId !== doc.document?.id));
    }
  };

  // Remove an endorsement record
  const removeEndorsementRecord = (index: number) => {
    setEndorsementRecords(prev => prev.filter((_, i) => i !== index));
  };

  // Add manual endorsement record
  const [newEndorsementForm, setNewEndorsementForm] = useState({ formNumber: '', documentTitle: '' });

  const addManualEndorsement = () => {
    if (!newEndorsementForm.formNumber.trim()) return;

    setEndorsementRecords(prev => [...prev, {
      formNumber: newEndorsementForm.formNumber.trim(),
      documentTitle: newEndorsementForm.documentTitle.trim() || 'Manual Entry',
    }]);
    setNewEndorsementForm({ formNumber: '', documentTitle: '' });
  };

  // Navigate between steps
  const goToNextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].key);
    }
  };

  const goToPrevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].key);
    }
  };

  // Finalize the claim - update from draft to fnol status
  const handleCreateClaim = async () => {
    setIsCreating(true);
    setError(null);

    try {
      // Collect all document IDs
      const documentIds: string[] = [];
      if (fnolDoc?.document?.id) documentIds.push(fnolDoc.document.id);
      if (policyDoc?.document?.id) documentIds.push(policyDoc.document.id);
      endorsementDocs.forEach(d => {
        if (d.document?.id) documentIds.push(d.document.id);
      });

      let claim: Claim;

      if (draftClaim) {
        // Finalize the existing draft - update to fnol status with latest data
        claim = await updateClaim(draftClaim.id, {
          claimId: claimData.claimId,
          policyholder: claimData.policyholder,
          dateOfLoss: claimData.dateOfLoss,
          riskLocation: claimData.riskLocation,
          causeOfLoss: claimData.causeOfLoss,
          lossDescription: claimData.lossDescription,
          policyNumber: claimData.policyNumber,
          state: claimData.state,
          yearRoofInstall: claimData.yearRoofInstall,
          windHailDeductible: claimData.windHailDeductible,
          dwellingLimit: claimData.dwellingLimit,
          endorsementsListed: claimData.endorsementsListed,
          status: 'fnol', // Change from draft to fnol
          metadata: {
            documentIds,
            endorsementRecords,
            policyholderSecondary: claimData.policyholderSecondary,
            contactPhone: claimData.contactPhone,
            contactEmail: claimData.contactEmail,
            yearBuilt: claimData.yearBuilt,
            isWoodRoof: claimData.isWoodRoof,
            // New property damage fields
            roofDamageReported: claimData.roofDamageReported,
            numberOfStories: claimData.numberOfStories,
            dwellingDamageDescription: claimData.dwellingDamageDescription,
            otherStructureDamageDescription: claimData.otherStructureDamageDescription,
            damageLocation: claimData.damageLocation,
            carrier: claimData.carrier,
            lineOfBusiness: claimData.lineOfBusiness,
            policyInceptionDate: claimData.policyInceptionDate,
            // New claim status fields
            claimStatus: claimData.claimStatus,
            droneEligibleAtFNOL: claimData.droneEligibleAtFNOL,
            policyDeductible: claimData.policyDeductible,
            windHailDeductiblePercent: claimData.windHailDeductiblePercent,
            otherStructuresLimit: claimData.otherStructuresLimit,
            personalPropertyLimit: claimData.personalPropertyLimit,
            lossOfUseLimit: claimData.lossOfUseLimit,
            liabilityLimit: claimData.liabilityLimit,
            medicalLimit: claimData.medicalLimit,
            unscheduledStructuresLimit: claimData.unscheduledStructuresLimit,
            coverages: claimData.coverages,
            scheduledStructures: claimData.scheduledStructures,
            additionalCoverages: claimData.additionalCoverages,
            endorsementDetails: claimData.endorsementDetails,
            // Third party fields
            thirdPartyInterest: claimData.thirdPartyInterest,
            mortgagee: claimData.mortgagee,
            producer: claimData.producer,
            producerPhone: claimData.producerPhone,
            producerEmail: claimData.producerEmail,
            reportedBy: claimData.reportedBy,
            reportedDate: claimData.reportedDate,
          },
        });
      } else {
        // No draft exists - create claim directly (fallback)
        if (!currentOrgId) {
          throw new Error('No organization selected. Please refresh the page and try again.');
        }
        claim = await createClaim({
          organizationId: currentOrgId,
          claimId: claimData.claimId,
          policyholder: claimData.policyholder,
          dateOfLoss: claimData.dateOfLoss,
          riskLocation: claimData.riskLocation,
          causeOfLoss: claimData.causeOfLoss,
          lossDescription: claimData.lossDescription,
          policyNumber: claimData.policyNumber,
          state: claimData.state,
          yearRoofInstall: claimData.yearRoofInstall,
          windHailDeductible: claimData.windHailDeductible,
          dwellingLimit: claimData.dwellingLimit,
          endorsementsListed: claimData.endorsementsListed,
          status: 'fnol',
          metadata: {
            documentIds,
            endorsementRecords,
            policyholderSecondary: claimData.policyholderSecondary,
            contactPhone: claimData.contactPhone,
            contactEmail: claimData.contactEmail,
            yearBuilt: claimData.yearBuilt,
            isWoodRoof: claimData.isWoodRoof,
            // New property damage fields
            roofDamageReported: claimData.roofDamageReported,
            numberOfStories: claimData.numberOfStories,
            dwellingDamageDescription: claimData.dwellingDamageDescription,
            otherStructureDamageDescription: claimData.otherStructureDamageDescription,
            damageLocation: claimData.damageLocation,
            carrier: claimData.carrier,
            lineOfBusiness: claimData.lineOfBusiness,
            policyInceptionDate: claimData.policyInceptionDate,
            // New claim status fields
            claimStatus: claimData.claimStatus,
            droneEligibleAtFNOL: claimData.droneEligibleAtFNOL,
            policyDeductible: claimData.policyDeductible,
            windHailDeductiblePercent: claimData.windHailDeductiblePercent,
            otherStructuresLimit: claimData.otherStructuresLimit,
            personalPropertyLimit: claimData.personalPropertyLimit,
            lossOfUseLimit: claimData.lossOfUseLimit,
            liabilityLimit: claimData.liabilityLimit,
            medicalLimit: claimData.medicalLimit,
            unscheduledStructuresLimit: claimData.unscheduledStructuresLimit,
            coverages: claimData.coverages,
            scheduledStructures: claimData.scheduledStructures,
            additionalCoverages: claimData.additionalCoverages,
            endorsementDetails: claimData.endorsementDetails,
            // Third party fields
            thirdPartyInterest: claimData.thirdPartyInterest,
            mortgagee: claimData.mortgagee,
            producer: claimData.producer,
            producerPhone: claimData.producerPhone,
            producerEmail: claimData.producerEmail,
            reportedBy: claimData.reportedBy,
            reportedDate: claimData.reportedDate,
          },
        });
      }

      // Create endorsement records in the database
      if (endorsementRecords.length > 0) {
        try {
          await fetch('/api/endorsements/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              claimId: claim.id,
              endorsements: endorsementRecords,
            }),
          });
        } catch (endorsementErr) {
          console.warn('Failed to create endorsement records:', endorsementErr);
        }
      }

      // Navigate to the claim
      setLocation(`/claim/${claim.id}`);
    } catch (err) {
      setError((err as Error).message);
      setIsCreating(false);
    }
  };

  // File drop zone component
  const FileDropZone = ({
    title,
    description,
    icon: Icon,
    accept,
    onFileSelect,
    uploadedDoc,
    onRemove,
    multiple = false,
  }: {
    title: string;
    description: string;
    icon: React.ElementType;
    accept: string;
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    uploadedDoc?: UploadedDocument | null;
    onRemove?: () => void;
    multiple?: boolean;
  }) => {
    const hasFile = uploadedDoc && uploadedDoc.status !== 'error';
    const isUploading = uploadedDoc?.status === 'uploading' || uploadedDoc?.status === 'processing';

    return (
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 transition-colors ${
          hasFile ? 'border-green-300 bg-green-50' : 'border-slate-200 hover:border-primary/50 bg-slate-50'
        }`}
      >
        {!hasFile && !isUploading && (
          <input
            type="file"
            accept={accept}
            multiple={multiple}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={onFileSelect}
          />
        )}

        <div className="flex flex-col items-center text-center">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
            hasFile ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'
          }`}>
            {isUploading ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : hasFile ? (
              <CheckCircle2 className="w-8 h-8" />
            ) : (
              <Icon className="w-8 h-8" />
            )}
          </div>

          <h3 className="font-semibold text-slate-900 mb-1 text-lg">{title}</h3>
          <p className="text-sm text-slate-500 mb-4">{description}</p>

          {uploadedDoc ? (
            <div className="w-full max-w-md">
              <div className="flex items-center gap-3 bg-white rounded-lg p-3 shadow-sm">
                <FileCheck className="w-5 h-5 text-green-500 flex-shrink-0" />
                <span className="flex-1 truncate text-sm font-medium">{uploadedDoc.file.name}</span>
                {uploadedDoc.status === 'uploading' && (
                  <Badge variant="secondary">Uploading...</Badge>
                )}
                {uploadedDoc.status === 'processing' && (
                  <Badge variant="secondary">Processing...</Badge>
                )}
                {uploadedDoc.status === 'completed' && (
                  <Badge className="bg-green-100 text-green-700">Processed</Badge>
                )}
                {uploadedDoc.status === 'error' && (
                  <Badge variant="destructive">Error</Badge>
                )}
                {onRemove && uploadedDoc.status !== 'uploading' && uploadedDoc.status !== 'processing' && (
                  <button
                    onClick={onRemove}
                    className="text-slate-400 hover:text-red-500 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {uploadedDoc.error && (
                <p className="text-sm text-red-500 mt-2">{uploadedDoc.error}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Drop file here or click to browse
            </p>
          )}
        </div>
      </div>
    );
  };

  // Extracted data preview component - comprehensive display with document viewer
  const ExtractedDataPreview = ({ 
    data, 
    title,
    documentId,
    documentName
  }: { 
    data: ExtractedData | undefined; 
    title: string;
    documentId?: string;
    documentName?: string;
  }) => {
    const [activeTab, setActiveTab] = useState<'document' | 'data'>(documentId ? 'document' : 'data');
    
    if (!data && !documentId) return null;

    // Basic claim info (handle undefined data)
    const claimFields = data ? [
      { label: 'Claim ID', value: data.claimId },
      { label: 'Date of Loss', value: data.dateOfLoss },
      { label: 'Claim Status', value: data.claimStatus },
      { label: 'Cause of Loss', value: data.causeOfLoss },
      { label: 'Damage Location', value: data.damageLocation },
      { label: 'Drone Eligible at FNOL', value: data.droneEligibleAtFNOL },
    ].filter(f => f.value) : [];

    // Policyholder info
    const policyholderFields = data ? [
      { label: 'Policyholder', value: data.policyholder },
      { label: 'Second Insured', value: data.policyholderSecondary },
      { label: 'Phone', value: data.contactPhone },
      { label: 'Email', value: data.contactEmail },
      { label: 'Property Address', value: data.propertyAddress || data.riskLocation },
    ].filter(f => f.value) : [];

    // Policy info
    const policyFields = data ? [
      { label: 'Policy Number', value: data.policyNumber || data.policyDetails?.policyNumber },
      { label: 'State', value: data.state || data.policyDetails?.state },
      { label: 'Carrier', value: data.carrier },
      { label: 'Line of Business', value: data.lineOfBusiness },
      { label: 'In Force Since', value: data.policyInceptionDate },
    ].filter(f => f.value) : [];

    // Property info
    const propertyFields = data ? [
      { label: 'Year Built', value: data.yearBuilt },
      { label: 'Roof Installed', value: data.yearRoofInstall || data.policyDetails?.yearRoofInstall },
      { label: 'Roof Damage Reported', value: data.roofDamageReported },
      { label: 'Number of Stories', value: data.numberOfStories },
      { label: 'Wood Roof', value: data.isWoodRoof !== undefined ? (data.isWoodRoof ? 'Yes' : 'No') : undefined },
    ].filter(f => f.value) : [];

    // Deductibles
    const deductibleFields = data ? [
      { label: 'Policy Deductible', value: data.policyDeductible },
      { label: 'Wind/Hail Deductible', value: data.windHailDeductible || data.policyDetails?.windHailDeductible },
      { label: 'Wind/Hail %', value: data.windHailDeductiblePercent },
    ].filter(f => f.value) : [];

    // Coverages
    const coverages = data?.coverages || [];
    const coverageFields = data ? [
      { label: 'Cov A - Dwelling', value: data.dwellingLimit || data.policyDetails?.dwellingLimit },
      { label: 'Cov B - Other Structures', value: data.otherStructuresLimit },
      { label: 'Cov C - Personal Property', value: data.personalPropertyLimit },
      { label: 'Cov D - Loss of Use', value: data.lossOfUseLimit },
      { label: 'Cov E - Liability', value: data.liabilityLimit },
      { label: 'Cov F - Medical', value: data.medicalLimit },
    ].filter(f => f.value) : [];

    // Scheduled structures
    const scheduledStructures = data?.scheduledStructures || [];

    // Additional coverages
    const additionalCoverages = data?.additionalCoverages || [];

    // Third parties
    const thirdPartyFields = data ? [
      { label: 'Third Party Interest', value: data.thirdPartyInterest },
      { label: 'Mortgagee', value: data.mortgagee },
      { label: 'Producer/Agent', value: data.producer },
      { label: 'Producer Phone', value: data.producerPhone },
      { label: 'Producer Email', value: data.producerEmail },
    ].filter(f => f.value) : [];

    // Endorsements
    const endorsements = data?.endorsementsListed || data?.policyDetails?.endorsementsListed || [];
    const endorsementDetails = data?.endorsementDetails || [];

    // HO Policy Form structure fields (new)
    const formIdentificationFields = data ? [
      { label: 'Document Type', value: data.documentType },
      { label: 'Form Number', value: data.formNumber },
      { label: 'Document Title', value: data.documentTitle },
    ].filter(f => f.value) : [];

    const baseStructure = data?.baseStructure;
    const sectionHeadings = baseStructure?.sectionHeadings || [];
    const definitionOfACV = baseStructure?.definitionOfACV;

    const policyProvisionSummary = data?.defaultPolicyProvisionSummary;
    const provisionFields = data ? [
      { label: 'Wind/Hail Loss Settlement', value: policyProvisionSummary?.windHailLossSettlement },
      { label: 'Unoccupied Exclusion Period', value: policyProvisionSummary?.unoccupiedExclusionPeriod },
    ].filter(f => f.value) : [];

    const hasData = claimFields.length > 0 || policyholderFields.length > 0 || policyFields.length > 0 ||
      propertyFields.length > 0 || deductibleFields.length > 0 || coverageFields.length > 0 ||
      coverages.length > 0 || scheduledStructures.length > 0 || additionalCoverages.length > 0 ||
      thirdPartyFields.length > 0 || endorsements.length > 0 || endorsementDetails.length > 0 ||
      formIdentificationFields.length > 0 || sectionHeadings.length > 0 || definitionOfACV || provisionFields.length > 0;

    // If only document viewer with no extracted data
    if (!hasData && documentId) {
      return (
        <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <h4 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2 pb-3 border-b border-slate-200">
            <ImageIcon className="w-4 h-4" />
            {title}
          </h4>
          <DocumentPageViewer documentId={documentId} documentName={documentName} />
        </div>
      );
    }
    
    if (!hasData) {
      return (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700">No data could be extracted from this document.</p>
        </div>
      );
    }

    const FieldGrid = ({ fields }: { fields: { label: string; value: string | undefined }[] }) => {
      if (fields.length === 0) return null;
      return (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {fields.map((field, idx) => (
            <div key={idx} className="flex flex-col">
              <span className="text-slate-500 text-xs">{field.label}</span>
              <span className="text-slate-900 text-sm font-medium">{field.value}</span>
            </div>
          ))}
        </div>
      );
    };

    return (
      <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <h4 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2 pb-3 border-b border-slate-200">
          <Eye className="w-4 h-4" />
          {title}
        </h4>

        <div className="space-y-0">
          {/* HO Policy Form Structure Section (new) */}
          {formIdentificationFields.length > 0 && (
            <CollapsibleSection title="Form Identification" defaultOpen={true}>
              <FieldGrid fields={formIdentificationFields} />
            </CollapsibleSection>
          )}

          {sectionHeadings.length > 0 && (
            <CollapsibleSection title="Policy Structure" count={sectionHeadings.length} defaultOpen={true}>
              <div className="space-y-1">
                {sectionHeadings.map((heading, idx) => (
                  <div key={idx} className="text-sm bg-white rounded px-2 py-1">
                    <span className="text-slate-700">{heading}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {definitionOfACV && (
            <CollapsibleSection title="Definition of ACV" defaultOpen={true}>
              <p className="text-sm text-slate-700 bg-white rounded p-2">{definitionOfACV}</p>
            </CollapsibleSection>
          )}

          {provisionFields.length > 0 && (
            <CollapsibleSection title="Default Policy Provisions" defaultOpen={true}>
              <div className="space-y-3">
                {provisionFields.map((field, idx) => (
                  <div key={idx} className="bg-white rounded p-2">
                    <span className="text-slate-500 text-xs block mb-1">{field.label}</span>
                    <p className="text-slate-700 text-sm">{field.value}</p>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {claimFields.length > 0 && (
            <CollapsibleSection title="Claim Information" defaultOpen={true}>
              <FieldGrid fields={claimFields} />
            </CollapsibleSection>
          )}

          {policyholderFields.length > 0 && (
            <CollapsibleSection title="Policyholder" defaultOpen={true}>
              <FieldGrid fields={policyholderFields} />
            </CollapsibleSection>
          )}

          {policyFields.length > 0 && (
            <CollapsibleSection title="Policy Details" defaultOpen={true}>
              <FieldGrid fields={policyFields} />
            </CollapsibleSection>
          )}

          {propertyFields.length > 0 && (
            <CollapsibleSection title="Property" defaultOpen={true}>
              <FieldGrid fields={propertyFields} />
            </CollapsibleSection>
          )}

          {deductibleFields.length > 0 && (
            <CollapsibleSection title="Deductibles" defaultOpen={true}>
              <FieldGrid fields={deductibleFields} />
            </CollapsibleSection>
          )}

          {coverageFields.length > 0 && (
            <CollapsibleSection title="Coverage Limits" defaultOpen={true}>
              <FieldGrid fields={coverageFields} />
            </CollapsibleSection>
          )}
          
          {coverages.length > 0 && (
            <CollapsibleSection title="Coverages (Detailed)" count={coverages.length} defaultOpen={false}>
              <div className="space-y-1">
                {coverages.map((cov, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm bg-white rounded px-2 py-1">
                    <span className="text-slate-700">{cov.name || `Coverage ${cov.code}`}</span>
                    <div className="flex gap-2 items-center">
                      {cov.limit && <span className="font-medium text-slate-900">{cov.limit}</span>}
                      {cov.percentage && <Badge variant="secondary" className="text-xs">{cov.percentage}</Badge>}
                      {cov.valuationMethod && <Badge variant="outline" className="text-xs">{cov.valuationMethod}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {scheduledStructures.length > 0 && (
            <CollapsibleSection title="Scheduled Structures" count={scheduledStructures.length} defaultOpen={false}>
              <div className="space-y-1">
                {scheduledStructures.map((struct, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm bg-white rounded px-2 py-1">
                    <span className="text-slate-700">{struct.description}</span>
                    <span className="font-medium text-slate-900">{struct.value}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {additionalCoverages.length > 0 && (
            <CollapsibleSection title="Additional Coverages" count={additionalCoverages.length} defaultOpen={false}>
              <div className="space-y-1">
                {additionalCoverages.map((cov, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm bg-white rounded px-2 py-1">
                    <span className="text-slate-700">{cov.name}</span>
                    <div className="flex gap-2">
                      {cov.limit && <span className="font-medium text-slate-900">{cov.limit}</span>}
                      {cov.deductible && <Badge variant="secondary" className="text-xs">Ded: {cov.deductible}</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {thirdPartyFields.length > 0 && (
            <CollapsibleSection title="Third Parties" defaultOpen={false}>
              <FieldGrid fields={thirdPartyFields} />
            </CollapsibleSection>
          )}

          {(endorsements.length > 0 || endorsementDetails.length > 0) && (
            <CollapsibleSection 
              title="Endorsements" 
              count={endorsementDetails.length || endorsements.length} 
              defaultOpen={false}
            >
              {endorsementDetails.length > 0 ? (
                <div className="space-y-1">
                  {endorsementDetails.map((e, idx) => (
                    <div key={idx} className="text-xs bg-white rounded px-2 py-1">
                      <span className="font-medium text-slate-900">{e.formNumber}</span>
                      <span className="text-slate-600 ml-2">{e.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {endorsements.map((e, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">{e}</Badge>
                  ))}
                </div>
              )}
            </CollapsibleSection>
          )}

          {data?.lossDescription && (
            <CollapsibleSection title="Loss Description" defaultOpen={true}>
              <p className="text-sm text-slate-700 bg-white rounded p-2">{data.lossDescription}</p>
            </CollapsibleSection>
          )}

          {data?.fullText && (
            <FullTextViewer fullText={data.fullText} pageTexts={data.pageTexts} />
          )}
          
          {documentId && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <CollapsibleSection title="Document Pages" defaultOpen={true} icon={ImageIcon}>
                <DocumentPageViewer documentId={documentId} documentName={documentName} />
              </CollapsibleSection>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Collapsible full text viewer component
  const FullTextViewer = ({ fullText, pageTexts }: { fullText: string; pageTexts?: string[] }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    return (
      <div className="mb-4 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between text-xs font-semibold text-primary uppercase tracking-wide mb-2 hover:text-primary/80 transition-colors"
          data-testid="button-toggle-full-text"
        >
          <span className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Full Document Text
            {pageTexts && pageTexts.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {pageTexts.length} {pageTexts.length === 1 ? 'page' : 'pages'}
              </Badge>
            )}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
        
        {isExpanded && (
          <div className="bg-white rounded p-3 border border-slate-200" data-testid="full-text-content">
            <ScrollArea className="max-h-96">
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                {fullText}
              </pre>
            </ScrollArea>
          </div>
        )}
      </div>
    );
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-6 md:p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-slate-900">New Claim</h1>
          <p className="text-slate-500 mt-1">Upload documents step-by-step to create a new claim</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {steps.map((step, idx) => {
            const isActive = step.key === currentStep;
            const isCompleted = idx < currentStepIndex;
            const Icon = step.icon;

            return (
              <div key={step.key} className="flex items-center">
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : isCompleted
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    isActive ? 'bg-white/20' : isCompleted ? 'bg-green-200' : 'bg-slate-200'
                  }`}>
                    {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                  </div>
                  <span className="font-medium text-sm whitespace-nowrap">{step.label}</span>
                </div>
                {idx < steps.length - 1 && (
                  <div className={`w-8 h-0.5 mx-1 ${idx < currentStepIndex ? 'bg-green-300' : 'bg-slate-200'}`} />
                )}
              </div>
            );
          })}
          
          {/* Draft saving indicator */}
          {(isSavingDraft || draftClaim) && (
            <div className="ml-auto flex items-center gap-2 text-sm">
              {isSavingDraft ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-slate-500">Saving draft...</span>
                </>
              ) : draftClaim ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="text-green-600">Draft saved</span>
                </>
              ) : null}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: FNOL Upload */}
        {currentStep === 'fnol' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Step 1: Upload FNOL Report
              </CardTitle>
              <CardDescription>
                Upload the First Notice of Loss document. We'll extract claim details automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileDropZone
                title="FNOL Report"
                description="PDF or image of the First Notice of Loss"
                icon={FileText}
                accept=".pdf,image/*"
                onFileSelect={handleFnolSelect}
                uploadedDoc={fnolDoc}
                onRemove={() => setFnolDoc(null)}
              />

              {fnolDoc?.status === 'completed' && (
                <ExtractedDataPreview 
                  data={fnolDoc.extractedData} 
                  title="Extracted from FNOL"
                  documentId={fnolDoc.document?.id}
                  documentName={fnolDoc.document?.name || fnolDoc.file.name}
                />
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setLocation("/")}>
                Cancel
              </Button>
              <Button
                onClick={goToNextStep}
                disabled={!fnolDoc || fnolDoc.status !== 'completed'}
              >
                Continue to Policy
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 2: Policy Upload */}
        {currentStep === 'policy' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Step 2: Upload Homeowner Policy
              </CardTitle>
              <CardDescription>
                Upload the policy declarations page to extract coverage details.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileDropZone
                title="HO Policy Declarations"
                description="PDF or image of the policy declarations page"
                icon={Shield}
                accept=".pdf,image/*"
                onFileSelect={handlePolicySelect}
                uploadedDoc={policyDoc}
                onRemove={() => setPolicyDoc(null)}
              />

              {policyDoc?.status === 'completed' && (
                <ExtractedDataPreview 
                  data={policyDoc.extractedData} 
                  title="Extracted from Policy"
                  documentId={policyDoc.document?.id}
                  documentName={policyDoc.document?.name || policyDoc.file.name}
                />
              )}

              {!policyDoc && (
                <p className="text-sm text-slate-500 mt-4 text-center">
                  You can skip this step if you don't have the policy document.
                </p>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={goToPrevStep}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={goToNextStep}>
                  Skip
                </Button>
                <Button onClick={goToNextStep}>
                  Continue to Endorsements
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardFooter>
          </Card>
        )}

        {/* Step 3: Endorsements Upload */}
        {currentStep === 'endorsements' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FilePlus className="w-5 h-5" />
                Step 3: Upload Endorsements
              </CardTitle>
              <CardDescription>
                Upload one or more policy endorsement documents. You can keep adding until complete.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Upload area */}
              <div
                className="relative border-2 border-dashed rounded-lg p-6 transition-colors border-slate-200 hover:border-primary/50 bg-slate-50"
              >
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleEndorsementSelect}
                  disabled={isProcessing}
                />
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3 bg-slate-100 text-slate-500">
                    {isProcessing ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <Plus className="w-6 h-6" />
                    )}
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-1">
                    {isProcessing ? 'Processing...' : 'Add Endorsement'}
                  </h3>
                  <p className="text-sm text-slate-500">
                    Click or drop an endorsement PDF here
                  </p>
                </div>
              </div>

              {/* Uploaded endorsement documents with preview */}
              {endorsementDocs.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700">
                    Uploaded Endorsement Documents ({endorsementDocs.length})
                  </h4>
                  {endorsementDocs.map((doc, idx) => (
                    <div key={idx} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                      <div className="flex items-center gap-3 p-3">
                        <FileCheck className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span className="flex-1 truncate text-sm font-medium">{doc.file.name}</span>
                        {doc.status === 'uploading' && <Badge variant="secondary">Uploading...</Badge>}
                        {doc.status === 'processing' && <Badge variant="secondary">Processing...</Badge>}
                        {doc.status === 'completed' && <Badge className="bg-green-100 text-green-700">Processed</Badge>}
                        {doc.status === 'error' && <Badge variant="destructive">Error</Badge>}
                        <button
                          onClick={() => removeEndorsementDoc(idx)}
                          className="text-slate-400 hover:text-red-500 p-1"
                          disabled={doc.status === 'uploading' || doc.status === 'processing'}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {doc.status === 'completed' && doc.document?.id && (
                        <div className="px-3 pb-3">
                          <ExtractedDataPreview
                            data={doc.extractedData}
                            title={`Extracted from ${doc.file.name}`}
                            documentId={doc.document.id}
                            documentName={doc.file.name}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <Separator />

              {/* Endorsement records list */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-700">
                  Endorsement Records ({endorsementRecords.length})
                </h4>

                {endorsementRecords.length > 0 ? (
                  <ScrollArea className="max-h-48">
                    <div className="space-y-2">
                      {endorsementRecords.map((record, idx) => (
                        <div key={idx} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                          <div className="flex-1">
                            <div className="font-medium text-sm">{record.formNumber}</div>
                            <div className="text-xs text-slate-500">{record.documentTitle}</div>
                            {record.fileName && (
                              <div className="text-xs text-slate-400">Source: {record.fileName}</div>
                            )}
                          </div>
                          <button
                            onClick={() => removeEndorsementRecord(idx)}
                            className="text-slate-400 hover:text-red-500 p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">
                    No endorsements added yet. Upload documents above or add manually below.
                  </p>
                )}

                {/* Manual endorsement entry */}
                <div className="flex gap-2 pt-2">
                  <Input
                    placeholder="Form Number (e.g., HO 84 28)"
                    value={newEndorsementForm.formNumber}
                    onChange={(e) => setNewEndorsementForm(prev => ({ ...prev, formNumber: e.target.value }))}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Title (optional)"
                    value={newEndorsementForm.documentTitle}
                    onChange={(e) => setNewEndorsementForm(prev => ({ ...prev, documentTitle: e.target.value }))}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={addManualEndorsement}
                    disabled={!newEndorsementForm.formNumber.trim()}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={goToPrevStep}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button onClick={goToNextStep}>
                Continue to Review
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {/* Step 4: Review & Create */}
        {currentStep === 'review' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Step 4: Review & Finalize Claim
                {draftClaim && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    Draft Saved
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {draftClaim 
                  ? "Review and edit the information, then finalize the claim. Your progress is auto-saved."
                  : "Review and edit the extracted information before creating the claim."
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Documents summary */}
              <div className="p-4 bg-slate-50 rounded-lg">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Attached Documents</h4>
                <div className="flex flex-wrap gap-2">
                  {fnolDoc?.document && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      FNOL: {fnolDoc.file.name}
                    </Badge>
                  )}
                  {policyDoc?.document && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      Policy: {policyDoc.file.name}
                    </Badge>
                  )}
                  {endorsementDocs.filter(d => d.document).map((doc, idx) => (
                    <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                      <FilePlus className="w-3 h-3" />
                      {doc.file.name}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Claim Info */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-slate-700">Claim Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="claimId">Claim ID</Label>
                    <Input
                      id="claimId"
                      placeholder="Auto-generated if empty"
                      value={claimData.claimId || ''}
                      onChange={(e) => setClaimData({ ...claimData, claimId: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="policyholder">Policyholder</Label>
                    <Input
                      id="policyholder"
                      value={claimData.policyholder || ''}
                      onChange={(e) => setClaimData({ ...claimData, policyholder: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="propertyAddress">Property Address</Label>
                  <Input
                    id="propertyAddress"
                    placeholder="123 Main St, City, ST 12345"
                    value={claimData.riskLocation || ''}
                    onChange={(e) => setClaimData({ ...claimData, riskLocation: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateOfLoss">Date of Loss</Label>
                    <Input
                      id="dateOfLoss"
                      placeholder="MM/DD/YYYY@HH:MM AM/PM"
                      value={claimData.dateOfLoss || ''}
                      onChange={(e) => setClaimData({ ...claimData, dateOfLoss: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cause of Loss</Label>
                    <Select
                      value={claimData.causeOfLoss || 'Hail'}
                      onValueChange={(v) => setClaimData({ ...claimData, causeOfLoss: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["Hail", "Wind", "Fire", "Water", "Impact", "Other"].map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lossDescription">Loss Description</Label>
                  <Textarea
                    id="lossDescription"
                    className="min-h-[80px]"
                    placeholder="Describe the damage..."
                    value={claimData.lossDescription || ''}
                    onChange={(e) => setClaimData({ ...claimData, lossDescription: e.target.value })}
                  />
                </div>
              </div>

              <Separator />

              {/* Policy Details */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-slate-700">Policy Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="policyNumber">Policy Number</Label>
                    <Input
                      id="policyNumber"
                      value={claimData.policyNumber || ''}
                      onChange={(e) => setClaimData({ ...claimData, policyNumber: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      placeholder="CO"
                      maxLength={2}
                      value={claimData.state || ''}
                      onChange={(e) => setClaimData({ ...claimData, state: e.target.value.toUpperCase() })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dwellingLimit">Dwelling Limit</Label>
                    <Input
                      id="dwellingLimit"
                      placeholder="$XXX,XXX"
                      value={claimData.dwellingLimit || ''}
                      onChange={(e) => setClaimData({ ...claimData, dwellingLimit: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="windHailDeductible">Wind/Hail Deductible</Label>
                    <Input
                      id="windHailDeductible"
                      placeholder="$X,XXX X%"
                      value={claimData.windHailDeductible || ''}
                      onChange={(e) => setClaimData({ ...claimData, windHailDeductible: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="yearRoofInstall">Roof Install Date</Label>
                    <Input
                      id="yearRoofInstall"
                      placeholder="MM-DD-YYYY"
                      value={claimData.yearRoofInstall || ''}
                      onChange={(e) => setClaimData({ ...claimData, yearRoofInstall: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Endorsements */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-slate-700">
                  Endorsements ({endorsementRecords.length})
                </h4>
                {endorsementRecords.length > 0 ? (
                  <div className="space-y-2">
                    {endorsementRecords.map((record, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                        <FilePlus className="w-4 h-4 text-slate-500" />
                        <div className="flex-1">
                          <span className="font-medium text-sm">{record.formNumber}</span>
                          {record.documentTitle && (
                            <span className="text-slate-500 text-sm"> - {record.documentTitle}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No endorsements added.</p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentStep('endorsements')}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add More Endorsements
                </Button>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={goToPrevStep}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleCreateClaim} disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {draftClaim ? 'Finalizing...' : 'Creating...'}
                  </>
                ) : (
                  <>
                    {draftClaim ? 'Finalize Claim' : 'Create Claim'}
                    <CheckCircle2 className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </Layout>
  );
}
