import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Shield,
  FilePlus,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Loader2,
  X,
  Image as ImageIcon
} from "lucide-react";

interface Document {
  id: string;
  name: string;
  type: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  processingStatus?: string;
}

interface DocumentViewerProps {
  documents: Document[];
  claimId: string;
}

interface ImageData {
  pages: number;
  images: string[];
}

export default function DocumentViewer({ documents, claimId }: DocumentViewerProps) {
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [loading, setLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState("fnol");

  // Group documents by type
  const fnolDocs = documents.filter(d => d.type === 'fnol');
  const policyDocs = documents.filter(d => d.type === 'policy');
  const endorsementDocs = documents.filter(d => d.type === 'endorsement');

  // Load document images when selected
  useEffect(() => {
    if (!selectedDoc) {
      setImageData(null);
      return;
    }

    const loadImages = async () => {
      setLoading(true);
      setCurrentPage(1);
      try {
        const response = await fetch(`/api/documents/${selectedDoc.id}/images`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setImageData(data);
        }
      } catch (error) {
        console.error('Failed to load document images:', error);
      } finally {
        setLoading(false);
      }
    };

    loadImages();
  }, [selectedDoc]);

  // Auto-select first document of active tab
  useEffect(() => {
    const docsForTab = activeTab === 'fnol' ? fnolDocs :
                       activeTab === 'policy' ? policyDocs : endorsementDocs;
    if (docsForTab.length > 0 && (!selectedDoc || !docsForTab.find(d => d.id === selectedDoc.id))) {
      setSelectedDoc(docsForTab[0]);
    }
  }, [activeTab, fnolDocs, policyDocs, endorsementDocs]);

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(p => p - 1);
  };

  const handleNextPage = () => {
    if (imageData && currentPage < imageData.pages) setCurrentPage(p => p + 1);
  };

  const handleZoomIn = () => {
    setZoom(z => Math.min(z + 25, 200));
  };

  const handleZoomOut = () => {
    setZoom(z => Math.max(z - 25, 50));
  };

  const handleDownload = () => {
    if (selectedDoc) {
      window.open(`/api/documents/${selectedDoc.id}/download`, '_blank');
    }
  };

  const DocumentList = ({ docs, type }: { docs: Document[], type: string }) => (
    <div className="space-y-2">
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No {type} documents uploaded
        </p>
      ) : (
        docs.map(doc => (
          <button
            key={doc.id}
            onClick={() => setSelectedDoc(doc)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              selectedDoc?.id === doc.id
                ? 'border-primary bg-primary/5'
                : 'border-transparent hover:bg-muted'
            }`}
          >
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium truncate flex-1">{doc.name || doc.fileName}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {doc.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {(doc.fileSize / 1024).toFixed(0)} KB
              </span>
            </div>
          </button>
        ))
      )}
    </div>
  );

  const ViewerContent = () => {
    if (!selectedDoc) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <FileText className="w-16 h-16 mb-4 opacity-50" />
          <p>Select a document to view</p>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Loading document...</p>
        </div>
      );
    }

    if (!imageData || imageData.images.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <FileText className="w-16 h-16 mb-4 opacity-50" />
          <p>Unable to load document preview</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-2 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handlePrevPage} disabled={currentPage <= 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm">
              Page {currentPage} of {imageData.pages}
            </span>
            <Button variant="ghost" size="sm" onClick={handleNextPage} disabled={currentPage >= imageData.pages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleZoomOut} disabled={zoom <= 50}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm w-12 text-center">{zoom}%</span>
            <Button variant="ghost" size="sm" onClick={handleZoomIn} disabled={zoom >= 200}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFullscreen(true)}>
              <Maximize2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Image display */}
        <div className="flex-1 overflow-auto p-4 bg-slate-100 dark:bg-slate-900">
          <div className="flex justify-center">
            <img
              src={imageData.images[currentPage - 1]}
              alt={`${selectedDoc.name} - Page ${currentPage}`}
              style={{ width: `${zoom}%`, maxWidth: 'none' }}
              className="shadow-lg bg-white"
            />
          </div>
        </div>
      </div>
    );
  };

  // Fullscreen modal
  if (fullscreen && selectedDoc && imageData) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
        <div className="flex items-center justify-between p-4 text-white">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={handlePrevPage} disabled={currentPage <= 1} className="text-white hover:bg-white/20">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span>Page {currentPage} of {imageData.pages}</span>
            <Button variant="ghost" size="sm" onClick={handleNextPage} disabled={currentPage >= imageData.pages} className="text-white hover:bg-white/20">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-75">{selectedDoc.name}</span>
            <Button variant="ghost" size="sm" onClick={handleDownload} className="text-white hover:bg-white/20">
              <Download className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFullscreen(false)} className="text-white hover:bg-white/20">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center p-4">
          <img
            src={imageData.images[currentPage - 1]}
            alt={`${selectedDoc.name} - Page ${currentPage}`}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      </div>
    );
  }

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Claim Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="px-4">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="fnol" className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                FNOL ({fnolDocs.length})
              </TabsTrigger>
              <TabsTrigger value="policy" className="flex items-center gap-1">
                <Shield className="w-3 h-3" />
                Policy ({policyDocs.length})
              </TabsTrigger>
              <TabsTrigger value="endorsement" className="flex items-center gap-1">
                <FilePlus className="w-3 h-3" />
                Endorsements ({endorsementDocs.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 flex overflow-hidden mt-2">
            {/* Document list sidebar */}
            <div className="w-64 border-r overflow-auto p-2">
              <TabsContent value="fnol" className="m-0">
                <DocumentList docs={fnolDocs} type="FNOL" />
              </TabsContent>
              <TabsContent value="policy" className="m-0">
                <DocumentList docs={policyDocs} type="policy" />
              </TabsContent>
              <TabsContent value="endorsement" className="m-0">
                <DocumentList docs={endorsementDocs} type="endorsement" />
              </TabsContent>
            </div>

            {/* Document viewer */}
            <div className="flex-1 overflow-hidden">
              <ViewerContent />
            </div>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
