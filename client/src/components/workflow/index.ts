/**
 * Workflow Components Index
 *
 * Export all workflow-related components
 */

// Wizard and Photo Capture
export { WorkflowWizard } from "./workflow-wizard";
export type { WizardData, WizardPropertyInfo, WizardAffectedAreas, WizardRoom, WizardSafetyInfo, WizardHomeownerInput } from "./workflow-wizard";

export { PhotoCapture, CompactPhotoCapture } from "./photo-capture";
export type { CapturedPhoto } from "./photo-capture";

// Step Completion
export { StepCompletionDialog } from "./step-completion-dialog";
export type { StepData, StepCompletionData } from "./step-completion-dialog";

// Voice Input
export { VoiceInput, VoiceButton } from "./voice-input";

// Sync Status
export { SyncStatus, CompactSyncIndicator } from "./sync-status";

// Findings Templates
export { FindingsTemplates, SeverityQuickSelect } from "./findings-templates";
