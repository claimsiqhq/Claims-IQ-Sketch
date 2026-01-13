/**
 * Calendar View Page
 * 
 * Displays a unified calendar view showing both local inspection appointments
 * and MS365 calendar events for the adjuster.
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Link2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useStore } from '@/lib/store';
import {
  getMs365ConnectionStatus,
  syncCalendarFull,
  getCalendarSyncStatus,
  type CalendarSyncStatus,
} from '@/lib/api';
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isSameDay, parseISO } from 'date-fns';

interface Appointment {
  id: string;
  claimId?: string;
  title: string;
  description: string | null;
  location: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  durationMinutes: number;
  status: string;
  ms365EventId: string | null;
  source: 'local' | 'ms365';
}

export default function Calendar() {
  const { toast } = useToast();
  const authUser = useStore((state) => state.authUser);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; configured: boolean } | null>(null);
  const [syncStatus, setSyncStatus] = useState<CalendarSyncStatus | null>(null);

  // Fetch connection status
  const { data: connectionData } = useQuery({
    queryKey: ['ms365-connection-status'],
    queryFn: async () => {
      try {
        return await getMs365ConnectionStatus();
      } catch {
        return { connected: false, configured: false, expiresAt: null };
      }
    },
    staleTime: 60000,
  });

  useEffect(() => {
    if (connectionData) {
      setConnectionStatus(connectionData);
    }
  }, [connectionData]);

  // Fetch sync status
  const { data: syncData } = useQuery({
    queryKey: ['calendar-sync-status'],
    queryFn: async () => {
      try {
        return await getCalendarSyncStatus();
      } catch {
        return null;
      }
    },
    enabled: connectionStatus?.connected === true,
    staleTime: 30000,
  });

  useEffect(() => {
    if (syncData) {
      setSyncStatus(syncData);
    }
  }, [syncData]);

  // Fetch local appointments
  const { data: appointmentsData, isLoading: isLoadingAppointments, refetch: refetchAppointments } = useQuery<{ appointments: Appointment[] }>({
    queryKey: ['calendar-appointments', currentDate, viewMode],
    queryFn: async () => {
      const startDate = getViewStartDate(currentDate, viewMode);
      const endDate = getViewEndDate(currentDate, viewMode);

      const response = await fetch(
        `/api/calendar/appointments?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
        { credentials: 'include' }
      );
      if (!response.ok) {
        return { appointments: [] };
      }
      const data = await response.json();
      return {
        appointments: (data.appointments || []).map((apt: any) => ({
          ...apt,
          source: 'local' as const,
        })),
      };
    },
    staleTime: 60000,
  });

  // Fetch MS365 events if connected
  const { data: ms365EventsData, isLoading: isLoadingMs365 } = useQuery<{ events: any[]; connected: boolean }>({
    queryKey: ['ms365-events', currentDate, viewMode],
    queryFn: async () => {
      const startDate = getViewStartDate(currentDate, viewMode);
      const endDate = getViewEndDate(currentDate, viewMode);

      const response = await fetch(
        `/api/calendar/ms365/events?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
        { credentials: 'include' }
      );
      if (!response.ok) {
        return { events: [], connected: false };
      }
      const data = await response.json();
      return {
        events: (data.events || []).map((event: any) => ({
          id: event.id,
          title: event.subject,
          description: event.bodyPreview,
          location: event.location?.displayName,
          scheduledStart: event.start.dateTime,
          scheduledEnd: event.end.dateTime,
          durationMinutes: calculateDuration(event.start.dateTime, event.end.dateTime),
          status: 'scheduled',
          ms365EventId: event.id,
          source: 'ms365' as const,
        })),
        connected: data.connected || false,
      };
    },
    enabled: connectionStatus?.connected === true,
    staleTime: 60000,
  });

  // Combine appointments and MS365 events
  const allEvents: Appointment[] = useMemo(() => {
    const local = appointmentsData?.appointments || [];
    const ms365 = ms365EventsData?.events || [];
    
    // Merge and deduplicate (prefer local if both exist)
    const eventMap = new Map<string, Appointment>();
    
    // Add MS365 events first
    for (const event of ms365) {
      if (!eventMap.has(event.id)) {
        eventMap.set(event.id, event);
      }
    }
    
    // Add local appointments (they take precedence)
    for (const apt of local) {
      if (apt.ms365EventId) {
        // Replace MS365 event with local appointment
        eventMap.set(apt.ms365EventId, apt);
      } else {
        eventMap.set(apt.id, apt);
      }
    }
    
    return Array.from(eventMap.values()).sort((a, b) => 
      new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime()
    );
  }, [appointmentsData, ms365EventsData]);

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      const startDate = getViewStartDate(currentDate, viewMode);
      const endDate = getViewEndDate(currentDate, viewMode);
      
      const result = await syncCalendarFull(
        startDate.toISOString(),
        endDate.toISOString()
      );

      if (result.success) {
        toast({
          title: 'Sync Complete',
          description: `Synced ${result.pulled} from MS365, pushed ${result.pushed} to MS365, updated ${result.updated}`,
        });
        refetchAppointments();
      } else {
        toast({
          title: 'Sync Failed',
          description: result.errors.join('; ') || 'Sync completed with errors',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Sync Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    if (viewMode === 'day') {
      setCurrentDate(addDays(currentDate, direction === 'next' ? 1 : -1));
    } else if (viewMode === 'week') {
      setCurrentDate(direction === 'next' ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    } else {
      // month view - would need month navigation
      setCurrentDate(direction === 'next' ? addWeeks(currentDate, 4) : subWeeks(currentDate, 4));
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-display">Calendar</h1>
            <p className="text-muted-foreground mt-1">
              View and manage your inspection appointments and MS365 calendar
            </p>
          </div>
          <div className="flex items-center gap-2">
            {connectionStatus?.connected && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync Now
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Connection Status Banner */}
        {connectionStatus && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {connectionStatus.connected ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <div>
                        <p className="font-medium">Connected to Microsoft 365</p>
                        <p className="text-sm text-muted-foreground">
                          {syncStatus?.lastSyncTime
                            ? `Last sync: ${format(parseISO(syncStatus.lastSyncTime), 'PPp')}`
                            : 'Not synced yet'}
                          {syncStatus && syncStatus.pendingSyncs > 0 && (
                            <> • {syncStatus.pendingSyncs} pending</>
                          )}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                      <div>
                        <p className="font-medium">Not Connected</p>
                        <p className="text-sm text-muted-foreground">
                          Connect to Microsoft 365 to sync your calendar
                        </p>
                      </div>
                    </>
                  )}
                </div>
                {!connectionStatus.connected && (
                  <Button
                    variant="outline"
                    onClick={() => window.location.href = '/settings?tab=integrations'}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    Connect
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* View Controls */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'day' | 'week' | 'month')}>
                <TabsList>
                  <TabsTrigger value="day">Day</TabsTrigger>
                  <TabsTrigger value="week">Week</TabsTrigger>
                  <TabsTrigger value="month">Month</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigateDate('prev')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentDate(new Date())}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigateDate('next')}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="text-sm font-medium min-w-[200px] text-center">
                  {format(currentDate, viewMode === 'day' ? 'EEEE, MMMM d, yyyy' : viewMode === 'week' ? 'MMM d - MMM d, yyyy' : 'MMMM yyyy')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendar View */}
        <Card>
          <CardHeader>
            <CardTitle>Appointments</CardTitle>
            <CardDescription>
              {isLoadingAppointments || isLoadingMs365 ? 'Loading...' : `${allEvents.length} event(s)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAppointments || isLoadingMs365 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : allEvents.length === 0 ? (
              <div className="text-center py-12">
                <CalendarIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No appointments scheduled</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function EventCard({ event }: { event: Appointment }) {
  const startTime = parseISO(event.scheduledStart);
  const endTime = parseISO(event.scheduledEnd);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-4">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="flex flex-col items-center">
              <div className="text-sm font-medium">
                {format(startTime, 'h:mm')}
              </div>
              <div className="text-xs text-muted-foreground">
                {format(endTime, 'h:mm a')}
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-foreground truncate">{event.title}</h3>
                {event.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {event.description}
                  </p>
                )}
                {event.location && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-2">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{event.location}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {event.source === 'ms365' && (
                  <Badge variant="outline" className="text-xs">
                    MS365
                  </Badge>
                )}
                {event.ms365EventId && event.source === 'local' && (
                  <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                    Synced
                  </Badge>
                )}
                {event.claimId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.location.href = `/claim/${event.claimId}`}
                  >
                    View Claim
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper functions
function getViewStartDate(date: Date, viewMode: 'day' | 'week' | 'month'): Date {
  if (viewMode === 'day') {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
  } else if (viewMode === 'week') {
    return startOfWeek(date, { weekStartsOn: 0 });
  } else {
    // Month view - first day of month
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }
}

function getViewEndDate(date: Date, viewMode: 'day' | 'week' | 'month'): Date {
  if (viewMode === 'day') {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
  } else if (viewMode === 'week') {
    return endOfWeek(date, { weekStartsOn: 0 });
  } else {
    // Month view - last day of month
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  }
}

function calculateDuration(start: string, end: string): number {
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60));
}
