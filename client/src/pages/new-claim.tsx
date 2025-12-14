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
import { Progress } from "@/components/ui/progress";
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
import { uploadDocument, createClaim, type Document } from "@/lib/api";

interface UploadedFile {
  file: File;
  type: 'fnol' | 'policy' | 'endorsement';
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  progress: number;
  document?: Document;
  error?: string;
}

interface ExtractedData {
  insuredName?: string;
  policyNumber?: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyZip?: string;
  dateOfLoss?: string;
  lossType?: string;
  lossDescription?: string;
  coverageA?: string;
  coverageB?: string;
  coverageC?: string;
  coverageD?: string;
  deductible?: string;
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

  // Upload all files and process
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
          idx === i ? { ...f, status: 'uploading', progress: 50 } : f
        ));

        try {
          const doc = await uploadDocument(uploadFile.file, {
            type: uploadFile.type,
            name: uploadFile.file.name,
          });

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

      // Extract data from documents (mock for now - will be AI in future)
      const fnolDoc = uploadedDocs.find(d => d.type === 'fnol');
      const policyDoc = uploadedDocs.find(d => d.type === 'policy');

      // Set some default extracted data
      setExtractedData({
        insuredName: '',
        policyNumber: '',
        propertyAddress: '',
        propertyCity: '',
        propertyState: '',
        propertyZip: '',
        dateOfLoss: new Date().toISOString().split('T')[0],
        lossType: 'Water',
        lossDescription: '',
        coverageA: '',
        coverageB: '',
        coverageC: '',
        coverageD: '',
        deductible: '',
      });

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
        insuredName: extractedData.insuredName,
        policyNumber: extractedData.policyNumber,
        propertyAddress: extractedData.propertyAddress,
        propertyCity: extractedData.propertyCity,
        propertyState: extractedData.propertyState,
        propertyZip: extractedData.propertyZip,
        dateOfLoss: extractedData.dateOfLoss,
        lossType: extractedData.lossType,
        lossDescription: extractedData.lossDescription,
        coverageA: extractedData.coverageA,
        coverageB: extractedData.coverageB,
        coverageC: extractedData.coverageC,
        coverageD: extractedData.coverageD,
        deductible: extractedData.deductible,
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
              <Tabs defaultValue="insured" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="insured">Insured Info</TabsTrigger>
                  <TabsTrigger value="loss">Loss Details</TabsTrigger>
                  <TabsTrigger value="coverage">Coverage</TabsTrigger>
                </TabsList>

                <TabsContent value="insured" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="insuredName">Insured Name</Label>
                      <Input
                        id="insuredName"
                        value={extractedData.insuredName || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, insuredName: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="policyNumber">Policy Number</Label>
                      <Input
                        id="policyNumber"
                        value={extractedData.policyNumber || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, policyNumber: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="propertyAddress">Property Address</Label>
                    <Input
                      id="propertyAddress"
                      value={extractedData.propertyAddress || ''}
                      onChange={(e) => setExtractedData({ ...extractedData, propertyAddress: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="propertyCity">City</Label>
                      <Input
                        id="propertyCity"
                        value={extractedData.propertyCity || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, propertyCity: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="propertyState">State</Label>
                      <Input
                        id="propertyState"
                        value={extractedData.propertyState || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, propertyState: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="propertyZip">ZIP Code</Label>
                      <Input
                        id="propertyZip"
                        value={extractedData.propertyZip || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, propertyZip: e.target.value })}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="loss" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="dateOfLoss">Date of Loss</Label>
                      <Input
                        id="dateOfLoss"
                        type="date"
                        value={extractedData.dateOfLoss || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, dateOfLoss: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Loss Type</Label>
                      <Select
                        value={extractedData.lossType || 'Water'}
                        onValueChange={(v) => setExtractedData({ ...extractedData, lossType: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["Water", "Fire", "Wind/Hail", "Impact", "Other"].map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lossDescription">Description of Loss</Label>
                    <Textarea
                      id="lossDescription"
                      className="min-h-[100px]"
                      value={extractedData.lossDescription || ''}
                      onChange={(e) => setExtractedData({ ...extractedData, lossDescription: e.target.value })}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="coverage" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="coverageA">Coverage A (Dwelling)</Label>
                      <Input
                        id="coverageA"
                        type="number"
                        placeholder="$0.00"
                        value={extractedData.coverageA || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, coverageA: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coverageB">Coverage B (Other Structures)</Label>
                      <Input
                        id="coverageB"
                        type="number"
                        placeholder="$0.00"
                        value={extractedData.coverageB || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, coverageB: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coverageC">Coverage C (Personal Property)</Label>
                      <Input
                        id="coverageC"
                        type="number"
                        placeholder="$0.00"
                        value={extractedData.coverageC || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, coverageC: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="coverageD">Coverage D (Loss of Use)</Label>
                      <Input
                        id="coverageD"
                        type="number"
                        placeholder="$0.00"
                        value={extractedData.coverageD || ''}
                        onChange={(e) => setExtractedData({ ...extractedData, coverageD: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deductible">Deductible</Label>
                    <Input
                      id="deductible"
                      type="number"
                      placeholder="$0.00"
                      value={extractedData.deductible || ''}
                      onChange={(e) => setExtractedData({ ...extractedData, deductible: e.target.value })}
                    />
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
