import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Auth from "@/pages/auth";
import ClaimDetail from "@/pages/claim-detail";
import NewClaim from "@/pages/new-claim";
import Settings from "@/pages/settings";
import VoiceSketchPage from "@/features/voice-sketch/VoiceSketchPage";
import ProtectedRoute from "@/components/ProtectedRoute";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={Auth} />
      <Route path="/">
        <ProtectedRoute>
          <Home />
        </ProtectedRoute>
      </Route>
      <Route path="/claim/:id">
        <ProtectedRoute>
          <ClaimDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/new-claim">
        <ProtectedRoute>
          <NewClaim />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute>
          <Settings />
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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
