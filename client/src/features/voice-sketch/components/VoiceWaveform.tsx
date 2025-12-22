// Voice Waveform Component
// Audio visualization showing listening/speaking state

import React, { useEffect, useRef } from 'react';
import { Mic, Volume2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceWaveformProps {
  isConnected: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  className?: string;
  compact?: boolean;
}

export function VoiceWaveform({
  isConnected,
  isListening,
  isSpeaking,
  className,
  compact = false,
}: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    let phase = 0;
    const barCount = 20;

    const animate = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);

      const centerY = rect.height / 2;
      const barWidth = rect.width / (barCount * 2);
      const maxBarHeight = rect.height * 0.6;

      for (let i = 0; i < barCount; i++) {
        const x = (i * 2 + 1) * barWidth;

        let height: number;
        let color: string;

        if (!isConnected) {
          // Disconnected - flat gray bars
          height = maxBarHeight * 0.1;
          color = 'hsl(var(--muted-foreground) / 0.3)';
        } else if (isSpeaking) {
          // Agent speaking - blue animated bars
          const sinValue = Math.sin(phase + i * 0.3);
          height = maxBarHeight * (0.3 + 0.5 * Math.abs(sinValue));
          color = `hsl(214, 52%, ${35 + 20 * Math.abs(sinValue)}%)`;
        } else if (isListening) {
          // Listening - green pulsing bars with lower amplitude
          const sinValue = Math.sin(phase * 0.5 + i * 0.2);
          height = maxBarHeight * (0.2 + 0.2 * Math.abs(sinValue));
          color = `hsl(142, 76%, ${35 + 10 * Math.abs(sinValue)}%)`;
        } else {
          // Connected but idle
          height = maxBarHeight * 0.15;
          color = 'hsl(var(--muted-foreground) / 0.5)';
        }

        // Draw rounded bar
        ctx.beginPath();
        ctx.roundRect(
          x - barWidth / 2,
          centerY - height / 2,
          barWidth,
          height,
          barWidth / 2
        );
        ctx.fillStyle = color;
        ctx.fill();
      }

      phase += isConnected ? (isSpeaking ? 0.15 : 0.05) : 0;
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isConnected, isListening, isSpeaking]);

  const getStatusLabel = () => {
    if (!isConnected) {
      return {
        icon: WifiOff,
        text: 'Not connected',
        className: 'text-muted-foreground',
      };
    }
    if (isSpeaking) {
      return {
        icon: Volume2,
        text: 'Assistant speaking...',
        className: 'text-primary',
      };
    }
    if (isListening) {
      return {
        icon: Mic,
        text: 'Listening...',
        className: 'text-green-600',
      };
    }
    return {
      icon: Mic,
      text: 'Ready',
      className: 'text-muted-foreground',
    };
  };

  const status = getStatusLabel();
  const StatusIcon = status.icon;

  // Compact mode: just waveform with minimal status indicator
  if (compact) {
    return (
      <div
        className={cn(
          'rounded border bg-card/50 px-2 py-1 flex items-center gap-2',
          className
        )}
      >
        {/* Small status indicator */}
        <div
          className={cn(
            'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
            !isConnected && 'bg-muted',
            isConnected && isListening && 'bg-green-100',
            isConnected && isSpeaking && 'bg-primary/10',
            isConnected && !isListening && !isSpeaking && 'bg-muted'
          )}
        >
          <StatusIcon
            className={cn(
              'h-3 w-3',
              !isConnected && 'text-muted-foreground',
              isConnected && isListening && 'text-green-600',
              isConnected && isSpeaking && 'text-primary'
            )}
          />
        </div>

        {/* Waveform Canvas - compact */}
        <canvas
          ref={canvasRef}
          className="flex-1"
          style={{ height: '20px' }}
        />

        {/* Compact status text */}
        <span className={cn('text-[10px] font-medium flex-shrink-0', status.className)}>
          {status.text}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-card px-3 py-2 flex items-center gap-3',
        className
      )}
    >
      {/* Visual indicator */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300',
          !isConnected && 'bg-muted',
          isConnected && isListening && 'bg-green-100 ring-2 ring-green-400',
          isConnected && isSpeaking && 'bg-primary/10 ring-2 ring-primary',
          isConnected && !isListening && !isSpeaking && 'bg-muted'
        )}
      >
        <StatusIcon
          className={cn(
            'h-4 w-4 transition-colors',
            !isConnected && 'text-muted-foreground',
            isConnected && isListening && 'text-green-600',
            isConnected && isSpeaking && 'text-primary'
          )}
        />
      </div>

      {/* Waveform Canvas */}
      <canvas
        ref={canvasRef}
        className="flex-1 h-8"
        style={{ height: '32px' }}
      />

      {/* Status Label */}
      <div className={cn('flex items-center gap-1 text-xs font-medium flex-shrink-0', status.className)}>
        <span>{status.text}</span>
      </div>
    </div>
  );
}
