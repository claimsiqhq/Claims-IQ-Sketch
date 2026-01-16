/**
 * Loading Button Component
 * 
 * Button that shows loading state with spinner
 */

import { Button, ButtonProps } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface LoadingButtonProps extends ButtonProps {
  loading?: boolean;
  loadingText?: string;
}

export function LoadingButton({
  loading = false,
  loadingText,
  children,
  disabled,
  className,
  ...props
}: LoadingButtonProps) {
  return (
    <Button
      disabled={loading || disabled}
      className={cn(className)}
      {...props}
    >
      {loading ? (
        <>
          <Spinner className="mr-2" />
          {loadingText || children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
