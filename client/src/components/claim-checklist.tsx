import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Circle,
  Clock,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Loader2,
  Plus,
  FileText,
  Shield,
  Eye,
  ClipboardCheck,
  Scale,
  BadgeCheck,
  Banknote,
  SkipForward,
  Ban,
  MinusCircle,
  AlertTriangle,
} from "lucide-react";
import {
  getClaimChecklist,
  generateClaimChecklist,
  updateChecklistItem,
  addChecklistItem,
  type ClaimChecklist,
  type ClaimChecklistItem,
  type ChecklistItemStatus,
} from "@/lib/api";
import { toast } from "sonner";

interface ClaimChecklistPanelProps {
  claimId: string;
  className?: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  documentation: { label: "Documentation", icon: <FileText className="h-4 w-4" />, color: "text-blue-600" },
  verification: { label: "Verification", icon: <Shield className="h-4 w-4" />, color: "text-purple-600" },
  inspection: { label: "Inspection", icon: <Eye className="h-4 w-4" />, color: "text-green-600" },
  estimation: { label: "Estimation", icon: <Scale className="h-4 w-4" />, color: "text-orange-600" },
  review: { label: "Review", icon: <BadgeCheck className="h-4 w-4" />, color: "text-cyan-600" },
  settlement: { label: "Settlement", icon: <Banknote className="h-4 w-4" />, color: "text-emerald-600" },
};

const STATUS_CONFIG: Record<ChecklistItemStatus, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  pending: { icon: <Circle className="h-4 w-4" />, color: "text-muted-foreground", bg: "bg-muted/50", label: "Pending" },
  in_progress: { icon: <Clock className="h-4 w-4" />, color: "text-blue-600", bg: "bg-blue-50", label: "In Progress" },
  completed: { icon: <CheckCircle2 className="h-4 w-4" />, color: "text-green-600", bg: "bg-green-50", label: "Completed" },
  skipped: { icon: <SkipForward className="h-4 w-4" />, color: "text-amber-600", bg: "bg-amber-50", label: "Skipped" },
  blocked: { icon: <Ban className="h-4 w-4" />, color: "text-red-600", bg: "bg-red-50", label: "Blocked" },
  na: { icon: <MinusCircle className="h-4 w-4" />, color: "text-gray-500", bg: "bg-gray-50", label: "N/A" },
};

const SEVERITY_LABELS: Record<string, { label: string; color: string }> = {
  minor: { label: "Minor", color: "bg-green-100 text-green-800" },
  moderate: { label: "Moderate", color: "bg-yellow-100 text-yellow-800" },
  severe: { label: "Severe", color: "bg-orange-100 text-orange-800" },
  catastrophic: { label: "Catastrophic", color: "bg-red-100 text-red-800" },
};

const PERIL_LABELS: Record<string, string> = {
  wind_hail: "Wind / Hail",
  fire: "Fire",
  water: "Water",
  flood: "Flood",
  smoke: "Smoke",
  mold: "Mold",
  impact: "Impact",
  other: "Other",
};

export default function ClaimChecklistPanel({ claimId, className }: ClaimChecklistPanelProps) {
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<string>("documentation");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("documentation");
  const [newItemDescription, setNewItemDescription] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['claim-checklist', claimId],
    queryFn: () => getClaimChecklist(claimId),
    enabled: !!claimId,
  });

  const regenerateMutation = useMutation({
    mutationFn: () => generateClaimChecklist(claimId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim-checklist', claimId] });
      toast.success("Checklist regenerated");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, status }: { itemId: string; status: ChecklistItemStatus }) =>
      updateChecklistItem(itemId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim-checklist', claimId] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const addItemMutation = useMutation({
    mutationFn: (item: { title: string; category: string; description?: string }) =>
      addChecklistItem(data?.checklist?.id || '', item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim-checklist', claimId] });
      setShowAddDialog(false);
      setNewItemTitle("");
      setNewItemDescription("");
      toast.success("Item added");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const checklist = data?.checklist;
  const items = data?.items || [];

  const itemsByCategory = items.reduce((acc, item) => {
    const cat = item.category || "documentation";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, ClaimChecklistItem[]>);

  const categories = Object.keys(CATEGORY_CONFIG);

  const getCategoryStats = (cat: string) => {
    const catItems = itemsByCategory[cat] || [];
    const completed = catItems.filter(i => i.status === "completed").length;
    return { total: catItems.length, completed };
  };

  const toggleExpanded = (id: string) => {
    const next = new Set(expandedItems);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedItems(next);
  };

  const handleStatusChange = (item: ClaimChecklistItem, newStatus: ChecklistItemStatus) => {
    updateItemMutation.mutate({ itemId: item.id, status: newStatus });
  };

  const handleAddItem = () => {
    if (!newItemTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    addItemMutation.mutate({
      title: newItemTitle.trim(),
      category: newItemCategory,
      description: newItemDescription.trim() || undefined,
    });
  };

  const progressPercent = checklist
    ? Math.round((checklist.completedItems / Math.max(checklist.totalItems, 1)) * 100)
    : 0;

  if (isLoading) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500 mb-2" />
          <p className="text-muted-foreground mb-4">Failed to load checklist</p>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("", className)} data-testid="claim-checklist-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              {checklist?.name || "Claim Checklist"}
            </CardTitle>
            {checklist && (
              <CardDescription className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={cn("text-xs", SEVERITY_LABELS[checklist.severity]?.color)}>
                  {SEVERITY_LABELS[checklist.severity]?.label || checklist.severity}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {PERIL_LABELS[checklist.peril] || checklist.peril}
                </Badge>
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddDialog(true)}
              disabled={!checklist}
              data-testid="button-add-checklist-item"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending}
              data-testid="button-regenerate-checklist"
            >
              {regenerateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {checklist && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">
                {checklist.completedItems} / {checklist.totalItems} ({progressPercent}%)
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="grid grid-cols-3 lg:grid-cols-6 w-full h-auto gap-1 p-1 bg-muted/50">
            {categories.map((cat) => {
              const config = CATEGORY_CONFIG[cat];
              const stats = getCategoryStats(cat);
              return (
                <TabsTrigger
                  key={cat}
                  value={cat}
                  className="flex-col py-2 px-1 text-xs data-[state=active]:bg-background"
                  data-testid={`tab-category-${cat}`}
                >
                  <span className={config.color}>{config.icon}</span>
                  <span className="mt-1 truncate w-full">{config.label}</span>
                  {stats.total > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      {stats.completed}/{stats.total}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {categories.map((cat) => (
            <TabsContent key={cat} value={cat} className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-2">
                  {(itemsByCategory[cat] || []).map((item) => {
                    const statusConfig = STATUS_CONFIG[item.status];
                    const isExpanded = expandedItems.has(item.id);

                    return (
                      <Collapsible key={item.id} open={isExpanded} onOpenChange={() => toggleExpanded(item.id)}>
                        <div
                          className={cn(
                            "border rounded-lg transition-all",
                            statusConfig.bg
                          )}
                        >
                          <div className="flex items-center gap-3 p-3">
                            <Checkbox
                              checked={item.status === "completed"}
                              onCheckedChange={(checked) => {
                                handleStatusChange(item, checked ? "completed" : "pending");
                              }}
                              disabled={updateItemMutation.isPending}
                              data-testid={`checkbox-item-${item.id}`}
                            />

                            <CollapsibleTrigger className="flex-1 flex items-center gap-2 text-left">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className={cn("font-medium text-sm", item.status === "completed" && "line-through text-muted-foreground")}>
                                    {item.title}
                                  </span>
                                  {item.required && (
                                    <Badge variant="destructive" className="text-[10px] px-1 py-0">
                                      Required
                                    </Badge>
                                  )}
                                  {item.priority === 1 && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-500 text-amber-600">
                                      High
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </CollapsibleTrigger>

                            <div className={cn("flex items-center gap-1 text-xs", statusConfig.color)}>
                              {statusConfig.icon}
                              <span className="hidden sm:inline">{statusConfig.label}</span>
                            </div>
                          </div>

                          <CollapsibleContent>
                            <div className="px-3 pb-3 pt-0 border-t">
                              {item.description && (
                                <p className="text-sm text-muted-foreground mt-2">{item.description}</p>
                              )}
                              <div className="flex flex-wrap gap-1 mt-3">
                                {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                                  <Button
                                    key={status}
                                    variant={item.status === status ? "default" : "outline"}
                                    size="sm"
                                    className="text-xs h-7"
                                    onClick={() => handleStatusChange(item, status as ChecklistItemStatus)}
                                    disabled={updateItemMutation.isPending}
                                    data-testid={`button-status-${status}-${item.id}`}
                                  >
                                    {config.icon}
                                    <span className="ml-1">{config.label}</span>
                                  </Button>
                                ))}
                              </div>
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}

                  {(itemsByCategory[cat] || []).length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      No items in this category
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Checklist Item</DialogTitle>
            <DialogDescription>Add a custom item to the claim checklist.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select value={newItemCategory} onValueChange={setNewItemCategory}>
                <SelectTrigger data-testid="select-new-item-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center gap-2">
                        {config.icon}
                        {config.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder="e.g., Contact contractor for repair estimate"
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                data-testid="input-new-item-title"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description (optional)</label>
              <Textarea
                placeholder="Additional details..."
                value={newItemDescription}
                onChange={(e) => setNewItemDescription(e.target.value)}
                data-testid="input-new-item-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddItem} disabled={addItemMutation.isPending} data-testid="button-confirm-add-item">
              {addItemMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Add Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
