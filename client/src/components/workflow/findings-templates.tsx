/**
 * Findings Templates
 *
 * Quick-action templates for common damage findings.
 * Speeds up data entry for field adjusters.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Cloud,
  Wind,
  Droplets,
  Flame,
  Check,
  ThumbsUp,
  AlertTriangle,
} from "lucide-react";

// Template categories and their templates
const TEMPLATES = {
  hail: {
    label: "Hail",
    icon: <Cloud className="h-4 w-4" />,
    color: "text-blue-600",
    templates: [
      {
        label: "Hail impacts found",
        text: "Multiple hail impacts observed in test square. Impacts show characteristic round indentations with granule displacement. Impact pattern consistent with date of loss storm event.",
      },
      {
        label: "Soft metal damage",
        text: "Hail impacts observed on soft metal components including gutters, downspouts, and HVAC unit. Dents range from dime to quarter size. Pattern indicates downward trajectory consistent with hail.",
      },
      {
        label: "No hail damage",
        text: "No hail impacts observed in test squares. Shingles show normal weathering patterns consistent with age. No collateral damage found on soft metals.",
      },
      {
        label: "Granule loss",
        text: "Significant granule loss observed at impact sites. Base mat exposed in several locations. Granule accumulation visible in gutters consistent with recent damage.",
      },
      {
        label: "Bruising on shingles",
        text: "Soft spots (bruising) detected when walking roof. Impact sites compress under pressure indicating mat damage. Multiple bruises found within test squares.",
      },
    ],
  },
  wind: {
    label: "Wind",
    icon: <Wind className="h-4 w-4" />,
    color: "text-gray-600",
    templates: [
      {
        label: "Shingle creasing",
        text: "Creasing observed along shingle edges consistent with wind uplift. Affected area shows directional pattern matching reported storm direction. Seal strips have released.",
      },
      {
        label: "Missing shingles",
        text: "Shingles missing from affected area. Exposed felt paper and nails visible. Debris pattern on ground indicates wind direction. Missing material not located on property.",
      },
      {
        label: "Lifted flashing",
        text: "Flashing lifted at transition points. Gap visible allowing water intrusion potential. Sealant has failed. Recommend replacement to prevent further damage.",
      },
      {
        label: "No wind damage",
        text: "No evidence of wind damage observed. Shingles properly sealed with no creasing or lifting. All flashing intact and properly secured.",
      },
      {
        label: "Fence/outbuilding damage",
        text: "Wind damage to fence/outbuilding. Sections pushed over in direction consistent with storm. Posts intact but panels separated. Structure is not salvageable.",
      },
    ],
  },
  water: {
    label: "Water",
    icon: <Droplets className="h-4 w-4" />,
    color: "text-cyan-600",
    templates: [
      {
        label: "Active leak",
        text: "Active water intrusion observed. Water actively dripping from ceiling. Source appears to be roof penetration. Immediate mitigation recommended.",
      },
      {
        label: "Moisture readings elevated",
        text: "Moisture meter readings elevated beyond normal range. Drywall reading XX%, baseboards XX%. Pattern indicates water travel from source. Drying required.",
      },
      {
        label: "Staining patterns",
        text: "Water staining visible on ceiling/walls. Stain measures approximately X inches x X inches. Rings indicate multiple wetting events. No active moisture detected currently.",
      },
      {
        label: "Mold present",
        text: "Visible mold growth observed on affected surfaces. Approximately XX square feet affected. Recommend mold remediation protocol. Photos document extent.",
      },
      {
        label: "No water damage",
        text: "No evidence of water intrusion. Moisture readings within normal range (< 15%). No staining or discoloration observed on ceilings or walls.",
      },
    ],
  },
  fire: {
    label: "Fire",
    icon: <Flame className="h-4 w-4" />,
    color: "text-orange-600",
    templates: [
      {
        label: "Char damage",
        text: "Char damage observed on affected materials. Char depth measures XX inches at deepest point. Material is structural/non-structural. Replacement required.",
      },
      {
        label: "Smoke damage",
        text: "Smoke residue visible on surfaces. Smoke line observed at approximately X feet from floor. Soot deposits present on contents. Cleaning/sealing required.",
      },
      {
        label: "Heat damage",
        text: "Heat damage observed without direct flame contact. Materials show discoloration and warping. Melting visible on plastic components. Replacement needed.",
      },
      {
        label: "Contents affected",
        text: "Contents in affected area show smoke/soot damage. Items salvageable with professional cleaning. Inventory attached separately. No structural damage to contents area.",
      },
      {
        label: "No smoke/fire damage",
        text: "No evidence of fire or smoke damage in this area. No odor detected. Surfaces clear of soot or discoloration. Area appears unaffected by loss event.",
      },
    ],
  },
  general: {
    label: "General",
    icon: <Check className="h-4 w-4" />,
    color: "text-green-600",
    templates: [
      {
        label: "No damage observed",
        text: "No damage related to this claim observed in this area. Condition consistent with normal wear for age of property. Pre-existing conditions noted separately if applicable.",
      },
      {
        label: "Pre-existing condition",
        text: "Condition observed predates date of loss. Evidence includes: weathering patterns, staining age, material deterioration consistent with long-term exposure. Not related to claimed event.",
      },
      {
        label: "Maintenance issue",
        text: "Observed condition appears to be maintenance-related rather than storm damage. Recommend addressing to prevent future damage. Photos document current state.",
      },
      {
        label: "Unable to access",
        text: "Unable to access this area for inspection due to safety/accessibility concerns. Recommend follow-up inspection with appropriate equipment/personnel.",
      },
      {
        label: "Measurements taken",
        text: "Measurements documented for estimating purposes. Room dimensions: X' x X' x X' ceiling height. Total SF: XXX. Photos attached for reference.",
      },
    ],
  },
};

interface FindingsTemplatesProps {
  peril?: string;
  onSelect: (text: string) => void;
  className?: string;
}

export function FindingsTemplates({
  peril,
  onSelect,
  className,
}: FindingsTemplatesProps) {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    peril?.toLowerCase() || "general"
  );

  // Get categories, prioritizing the claim's peril
  const categories = Object.entries(TEMPLATES);
  if (peril) {
    const perilLower = peril.toLowerCase();
    categories.sort((a, b) => {
      if (a[0] === perilLower) return -1;
      if (b[0] === perilLower) return 1;
      if (a[0] === "general") return 1;
      if (b[0] === "general") return -1;
      return 0;
    });
  }

  const handleSelect = (text: string) => {
    onSelect(text);
    setOpen(false);
  };

  const currentCategory = TEMPLATES[selectedCategory as keyof typeof TEMPLATES];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-1", className)}
        >
          <Sparkles className="h-3 w-3" />
          Quick Findings
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        {/* Category tabs */}
        <div className="flex overflow-x-auto border-b p-1 gap-1">
          {categories.map(([key, category]) => (
            <Button
              key={key}
              variant={selectedCategory === key ? "default" : "ghost"}
              size="sm"
              className="flex-shrink-0 gap-1"
              onClick={() => setSelectedCategory(key)}
            >
              <span className={category.color}>{category.icon}</span>
              {category.label}
            </Button>
          ))}
        </div>

        {/* Templates list */}
        <ScrollArea className="h-64">
          <div className="p-2 space-y-1">
            {currentCategory?.templates.map((template, idx) => (
              <button
                key={idx}
                onClick={() => handleSelect(template.text)}
                className="w-full text-left p-2 rounded-md hover:bg-muted transition-colors"
              >
                <div className="font-medium text-sm">{template.label}</div>
                <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                  {template.text}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Severity quick-select with descriptions
 */
interface SeverityQuickSelectProps {
  value: string | null;
  onChange: (severity: string) => void;
  className?: string;
}

export function SeverityQuickSelect({
  value,
  onChange,
  className,
}: SeverityQuickSelectProps) {
  const severities = [
    {
      value: "none",
      label: "None",
      description: "No damage found",
      icon: <ThumbsUp className="h-4 w-4" />,
      color: "text-green-600 border-green-500 bg-green-50",
    },
    {
      value: "minor",
      label: "Minor",
      description: "Cosmetic, easily repairable",
      icon: <Check className="h-4 w-4" />,
      color: "text-amber-600 border-amber-500 bg-amber-50",
    },
    {
      value: "moderate",
      label: "Moderate",
      description: "Functional impact, repair needed",
      icon: <AlertTriangle className="h-4 w-4" />,
      color: "text-orange-600 border-orange-500 bg-orange-50",
    },
    {
      value: "severe",
      label: "Severe",
      description: "Major damage, replacement likely",
      icon: <AlertTriangle className="h-4 w-4" />,
      color: "text-red-600 border-red-500 bg-red-50",
    },
  ];

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {severities.map((severity) => {
        const isSelected = value === severity.value;
        return (
          <button
            key={severity.value}
            onClick={() => onChange(severity.value)}
            className={cn(
              "flex items-center gap-2 p-2 rounded-lg border-2 transition-colors text-left",
              isSelected ? severity.color : "border-muted hover:border-muted-foreground/30"
            )}
          >
            <span className={isSelected ? "" : "text-muted-foreground"}>
              {severity.icon}
            </span>
            <div>
              <div className="font-medium text-sm">{severity.label}</div>
              <div className="text-xs text-muted-foreground">{severity.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default FindingsTemplates;
