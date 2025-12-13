// Command History Component
// Shows transcript of voice interactions and executed commands

import React, { useRef, useEffect } from 'react';
import { MessageSquare, User, Bot, Wrench } from 'lucide-react';
import { useGeometryEngine } from '../services/geometry-engine';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CommandHistoryProps {
  className?: string;
}

export function CommandHistory({ className }: CommandHistoryProps) {
  const { transcript, commandHistory } = useGeometryEngine();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, commandHistory]);

  // Merge transcript and commands into a timeline
  const timeline = React.useMemo(() => {
    const items: Array<{
      type: 'transcript' | 'command';
      id: string;
      timestamp: string;
      data: typeof transcript[0] | typeof commandHistory[0];
    }> = [];

    transcript.forEach((entry) => {
      items.push({
        type: 'transcript',
        id: entry.id,
        timestamp: entry.timestamp,
        data: entry,
      });
    });

    commandHistory.forEach((cmd) => {
      items.push({
        type: 'command',
        id: cmd.id,
        timestamp: cmd.timestamp,
        data: cmd,
      });
    });

    // Sort by timestamp
    return items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [transcript, commandHistory]);

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatCommandType = (type: string) => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className={cn('rounded-lg border bg-card flex flex-col h-full', className)}>
      <div className="p-3 border-b bg-muted/50">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Conversation
        </h3>
      </div>

      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-3 space-y-3">
          {timeline.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Start speaking to begin the conversation...
            </div>
          ) : (
            timeline.map((item) => {
              if (item.type === 'transcript') {
                const entry = item.data as typeof transcript[0];
                return (
                  <TranscriptEntry
                    key={item.id}
                    role={entry.role}
                    text={entry.text}
                    timestamp={formatTime(entry.timestamp)}
                  />
                );
              } else {
                const cmd = item.data as typeof commandHistory[0];
                return (
                  <CommandEntry
                    key={item.id}
                    type={formatCommandType(cmd.type)}
                    result={cmd.result}
                    timestamp={formatTime(cmd.timestamp)}
                  />
                );
              }
            })
          )}
        </div>
      </ScrollArea>

      {/* Stats footer */}
      {commandHistory.length > 0 && (
        <div className="p-2 border-t bg-muted/30 text-xs text-muted-foreground flex justify-between">
          <span>{transcript.length} messages</span>
          <span>{commandHistory.length} commands</span>
        </div>
      )}
    </div>
  );
}

interface TranscriptEntryProps {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

function TranscriptEntry({ role, text, timestamp }: TranscriptEntryProps) {
  const isUser = role === 'user';

  return (
    <div
      className={cn(
        'flex gap-2 text-sm',
        isUser ? 'flex-row' : 'flex-row-reverse'
      )}
    >
      <div
        className={cn(
          'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary/10' : 'bg-secondary'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary" />
        ) : (
          <Bot className="h-4 w-4 text-secondary-foreground" />
        )}
      </div>
      <div
        className={cn(
          'flex-1 rounded-lg px-3 py-2',
          isUser
            ? 'bg-primary/10 text-foreground'
            : 'bg-secondary text-secondary-foreground'
        )}
      >
        <p className="break-words">{text}</p>
        <span className="text-[10px] text-muted-foreground mt-1 block">
          {timestamp}
        </span>
      </div>
    </div>
  );
}

interface CommandEntryProps {
  type: string;
  result: string;
  timestamp: string;
}

function CommandEntry({ type, result, timestamp }: CommandEntryProps) {
  return (
    <div className="flex gap-2 text-sm">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
        <Wrench className="h-3.5 w-3.5 text-green-700" />
      </div>
      <div className="flex-1 rounded-lg bg-green-50 px-3 py-2 border border-green-200">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-green-800">{type}</span>
          <span className="text-[10px] text-green-600">{timestamp}</span>
        </div>
        <p className="text-green-700 text-xs mt-1">{result}</p>
      </div>
    </div>
  );
}
