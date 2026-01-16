/**
 * Error Banner Component
 * 
 * Displays error messages with dismiss functionality
 */

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorBannerProps {
  message: string | null | undefined;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorBanner({ message, onDismiss, className }: ErrorBannerProps) {
  if (!message) return null;

  return (
    <Alert variant="destructive" className={cn("mb-4", className)}>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <span>{message}</span>
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-2"
            onClick={onDismiss}
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
