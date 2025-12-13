import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { LineItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface LineItemPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: LineItem) => void;
}

export default function LineItemPicker({ isOpen, onClose, onSelect }: LineItemPickerProps) {
  const catalog = useStore((state) => state.lineItemCatalog);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = Array.from(new Set(catalog.map(item => item.category)));

  const filteredItems = catalog.filter(item => {
    const matchesSearch = item.description.toLowerCase().includes(search.toLowerCase()) || 
                          item.code.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory ? item.category === selectedCategory : true;
    return matchesSearch && matchesCategory;
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] h-[80vh] flex flex-col">
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

          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <Button 
              variant={selectedCategory === null ? "default" : "outline"} 
              size="sm"
              onClick={() => setSelectedCategory(null)}
              className="rounded-full"
            >
              All
            </Button>
            {categories.map(cat => (
              <Button
                key={cat}
                variant={selectedCategory === cat ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(cat)}
                className="rounded-full whitespace-nowrap"
              >
                {cat}
              </Button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto border rounded-md divide-y">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No items found.
              </div>
            ) : (
              filteredItems.map((item) => (
                <div key={item.id} className="p-3 flex items-center justify-between hover:bg-muted/50 transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                        {item.code}
                      </span>
                      <span className="text-xs text-muted-foreground">{item.category}</span>
                    </div>
                    <p className="text-sm font-medium mt-1">{item.description}</p>
                    <p className="text-xs text-muted-foreground">Price: ${item.unitPrice.toFixed(2)} / {item.unit}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => onSelect(item)}>
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
