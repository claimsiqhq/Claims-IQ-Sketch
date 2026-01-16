import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DeviceModeProvider } from "@/contexts/DeviceModeContext";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Auth from "@/pages/auth";
import ClaimDetail from "@/pages/claim-detail";
import Settings from "@/pages/settings";
import Profile from "@/pages/profile";
import ClaimsMap from "@/pages/claims-map";
import VoiceSketchPage from "@/features/voice-sketch/VoiceSketchPage";
import Photos from "@/pages/photos";
import Calendar from "@/pages/calendar";
import FlowBuilder from "@/pages/flow-builder";
import FlowProgress from "@/pages/flow-progress";
import MovementExecution from "@/pages/movement-execution";
import ProtectedRoute from "@/components/ProtectedRoute";
import { UploadStatusBar } from "@/components/UploadStatusBar";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={Auth} />
      <Route path="/">
        <ProtectedRoute>
          <Home />
        </ProtectedRoute>
      </Route>
      {/* Redirect /claims to / for backwards compatibility */}
      <Route path="/claims">
        <Redirect to="/" />
      </Route>
      <Route path="/claim/:id">
        <ProtectedRoute>
          <ClaimDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <Settings />
        </ProtectedRoute>
      </Route>
      <Route path="/profile">
        <ProtectedRoute>
          <Profile />
        </ProtectedRoute>
      </Route>
      <Route path="/map">
        <ProtectedRoute>
          <ClaimsMap />
        </ProtectedRoute>
      </Route>
      <Route path="/photos">
        <ProtectedRoute>
          <Photos />
        </ProtectedRoute>
      </Route>
      <Route path="/voice-sketch">
        <ProtectedRoute>
          <VoiceSketchPage />
        </ProtectedRoute>
      </Route>
      <Route path="/voice-sketch/:claimId">
        <ProtectedRoute>
          <VoiceSketchPage />
        </ProtectedRoute>
      </Route>
      <Route path="/calendar">
        <ProtectedRoute>
          <Calendar />
        </ProtectedRoute>
      </Route>
      <Route path="/flow-builder">
        <ProtectedRoute>
          <FlowBuilder />
        </ProtectedRoute>
      </Route>
      <Route path="/flow-builder/:id">
        <ProtectedRoute>
          <FlowBuilder />
        </ProtectedRoute>
      </Route>
      {/* Flow Execution Routes */}
      <Route path="/flows/:flowId">
        <ProtectedRoute>
          <FlowProgress />
        </ProtectedRoute>
      </Route>
      <Route path="/flows/:flowId/movements/:movementId">
        <ProtectedRoute>
          <MovementExecution />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <DeviceModeProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
            <UploadStatusBar />
          </TooltipProvider>
        </DeviceModeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
