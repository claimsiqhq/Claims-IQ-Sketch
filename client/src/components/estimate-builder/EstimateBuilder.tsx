import { useState, useEffect } from 'react';
import { useEstimateBuilder, ZONE_STATUS_LABELS } from '@/hooks/useEstimateBuilder';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Building2,
  Layers,
  Square,
  Plus,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { StructureTree } from './StructureTree';
import { ZoneEditor } from './ZoneEditor';
import { DimensionDisplay } from './DimensionDisplay';
import { MissingWallManager } from './MissingWallManager';
import { LineItemPanel } from './LineItemPanel';
import { EstimateSummary } from './EstimateSummary';

interface EstimateBuilderProps {
  estimateId: string;
  className?: string;
}

export function EstimateBuilder({ estimateId, className }: EstimateBuilderProps) {
  const {
    hierarchy,
    activeZone,
    isLoading,
    isError,
    error,
    activeZoneId,
    setActiveZoneId,
    totalZones,
    totalLineItems,
    estimateTotals,
    initialize,
    recalculate,
    createStructure,
    createArea,
    createZone,
    updateZone,
    deleteZone,
    createMissingWall,
    deleteMissingWall,
    addLineItem,
    deleteLineItem,
    isInitializing,
    isRecalculating,
    isSaving,
    refetch,
  } = useEstimateBuilder(estimateId);

  const [activeTab, setActiveTab] = useState('zone');

  // Auto-initialize if no hierarchy exists
  useEffect(() => {
    if (!isLoading && hierarchy && hierarchy.structures.length === 0) {
      // Show empty state, user can initialize
    }
  }, [isLoading, hierarchy]);

  if (isLoading) {
    return (
      <div className={cn('h-full flex flex-col', className)}>
        <div className="p-4 border-b flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="flex-1 flex">
          <div className="w-64 border-r p-4 space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
          <div className="flex-1 p-4">
            <Skeleton className="h-full w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={cn('h-full flex items-center justify-center', className)}>
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load estimate: {error?.message || 'Unknown error'}
            <Button variant="outline" size="sm" className="ml-4" onClick={() => refetch()}>
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Empty state - no structures yet
  if (!hierarchy || hierarchy.structures.length === 0) {
    return (
      <div className={cn('h-full flex items-center justify-center', className)}>
        <div className="text-center space-y-4 max-w-md p-8">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Start Building Your Estimate</h2>
          <p className="text-muted-foreground">
            Initialize the estimate structure to begin adding rooms, zones, and line items.
          </p>
          <Button
            onClick={() => initialize({})}
            disabled={isInitializing}
            size="lg"
          >
            {isInitializing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Initializing...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Initialize Estimate
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('h-full flex flex-col bg-background', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold">Estimate Builder</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="font-normal">
              {totalZones} zones
            </Badge>
            <Badge variant="outline" className="font-normal">
              {totalLineItems} items
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => recalculate()}
            disabled={isRecalculating}
          >
            {isRecalculating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Recalculate
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left Sidebar - Structure Tree */}
          <ResizablePanel defaultSize={22} minSize={18} maxSize={35}>
            <div className="h-full flex flex-col border-r bg-slate-50/50">
              <div className="p-3 border-b bg-white">
                <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">
                  Structure
                </h3>
              </div>
              <ScrollArea className="flex-1">
                <StructureTree
                  structures={hierarchy.structures}
                  activeZoneId={activeZoneId}
                  onSelectZone={setActiveZoneId}
                  onCreateZone={createZone}
                  onCreateArea={createArea}
                  onCreateStructure={createStructure}
                />
              </ScrollArea>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Center - Zone Editor */}
          <ResizablePanel defaultSize={50}>
            <div className="h-full flex flex-col bg-white">
              {activeZoneId && activeZone ? (
                <>
                  {/* Zone Header */}
                  <div className="p-4 border-b flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{activeZone.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            activeZone.status === 'complete' && 'border-green-200 text-green-700 bg-green-50',
                            activeZone.status === 'scoped' && 'border-blue-200 text-blue-700 bg-blue-50',
                            activeZone.status === 'measured' && 'border-amber-200 text-amber-700 bg-amber-50',
                            activeZone.status === 'pending' && 'border-slate-200 text-slate-600'
                          )}
                        >
                          {ZONE_STATUS_LABELS[activeZone.status as keyof typeof ZONE_STATUS_LABELS] || activeZone.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground capitalize">
                          {activeZone.zoneType}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm('Delete this zone?')) {
                          deleteZone(activeZoneId);
                        }
                      }}
                    >
                      Delete Zone
                    </Button>
                  </div>

                  {/* Zone Tabs */}
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                    <div className="border-b px-4">
                      <TabsList className="bg-transparent h-auto p-0 space-x-4">
                        <TabsTrigger
                          value="zone"
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 py-3"
                        >
                          <Square className="h-4 w-4 mr-2" />
                          Dimensions
                        </TabsTrigger>
                        <TabsTrigger
                          value="openings"
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 py-3"
                        >
                          <Layers className="h-4 w-4 mr-2" />
                          Openings
                          {activeZone.missingWalls.length > 0 && (
                            <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                              {activeZone.missingWalls.length}
                            </Badge>
                          )}
                        </TabsTrigger>
                        <TabsTrigger
                          value="items"
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 py-3"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Line Items
                          {activeZone.lineItemCount > 0 && (
                            <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                              {activeZone.lineItemCount}
                            </Badge>
                          )}
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <ScrollArea className="flex-1">
                      <TabsContent value="zone" className="m-0 p-4">
                        <div className="space-y-6">
                          <ZoneEditor
                            zone={activeZone}
                            onUpdate={(updates) => updateZone(activeZoneId, updates)}
                            disabled={isSaving}
                          />
                          <DimensionDisplay
                            dimensions={activeZone.dimensions}
                            zoneType={activeZone.zoneType as any}
                          />
                        </div>
                      </TabsContent>

                      <TabsContent value="openings" className="m-0 p-4">
                        <MissingWallManager
                          missingWalls={activeZone.missingWalls}
                          onAdd={(input) => createMissingWall(activeZoneId, input)}
                          onDelete={deleteMissingWall}
                        />
                      </TabsContent>

                      <TabsContent value="items" className="m-0 p-4">
                        <LineItemPanel
                          zoneId={activeZoneId}
                          lineItemCount={activeZone.lineItemCount}
                          onAddItem={(input) => addLineItem(activeZoneId, input)}
                          onDeleteItem={deleteLineItem}
                        />
                      </TabsContent>
                    </ScrollArea>
                  </Tabs>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-center p-8">
                  <div className="space-y-3">
                    <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                      <Square className="h-6 w-6" />
                    </div>
                    <p className="text-muted-foreground">
                      Select a zone from the structure tree to edit dimensions and add line items.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Sidebar - Summary */}
          <ResizablePanel defaultSize={28} minSize={20} maxSize={40}>
            <div className="h-full flex flex-col border-l bg-slate-50/50">
              <div className="p-3 border-b bg-white">
                <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">
                  Estimate Summary
                </h3>
              </div>
              <ScrollArea className="flex-1">
                <EstimateSummary
                  totals={estimateTotals}
                  hierarchy={hierarchy}
                />
              </ScrollArea>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
