/**
 * Workflow Generation Wizard
 *
 * Mobile-first, multi-step wizard that gathers context from field adjusters
 * BEFORE generating an AI-powered inspection workflow.
 *
 * Steps:
 * 1. Property Overview - Structure type, stories, features
 * 2. Affected Areas - Which parts of property have damage
 * 3. Rooms Selection - Which rooms need inspection
 * 4. Safety Assessment - Any hazards or concerns
 * 5. Homeowner Input - Their primary concerns
 * 6. Review & Generate - Confirm and create workflow
 */

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Layers,
  AlertTriangle,
  MessageSquare,
  ClipboardCheck,
  Loader2,
  Building2,
  TreePine,
  Car,
  Waves,
  Flame,
  Wind,
  Cloud,
  Zap,
  CheckCircle2,
  X,
  MapPin,
  Shield,
  Camera,
  Ruler,
  HardHat,
  Dog,
  Droplets,
  Plug,
  ThermometerSun,
} from "lucide-react";

// Types for wizard data
export interface WizardPropertyInfo {
  propertyType: "single_family" | "multi_family" | "townhouse" | "condo" | "mobile_home" | "commercial";
  stories: number;
  hasBasement: boolean;
  hasAttic: boolean;
  hasGarage: boolean;
  hasPool: boolean;
  hasOutbuildings: boolean;
  roofType: "shingle" | "tile" | "metal" | "flat" | "other" | "unknown";
  sidingType: "vinyl" | "wood" | "brick" | "stucco" | "stone" | "other" | "unknown";
}

export interface WizardAffectedAreas {
  roof: boolean;
  roofDetails: string;
  exteriorNorth: boolean;
  exteriorSouth: boolean;
  exteriorEast: boolean;
  exteriorWest: boolean;
  exteriorDetails: string;
  interior: boolean;
  basement: boolean;
  attic: boolean;
  garage: boolean;
  otherStructures: boolean;
  otherStructuresDetails: string;
  landscaping: boolean;
}

export interface WizardRoom {
  name: string;
  level: "basement" | "main" | "upper" | "attic";
  hasDamage: boolean;
  damageType: string;
}

export interface WizardSafetyInfo {
  activeLeaks: boolean;
  standingWater: boolean;
  electricalHazard: boolean;
  structuralConcern: boolean;
  moldVisible: boolean;
  gasSmell: boolean;
  animalsConcern: boolean;
  accessIssues: boolean;
  safetyNotes: string;
  powerStatus: "on" | "off" | "partial" | "unknown";
  waterStatus: "on" | "off" | "unknown";
}

export interface WizardHomeownerInput {
  primaryConcern: string;
  previousDamage: boolean;
  previousDamageDetails: string;
  temporaryRepairs: boolean;
  temporaryRepairsDetails: string;
  contentsDamage: boolean;
  additionalNotes: string;
}

export interface WizardData {
  propertyInfo: WizardPropertyInfo;
  affectedAreas: WizardAffectedAreas;
  rooms: WizardRoom[];
  safetyInfo: WizardSafetyInfo;
  homeownerInput: WizardHomeownerInput;
}

interface WorkflowWizardProps {
  claimId: string;
  claimNumber: string;
  primaryPeril: string;
  propertyAddress?: string;
  onComplete: (data: WizardData) => void;
  onCancel: () => void;
  isGenerating?: boolean;
}

const WIZARD_STEPS = [
  { id: "property", title: "Property", icon: Home, description: "Property details" },
  { id: "areas", title: "Damage Areas", icon: MapPin, description: "Affected areas" },
  { id: "rooms", title: "Rooms", icon: Layers, description: "Interior rooms" },
  { id: "safety", title: "Safety", icon: Shield, description: "Safety concerns" },
  { id: "homeowner", title: "Homeowner", icon: MessageSquare, description: "Their concerns" },
  { id: "review", title: "Review", icon: ClipboardCheck, description: "Confirm & generate" },
];

const DEFAULT_ROOMS: WizardRoom[] = [
  { name: "Living Room", level: "main", hasDamage: false, damageType: "" },
  { name: "Kitchen", level: "main", hasDamage: false, damageType: "" },
  { name: "Master Bedroom", level: "main", hasDamage: false, damageType: "" },
  { name: "Master Bathroom", level: "main", hasDamage: false, damageType: "" },
  { name: "Bedroom 2", level: "main", hasDamage: false, damageType: "" },
  { name: "Bathroom 2", level: "main", hasDamage: false, damageType: "" },
  { name: "Dining Room", level: "main", hasDamage: false, damageType: "" },
  { name: "Hallway", level: "main", hasDamage: false, damageType: "" },
  { name: "Laundry Room", level: "main", hasDamage: false, damageType: "" },
  { name: "Garage Interior", level: "main", hasDamage: false, damageType: "" },
];

const COMMON_ROOM_TEMPLATES = {
  basement: [
    { name: "Basement", level: "basement" as const },
    { name: "Basement Bathroom", level: "basement" as const },
    { name: "Basement Bedroom", level: "basement" as const },
    { name: "Utility Room", level: "basement" as const },
  ],
  upper: [
    { name: "Bedroom 3", level: "upper" as const },
    { name: "Bedroom 4", level: "upper" as const },
    { name: "Bathroom 3", level: "upper" as const },
    { name: "Upstairs Hallway", level: "upper" as const },
    { name: "Bonus Room", level: "upper" as const },
  ],
  attic: [
    { name: "Attic Space", level: "attic" as const },
    { name: "Attic Storage", level: "attic" as const },
  ],
};

export function WorkflowWizard({
  claimId,
  claimNumber,
  primaryPeril,
  propertyAddress,
  onComplete,
  onCancel,
  isGenerating = false,
}: WorkflowWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);

  // Initialize wizard data
  const [propertyInfo, setPropertyInfo] = useState<WizardPropertyInfo>({
    propertyType: "single_family",
    stories: 1,
    hasBasement: false,
    hasAttic: false,
    hasGarage: true,
    hasPool: false,
    hasOutbuildings: false,
    roofType: "shingle",
    sidingType: "vinyl",
  });

  const [affectedAreas, setAffectedAreas] = useState<WizardAffectedAreas>({
    roof: primaryPeril === "hail" || primaryPeril === "wind",
    roofDetails: "",
    exteriorNorth: false,
    exteriorSouth: false,
    exteriorEast: false,
    exteriorWest: false,
    exteriorDetails: "",
    interior: primaryPeril === "water" || primaryPeril === "fire",
    basement: false,
    attic: false,
    garage: false,
    otherStructures: false,
    otherStructuresDetails: "",
    landscaping: false,
  });

  const [rooms, setRooms] = useState<WizardRoom[]>(DEFAULT_ROOMS);

  const [safetyInfo, setSafetyInfo] = useState<WizardSafetyInfo>({
    activeLeaks: false,
    standingWater: false,
    electricalHazard: false,
    structuralConcern: false,
    moldVisible: false,
    gasSmell: false,
    animalsConcern: false,
    accessIssues: false,
    safetyNotes: "",
    powerStatus: "on",
    waterStatus: "on",
  });

  const [homeownerInput, setHomeownerInput] = useState<WizardHomeownerInput>({
    primaryConcern: "",
    previousDamage: false,
    previousDamageDetails: "",
    temporaryRepairs: false,
    temporaryRepairsDetails: "",
    contentsDamage: false,
    additionalNotes: "",
  });

  // Navigation
  const canGoNext = currentStep < WIZARD_STEPS.length - 1;
  const canGoPrev = currentStep > 0;
  const isLastStep = currentStep === WIZARD_STEPS.length - 1;

  const handleNext = () => {
    if (canGoNext) setCurrentStep(prev => prev + 1);
  };

  const handlePrev = () => {
    if (canGoPrev) setCurrentStep(prev => prev - 1);
  };

  const handleComplete = () => {
    const data: WizardData = {
      propertyInfo,
      affectedAreas,
      rooms: rooms.filter(r => r.hasDamage),
      safetyInfo,
      homeownerInput,
    };
    onComplete(data);
  };

  // Room management
  const toggleRoom = (index: number) => {
    setRooms(prev => prev.map((room, i) =>
      i === index ? { ...room, hasDamage: !room.hasDamage } : room
    ));
  };

  const addRoomsFromTemplate = (template: typeof COMMON_ROOM_TEMPLATES.basement) => {
    const newRooms = template
      .filter(t => !rooms.some(r => r.name === t.name))
      .map(t => ({ ...t, hasDamage: false, damageType: "" }));
    setRooms(prev => [...prev, ...newRooms]);
  };

  const progressPercent = ((currentStep + 1) / WIZARD_STEPS.length) * 100;

  // Get peril icon
  const getPerilIcon = () => {
    switch (primaryPeril?.toLowerCase()) {
      case "hail": return <Cloud className="h-5 w-5" />;
      case "wind": return <Wind className="h-5 w-5" />;
      case "water": return <Waves className="h-5 w-5" />;
      case "fire": return <Flame className="h-5 w-5" />;
      case "lightning": return <Zap className="h-5 w-5" />;
      default: return <AlertTriangle className="h-5 w-5" />;
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[100dvh] bg-background">
      {/* Header - Fixed */}
      <div className="flex-shrink-0 border-b bg-card px-4 py-3 safe-top">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            <span className="font-semibold">Workflow Wizard</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Close wizard">
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        {/* Claim context */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <Badge variant="outline">{claimNumber}</Badge>
          <Badge variant="secondary" className="flex items-center gap-1">
            {getPerilIcon()}
            {primaryPeril || "Unknown Peril"}
          </Badge>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Step {currentStep + 1} of {WIZARD_STEPS.length}</span>
            <span>{WIZARD_STEPS[currentStep].title}</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {/* Step indicators - horizontal scroll on mobile */}
        <div className="flex gap-1 mt-3 overflow-x-auto pb-1 -mx-1 px-1">
          {WIZARD_STEPS.map((step, idx) => {
            const StepIcon = step.icon;
            const isActive = idx === currentStep;
            const isComplete = idx < currentStep;

            return (
              <button
                key={step.id}
                onClick={() => setCurrentStep(idx)}
                aria-label={`Go to step ${idx + 1}: ${step.title}`}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  "flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive && "bg-primary text-primary-foreground",
                  isComplete && "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
                  !isActive && !isComplete && "bg-muted text-muted-foreground"
                )}
              >
                {isComplete ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <StepIcon className="h-3 w-3" />
                )}
                <span className="hidden sm:inline">{step.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Step 1: Property Overview */}
        {currentStep === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Property Overview</h2>
              <p className="text-sm text-muted-foreground">
                Tell us about the property structure
              </p>
            </div>

            {propertyAddress && (
              <Card className="bg-muted/50">
                <CardContent className="py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{propertyAddress}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Property Type */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Property Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "single_family", label: "Single Family", icon: Home },
                  { value: "multi_family", label: "Multi Family", icon: Building2 },
                  { value: "townhouse", label: "Townhouse", icon: Building2 },
                  { value: "condo", label: "Condo", icon: Building2 },
                  { value: "mobile_home", label: "Mobile Home", icon: Home },
                  { value: "commercial", label: "Commercial", icon: Building2 },
                ].map(type => {
                  const Icon = type.icon;
                  const isSelected = propertyInfo.propertyType === type.value;
                  return (
                    <button
                      key={type.value}
                      onClick={() => setPropertyInfo(prev => ({ ...prev, propertyType: type.value as any }))}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-lg border-2 transition-colors text-left",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-muted hover:border-muted-foreground/30"
                      )}
                    >
                      <Icon className={cn("h-5 w-5", isSelected ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-sm font-medium">{type.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stories */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Number of Stories</Label>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map(num => (
                  <button
                    key={num}
                    onClick={() => setPropertyInfo(prev => ({ ...prev, stories: num }))}
                    className={cn(
                      "flex-1 py-3 rounded-lg border-2 font-semibold transition-colors",
                      propertyInfo.stories === num
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-muted hover:border-muted-foreground/30"
                    )}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Property Features */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Property Features</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "hasBasement", label: "Basement", icon: Layers },
                  { key: "hasAttic", label: "Attic", icon: Home },
                  { key: "hasGarage", label: "Garage", icon: Car },
                  { key: "hasPool", label: "Pool", icon: Waves },
                  { key: "hasOutbuildings", label: "Outbuildings", icon: TreePine },
                ].map(feature => {
                  const Icon = feature.icon;
                  const isChecked = propertyInfo[feature.key as keyof WizardPropertyInfo] as boolean;
                  return (
                    <button
                      key={feature.key}
                      onClick={() => setPropertyInfo(prev => ({
                        ...prev,
                        [feature.key]: !prev[feature.key as keyof WizardPropertyInfo]
                      }))}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-lg border-2 transition-colors",
                        isChecked
                          ? "border-primary bg-primary/5"
                          : "border-muted hover:border-muted-foreground/30"
                      )}
                    >
                      <div className={cn(
                        "h-5 w-5 rounded border-2 flex items-center justify-center",
                        isChecked ? "bg-primary border-primary" : "border-muted-foreground/30"
                      )}>
                        {isChecked && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <Icon className={cn("h-4 w-4", isChecked ? "text-primary" : "text-muted-foreground")} />
                      <span className="text-sm">{feature.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Roof Type */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Roof Type</Label>
              <div className="flex flex-wrap gap-2">
                {["shingle", "tile", "metal", "flat", "other", "unknown"].map(type => (
                  <button
                    key={type}
                    onClick={() => setPropertyInfo(prev => ({ ...prev, roofType: type as any }))}
                    className={cn(
                      "px-4 py-2 rounded-full border-2 text-sm capitalize transition-colors",
                      propertyInfo.roofType === type
                        ? "border-primary bg-primary/5 text-primary font-medium"
                        : "border-muted hover:border-muted-foreground/30"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Siding Type */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Siding Type</Label>
              <div className="flex flex-wrap gap-2">
                {["vinyl", "wood", "brick", "stucco", "stone", "other", "unknown"].map(type => (
                  <button
                    key={type}
                    onClick={() => setPropertyInfo(prev => ({ ...prev, sidingType: type as any }))}
                    className={cn(
                      "px-4 py-2 rounded-full border-2 text-sm capitalize transition-colors",
                      propertyInfo.sidingType === type
                        ? "border-primary bg-primary/5 text-primary font-medium"
                        : "border-muted hover:border-muted-foreground/30"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Affected Areas */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Affected Areas</h2>
              <p className="text-sm text-muted-foreground">
                Select all areas with visible or reported damage
              </p>
            </div>

            {/* Roof */}
            <Card className={cn(affectedAreas.roof && "border-primary")}>
              <CardHeader className="pb-2">
                <button
                  onClick={() => setAffectedAreas(prev => ({ ...prev, roof: !prev.roof }))}
                  className="flex items-center gap-3 w-full text-left"
                >
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center",
                    affectedAreas.roof ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    <Home className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">Roof</CardTitle>
                    <CardDescription className="text-xs">Shingles, flashing, gutters</CardDescription>
                  </div>
                  <div className={cn(
                    "h-6 w-6 rounded-full border-2 flex items-center justify-center",
                    affectedAreas.roof ? "bg-primary border-primary" : "border-muted-foreground/30"
                  )}>
                    {affectedAreas.roof && <CheckCircle2 className="h-4 w-4 text-primary-foreground" />}
                  </div>
                </button>
              </CardHeader>
              {affectedAreas.roof && (
                <CardContent>
                  <Textarea
                    placeholder="Describe roof damage (optional)..."
                    value={affectedAreas.roofDetails}
                    onChange={(e) => setAffectedAreas(prev => ({ ...prev, roofDetails: e.target.value }))}
                    className="min-h-[80px]"
                  />
                </CardContent>
              )}
            </Card>

            {/* Exterior Elevations */}
            <Card className={cn(
              (affectedAreas.exteriorNorth || affectedAreas.exteriorSouth ||
               affectedAreas.exteriorEast || affectedAreas.exteriorWest) && "border-primary"
            )}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center",
                    (affectedAreas.exteriorNorth || affectedAreas.exteriorSouth ||
                     affectedAreas.exteriorEast || affectedAreas.exteriorWest)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}>
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Exterior Elevations</CardTitle>
                    <CardDescription className="text-xs">Siding, windows, doors</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "exteriorNorth", label: "North" },
                    { key: "exteriorSouth", label: "South" },
                    { key: "exteriorEast", label: "East" },
                    { key: "exteriorWest", label: "West" },
                  ].map(dir => {
                    const isChecked = affectedAreas[dir.key as keyof WizardAffectedAreas] as boolean;
                    return (
                      <button
                        key={dir.key}
                        onClick={() => setAffectedAreas(prev => ({
                          ...prev,
                          [dir.key]: !prev[dir.key as keyof WizardAffectedAreas]
                        }))}
                        className={cn(
                          "py-3 rounded-lg border-2 font-medium transition-colors",
                          isChecked
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-muted hover:border-muted-foreground/30"
                        )}
                      >
                        {dir.label}
                      </button>
                    );
                  })}
                </div>
                {(affectedAreas.exteriorNorth || affectedAreas.exteriorSouth ||
                  affectedAreas.exteriorEast || affectedAreas.exteriorWest) && (
                  <Textarea
                    placeholder="Describe exterior damage (optional)..."
                    value={affectedAreas.exteriorDetails}
                    onChange={(e) => setAffectedAreas(prev => ({ ...prev, exteriorDetails: e.target.value }))}
                    className="min-h-[80px]"
                  />
                )}
              </CardContent>
            </Card>

            {/* Other Areas */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: "interior", label: "Interior", icon: Layers, desc: "Rooms inside" },
                { key: "basement", label: "Basement", icon: Layers, desc: "Below grade" },
                { key: "attic", label: "Attic", icon: Home, desc: "Attic space" },
                { key: "garage", label: "Garage", icon: Car, desc: "Attached/detached" },
                { key: "otherStructures", label: "Outbuildings", icon: TreePine, desc: "Shed, fence, etc." },
                { key: "landscaping", label: "Landscaping", icon: TreePine, desc: "Trees, lawn" },
              ].map(area => {
                const Icon = area.icon;
                const isChecked = affectedAreas[area.key as keyof WizardAffectedAreas] as boolean;
                return (
                  <button
                    key={area.key}
                    onClick={() => setAffectedAreas(prev => ({
                      ...prev,
                      [area.key]: !prev[area.key as keyof WizardAffectedAreas]
                    }))}
                    className={cn(
                      "flex flex-col items-center gap-1 p-4 rounded-lg border-2 transition-colors",
                      isChecked
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/30"
                    )}
                  >
                    <Icon className={cn("h-6 w-6", isChecked ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-sm font-medium">{area.label}</span>
                    <span className="text-xs text-muted-foreground">{area.desc}</span>
                  </button>
                );
              })}
            </div>

            {affectedAreas.otherStructures && (
              <Textarea
                placeholder="List other structures with damage..."
                value={affectedAreas.otherStructuresDetails}
                onChange={(e) => setAffectedAreas(prev => ({ ...prev, otherStructuresDetails: e.target.value }))}
                className="min-h-[80px]"
              />
            )}
          </div>
        )}

        {/* Step 3: Rooms Selection */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Interior Rooms</h2>
              <p className="text-sm text-muted-foreground">
                Select rooms that need inspection. Tap to toggle.
              </p>
            </div>

            {/* Quick add buttons */}
            <div className="flex flex-wrap gap-2">
              {propertyInfo.hasBasement && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addRoomsFromTemplate(COMMON_ROOM_TEMPLATES.basement)}
                >
                  + Add Basement Rooms
                </Button>
              )}
              {propertyInfo.stories > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addRoomsFromTemplate(COMMON_ROOM_TEMPLATES.upper)}
                >
                  + Add Upstairs Rooms
                </Button>
              )}
              {propertyInfo.hasAttic && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addRoomsFromTemplate(COMMON_ROOM_TEMPLATES.attic)}
                >
                  + Add Attic Areas
                </Button>
              )}
            </div>

            {/* Room list */}
            <div className="space-y-2">
              {rooms.map((room, index) => (
                <button
                  key={`${room.name}-${index}`}
                  onClick={() => toggleRoom(index)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors text-left",
                    room.hasDamage
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/30"
                  )}
                >
                  <div className={cn(
                    "h-6 w-6 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                    room.hasDamage ? "bg-primary border-primary" : "border-muted-foreground/30"
                  )}>
                    {room.hasDamage && <CheckCircle2 className="h-4 w-4 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium block truncate">{room.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">{room.level} floor</span>
                  </div>
                  {room.hasDamage && (
                    <Badge variant="secondary" className="flex-shrink-0">
                      <Camera className="h-3 w-3 mr-1" />
                      Inspect
                    </Badge>
                  )}
                </button>
              ))}
            </div>

            {/* Summary */}
            <Card className="bg-muted/50">
              <CardContent className="py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Rooms to inspect:</span>
                  <Badge variant="default">{rooms.filter(r => r.hasDamage).length}</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 4: Safety Assessment */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Safety Assessment</h2>
              <p className="text-sm text-muted-foreground">
                Identify any hazards or access concerns
              </p>
            </div>

            {/* Critical Safety */}
            <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-5 w-5" />
                  Critical Hazards
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { key: "electricalHazard", label: "Electrical Hazard", icon: Zap, desc: "Exposed wires, water near electric" },
                  { key: "gasSmell", label: "Gas Smell", icon: Flame, desc: "Natural gas odor detected" },
                  { key: "structuralConcern", label: "Structural Damage", icon: HardHat, desc: "Sagging, collapse risk" },
                ].map(hazard => {
                  const Icon = hazard.icon;
                  const isChecked = safetyInfo[hazard.key as keyof WizardSafetyInfo] as boolean;
                  return (
                    <button
                      key={hazard.key}
                      onClick={() => setSafetyInfo(prev => ({
                        ...prev,
                        [hazard.key]: !prev[hazard.key as keyof WizardSafetyInfo]
                      }))}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors text-left",
                        isChecked
                          ? "border-red-500 bg-red-100 dark:bg-red-900"
                          : "border-red-200 dark:border-red-800 hover:border-red-300"
                      )}
                    >
                      <Icon className={cn("h-5 w-5", isChecked ? "text-red-600" : "text-red-400")} />
                      <div className="flex-1">
                        <span className="font-medium block">{hazard.label}</span>
                        <span className="text-xs text-muted-foreground">{hazard.desc}</span>
                      </div>
                      <div className={cn(
                        "h-6 w-6 rounded-full border-2 flex items-center justify-center",
                        isChecked ? "bg-red-500 border-red-500" : "border-red-300"
                      )}>
                        {isChecked && <CheckCircle2 className="h-4 w-4 text-white" />}
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Water Issues */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Droplets className="h-5 w-5 text-blue-500" />
                  Water Conditions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { key: "activeLeaks", label: "Active Leaks", desc: "Water currently dripping" },
                  { key: "standingWater", label: "Standing Water", desc: "Pooled water present" },
                  { key: "moldVisible", label: "Visible Mold", desc: "Mold growth observed" },
                ].map(issue => {
                  const isChecked = safetyInfo[issue.key as keyof WizardSafetyInfo] as boolean;
                  return (
                    <button
                      key={issue.key}
                      onClick={() => setSafetyInfo(prev => ({
                        ...prev,
                        [issue.key]: !prev[issue.key as keyof WizardSafetyInfo]
                      }))}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors text-left",
                        isChecked
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                          : "border-muted hover:border-muted-foreground/30"
                      )}
                    >
                      <div className="flex-1">
                        <span className="font-medium block">{issue.label}</span>
                        <span className="text-xs text-muted-foreground">{issue.desc}</span>
                      </div>
                      <div className={cn(
                        "h-6 w-6 rounded-full border-2 flex items-center justify-center",
                        isChecked ? "bg-blue-500 border-blue-500" : "border-muted-foreground/30"
                      )}>
                        {isChecked && <CheckCircle2 className="h-4 w-4 text-white" />}
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Utility Status */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Plug className="h-4 w-4" />
                    Power Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {["on", "off", "partial", "unknown"].map(status => (
                    <button
                      key={status}
                      onClick={() => setSafetyInfo(prev => ({ ...prev, powerStatus: status as any }))}
                      className={cn(
                        "w-full py-2 rounded border text-sm capitalize",
                        safetyInfo.powerStatus === status
                          ? "border-primary bg-primary/5 text-primary font-medium"
                          : "border-muted hover:border-muted-foreground/30"
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Droplets className="h-4 w-4" />
                    Water Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {["on", "off", "unknown"].map(status => (
                    <button
                      key={status}
                      onClick={() => setSafetyInfo(prev => ({ ...prev, waterStatus: status as any }))}
                      className={cn(
                        "w-full py-2 rounded border text-sm capitalize",
                        safetyInfo.waterStatus === status
                          ? "border-primary bg-primary/5 text-primary font-medium"
                          : "border-muted hover:border-muted-foreground/30"
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Other Concerns */}
            <div className="space-y-2">
              {[
                { key: "animalsConcern", label: "Animals on Property", icon: Dog },
                { key: "accessIssues", label: "Access Issues", icon: AlertTriangle },
              ].map(concern => {
                const Icon = concern.icon;
                const isChecked = safetyInfo[concern.key as keyof WizardSafetyInfo] as boolean;
                return (
                  <button
                    key={concern.key}
                    onClick={() => setSafetyInfo(prev => ({
                      ...prev,
                      [concern.key]: !prev[concern.key as keyof WizardSafetyInfo]
                    }))}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors text-left",
                      isChecked
                        ? "border-amber-500 bg-amber-50 dark:bg-amber-950"
                        : "border-muted hover:border-muted-foreground/30"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", isChecked ? "text-amber-600" : "text-muted-foreground")} />
                    <span className="font-medium flex-1">{concern.label}</span>
                    <div className={cn(
                      "h-6 w-6 rounded-full border-2 flex items-center justify-center",
                      isChecked ? "bg-amber-500 border-amber-500" : "border-muted-foreground/30"
                    )}>
                      {isChecked && <CheckCircle2 className="h-4 w-4 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Safety Notes */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Additional Safety Notes</Label>
              <Textarea
                placeholder="Any other safety concerns or access notes..."
                value={safetyInfo.safetyNotes}
                onChange={(e) => setSafetyInfo(prev => ({ ...prev, safetyNotes: e.target.value }))}
                className="min-h-[80px]"
              />
            </div>
          </div>
        )}

        {/* Step 5: Homeowner Input */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Homeowner Input</h2>
              <p className="text-sm text-muted-foreground">
                Capture their main concerns and relevant history
              </p>
            </div>

            {/* Primary Concern */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                What is the homeowner's primary concern?
              </Label>
              <Textarea
                placeholder="e.g., 'The ceiling in the master bedroom is leaking and they're worried about mold...'"
                value={homeownerInput.primaryConcern}
                onChange={(e) => setHomeownerInput(prev => ({ ...prev, primaryConcern: e.target.value }))}
                className="min-h-[100px]"
              />
            </div>

            {/* Previous Damage */}
            <Card>
              <CardContent className="py-3">
                <button
                  onClick={() => setHomeownerInput(prev => ({ ...prev, previousDamage: !prev.previousDamage }))}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <div className={cn(
                    "h-6 w-6 rounded border-2 flex items-center justify-center",
                    homeownerInput.previousDamage ? "bg-primary border-primary" : "border-muted-foreground/30"
                  )}>
                    {homeownerInput.previousDamage && <CheckCircle2 className="h-4 w-4 text-primary-foreground" />}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium">Previous Claims or Damage?</span>
                    <span className="text-xs text-muted-foreground block">Prior damage to same areas</span>
                  </div>
                </button>
                {homeownerInput.previousDamage && (
                  <Textarea
                    placeholder="Describe previous damage history..."
                    value={homeownerInput.previousDamageDetails}
                    onChange={(e) => setHomeownerInput(prev => ({ ...prev, previousDamageDetails: e.target.value }))}
                    className="mt-3 min-h-[80px]"
                  />
                )}
              </CardContent>
            </Card>

            {/* Temporary Repairs */}
            <Card>
              <CardContent className="py-3">
                <button
                  onClick={() => setHomeownerInput(prev => ({ ...prev, temporaryRepairs: !prev.temporaryRepairs }))}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <div className={cn(
                    "h-6 w-6 rounded border-2 flex items-center justify-center",
                    homeownerInput.temporaryRepairs ? "bg-primary border-primary" : "border-muted-foreground/30"
                  )}>
                    {homeownerInput.temporaryRepairs && <CheckCircle2 className="h-4 w-4 text-primary-foreground" />}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium">Temporary Repairs Made?</span>
                    <span className="text-xs text-muted-foreground block">Tarps, boards, mitigation</span>
                  </div>
                </button>
                {homeownerInput.temporaryRepairs && (
                  <Textarea
                    placeholder="Describe temporary repairs..."
                    value={homeownerInput.temporaryRepairsDetails}
                    onChange={(e) => setHomeownerInput(prev => ({ ...prev, temporaryRepairsDetails: e.target.value }))}
                    className="mt-3 min-h-[80px]"
                  />
                )}
              </CardContent>
            </Card>

            {/* Contents Damage */}
            <Card>
              <CardContent className="py-3">
                <button
                  onClick={() => setHomeownerInput(prev => ({ ...prev, contentsDamage: !prev.contentsDamage }))}
                  className="w-full flex items-center gap-3 text-left"
                >
                  <div className={cn(
                    "h-6 w-6 rounded border-2 flex items-center justify-center",
                    homeownerInput.contentsDamage ? "bg-primary border-primary" : "border-muted-foreground/30"
                  )}>
                    {homeownerInput.contentsDamage && <CheckCircle2 className="h-4 w-4 text-primary-foreground" />}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium">Contents Damage?</span>
                    <span className="text-xs text-muted-foreground block">Personal property affected</span>
                  </div>
                </button>
              </CardContent>
            </Card>

            {/* Additional Notes */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Additional Notes</Label>
              <Textarea
                placeholder="Any other relevant information from the homeowner..."
                value={homeownerInput.additionalNotes}
                onChange={(e) => setHomeownerInput(prev => ({ ...prev, additionalNotes: e.target.value }))}
                className="min-h-[80px]"
              />
            </div>
          </div>
        )}

        {/* Step 6: Review & Generate */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Review & Generate</h2>
              <p className="text-sm text-muted-foreground">
                Confirm details and generate your inspection workflow
              </p>
            </div>

            {/* Property Summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  Property
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="capitalize">{propertyInfo.propertyType.replace("_", " ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stories:</span>
                  <span>{propertyInfo.stories}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Roof:</span>
                  <span className="capitalize">{propertyInfo.roofType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Features:</span>
                  <span>
                    {[
                      propertyInfo.hasBasement && "Basement",
                      propertyInfo.hasAttic && "Attic",
                      propertyInfo.hasGarage && "Garage",
                    ].filter(Boolean).join(", ") || "None"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Affected Areas Summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Affected Areas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {affectedAreas.roof && <Badge>Roof</Badge>}
                  {affectedAreas.exteriorNorth && <Badge variant="outline">North Exterior</Badge>}
                  {affectedAreas.exteriorSouth && <Badge variant="outline">South Exterior</Badge>}
                  {affectedAreas.exteriorEast && <Badge variant="outline">East Exterior</Badge>}
                  {affectedAreas.exteriorWest && <Badge variant="outline">West Exterior</Badge>}
                  {affectedAreas.interior && <Badge>Interior</Badge>}
                  {affectedAreas.basement && <Badge variant="outline">Basement</Badge>}
                  {affectedAreas.attic && <Badge variant="outline">Attic</Badge>}
                  {affectedAreas.garage && <Badge variant="outline">Garage</Badge>}
                  {affectedAreas.otherStructures && <Badge variant="outline">Other Structures</Badge>}
                </div>
              </CardContent>
            </Card>

            {/* Rooms Summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Rooms to Inspect ({rooms.filter(r => r.hasDamage).length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {rooms.filter(r => r.hasDamage).map((room, i) => (
                    <Badge key={i} variant="secondary">{room.name}</Badge>
                  ))}
                  {rooms.filter(r => r.hasDamage).length === 0 && (
                    <span className="text-sm text-muted-foreground">No rooms selected</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Safety Summary */}
            <Card className={cn(
              (safetyInfo.electricalHazard || safetyInfo.gasSmell || safetyInfo.structuralConcern)
                && "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950"
            )}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Safety
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {safetyInfo.electricalHazard && <Badge variant="destructive">Electrical Hazard</Badge>}
                  {safetyInfo.gasSmell && <Badge variant="destructive">Gas Smell</Badge>}
                  {safetyInfo.structuralConcern && <Badge variant="destructive">Structural</Badge>}
                  {safetyInfo.activeLeaks && <Badge className="bg-blue-500">Active Leaks</Badge>}
                  {safetyInfo.standingWater && <Badge className="bg-blue-500">Standing Water</Badge>}
                  {safetyInfo.moldVisible && <Badge className="bg-amber-500">Mold</Badge>}
                  {!safetyInfo.electricalHazard && !safetyInfo.gasSmell && !safetyInfo.structuralConcern &&
                   !safetyInfo.activeLeaks && !safetyInfo.standingWater && !safetyInfo.moldVisible && (
                    <span className="text-sm text-muted-foreground">No hazards identified</span>
                  )}
                </div>
                <div className="flex gap-4 mt-2 text-sm">
                  <span>Power: <strong className="capitalize">{safetyInfo.powerStatus}</strong></span>
                  <span>Water: <strong className="capitalize">{safetyInfo.waterStatus}</strong></span>
                </div>
              </CardContent>
            </Card>

            {/* Homeowner Concern */}
            {homeownerInput.primaryConcern && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Homeowner's Primary Concern
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm italic">"{homeownerInput.primaryConcern}"</p>
                </CardContent>
              </Card>
            )}

            {/* Generate Button */}
            <Card className="bg-primary/5 border-primary">
              <CardContent className="py-6 text-center">
                <ClipboardCheck className="h-12 w-12 mx-auto mb-3 text-primary" />
                <h3 className="font-semibold mb-1">Ready to Generate</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  AI will create a tailored inspection workflow based on your inputs
                </p>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={handleComplete}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Generating Workflow...
                    </>
                  ) : (
                    <>
                      <ClipboardCheck className="h-5 w-5 mr-2" />
                      Generate Inspection Workflow
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Footer Navigation - Fixed */}
      <div className="flex-shrink-0 border-t bg-card px-4 py-3 safe-bottom">
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handlePrev}
            disabled={!canGoPrev || isGenerating}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          {!isLastStep && (
            <Button
              className="flex-1"
              onClick={handleNext}
              disabled={!canGoNext}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default WorkflowWizard;
