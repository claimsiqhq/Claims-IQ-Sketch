// Voice Scope Feature Exports

export { VoiceScopeController } from './components/VoiceScopeController';
export { useVoiceScopeSession } from './hooks/useVoiceScopeSession';
export { useScopeEngine, scopeEngine } from './services/scope-engine';
export { createScopeAgentAsync, tools as scopeTools } from './agents/scope-agent';
export type { ScopeLineItem, ScopeCommand } from './services/scope-engine';
