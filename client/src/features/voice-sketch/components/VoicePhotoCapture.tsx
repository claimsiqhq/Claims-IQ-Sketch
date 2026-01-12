// Voice Photo Capture Component
// Camera overlay for voice-triggered photo capture with AI analysis feedback

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, X, Mic, Check, AlertTriangle, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PhotoCaptureConfig } from '../services/geometry-engine';

export interface PhotoCaptureResult {
  status: 'captured' | 'cancelled' | 'error';
  photo_id?: string;
  ai_analysis?: {
    detected_room_type?: string;
    damage_detected?: boolean;
    damage_types?: string[];
    quality_issues?: string[];
    description?: string;
    quality_score?: number;
  };
  quality_assessment?: 'good' | 'fair' | 'poor';
  error?: string;
}

interface VoicePhotoCaptureProps {
  isOpen: boolean;
  config: PhotoCaptureConfig | null;
  roomName?: string;
  onCapture: (data: { blob: Blob; timestamp: Date }) => Promise<PhotoCaptureResult>;
  onCancel: () => void;
  onComplete: (result: PhotoCaptureResult) => void;
  // Workflow step context
  workflowStepId?: string;
  stepTitle?: string;
  stepProgress?: { current: number; required: number };
}

type CapturePhase = 'preview' | 'capturing' | 'analyzing' | 'analysis_result' | 'annotation';

export function VoicePhotoCapture({
  isOpen,
  config,
  roomName,
  onCapture,
  onCancel,
  onComplete,
  workflowStepId,
  stepTitle,
  stepProgress,
}: VoicePhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<CapturePhase>('preview');
  const [analysisResult, setAnalysisResult] = useState<PhotoCaptureResult | null>(null);
  const [annotation, setAnnotation] = useState('');
  const [isListeningForAnnotation, setIsListeningForAnnotation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize camera
  useEffect(() => {
    if (!isOpen) {
      // Reset state when closed
      setPhase('preview');
      setAnalysisResult(null);
      setAnnotation('');
      setIsListeningForAnnotation(false);
      setError(null);
      return;
    }

    const initCamera = async () => {
      try {
        setError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Camera access error:', err);
        setError('Unable to access camera. Please check permissions.');
      }
    };

    initCamera();

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [isOpen]);

  // Handle capture
  const handleCapture = useCallback(async () => {
    if (!videoRef.current || phase !== 'preview') return;

    setPhase('capturing');

    // Create canvas and capture frame
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1920;
    canvas.height = videoRef.current.videoHeight || 1080;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setError('Unable to capture photo');
      setPhase('preview');
      return;
    }

    ctx.drawImage(videoRef.current, 0, 0);

    // Convert to blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
    });

    if (!blob) {
      setError('Unable to create photo');
      setPhase('preview');
      return;
    }

    setPhase('analyzing');

    // Upload and get AI analysis
    try {
      const result = await onCapture({ blob, timestamp: new Date() });
      setAnalysisResult(result);
      setPhase('analysis_result');

      // After showing analysis for 2.5 seconds, move to annotation
      setTimeout(() => setPhase('annotation'), 2500);
    } catch (err) {
      console.error('Photo capture error:', err);
      setError(err instanceof Error ? err.message : 'Photo capture failed');
      setPhase('preview'); // Allow retry
    }
  }, [phase, onCapture]);

  // Handle annotation completion
  const handleAnnotationComplete = useCallback(() => {
    if (analysisResult) {
      onComplete({
        ...analysisResult,
        // Annotation would be saved via separate API call
      });
    }
  }, [analysisResult, onComplete]);

  // Handle retake
  const handleRetake = useCallback(() => {
    setPhase('preview');
    setAnalysisResult(null);
    setAnnotation('');
    setError(null);
  }, []);

  // Handle cancel
  const handleCancel = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    onCancel();
  }, [onCancel]);

  if (!isOpen || !config) return null;

  const targetType = config.targetType.replace(/_/g, ' ');
  const suggestedLabel = config.suggestedLabel;
  const framingGuidance = config.framingGuidance;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Camera Preview */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Overlay UI */}
      <div className="absolute inset-0 flex flex-col">
        {/* Top bar */}
        <div className="flex justify-between items-center p-4 bg-gradient-to-b from-black/70 to-transparent">
          <div className="text-white">
            {/* Workflow Step Context Banner */}
            {workflowStepId && stepTitle && (
              <div className="bg-blue-500/80 text-white px-3 py-1.5 rounded-lg mb-2">
                <p className="text-sm font-medium">Workflow Step: {stepTitle}</p>
                {stepProgress && (
                  <p className="text-xs opacity-80">
                    {stepProgress.current}/{stepProgress.required} photos captured
                  </p>
                )}
              </div>
            )}
            <p className="text-sm opacity-80">{targetType}</p>
            <p className="font-medium">{suggestedLabel}</p>
            {roomName && <p className="text-xs opacity-60">{roomName}</p>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCancel}
            className="text-white hover:bg-white/20"
            aria-label="Cancel photo capture"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </Button>
        </div>

        {/* Center content based on phase */}
        <div className="flex-1 flex items-center justify-center p-4">
          {phase === 'preview' && error && (
            <div className="bg-red-500/90 text-white px-6 py-3 rounded-lg max-w-sm text-center">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                className="mt-3 text-white border-white/50"
              >
                Close
              </Button>
            </div>
          )}

          {phase === 'preview' && !error && framingGuidance && (
            <div className="bg-black/60 text-white px-6 py-3 rounded-lg max-w-sm text-center">
              <p>{framingGuidance}</p>
              <p className="text-sm opacity-70 mt-2">
                Say "capture" or tap the button
              </p>
            </div>
          )}

          {phase === 'capturing' && (
            <div className="bg-black/80 text-white px-8 py-6 rounded-xl flex flex-col items-center">
              <Camera className="h-8 w-8 mb-3 animate-pulse" />
              <p>Capturing...</p>
            </div>
          )}

          {phase === 'analyzing' && (
            <div className="bg-black/80 text-white px-8 py-6 rounded-xl flex flex-col items-center">
              <Loader2 className="h-8 w-8 animate-spin mb-3" />
              <p>Analyzing photo...</p>
            </div>
          )}

          {phase === 'analysis_result' && analysisResult?.ai_analysis && (
            <div className="bg-black/80 text-white px-6 py-4 rounded-xl max-w-sm">
              <div className="flex items-center gap-2 mb-2">
                {analysisResult.quality_assessment === 'good' ? (
                  <Check className="h-5 w-5 text-green-400" />
                ) : analysisResult.quality_assessment === 'fair' ? (
                  <Check className="h-5 w-5 text-yellow-400" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-400" />
                )}
                <span className="font-medium">
                  {analysisResult.quality_assessment === 'good'
                    ? 'Great capture!'
                    : analysisResult.quality_assessment === 'fair'
                    ? 'Acceptable quality'
                    : 'Quality issues detected'}
                </span>
              </div>
              {analysisResult.ai_analysis.description && (
                <p className="text-sm opacity-90">
                  {analysisResult.ai_analysis.description}
                </p>
              )}
              {analysisResult.ai_analysis.damage_detected && (
                <p className="text-sm text-yellow-300 mt-2">
                  Damage detected:{' '}
                  {analysisResult.ai_analysis.damage_types?.join(', ')}
                </p>
              )}
              {analysisResult.ai_analysis.quality_issues &&
                analysisResult.ai_analysis.quality_issues.length > 0 && (
                  <p className="text-sm text-orange-300 mt-2">
                    {analysisResult.ai_analysis.quality_issues[0]}
                  </p>
                )}
            </div>
          )}

          {phase === 'annotation' && (
            <div className="bg-black/80 text-white px-6 py-4 rounded-xl max-w-sm w-full">
              <p className="font-medium mb-2">
                Anything to note about this photo?
              </p>
              <p className="text-sm opacity-70 mb-4">
                Speak your annotation or tap Skip
              </p>
              {isListeningForAnnotation ? (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Mic className="h-6 w-6 text-red-400 animate-pulse" />
                  <span>Listening...</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 bg-white/10 border-white/30 text-white hover:bg-white/20"
                    onClick={() => setIsListeningForAnnotation(true)}
                  >
                    <Mic className="h-4 w-4 mr-2" />
                    Add note
                  </Button>
                  <Button
                    variant="outline"
                    className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                    onClick={handleAnnotationComplete}
                  >
                    Skip
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom controls */}
        <div className="p-6 bg-gradient-to-t from-black/70 to-transparent">
          <div className="flex justify-center items-center gap-6">
            {phase === 'preview' && !error && (
              <button
                onClick={handleCapture}
                className="w-20 h-20 rounded-full bg-white border-4 border-white/50 flex items-center justify-center active:scale-95 transition-transform shadow-lg"
                aria-label="Capture photo"
              >
                <div className="w-16 h-16 rounded-full bg-white" />
              </button>
            )}

            {(phase === 'analysis_result' || phase === 'annotation') && (
              <Button
                variant="outline"
                onClick={handleRetake}
                className="text-white border-white/50 bg-white/10 hover:bg-white/20"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Retake
              </Button>
            )}

            {phase === 'annotation' && (
              <Button
                variant="default"
                onClick={handleAnnotationComplete}
                className="bg-green-600 hover:bg-green-700"
              >
                <Check className="h-4 w-4 mr-2" />
                Done
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
