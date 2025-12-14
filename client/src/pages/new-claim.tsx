import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
  ArrowRight
} from "lucide-react";
import { uploadDocument, processDocument, createClaim, type Document } from "@/lib/api";

interface UploadedFile {
  file: File;
  type: 'fnol' | 'policy' | 'endorsement';
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  progress: number;
  document?: Document;
  error?: string;
}

// Updated to match new FNOL JSON format
interface ExtractedData {
  claimId?: string;
  policyholder?: string;
  dateOfLoss?: string; // Format: MM/DD/YYYY@HH:MM AM/PM
  riskLocation?: string;
  causeOfLoss?: string;
  lossDescription?: string;
  policyNumber?: string;
  state?: string;
  yearRoofInstall?: string;
  windHailDeductible?: string;
  dwellingLimit?: string;
  endorsementsListed?: string[];
}

export default function NewClaim() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<'upload' | 'review' | 'creating'>('upload');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [extractedData, setExtractedData] = useState<ExtractedData>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent, type: 'fnol' | 'policy' | 'endorsement') => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      f => f.type === 'application/pdf' || f.type.startsWith('image/')
    );

    const newFiles: UploadedFile[] = droppedFiles.map(file => ({
      file,
      type,
      status: 'pending',
      progress: 0
    }));

    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  // Handle file input
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'fnol' | 'policy' | 'endorsement') => {
    if (!e.target.files) return;

    const selectedFiles = Array.from(e.target.files);
    const newFiles: UploadedFile[] = selectedFiles.map(file => ({
      file,
      type,
      status: 'pending',
      progress: 0
    }));

    setFiles(prev => [...prev, ...newFiles]);
    e.target.value = ''; // Reset input
  };

  // Remove file
  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Upload all files and process with Vision AI
  const handleUploadAndProcess = async () => {
    if (files.length === 0) {
      setError('Please add at least one document');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Upload each file
      const uploadedDocs: Document[] = [];

      for (let i = 0; i < files.length; i++) {
        const uploadFile = files[i];

        // Update status to uploading
        setFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'uploading', progress: 30 } : f
        ));

        try {
          const doc = await uploadDocument(uploadFile.file, {
            type: uploadFile.type,
            name: uploadFile.file.name,
          });

          // Update progress - now processing with AI
          setFiles(prev => prev.map((f, idx) =>
            idx === i ? { ...f, status: 'uploading', progress: 60, document: doc } : f
          ));

          // Process document with Vision AI
          try {
            const processResult = await processDocument(doc.id);
            doc.extractedData = processResult.extractedData;
            doc.processingStatus = processResult.processingStatus;
          } catch (processErr) {
            console.warn('AI extraction failed for', doc.name, processErr);
          }

          uploadedDocs.push(doc);

          // Update status to uploaded
          setFiles(prev => prev.map((f, idx) =>
            idx === i ? { ...f, status: 'uploaded', progress: 100, document: doc } : f
          ));
        } catch (err) {
          setFiles(prev => prev.map((f, idx) =>
            idx === i ? { ...f, status: 'error', error: (err as Error).message } : f
          ));
        }
      }

      // Merge extracted data from all documents - using new FNOL format
      const mergedData: ExtractedData = {
        claimId: '',
        policyholder: '',
        dateOfLoss: '',
        riskLocation: '',
        causeOfLoss: 'Hail',
        lossDescription: '',
        policyNumber: '',
        state: '',
        yearRoofInstall: '',
        windHailDeductible: '',
        dwellingLimit: '',
        endorsementsListed: [],
      };

      // Populate from extracted data (prefer non-empty values)
      for (const doc of uploadedDocs) {
        if (doc.extractedData) {
          const ed = doc.extractedData;
          // Map new field names
          if (ed.claimId && !mergedData.claimId) mergedData.claimId = ed.claimId;
          if (ed.policyholder && !mergedData.policyholder) mergedData.policyholder = ed.policyholder;
          if (ed.dateOfLoss && !mergedData.dateOfLoss) mergedData.dateOfLoss = ed.dateOfLoss;
          if (ed.riskLocation && !mergedData.riskLocation) mergedData.riskLocation = ed.riskLocation;
          if (ed.causeOfLoss && !mergedData.causeOfLoss) mergedData.causeOfLoss = ed.causeOfLoss;
          if (ed.lossDescription && !mergedData.lossDescription) mergedData.lossDescription = ed.lossDescription;

          // Policy details - check both flattened and nested
          const pd = ed.policyDetails || {};
          if ((ed.policyNumber || pd.policyNumber) && !mergedData.policyNumber)
            mergedData.policyNumber = ed.policyNumber || pd.policyNumber;
          if ((ed.state || pd.state) && !mergedData.state)
            mergedData.state = ed.state || pd.state;
          if ((ed.yearRoofInstall || pd.yearRoofInstall) && !mergedData.yearRoofInstall)
            mergedData.yearRoofInstall = ed.yearRoofInstall || pd.yearRoofInstall;
          if ((ed.windHailDeductible || pd.windHailDeductible) && !mergedData.windHailDeductible)
            mergedData.windHailDeductible = ed.windHailDeductible || pd.windHailDeductible;
          if ((ed.dwellingLimit || pd.dwellingLimit) && !mergedData.dwellingLimit)
            mergedData.dwellingLimit = ed.dwellingLimit || pd.dwellingLimit;

          // Merge endorsements arrays
          const endorsements = ed.endorsementsListed || pd.endorsementsListed || [];
          if (endorsements.length > 0) {
            mergedData.endorsementsListed = [...new Set([...(mergedData.endorsementsListed || []), ...endorsements])];
          }
        }
      }

      setExtractedData(mergedData);
      setStep('review');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Create claim with extracted data
  const handleCreateClaim = async () => {
    setStep('creating');
    setError(null);

    try {
      const claim = await createClaim({
        claimId: extractedData.claimId,
        policyholder: extractedData.policyholder,
        dateOfLoss: extractedData.dateOfLoss,
        riskLocation: extractedData.riskLocation,
        causeOfLoss: extractedData.causeOfLoss,
        lossDescription: extractedData.lossDescription,
        policyNumber: extractedData.policyNumber,
        state: extractedData.state,
        yearRoofInstall: extractedData.yearRoofInstall,
        windHailDeductible: extractedData.windHailDeductible,
        dwellingLimit: extractedData.dwellingLimit,
        endorsementsListed: extractedData.endorsementsListed,
        status: 'fnol',
      });

      // Navigate to the new claim
      setLocation(`/claim/${claim.id}`);
    } catch (err) {
      setError((err as Error).message);
      setStep('review');
    }
  };

  const FileTypeCard = ({
    type,
    title,
    description,
    icon: Icon,
    required
  }: {
    type: 'fnol' | 'policy' | 'endorsement';
    title: string;
    description: string;
    icon: React.ElementType;
    required?: boolean;
  }) => {
    const typeFiles = files.filter(f => f.type === type);
    const hasFiles = typeFiles.length > 0;

    return (
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${
          hasFiles ? 'border-green-300 bg-green-50' : 'border-slate-200 hover:border-primary/50'
        }`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDrop(e, type)}
      >
        <input
          type="file"
          accept=".pdf,image/*"
          multiple
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={(e) => handleFileSelect(e, type)}
        />

        <div className="flex flex-col items-center text-center">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
            hasFiles ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'
          }`}>
            {hasFiles ? <CheckCircle2 className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
          </div>

          <h3 className="font-semibold text-slate-900 mb-1">
            {title}
            {required && <span className="text-red-500 ml-1">*</span>}
          </h3>
          <p className="text-sm text-slate-500 mb-3">{description}</p>

          {typeFiles.length > 0 ? (
            <div className="w-full space-y-2">
              {typeFiles.map((f, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-white rounded p-2 text-sm">
                  <FileCheck className="w-4 h-4 text-green-500" />
                  <span className="flex-1 truncate text-left">{f.file.name}</span>
                  {f.status === 'uploading' && <Loader2 className="w-4 h-4 animate-spin" />}
                  {f.status === 'uploaded' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {f.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(files.indexOf(f)); }}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Drop files here or click to browse
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-6 md:p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-slate-900">New Claim</h1>
          <p className="text-slate-500 mt-1">Upload documents to create a new claim</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-4 mb-8">
          <div className={`flex items-center gap-2 ${step === 'upload' ? 'text-primary' : 'text-green-600'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === 'upload' ? 'bg-primary text-white' : 'bg-green-100 text-green-600'
            }`}>
              {step !== 'upload' ? <CheckCircle2 className="w-5 h-5" /> : '1'}
            </div>
            <span className="font-medium">Upload Documents</span>
          </div>
          <div className="flex-1 h-0.5 bg-slate-200" />
          <div className={`flex items-center gap-2 ${step === 'review' ? 'text-primary' : step === 'creating' ? 'text-green-600' : 'text-slate-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === 'review' ? 'bg-primary text-white' : step === 'creating' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
            }`}>
              {step === 'creating' ? <CheckCircle2 className="w-5 h-5" /> : '2'}
            </div>
            <span className="font-medium">Review & Confirm</span>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload Claim Documents
              </CardTitle>
              <CardDescription>
                Upload your FNOL report, policy declarations, and any endorsements.
                We'll extract the key information to create your claim.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FileTypeCard
                  type="fnol"
                  title="FNOL Report"
                  description="First Notice of Loss document"
                  icon={FileText}
                  required
                />
                <FileTypeCard
                  type="policy"
                  title="HO Policy"
                  description="Homeowners policy declarations"
                  icon={Shield}
                />
                <FileTypeCard
                  type="endorsement"
                  title="Endorsements"
                  description="Policy endorsements & riders"
                  icon={FilePlus}
                />
              </div>

              {files.length > 0 && (
                <div className="mt-6 p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">
                      {files.length} document{files.length !== 1 ? 's' : ''} ready
                    </span>
                    <Badge variant="secondary">
                      {files.filter(f => f.type === 'fnol').length} FNOL, {' '}
                      {files.filter(f => f.type === 'policy').length} Policy, {' '}
                      {files.filter(f => f.type === 'endorsement').length} Endorsement
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setLocation("/")}>
                Cancel
              </Button>
              <Button
                onClick={handleUploadAndProcess}
                disabled={files.length === 0 || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === 'review' && (
          <Card>
            <CardHeader>
              <CardTitle>Review Claim Information</CardTitle>
              <CardDescription>
                Review and edit the extracted information before creating the claim.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Tabs defaultValue="claim" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="claim">Claim Info</TabsTrigger>
                  <TabsTrigger value="policy">Policy Details</TabsTrigger>
                  <TabsTrigger value="endorsements">Endorsements</TabsTrigger>
                </TabsList>

                <TabsContent value="claim" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="claimId">Claim ID</Label>
                      <Input
                        id="claimId"
                        placeholder="01-XXX-XXXXXX"
                        value={extractedData.claimId || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, claimId: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="policyholder">Policyholder</Label>
                      <Input
                        id="policyholder"
                        value={extractedData.policyholder || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, policyholder: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="riskLocation">Risk Location (Full Address)</Label>
                    <Input
                      id="riskLocation"
                      placeholder="123 Main St, City, ST 12345"
                      value={extractedData.riskLocation || ''}
                      onChange={(e) => setExtractedData({ ...extractedData, riskLocation: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dateOfLoss">Date of Loss</Label>
                      <Input
                        id="dateOfLoss"
                        placeholder="MM/DD/YYYY@HH:MM AM/PM"
                        value={extractedData.dateOfLoss || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, dateOfLoss: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Cause of Loss</Label>
                      <Select
                        value={extractedData.causeOfLoss || 'Hail'}
                        onValueChange={(v) => setExtractedData({ ...extractedData, causeOfLoss: v })}
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
                      className="min-h-[100px]"
                      placeholder="Describe the damage..."
                      value={extractedData.lossDescription || ''}
                      onChange={(e) => setExtractedData({ ...extractedData, lossDescription: e.target.value })}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="policy" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="policyNumber">Policy Number</Label>
                      <Input
                        id="policyNumber"
                        value={extractedData.policyNumber || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, policyNumber: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">State</Label>
                      <Input
                        id="state"
                        placeholder="CO"
                        maxLength={2}
                        value={extractedData.state || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, state: e.target.value.toUpperCase() })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dwellingLimit">Dwelling Limit</Label>
                      <Input
                        id="dwellingLimit"
                        placeholder="$XXX,XXX"
                        value={extractedData.dwellingLimit || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, dwellingLimit: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="windHailDeductible">Wind/Hail Deductible</Label>
                      <Input
                        id="windHailDeductible"
                        placeholder="$X,XXX X%"
                        value={extractedData.windHailDeductible || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, windHailDeductible: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="yearRoofInstall">Year Roof Installed</Label>
                    <Input
                      id="yearRoofInstall"
                      placeholder="MM-DD-YYYY"
                      value={extractedData.yearRoofInstall || ''}
                      onChange={(e) => setExtractedData({ ...extractedData, yearRoofInstall: e.target.value })}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="endorsements" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Endorsements Listed</Label>
                    <div className="border rounded-lg p-4 min-h-[150px]">
                      {(extractedData.endorsementsListed || []).length > 0 ? (
                        <div className="space-y-2">
                          {extractedData.endorsementsListed?.map((endorsement, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded p-2">
                              <FileCheck className="w-4 h-4 text-green-500" />
                              <span className="flex-1 text-sm">{endorsement}</span>
                              <button
                                onClick={() => {
                                  const newList = [...(extractedData.endorsementsListed || [])];
                                  newList.splice(idx, 1);
                                  setExtractedData({ ...extractedData, endorsementsListed: newList });
                                }}
                                className="text-slate-400 hover:text-red-500"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 text-center py-8">
                          No endorsements extracted. Add them manually below.
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Input
                        id="newEndorsement"
                        placeholder="HO 84 28 - Hidden Water Coverage"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const input = e.target as HTMLInputElement;
                            if (input.value.trim()) {
                              setExtractedData({
                                ...extractedData,
                                endorsementsListed: [...(extractedData.endorsementsListed || []), input.value.trim()]
                              });
                              input.value = '';
                            }
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        onClick={() => {
                          const input = document.getElementById('newEndorsement') as HTMLInputElement;
                          if (input?.value.trim()) {
                            setExtractedData({
                              ...extractedData,
                              endorsementsListed: [...(extractedData.endorsementsListed || []), input.value.trim()]
                            });
                            input.value = '';
                          }
                        }}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Uploaded Documents Summary */}
              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium text-slate-700 mb-2">Attached Documents</h4>
                <div className="flex flex-wrap gap-2">
                  {files.filter(f => f.status === 'uploaded').map((f, idx) => (
                    <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                      <FileCheck className="w-3 h-3" />
                      {f.file.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button onClick={handleCreateClaim}>
                Create Claim
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === 'creating' && (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center text-center">
                <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Creating Your Claim</h3>
                <p className="text-slate-500">Please wait while we set up your claim...</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
