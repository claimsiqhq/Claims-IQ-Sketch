/**
 * Voice-Guided Inspection Component
 * 
 * Provides hands-free inspection mode with TTS guidance and voice commands.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mic, MicOff, Volume2, VolumeX, X, CheckCircle2, ArrowLeft, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceGuidedInspectionProps {
  flowInstanceId: string;
  onComplete?: () => void;
  onExit?: () => void;
}

interface VoiceSession {
  sessionId: string;
  currentMovement: string;
  systemContext: string;
}

export function VoiceGuidedInspection({ 
  flowInstanceId, 
  onComplete,
  onExit 
}: VoiceGuidedInspectionProps) {
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentMovement, setCurrentMovement] = useState<any>(null);
  const [lastResponse, setLastResponse] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  
  // Initialize speech recognition and synthesis
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Check for Web Speech API support
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';
        
        recognitionRef.current.onresult = async (event: any) => {
          const transcript = event.results[event.results.length - 1][0].transcript;
          await sendCommand(transcript);
        };
        
        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          setError(`Speech recognition error: ${event.error}`);
        };
      }
      
      if ('speechSynthesis' in window) {
        synthRef.current = window.speechSynthesis;
      }
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);
  
  // Start voice session
  useEffect(() => {
    startSession();
    return () => endSession();
  }, [flowInstanceId]);
  
  const startSession = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/voice-inspection/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ flowInstanceId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to start voice session');
      }
      
      const data = await response.json();
      setSession({
        sessionId: data.sessionId,
        currentMovement: data.currentMovement,
        systemContext: data.systemContext
      });
      
      // Speak initial instructions
      const initialText = data.systemContext.split('CURRENT INSPECTION STATE:')[1]?.split('VOICE COMMANDS')[0] || '';
      if (initialText.trim()) {
        speak(`Voice-guided inspection started. ${initialText.trim()}`);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start voice session');
    } finally {
      setLoading(false);
    }
  };
  
  const endSession = async () => {
    if (session?.sessionId) {
      try {
        await fetch('/api/voice-inspection/end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sessionId: session.sessionId })
        });
      } catch (err) {
        console.error('Failed to end session:', err);
      }
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (synthRef.current) {
      synthRef.current.cancel();
    }
  };
  
  const sendCommand = async (command: string) => {
    if (!session?.sessionId) return;
    
    try {
      const response = await fetch('/api/voice-inspection/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sessionId: session.sessionId, command })
      });
      
      if (!response.ok) {
        throw new Error('Failed to process command');
      }
      
      const result = await response.json();
      setLastResponse(result.response);
      speak(result.response);
      
      if (result.action === 'flow_complete') {
        onComplete?.();
      }
      
      if (result.data?.nextMovement) {
        setCurrentMovement(result.data.nextMovement);
      } else if (result.data?.movement) {
        setCurrentMovement(result.data.movement);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process command');
    }
  };
  
  const speak = (text: string) => {
    if (!synthRef.current) {
      // Fallback: just display text
      setIsSpeaking(false);
      return;
    }
    
    setIsSpeaking(true);
    synthRef.current.cancel(); // Cancel any ongoing speech
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    synthRef.current.speak(utterance);
  };
  
  const toggleListening = () => {
    if (!recognitionRef.current) {
      setError('Speech recognition not supported in this browser');
      return;
    }
    
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };
  
  const handleQuickAction = (command: string) => {
    sendCommand(command);
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Starting voice session...</span>
      </div>
    );
  }
  
  if (!session) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to start voice session. Please try again.</AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className={cn("h-5 w-5", isSpeaking && "text-primary")} />
          <h2 className="text-lg font-semibold">Voice-Guided Inspection</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onExit}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Current Movement Display */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase">Current Step</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">{currentMovement?.name || 'Loading...'}</h3>
              {currentMovement?.description && (
                <p className="text-muted-foreground">{currentMovement.description}</p>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Last Response */}
        {lastResponse && (
          <Alert>
            <Volume2 className="h-4 w-4" />
            <AlertDescription>{lastResponse}</AlertDescription>
          </Alert>
        )}
        
        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      
      {/* Voice Control */}
      <div className="border-t p-6 space-y-6">
        <div className="flex flex-col items-center space-y-4">
          <Button
            size="lg"
            className={cn(
              "h-24 w-24 rounded-full",
              isListening && "bg-destructive hover:bg-destructive/90 animate-pulse"
            )}
            onClick={toggleListening}
            disabled={!recognitionRef.current}
          >
            {isListening ? (
              <Mic className="h-8 w-8" />
            ) : (
              <MicOff className="h-8 w-8" />
            )}
          </Button>
          
          <p className="text-sm text-muted-foreground">
            {isListening ? 'Listening...' : 'Tap to speak'}
          </p>
        </div>
        
        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleQuickAction('complete')}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            Complete
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleQuickAction('skip')}
          >
            Skip
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleQuickAction('repeat')}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Repeat
          </Button>
        </div>
      </div>
    </div>
  );
}
