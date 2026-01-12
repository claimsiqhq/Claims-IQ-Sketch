/**
 * Memoized Scope Item Components
 *
 * These components prevent unnecessary re-renders when displaying
 * scope items by memoizing individual rows.
 */

import React, { memo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Trash2 } from 'lucide-react';
import type { ScopeItem } from '@/lib/api';

interface ScopeItemRowProps {
  item: ScopeItem;
  onUpdate: (itemId: string, data: { quantity?: number; notes?: string }) => void;
  onDelete: (itemId: string) => void;
  isLocked?: boolean;
}

/**
 * Memoized ScopeItemRow component for desktop view
 * Only re-renders when item data or handlers change
 */
export const ScopeItemRow = memo(function ScopeItemRow({
  item,
  onUpdate,
  onDelete,
  isLocked = false,
}: ScopeItemRowProps) {
  const handleDecrease = useCallback(() => {
    const newQty = Math.max(0.01, item.quantity - 1);
    onUpdate(item.id, { quantity: newQty });
  }, [item.id, item.quantity, onUpdate]);

  const handleIncrease = useCallback(() => {
    onUpdate(item.id, { quantity: item.quantity + 1 });
  }, [item.id, item.quantity, onUpdate]);

  const handleQuantityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newQty = Math.max(0.01, Number(e.target.value) || 1);
      onUpdate(item.id, { quantity: newQty });
    },
    [item.id, onUpdate]
  );

  const handleDelete = useCallback(() => {
    onDelete(item.id);
  }, [item.id, onDelete]);

  return (
    <div className="grid grid-cols-12 gap-2 md:gap-4 p-4 text-sm items-center hover:bg-slate-50 group">
      <div className="col-span-3 md:col-span-2 font-mono text-slate-600 text-xs md:text-sm">
        {item.lineItemCode}
      </div>
      <div className="col-span-4 md:col-span-3">
        <p className="font-medium truncate">{item.description}</p>
        <p className="text-xs text-muted-foreground">{item.category}</p>
      </div>
      <div className="col-span-2 flex items-center justify-center gap-1">
        <div className="flex items-center border rounded-md">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 rounded-r-none"
            onClick={handleDecrease}
            disabled={isLocked}
          >
            -
          </Button>
          <Input
            type="number"
            min="0.01"
            step="any"
            value={item.quantity}
            onChange={handleQuantityChange}
            disabled={isLocked}
            className="h-8 w-14 text-center border-0 rounded-none focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 rounded-l-none"
            onClick={handleIncrease}
            disabled={isLocked}
          >
            +
          </Button>
        </div>
        <span className="text-xs text-muted-foreground hidden md:inline">
          {item.unit}
        </span>
      </div>
      <div className="col-span-1 text-right text-muted-foreground hidden md:block">
        ${item.unitPrice.toFixed(2)}
      </div>
      <div className="col-span-2 md:col-span-2 text-right font-semibold">
        ${item.total.toFixed(2)}
      </div>
      <div className="col-span-1 text-right">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleDelete}
          disabled={isLocked}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});

interface MobileScopeItemCardProps {
  item: ScopeItem;
}

/**
 * Memoized mobile scope item card
 */
export const MobileScopeItemCard = memo(function MobileScopeItemCard({
  item,
}: MobileScopeItemCardProps) {
  return (
    <div className="bg-white border rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="font-mono text-xs text-slate-500">
            {item.lineItemCode}
          </span>
          <p className="font-medium text-sm truncate">{item.description}</p>
        </div>
        <Badge variant="outline">
          {item.quantity} {item.unit}
        </Badge>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-sm text-muted-foreground">
          ${item.unitPrice.toFixed(2)} / {item.unit}
        </span>
        <span className="font-semibold">${item.total.toFixed(2)}</span>
      </div>
    </div>
  );
});

interface ScopeItemsListProps {
  items: ScopeItem[];
  onUpdate: (itemId: string, data: { quantity?: number; notes?: string }) => void;
  onDelete: (itemId: string) => void;
  isLocked?: boolean;
}

/**
 * Memoized ScopeItemsList component
 * Renders a list of ScopeItemRow components
 */
export const ScopeItemsList = memo(function ScopeItemsList({
  items,
  onUpdate,
  onDelete,
  isLocked = false,
}: ScopeItemsListProps) {
  return (
    <div className="divide-y">
      {items.map((item) => (
        <ScopeItemRow
          key={item.id}
          item={item}
          onUpdate={onUpdate}
          onDelete={onDelete}
          isLocked={isLocked}
        />
      ))}
    </div>
  );
});
