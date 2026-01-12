/**
 * Memoized Document Card Components
 *
 * These components prevent unnecessary re-renders when the document list
 * is displayed by memoizing individual document cards.
 */

import React, { memo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Image as ImageIcon, Eye, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { getDocumentDownloadUrl, type Document } from '@/lib/api';

interface DocumentCardProps {
  document: Document;
  onPreview: (docId: string, docName: string) => void;
}

/**
 * Memoized DocumentCard component
 * Only re-renders when document data or preview handler changes
 */
export const DocumentCard = memo(function DocumentCard({
  document: doc,
  onPreview,
}: DocumentCardProps) {
  const handlePreviewClick = useCallback(() => {
    onPreview(doc.id, doc.name || doc.fileName);
  }, [doc.id, doc.name, doc.fileName, onPreview]);

  const typeColorClass = cn(
    'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
    doc.type === 'fnol' && 'bg-purple-100 text-purple-600',
    doc.type === 'policy' && 'bg-blue-100 text-blue-600',
    doc.type === 'endorsement' && 'bg-green-100 text-green-600',
    doc.type === 'photo' && 'bg-amber-100 text-amber-600',
    doc.type === 'estimate' && 'bg-orange-100 text-orange-600',
    doc.type === 'correspondence' && 'bg-slate-100 text-slate-600'
  );

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={typeColorClass}>
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
              {doc.createdAt
                ? formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })
                : 'Recently'}
            </p>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={handlePreviewClick}
          >
            <Eye className="h-4 w-4 mr-1" />
            View
          </Button>
          <Button size="sm" variant="outline" className="flex-1" asChild>
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
  );
});

interface DocumentListProps {
  documents: Document[];
  onPreview: (docId: string, docName: string) => void;
}

/**
 * Memoized DocumentList component
 * Renders a grid of DocumentCard components
 */
export const DocumentList = memo(function DocumentList({
  documents,
  onPreview,
}: DocumentListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {documents.map((doc) => (
        <DocumentCard key={doc.id} document={doc} onPreview={onPreview} />
      ))}
    </div>
  );
});
