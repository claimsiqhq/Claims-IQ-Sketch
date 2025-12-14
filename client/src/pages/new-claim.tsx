import { useState, useCallback } from "react";
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
  Eye
} from "lucide-react";
import { uploadDocument, processDocument, createClaim, type Document } from "@/lib/api";

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

// Extracted data from documents
interface ExtractedData {
  claimId?: string;
  policyholder?: string;
  dateOfLoss?: string;
  riskLocation?: string;
  causeOfLoss?: string;
  lossDescription?: string;
  policyNumber?: string;
  state?: string;
  yearRoofInstall?: string;
  windHailDeductible?: string;
  dwellingLimit?: string;
  endorsementsListed?: string[];
  policyDetails?: {
    policyNumber?: string;
    state?: string;
    yearRoofInstall?: string;
    windHailDeductible?: string;
    dwellingLimit?: string;
    endorsementsListed?: string[];
  };
}

// Endorsement record for database
interface EndorsementRecord {
  formNumber: string;
  documentTitle: string;
  description?: string;
  documentId?: string;
  fileName?: string;
}

export default function NewClaim() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState<WizardStep>('fnol');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      if (extracted.claimId && !merged.claimId) merged.claimId = extracted.claimId;
      if (extracted.policyholder && !merged.policyholder) merged.policyholder = extracted.policyholder;
      if (extracted.dateOfLoss && !merged.dateOfLoss) merged.dateOfLoss = extracted.dateOfLoss;
      if (extracted.riskLocation && !merged.riskLocation) merged.riskLocation = extracted.riskLocation;
      if (extracted.causeOfLoss && extracted.causeOfLoss !== 'Hail') merged.causeOfLoss = extracted.causeOfLoss;
      if (extracted.lossDescription && !merged.lossDescription) merged.lossDescription = extracted.lossDescription;

      // Policy details
      if ((extracted.policyNumber || pd.policyNumber) && !merged.policyNumber)
        merged.policyNumber = extracted.policyNumber || pd.policyNumber;
      if ((extracted.state || pd.state) && !merged.state)
        merged.state = extracted.state || pd.state;
      if ((extracted.yearRoofInstall || pd.yearRoofInstall) && !merged.yearRoofInstall)
        merged.yearRoofInstall = extracted.yearRoofInstall || pd.yearRoofInstall;
      if ((extracted.windHailDeductible || pd.windHailDeductible) && !merged.windHailDeductible)
        merged.windHailDeductible = extracted.windHailDeductible || pd.windHailDeductible;
      if ((extracted.dwellingLimit || pd.dwellingLimit) && !merged.dwellingLimit)
        merged.dwellingLimit = extracted.dwellingLimit || pd.dwellingLimit;

      // Merge endorsements
      const newEndorsements = extracted.endorsementsListed || pd.endorsementsListed || [];
      if (newEndorsements.length > 0) {
        merged.endorsementsListed = [...new Set([...(merged.endorsementsListed || []), ...newEndorsements])];
      }

      return merged;
    });
  };

  // Handle FNOL file selection
  const handleFnolSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    setError(null);
    setIsProcessing(true);
    setFnolDoc({ file, type: 'fnol', status: 'uploading' });

    try {
      const result = await uploadAndProcessDocument(file, 'fnol');
      setFnolDoc(result);
      mergeExtractedData(result.extractedData);
    } catch (err) {
      setError((err as Error).message);
      setFnolDoc(prev => prev ? { ...prev, status: 'error', error: (err as Error).message } : null);
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  // Handle Policy file selection
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
        // Parse endorsement strings into records
        endorsementsList.forEach(endorsementStr => {
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

  // Create the claim
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

      // Create the claim
      const claim = await createClaim({
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
        },
      });

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

      // Navigate to the new claim
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

  // Extracted data preview component
  const ExtractedDataPreview = ({ data, title }: { data: ExtractedData | undefined; title: string }) => {
    if (!data) return null;

    const fields = [
      { label: 'Policyholder', value: data.policyholder },
      { label: 'Risk Location', value: data.riskLocation },
      { label: 'Date of Loss', value: data.dateOfLoss },
      { label: 'Cause of Loss', value: data.causeOfLoss },
      { label: 'Policy Number', value: data.policyNumber || data.policyDetails?.policyNumber },
      { label: 'State', value: data.state || data.policyDetails?.state },
      { label: 'Dwelling Limit', value: data.dwellingLimit || data.policyDetails?.dwellingLimit },
      { label: 'Wind/Hail Deductible', value: data.windHailDeductible || data.policyDetails?.windHailDeductible },
    ].filter(f => f.value);

    const endorsements = data.endorsementsListed || data.policyDetails?.endorsementsListed || [];

    if (fields.length === 0 && endorsements.length === 0) {
      return (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700">No data could be extracted from this document.</p>
        </div>
      );
    }

    return (
      <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Eye className="w-4 h-4" />
          {title}
        </h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {fields.map((field, idx) => (
            <div key={idx} className="flex flex-col">
              <span className="text-slate-500 text-xs">{field.label}</span>
              <span className="text-slate-900 font-medium truncate">{field.value}</span>
            </div>
          ))}
        </div>
        {endorsements.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <span className="text-slate-500 text-xs">Endorsements Found</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {endorsements.map((e, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">{e}</Badge>
              ))}
            </div>
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

              {fnolDoc?.status === 'completed' && fnolDoc.extractedData && (
                <ExtractedDataPreview data={fnolDoc.extractedData} title="Extracted from FNOL" />
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

              {policyDoc?.status === 'completed' && policyDoc.extractedData && (
                <ExtractedDataPreview data={policyDoc.extractedData} title="Extracted from Policy" />
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

              {/* Uploaded endorsement documents */}
              {endorsementDocs.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700">
                    Uploaded Endorsement Documents ({endorsementDocs.length})
                  </h4>
                  {endorsementDocs.map((doc, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-white rounded-lg p-3 border border-slate-200">
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
                Step 4: Review & Create Claim
              </CardTitle>
              <CardDescription>
                Review and edit the extracted information before creating the claim.
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
                  <Label htmlFor="riskLocation">Risk Location</Label>
                  <Input
                    id="riskLocation"
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
                    Creating...
                  </>
                ) : (
                  <>
                    Create Claim
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
