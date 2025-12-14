import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Trash2, Package, Search, DollarSign } from 'lucide-react';
import type { AddLineItemInput } from '@/hooks/useEstimateBuilder';

interface LineItem {
  id: string;
  xactimateCode: string | null;
  category: string | null;
  trade: string | null;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  rcv: string | null;
  acv: string | null;
  depreciation: string | null;
}

interface FormState {
  lineItemCode: string;
  quantity: number;
  notes: string;
}

interface LineItemPanelProps {
  zoneId: string;
  lineItemCount: number;
  onAddItem: (input: AddLineItemInput) => Promise<any>;
  onDeleteItem: (itemId: string) => Promise<any>;
  disabled?: boolean;
}

const UNIT_TYPES = [
  { value: 'SF', label: 'Square Feet (SF)' },
  { value: 'SY', label: 'Square Yards (SY)' },
  { value: 'LF', label: 'Linear Feet (LF)' },
  { value: 'EA', label: 'Each (EA)' },
  { value: 'HR', label: 'Hour (HR)' },
  { value: 'SQ', label: 'Roofing Square (SQ)' },
  { value: 'DAY', label: 'Day (DAY)' },
  { value: 'GAL', label: 'Gallon (GAL)' },
  { value: 'TON', label: 'Ton (TON)' },
  { value: 'CY', label: 'Cubic Yards (CY)' },
];

const CATEGORIES = [
  'Demolition',
  'Framing',
  'Drywall',
  'Painting',
  'Flooring',
  'Roofing',
  'Siding',
  'Windows',
  'Doors',
  'Electrical',
  'Plumbing',
  'HVAC',
  'Insulation',
  'Cabinets',
  'Countertops',
  'Appliances',
  'Cleanup',
  'Labor',
  'Equipment',
  'Other',
];

const TRADES = [
  'General Contractor',
  'Carpenter',
  'Painter',
  'Roofer',
  'Electrician',
  'Plumber',
  'HVAC Tech',
  'Flooring',
  'Drywall',
  'Mason',
  'Siding',
  'Laborer',
];

const formatCurrency = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return '$0.00';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
};

export function LineItemPanel({
  zoneId,
  lineItemCount,
  onAddItem,
  onDeleteItem,
  disabled,
}: LineItemPanelProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newItem, setNewItem] = useState<FormState>({
    lineItemCode: '',
    quantity: 1,
    notes: '',
  });

  // Fetch line items for this zone
  const { data: lineItems = [], isLoading, refetch } = useQuery<LineItem[]>({
    queryKey: ['zone-line-items', zoneId],
    queryFn: async () => {
      const response = await fetch(`/api/zones/${zoneId}/line-items`);
      if (!response.ok) {
        throw new Error('Failed to fetch line items');
      }
      return response.json();
    },
    enabled: !!zoneId,
  });

  const handleAddItem = async () => {
    if (!newItem.lineItemCode || newItem.quantity <= 0) return;

    setIsSubmitting(true);
    try {
      await onAddItem({
        lineItemCode: newItem.lineItemCode,
        quantity: newItem.quantity,
        notes: newItem.notes || undefined,
      });
      setIsAddDialogOpen(false);
      refetch();
      // Reset form
      setNewItem({
        lineItemCode: '',
        quantity: 1,
        notes: '',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Delete this line item?')) return;
    await onDeleteItem(itemId);
    refetch();
  };

  const totalAmount = lineItems.reduce((sum, item) => {
    return sum + (parseFloat(item.totalPrice) || 0);
  }, 0);

  const filteredItems = searchQuery
    ? lineItems.filter(
        (item) =>
          item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.xactimateCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.category?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : lineItems;

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Line Items</CardTitle>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={disabled}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Line Item</DialogTitle>
                <DialogDescription>
                  Enter an Xactimate code and quantity. Pricing will be calculated automatically.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Xactimate Code *</Label>
                  <Input
                    value={newItem.lineItemCode}
                    onChange={(e) =>
                      setNewItem((prev) => ({ ...prev, lineItemCode: e.target.value.toUpperCase() }))
                    }
                    placeholder="e.g., DRYWL, PNTG, FLRP"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the Xactimate line item code. Unit and price will be looked up automatically.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={newItem.quantity || ''}
                    onChange={(e) =>
                      setNewItem((prev) => ({
                        ...prev,
                        quantity: parseFloat(e.target.value) || 0,
                      }))
                    }
                    placeholder="Enter quantity"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notes (Optional)</Label>
                  <Input
                    value={newItem.notes}
                    onChange={(e) =>
                      setNewItem((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="Additional notes for this line item"
                  />
                </div>

              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAddItem}
                  disabled={isSubmitting || !newItem.lineItemCode || newItem.quantity <= 0}
                >
                  {isSubmitting ? 'Adding...' : 'Add Item'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : lineItems.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No line items</p>
            <p className="text-xs mt-1">
              Add line items to define the scope of work for this zone
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search */}
            {lineItems.length > 3 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search line items..."
                  className="pl-9"
                />
              </div>
            )}

            {/* Line Items List */}
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {item.xactimateCode && (
                          <Badge variant="outline" className="text-xs font-mono">
                            {item.xactimateCode}
                          </Badge>
                        )}
                        {item.category && (
                          <Badge variant="secondary" className="text-xs">
                            {item.category}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">{item.description}</p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span>
                          {parseFloat(item.quantity).toFixed(2)} {item.unit}
                        </span>
                        <span>@ {formatCurrency(item.unitPrice)}</span>
                        {item.trade && <span>• {item.trade}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <div className="text-right">
                        <div className="font-semibold">
                          {formatCurrency(item.totalPrice)}
                        </div>
                        {item.depreciation && parseFloat(item.depreciation) > 0 && (
                          <div className="text-xs text-amber-600">
                            -{formatCurrency(item.depreciation)} dep
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteItem(item.id)}
                        disabled={disabled}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Zone Total */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Zone Total</span>
                <Badge variant="secondary">{lineItems.length} items</Badge>
              </div>
              <span className="text-lg font-bold">{formatCurrency(totalAmount)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
