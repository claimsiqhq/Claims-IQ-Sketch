/**
 * Empty State Component
 * 
 * Displays helpful empty state messages
 */

import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode | string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <Empty className={className}>
      <EmptyHeader>
        {icon && (
          <EmptyMedia variant="icon">
            {typeof icon === 'string' ? (
              <span className="text-4xl">{icon}</span>
            ) : (
              icon
            )}
          </EmptyMedia>
        )}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <div className="mt-4">{action}</div>}
    </Empty>
  );
}
