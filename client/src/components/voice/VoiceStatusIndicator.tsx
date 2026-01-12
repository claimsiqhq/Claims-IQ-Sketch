// Voice Status Indicator Component
// Shared status indicator for voice sessions showing listening/speaking state

import React from 'react';
import { Mic, Volume2, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type VoiceSessionStatus = 'disconnected' | 'connecting' | 'listening' | 'speaking' | 'idle';

interface VoiceStatusIndicatorProps {
  status: VoiceSessionStatus;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig = {
  disconnected: {
    icon: WifiOff,
    label: 'Not connected',
    textClass: 'text-muted-foreground',
    bgClass: 'bg-muted',
    dotClass: '',
  },
  connecting: {
    icon: Loader2,
    label: 'Connecting...',
    textClass: 'text-muted-foreground',
    bgClass: 'bg-muted',
    dotClass: '',
  },
  listening: {
    icon: Mic,
    label: 'Listening',
    textClass: 'text-green-600',
    bgClass: 'bg-green-100',
    dotClass: 'bg-green-500',
  },
  speaking: {
    icon: Volume2,
    label: 'Speaking',
    textClass: 'text-blue-600',
    bgClass: 'bg-blue-100',
    dotClass: 'bg-blue-500',
  },
  idle: {
    icon: Mic,
    label: 'Ready',
    textClass: 'text-muted-foreground',
    bgClass: 'bg-muted',
    dotClass: '',
  },
};

const sizeConfig = {
  sm: {
    container: 'gap-1',
    iconContainer: 'w-5 h-5',
    icon: 'h-3 w-3',
    text: 'text-[10px]',
    dot: 'h-1.5 w-1.5',
  },
  md: {
    container: 'gap-1.5',
    iconContainer: 'w-6 h-6',
    icon: 'h-3.5 w-3.5',
    text: 'text-xs',
    dot: 'h-2 w-2',
  },
  lg: {
    container: 'gap-2',
    iconContainer: 'w-8 h-8',
    icon: 'h-4 w-4',
    text: 'text-sm',
    dot: 'h-2.5 w-2.5',
  },
};

export function VoiceStatusIndicator({
  status,
  className,
  showLabel = true,
  size = 'md',
}: VoiceStatusIndicatorProps) {
  const config = statusConfig[status];
  const sizes = sizeConfig[size];
  const Icon = config.icon;

  return (
    <div className={cn('flex items-center', sizes.container, className)}>
      {/* Pulsing dot for active states */}
      {(status === 'listening' || status === 'speaking') && (
        <span className="relative flex">
          <span
            className={cn(
              'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
              config.dotClass,
              sizes.dot
            )}
          />
          <span
            className={cn(
              'relative inline-flex rounded-full',
              config.dotClass,
              sizes.dot
            )}
          />
        </span>
      )}

      {/* Icon container */}
      <div
        className={cn(
          'rounded-full flex items-center justify-center flex-shrink-0',
          config.bgClass,
          sizes.iconContainer
        )}
      >
        <Icon
          className={cn(
            sizes.icon,
            config.textClass,
            status === 'connecting' && 'animate-spin',
            status === 'speaking' && 'animate-pulse'
          )}
        />
      </div>

      {/* Label */}
      {showLabel && (
        <span className={cn('font-medium', sizes.text, config.textClass)}>
          {config.label}
        </span>
      )}
    </div>
  );
}

// Helper function to derive status from boolean flags
export function deriveVoiceStatus(
  isConnected: boolean,
  isListening: boolean,
  isSpeaking: boolean,
  isConnecting?: boolean
): VoiceSessionStatus {
  if (isConnecting) return 'connecting';
  if (!isConnected) return 'disconnected';
  if (isSpeaking) return 'speaking';
  if (isListening) return 'listening';
  return 'idle';
}
