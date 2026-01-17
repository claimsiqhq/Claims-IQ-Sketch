import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Loader2, Minus, Check, X } from "lucide-react";
import { LineItem } from "@/lib/types";
import { searchLineItems, getCategories, ApiLineItem, Category } from "@/lib/api";

interface LineItemPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: LineItem) => void;
}

export default function LineItemPicker({ isOpen, onClose, onSelect }: LineItemPickerProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [items, setItems] = useState<ApiLineItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ApiLineItem | null>(null);
  const [quantity, setQuantity] = useState<string>("1");

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      loadItems();
      setSelectedItem(null);
      setQuantity("1");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      loadItems();
    }, 300);

    return () => clearTimeout(timer);
  }, [search, selectedCategory, isOpen]);

  const loadCategories = async () => {
    try {
      const cats = await getCategories();
      setCategories(cats);
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  };

  const loadItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await searchLineItems({
        q: search || undefined,
        category: selectedCategory || undefined,
        limit: 50,
      });
      setItems(result.items);
    } catch (err) {
      setError("Failed to load line items");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleItemClick = (item: ApiLineItem) => {
    setSelectedItem(item);
    setQuantity("1");
  };

  const handleCancelSelection = () => {
    setSelectedItem(null);
    setQuantity("1");
  };

  const parseFraction = (value: string): number => {
    const trimmed = value.trim();
    if (!trimmed) return 1;
    
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length === 2) {
        const num = parseFloat(parts[0]);
        const denom = parseFloat(parts[1]);
        if (!isNaN(num) && !isNaN(denom) && denom !== 0) {
          return num / denom;
        }
      }
    }
    
    const parsed = parseFloat(trimmed);
    return isNaN(parsed) ? 1 : parsed;
  };

  const handleConfirmAdd = () => {
    if (!selectedItem) return;
    
    const qty = Math.max(0.01, parseFraction(quantity));
    const lineItem: LineItem = {
      id: selectedItem.id,
      code: selectedItem.code,
      description: selectedItem.description,
      category: selectedItem.categoryName,
      unit: selectedItem.unit,
      unitPrice: selectedItem.basePrice,
      quantity: qty,
    };
    onSelect(lineItem);
    setSelectedItem(null);
    setQuantity("1");
  };

  const adjustQuantity = (delta: number) => {
    const current = parseFraction(quantity);
    const newVal = Math.max(0.01, current + delta);
    setQuantity(newVal.toString());
  };

  const handleQuantityChange = (value: string) => {
    if (value === "" || /^[\d./]*$/.test(value)) {
      setQuantity(value);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-[100vw] h-[100dvh] sm:max-w-[600px] sm:h-[80vh] flex flex-col rounded-none sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Add Line Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {selectedItem ? (
            <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold bg-primary/10 px-1.5 py-0.5 rounded text-primary">
                      {selectedItem.code}
                    </span>
                    <span className="text-xs text-muted-foreground">{selectedItem.categoryName}</span>
                  </div>
                  <p className="text-sm font-medium mt-1">{selectedItem.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ${selectedItem.basePrice.toFixed(2)} / {selectedItem.unit}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCancelSelection}
                  className="shrink-0 h-8 w-8"
                  aria-label="Cancel selection"
                  data-testid="button-cancel-selection"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-muted-foreground">Quantity:</label>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => adjustQuantity(-1)}
                    className="h-9 w-9"
                    aria-label="Decrease quantity"
                    data-testid="button-quantity-minus"
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => handleQuantityChange(e.target.value)}
                    className="w-20 text-center font-medium"
                    data-testid="input-quantity"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => adjustQuantity(1)}
                    className="h-9 w-9"
                    aria-label="Increase quantity"
                    data-testid="button-quantity-plus"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <span className="text-sm text-muted-foreground ml-1">{selectedItem.unit}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="text-sm">
                  <span className="text-muted-foreground">Line Total: </span>
                  <span className="font-semibold">
                    ${((parseFloat(quantity) || 0) * selectedItem.basePrice).toFixed(2)}
                  </span>
                </div>
                <Button onClick={handleConfirmAdd} className="gap-2" data-testid="button-confirm-add">
                  <Check className="h-4 w-4" />
                  Add to Scope
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by code or description..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search"
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 scroll-smooth-touch -mx-1 px-1">
                <Button
                  variant={selectedCategory === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(null)}
                  className="rounded-full shrink-0"
                  data-testid="button-category-all"
                >
                  All
                </Button>
                {categories.map(cat => (
                  <Button
                    key={cat.id}
                    variant={selectedCategory === cat.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(cat.id)}
                    className="rounded-full whitespace-nowrap shrink-0"
                    data-testid={`button-category-${cat.id}`}
                  >
                    {cat.name}
                  </Button>
                ))}
              </div>
            </>
          )}

          {!selectedItem && (
            <div className="flex-1 overflow-y-auto border rounded-md divide-y scroll-smooth-touch">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : error ? (
                <div className="p-8 text-center text-destructive">
                  {error}
                  <Button variant="outline" size="sm" className="ml-2" onClick={loadItems}>
                    Retry
                  </Button>
                </div>
              ) : items.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No items found.
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 flex items-center justify-between hover:bg-muted/50 active:bg-muted transition-colors min-tap-target cursor-pointer"
                    onClick={() => handleItemClick(item)}
                    data-testid={`line-item-${item.code}`}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                          {item.code}
                        </span>
                        <span className="text-xs text-muted-foreground">{item.categoryName}</span>
                      </div>
                      <p className="text-sm font-medium mt-1 truncate">{item.description}</p>
                      <p className="text-xs text-muted-foreground">Price: ${item.basePrice.toFixed(2)} / {item.unit}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="shrink-0 min-tap-target pointer-events-none">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
