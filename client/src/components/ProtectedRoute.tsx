import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useStore } from '@/lib/store';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isAuthLoading, checkAuth } = useStore();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      setIsRedirecting(true);
      setLocation('/auth');
    }
  }, [isAuthLoading, isAuthenticated, setLocation]);

  // Show loading state while checking auth or redirecting
  if (isAuthLoading || isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">{isRedirecting ? 'Redirecting...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  // Don't render children if not authenticated (show loading instead of blank)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
