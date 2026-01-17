import { useState, useEffect, useRef, useCallback } from "react";
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
  Image as ImageIcon,
  RotateCcw
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
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 });

  const fnolDocs = documents.filter(d => d.type === 'fnol');
  const policyDocs = documents.filter(d => d.type === 'policy');
  const endorsementDocs = documents.filter(d => d.type === 'endorsement');

  useEffect(() => {
    if (!selectedDoc) {
      setImageData(null);
      return;
    }

    const loadPreviews = async () => {
      setLoading(true);
      setCurrentPage(1);
      setZoom(100);
      try {
        const response = await fetch(`/api/documents/${selectedDoc.id}/previews`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          
          if (data.previewStatus === 'pending' || data.previewStatus === 'processing') {
            if (data.previewStatus === 'pending') {
              await fetch(`/api/documents/${selectedDoc.id}/generate-previews`, {
                method: 'POST',
                credentials: 'include'
              });
            }
            
            let attempts = 0;
            const maxAttempts = 15;
            while (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 2000));
              const pollResponse = await fetch(`/api/documents/${selectedDoc.id}/previews`, {
                credentials: 'include'
              });
              if (pollResponse.ok) {
                const pollData = await pollResponse.json();
                if (pollData.previewStatus === 'completed' && pollData.urls.length > 0) {
                  setImageData({ pages: pollData.pageCount, images: pollData.urls });
                  return;
                }
                if (pollData.previewStatus === 'failed') {
                  break;
                }
              }
              attempts++;
            }
          } else if (data.previewStatus === 'completed' && data.urls.length > 0) {
            setImageData({ pages: data.pageCount, images: data.urls });
            return;
          }
        }
        
        const legacyResponse = await fetch(`/api/documents/${selectedDoc.id}/images`, {
          credentials: 'include'
        });
        if (legacyResponse.ok) {
          const legacyData = await legacyResponse.json();
          setImageData(legacyData);
        }
      } catch (error) {
        // Failed to load document previews - will show error state
      } finally {
        setLoading(false);
      }
    };

    loadPreviews();
  }, [selectedDoc]);

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
    setZoom(z => Math.min(z + 25, 300));
  };

  const handleZoomOut = () => {
    setZoom(z => Math.max(z - 25, 25));
  };

  const handleResetZoom = () => {
    setZoom(100);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      containerRef.current.scrollLeft = 0;
    }
  };

  const handleDownload = () => {
    if (selectedDoc) {
      window.open(`/api/documents/${selectedDoc.id}/download`, '_blank');
    }
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -10 : 10;
      setZoom(z => Math.min(Math.max(z + delta, 25), 300));
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    if (containerRef.current) {
      setScrollStart({ 
        x: containerRef.current.scrollLeft, 
        y: containerRef.current.scrollTop 
      });
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    containerRef.current.scrollLeft = scrollStart.x - dx;
    containerRef.current.scrollTop = scrollStart.y - dy;
  }, [isDragging, dragStart, scrollStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

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
            data-testid={`doc-item-${doc.id}`}
            onClick={() => setSelectedDoc(doc)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              selectedDoc?.id === doc.id
                ? 'border-primary bg-primary/5'
                : 'border-transparent hover:bg-muted'
            }`}
          >
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" />
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
        <div className="flex items-center justify-between p-2 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handlePrevPage} disabled={currentPage <= 1} data-testid="btn-prev-page">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm min-w-[80px] text-center">
              Page {currentPage} of {imageData.pages}
            </span>
            <Button variant="ghost" size="sm" onClick={handleNextPage} disabled={currentPage >= imageData.pages} data-testid="btn-next-page">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={handleZoomOut} disabled={zoom <= 25} data-testid="btn-zoom-out">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm w-12 text-center">{zoom}%</span>
            <Button variant="ghost" size="sm" onClick={handleZoomIn} disabled={zoom >= 300} data-testid="btn-zoom-in">
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleResetZoom} title="Reset zoom" data-testid="btn-reset-zoom">
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFullscreen(true)} data-testid="btn-fullscreen">
              <Maximize2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownload} data-testid="btn-download">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div 
          ref={containerRef}
          className="flex-1 overflow-auto p-4 bg-slate-100 dark:bg-slate-900"
          style={{ cursor: isDragging ? 'grabbing' : (zoom > 100 ? 'grab' : 'default') }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <div className="flex justify-center min-h-full">
            <img
              src={imageData.images[currentPage - 1]}
              alt={`${selectedDoc.name} - Page ${currentPage}`}
              style={{ 
                width: `${zoom}%`, 
                maxWidth: 'none',
                userSelect: 'none',
                pointerEvents: 'none'
              }}
              className="shadow-lg bg-white"
              draggable={false}
            />
          </div>
        </div>
        
        <div className="text-xs text-muted-foreground text-center py-1 border-t bg-muted/20 shrink-0">
          Scroll to navigate • Ctrl+Scroll to zoom • Drag to pan when zoomed
        </div>
      </div>
    );
  };

  if (fullscreen && selectedDoc && imageData) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
        {/* Mobile-friendly close button - always visible in top-right corner */}
        <Button 
          variant="ghost" 
          size="lg"
          onClick={() => setFullscreen(false)} 
          className="fixed top-2 right-2 z-[60] text-white bg-black/50 hover:bg-black/70 rounded-full w-12 h-12 p-0 md:hidden"
          data-testid="btn-close-fullscreen-mobile"
        >
          <X className="w-6 h-6" />
        </Button>
        
        <div className="flex items-center justify-between p-2 md:p-4 text-white shrink-0">
          {/* Page navigation - left side */}
          <div className="flex items-center gap-1 md:gap-4">
            <Button variant="ghost" size="sm" onClick={handlePrevPage} disabled={currentPage <= 1} className="text-white hover:bg-white/20 p-1 md:p-2">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <span className="text-xs md:text-sm whitespace-nowrap">Page {currentPage}/{imageData.pages}</span>
            <Button variant="ghost" size="sm" onClick={handleNextPage} disabled={currentPage >= imageData.pages} className="text-white hover:bg-white/20 p-1 md:p-2">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
          
          {/* Controls - right side (hidden on mobile except for essential buttons) */}
          <div className="flex items-center gap-1 md:gap-4">
            {/* Zoom controls - hidden on mobile to save space */}
            <div className="hidden md:flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleZoomOut} disabled={zoom <= 25} className="text-white hover:bg-white/20">
                <ZoomOut className="w-5 h-5" />
              </Button>
              <span className="text-sm w-12 text-center">{zoom}%</span>
              <Button variant="ghost" size="sm" onClick={handleZoomIn} disabled={zoom >= 300} className="text-white hover:bg-white/20">
                <ZoomIn className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleResetZoom} className="text-white hover:bg-white/20">
                <RotateCcw className="w-5 h-5" />
              </Button>
            </div>
            <span className="hidden md:inline text-sm opacity-75 max-w-[200px] truncate">{selectedDoc.name}</span>
            <Button variant="ghost" size="sm" onClick={handleDownload} className="text-white hover:bg-white/20 p-1 md:p-2">
              <Download className="w-5 h-5" />
            </Button>
            {/* Desktop close button */}
            <Button variant="ghost" size="sm" onClick={() => setFullscreen(false)} className="hidden md:flex text-white hover:bg-white/20" data-testid="btn-close-fullscreen">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>
        <div 
          className="flex-1 overflow-auto flex items-start justify-center p-4"
          style={{ cursor: isDragging ? 'grabbing' : (zoom > 100 ? 'grab' : 'default') }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <img
            src={imageData.images[currentPage - 1]}
            alt={`${selectedDoc.name} - Page ${currentPage}`}
            style={{ 
              width: zoom > 100 ? `${zoom}%` : undefined,
              maxHeight: zoom <= 100 ? '100%' : undefined,
              maxWidth: zoom <= 100 ? '100%' : 'none',
              objectFit: 'contain',
              userSelect: 'none',
              pointerEvents: 'none'
            }}
            draggable={false}
          />
        </div>
      </div>
    );
  }

  return (
    <Card className="h-full min-h-[500px] flex flex-col">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Claim Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 shrink-0">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="fnol" className="flex items-center gap-1" data-testid="tab-fnol">
                <FileText className="w-3 h-3" />
                FNOL ({fnolDocs.length})
              </TabsTrigger>
              <TabsTrigger value="policy" className="flex items-center gap-1" data-testid="tab-policy">
                <Shield className="w-3 h-3" />
                Policy ({policyDocs.length})
              </TabsTrigger>
              <TabsTrigger value="endorsement" className="flex items-center gap-1" data-testid="tab-endorsement">
                <FilePlus className="w-3 h-3" />
                Endorsements ({endorsementDocs.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 flex flex-col md:flex-row overflow-hidden mt-2">
            <div className="md:w-48 border-b md:border-b-0 md:border-r overflow-x-auto md:overflow-y-auto p-2 shrink-0 max-h-24 md:max-h-none">
              <div className="flex md:flex-col gap-2">
                <TabsContent value="fnol" className="m-0">
                  <div className="flex md:flex-col gap-2">
                    {fnolDocs.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center whitespace-nowrap">No FNOL docs</p>
                    ) : fnolDocs.map(doc => (
                      <button
                        key={doc.id}
                        data-testid={`doc-item-${doc.id}`}
                        onClick={() => setSelectedDoc(doc)}
                        className={`flex-shrink-0 text-left p-2 rounded-lg border transition-colors ${
                          selectedDoc?.id === doc.id ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <ImageIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium truncate max-w-[100px] md:max-w-[120px]">{doc.name || doc.fileName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {doc.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{(doc.fileSize / 1024).toFixed(0)} KB</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="policy" className="m-0">
                  <div className="flex md:flex-col gap-2">
                    {policyDocs.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center whitespace-nowrap">No policy docs</p>
                    ) : policyDocs.map(doc => (
                      <button
                        key={doc.id}
                        data-testid={`doc-item-${doc.id}`}
                        onClick={() => setSelectedDoc(doc)}
                        className={`flex-shrink-0 text-left p-2 rounded-lg border transition-colors ${
                          selectedDoc?.id === doc.id ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <ImageIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium truncate max-w-[100px] md:max-w-[120px]">{doc.name || doc.fileName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {doc.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{(doc.fileSize / 1024).toFixed(0)} KB</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="endorsement" className="m-0">
                  <div className="flex md:flex-col gap-2">
                    {endorsementDocs.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center whitespace-nowrap">No endorsements</p>
                    ) : endorsementDocs.map(doc => (
                      <button
                        key={doc.id}
                        data-testid={`doc-item-${doc.id}`}
                        onClick={() => setSelectedDoc(doc)}
                        className={`flex-shrink-0 text-left p-2 rounded-lg border transition-colors ${
                          selectedDoc?.id === doc.id ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <ImageIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium truncate max-w-[100px] md:max-w-[120px]">{doc.name || doc.fileName}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {doc.mimeType.split('/')[1]?.toUpperCase() || 'FILE'}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{(doc.fileSize / 1024).toFixed(0)} KB</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </TabsContent>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col min-h-[300px]">
              <ViewerContent />
            </div>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
