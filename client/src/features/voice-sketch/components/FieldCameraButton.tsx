// Field Camera Button Component
// Allows mobile users to quickly capture photos using the native camera

import React, { useRef, useCallback } from 'react';
import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FieldCameraButtonProps {
  onPhotoCaptured?: (file: File) => void;
  className?: string;
  disabled?: boolean;
}

export function FieldCameraButton({
  onPhotoCaptured,
  className,
  disabled = false,
}: FieldCameraButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleButtonClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        console.log('Photo captured:', file.name, file.size, file.type);
        onPhotoCaptured?.(file);
      }
      // Reset input so the same file can be selected again
      event.target.value = '';
    },
    [onPhotoCaptured]
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={handleButtonClick}
        disabled={disabled}
        className={cn(
          'h-12 w-12 rounded-full shadow-lg',
          'bg-primary hover:bg-primary/90 text-primary-foreground',
          'transition-all duration-200',
          'active:scale-95',
          className
        )}
        title="Capture photo"
        aria-label="Capture photo with camera"
      >
        <Camera className="h-6 w-6" />
      </Button>
    </>
  );
}
