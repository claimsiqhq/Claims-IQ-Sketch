import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Loader2 } from "lucide-react";
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

  // Load categories on mount
  useEffect(() => {
    if (isOpen) {
      loadCategories();
      loadItems();
    }
  }, [isOpen]);

  // Debounced search
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

  const handleSelect = (item: ApiLineItem) => {
    // Convert API item to local LineItem format
    const lineItem: LineItem = {
      id: item.id,
      code: item.code,
      description: item.description,
      category: item.categoryName,
      unit: item.unit,
      unitPrice: item.basePrice,
    };
    onSelect(lineItem);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-[100vw] h-[100dvh] sm:max-w-[600px] sm:h-[80vh] flex flex-col rounded-none sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Add Line Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by code or description..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 scroll-smooth-touch -mx-1 px-1">
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(null)}
              className="rounded-full shrink-0"
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
              >
                {cat.name}
              </Button>
            ))}
          </div>

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
                <div key={item.id} className="p-3 flex items-center justify-between hover:bg-muted/50 active:bg-muted transition-colors min-tap-target">
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
                  <Button size="sm" variant="ghost" onClick={() => handleSelect(item)} className="shrink-0 min-tap-target">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
