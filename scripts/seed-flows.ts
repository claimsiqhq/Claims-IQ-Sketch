import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const waterDamageFlow = {
  schema_version: "1.0.0",
  metadata: {
    name: "Water Damage Inspection",
    description: "Comprehensive water damage inspection for Category 1-3 water losses",
    estimated_duration_minutes: 45,
    primary_peril: "water",
    secondary_perils: ["mold", "structural"]
  },
  phases: [
    {
      id: "phase-overview",
      name: "Property Overview",
      description: "Establish context and document overall property condition",
      sequence_order: 1,
      movements: [
        {
          id: "mov-exterior-front",
          name: "Exterior Front",
          description: "Photograph the front of the property showing address if visible",
          sequence_order: 1,
          is_required: true,
          criticality: "high",
          guidance: {
            instruction: "Take a photo of the front of the property with the address visible",
            tts_text: "Please photograph the front of the property. Try to include the address in the shot.",
            tips: [
              "Step back far enough to capture the full structure",
              "Include house number or mailbox if address not on building",
              "This establishes the property for the claim file"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Front exterior showing address",
              is_required: true,
              quantity_min: 1,
              quantity_max: 3,
              taxonomy_prefix: "OV-EXT-FRONT"
            }
          ],
          estimated_minutes: 2
        },
        {
          id: "mov-exterior-sides",
          name: "Exterior Sides & Rear",
          description: "Photograph all sides of the structure",
          sequence_order: 2,
          is_required: true,
          criticality: "medium",
          guidance: {
            instruction: "Walk around the property and photograph all sides",
            tts_text: "Now photograph all sides of the structure. Look for any external water sources.",
            tips: [
              "Check for external water sources: downspouts, grading issues, hose bibs",
              "Note any exterior damage or staining",
              "Document drainage patterns around foundation"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Side and rear exterior views",
              is_required: true,
              quantity_min: 2,
              quantity_max: 6,
              taxonomy_prefix: "OV-EXT-SIDE"
            }
          ],
          estimated_minutes: 3
        },
        {
          id: "mov-water-main",
          name: "Water Main / Shutoff",
          description: "Locate and photograph the main water shutoff",
          sequence_order: 3,
          is_required: false,
          criticality: "low",
          guidance: {
            instruction: "Find and photograph the main water shutoff valve",
            tts_text: "Locate the main water shutoff. Note if water has been turned off.",
            tips: [
              "Usually in basement, crawlspace, or near water heater",
              "Document meter reading if accessible",
              "Note if water is currently on or off"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Water main shutoff location",
              is_required: false,
              quantity_min: 0,
              quantity_max: 2,
              taxonomy_prefix: "WTR-UTIL"
            }
          ],
          estimated_minutes: 2
        }
      ]
    },
    {
      id: "phase-source",
      name: "Source Identification",
      description: "Locate and document the water source",
      sequence_order: 2,
      movements: [
        {
          id: "mov-source-point",
          name: "Source Point",
          description: "Photograph the exact point of water origin",
          sequence_order: 1,
          is_required: true,
          criticality: "high",
          guidance: {
            instruction: "Document the exact source of the water intrusion",
            tts_text: "This is critical. Photograph the exact point where water originated. Get close-up and context shots.",
            tips: [
              "Failed pipe, appliance, roof penetration are common sources",
              "Get both close-up detail and wider context shots",
              "If source is hidden, document the area where it's believed to be",
              "Look for corrosion, breaks, or failure points"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Water source point - close-up",
              is_required: true,
              quantity_min: 2,
              quantity_max: 5,
              taxonomy_prefix: "WTR-SRC"
            }
          ],
          estimated_minutes: 5
        },
        {
          id: "mov-source-cause",
          name: "Cause Documentation",
          description: "Document the cause of failure",
          sequence_order: 2,
          is_required: true,
          criticality: "high",
          guidance: {
            instruction: "Document evidence of what caused the water source to fail",
            tts_text: "What caused the failure? Document any visible cause - corrosion, freeze damage, mechanical failure, age.",
            tips: [
              "Look for corrosion, freeze damage, wear",
              "Document any labels or manufacture dates",
              "Note age of failed component if known",
              "If cause unclear, note that expert evaluation may be needed"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Cause of failure evidence",
              is_required: true,
              quantity_min: 1,
              quantity_max: 4,
              taxonomy_prefix: "WTR-SRC-CAUSE"
            },
            {
              type: "observation",
              description: "Notes on apparent cause",
              is_required: true,
              quantity_min: 1,
              quantity_max: 1
            }
          ],
          estimated_minutes: 3
        },
        {
          id: "mov-source-repair",
          name: "Emergency Repairs",
          description: "Document any emergency repairs already made",
          sequence_order: 3,
          is_required: false,
          criticality: "medium",
          guidance: {
            instruction: "Document any emergency repairs that have been made",
            tts_text: "Has the source been repaired? Document any emergency repairs and get the invoice if available.",
            tips: [
              "Note if plumber has already made repairs",
              "Get plumber's invoice if available",
              "Document any temporary fixes"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Emergency repairs made",
              is_required: false,
              quantity_min: 0,
              quantity_max: 3,
              taxonomy_prefix: "WTR-REPAIR"
            }
          ],
          estimated_minutes: 2
        }
      ]
    },
    {
      id: "phase-affected-areas",
      name: "Affected Areas",
      description: "Document each room/area with water damage",
      sequence_order: 3,
      movements: [
        {
          id: "mov-room-overview",
          name: "Room Overview",
          description: "Photograph the full room showing extent of damage",
          sequence_order: 1,
          is_required: true,
          criticality: "high",
          guidance: {
            instruction: "Photograph the entire room to show the extent of water damage",
            tts_text: "Capture the full room showing all visible water damage. Try to show water lines and affected areas.",
            tips: [
              "Capture all walls if possible in multiple shots",
              "Show water lines and staining clearly",
              "Include transitions between affected and unaffected areas"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Room overview showing damage extent",
              is_required: true,
              quantity_min: 2,
              quantity_max: 4,
              taxonomy_prefix: "WTR-RM-OV"
            }
          ],
          estimated_minutes: 2
        },
        {
          id: "mov-room-dimensions",
          name: "Room Dimensions",
          description: "Capture room measurements",
          sequence_order: 2,
          is_required: true,
          criticality: "high",
          guidance: {
            instruction: "Measure and record the room dimensions",
            tts_text: "Measure the room. I need length, width, and ceiling height if not standard 8 feet.",
            tips: [
              "Measure length and width in feet",
              "Note ceiling height if not standard 8 feet",
              "Mark door and window locations mentally for scope"
            ]
          },
          evidence_requirements: [
            {
              type: "measurement",
              description: "Room length in feet",
              is_required: true,
              quantity_min: 1,
              quantity_max: 1
            },
            {
              type: "measurement",
              description: "Room width in feet",
              is_required: true,
              quantity_min: 1,
              quantity_max: 1
            },
            {
              type: "measurement",
              description: "Ceiling height in feet",
              is_required: false,
              quantity_min: 0,
              quantity_max: 1
            }
          ],
          estimated_minutes: 2
        },
        {
          id: "mov-wall-damage",
          name: "Wall Damage",
          description: "Document damage to each affected wall",
          sequence_order: 3,
          is_required: true,
          criticality: "high",
          guidance: {
            instruction: "Document water damage on walls",
            tts_text: "Document damage to each affected wall. Measure the height of the water line and note the material type.",
            tips: [
              "Measure height of water line from floor",
              "Note wall material: drywall, plaster, paneling",
              "Check and document baseboard damage",
              "Note which walls are affected (north, south, etc.)"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Wall damage with water line visible",
              is_required: true,
              quantity_min: 1,
              quantity_max: 8,
              taxonomy_prefix: "WTR-DMG-WALL"
            },
            {
              type: "measurement",
              description: "Water line height in inches",
              is_required: true,
              quantity_min: 1,
              quantity_max: 1
            }
          ],
          estimated_minutes: 4
        },
        {
          id: "mov-floor-damage",
          name: "Floor Damage",
          description: "Document flooring damage",
          sequence_order: 4,
          is_required: true,
          criticality: "high",
          guidance: {
            instruction: "Document damage to the flooring",
            tts_text: "Document the floor damage. Note the flooring type and look for cupping, buckling, or saturation.",
            tips: [
              "Identify flooring type: carpet, hardwood, tile, LVP, laminate",
              "Look for cupping, buckling, or warping in hard floors",
              "Check carpet saturation - is pad affected?",
              "Note square footage of affected flooring"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Floor damage documentation",
              is_required: true,
              quantity_min: 1,
              quantity_max: 4,
              taxonomy_prefix: "WTR-DMG-FLR"
            },
            {
              type: "observation",
              description: "Flooring type and condition",
              is_required: true,
              quantity_min: 1,
              quantity_max: 1
            }
          ],
          estimated_minutes: 3
        },
        {
          id: "mov-ceiling-damage",
          name: "Ceiling Damage",
          description: "Document any ceiling damage",
          sequence_order: 5,
          is_required: false,
          criticality: "medium",
          guidance: {
            instruction: "Check and document any ceiling damage",
            tts_text: "Look up. Is there any ceiling damage? Staining, sagging, or bubbling paint may indicate damage from above.",
            tips: [
              "Look for staining, sagging, or bubbling",
              "Ceiling damage may indicate leak from above",
              "Note if insulation is visible or wet"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Ceiling damage if present",
              is_required: false,
              quantity_min: 0,
              quantity_max: 4,
              taxonomy_prefix: "WTR-DMG-CEIL"
            }
          ],
          estimated_minutes: 2
        }
      ]
    },
    {
      id: "phase-moisture",
      name: "Moisture Assessment",
      description: "Document moisture levels for drying protocol",
      sequence_order: 4,
      movements: [
        {
          id: "mov-moisture-readings",
          name: "Moisture Readings",
          description: "Take and document moisture meter readings",
          sequence_order: 1,
          is_required: true,
          criticality: "medium",
          guidance: {
            instruction: "Take moisture readings with meter if available",
            tts_text: "If you have a moisture meter, take readings on walls, floors, and cabinets. Compare to a dry reference area.",
            tips: [
              "Use moisture meter on walls, floors, cabinets",
              "Take a dry reference reading for comparison",
              "Document reading locations",
              "Note any readings above normal threshold"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Moisture meter showing reading",
              is_required: false,
              quantity_min: 0,
              quantity_max: 10,
              taxonomy_prefix: "WTR-MOIST"
            },
            {
              type: "measurement",
              description: "Moisture reading percentage",
              is_required: false,
              quantity_min: 0,
              quantity_max: 20
            }
          ],
          estimated_minutes: 5
        },
        {
          id: "mov-mold-check",
          name: "Mold / Microbial Check",
          description: "Visual inspection for mold growth",
          sequence_order: 2,
          is_required: true,
          criticality: "high",
          guidance: {
            instruction: "Visually inspect for any signs of mold growth",
            tts_text: "Check for mold. Look in hidden areas - behind baseboards, under cabinets, near HVAC. Note any visible growth or musty odor.",
            tips: [
              "Check behind baseboards if removed",
              "Look under cabinets and in dark corners",
              "Check HVAC vents and returns",
              "Note any musty odor even if no visible mold"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Visible mold if present",
              is_required: false,
              quantity_min: 0,
              quantity_max: 6,
              taxonomy_prefix: "WTR-MOLD"
            },
            {
              type: "checklist",
              description: "Mold assessment checklist",
              is_required: true,
              quantity_min: 1,
              quantity_max: 1
            }
          ],
          estimated_minutes: 4
        }
      ]
    },
    {
      id: "phase-mitigation",
      name: "Mitigation Status",
      description: "Document emergency services and drying equipment",
      sequence_order: 5,
      movements: [
        {
          id: "mov-mitigation-equipment",
          name: "Drying Equipment",
          description: "Document all mitigation equipment in place",
          sequence_order: 1,
          is_required: false,
          criticality: "medium",
          guidance: {
            instruction: "Document any drying equipment that's been placed",
            tts_text: "Is there mitigation equipment running? Count and photograph air movers, dehumidifiers, and air scrubbers.",
            tips: [
              "Count each type of equipment",
              "Note equipment tags or ID numbers",
              "Document placement locations",
              "Get mitigation company name if present"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Mitigation equipment in place",
              is_required: false,
              quantity_min: 0,
              quantity_max: 10,
              taxonomy_prefix: "WTR-MIT-EQUIP"
            }
          ],
          estimated_minutes: 3
        },
        {
          id: "mov-tearout",
          name: "Completed Tearout",
          description: "Document any demolition already completed",
          sequence_order: 2,
          is_required: false,
          criticality: "medium",
          guidance: {
            instruction: "Document any demo work already done",
            tts_text: "Has any tearout been done? Document removed baseboards, drywall cuts, pulled flooring.",
            tips: [
              "Note height of drywall cuts (typically 2 feet)",
              "Document removed baseboards",
              "Note any cabinet toe kick removal",
              "Document flooring that's been pulled"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Demolition/tearout completed",
              is_required: false,
              quantity_min: 0,
              quantity_max: 8,
              taxonomy_prefix: "WTR-MIT-TEAR"
            }
          ],
          estimated_minutes: 3
        }
      ]
    },
    {
      id: "phase-wrapup",
      name: "Wrap-Up",
      description: "Final documentation and notes",
      sequence_order: 6,
      movements: [
        {
          id: "mov-additional",
          name: "Additional Documentation",
          description: "Capture any additional relevant photos",
          sequence_order: 1,
          is_required: false,
          criticality: "low",
          guidance: {
            instruction: "Capture any other relevant documentation",
            tts_text: "Is there anything else I should document? HVAC system, attic, crawlspace, or anything unusual?",
            tips: [
              "HVAC system if relevant",
              "Attic access if water came from above",
              "Crawlspace if accessible",
              "Any unusual conditions"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Additional documentation",
              is_required: false,
              quantity_min: 0,
              quantity_max: 20,
              taxonomy_prefix: "WTR-MISC"
            }
          ],
          estimated_minutes: 5
        },
        {
          id: "mov-policyholder-notes",
          name: "Policyholder Discussion",
          description: "Document key points from policyholder",
          sequence_order: 2,
          is_required: false,
          criticality: "low",
          guidance: {
            instruction: "Note any important information from the policyholder",
            tts_text: "Make notes of your discussion with the policyholder. Timeline of events, their concerns, any pre-existing conditions.",
            tips: [
              "When did they first notice the water?",
              "What actions did they take?",
              "Any pre-existing conditions to note?",
              "Their primary concerns?"
            ]
          },
          evidence_requirements: [
            {
              type: "observation",
              description: "Policyholder discussion notes",
              is_required: false,
              quantity_min: 0,
              quantity_max: 1
            }
          ],
          estimated_minutes: 3
        }
      ]
    }
  ],
  gates: [
    {
      id: "gate-overview-to-source",
      name: "Overview Complete",
      from_phase: "phase-overview",
      to_phase: "phase-source",
      gate_type: "automatic",
      evaluation_criteria: "All required movements in overview phase completed"
    },
    {
      id: "gate-source-to-affected",
      name: "Source Documented",
      from_phase: "phase-source",
      to_phase: "phase-affected-areas",
      gate_type: "automatic",
      evaluation_criteria: "Source point documented with photos"
    },
    {
      id: "gate-affected-to-moisture",
      name: "Areas Documented",
      from_phase: "phase-affected-areas",
      to_phase: "phase-moisture",
      gate_type: "manual",
      evaluation_criteria: "User confirms all affected rooms have been documented"
    },
    {
      id: "gate-moisture-to-mitigation",
      name: "Moisture Complete",
      from_phase: "phase-moisture",
      to_phase: "phase-mitigation",
      gate_type: "automatic",
      evaluation_criteria: "Moisture and mold assessment completed"
    },
    {
      id: "gate-mitigation-to-wrapup",
      name: "Mitigation Documented",
      from_phase: "phase-mitigation",
      to_phase: "phase-wrapup",
      gate_type: "automatic",
      evaluation_criteria: "Mitigation status documented or skipped"
    }
  ]
};

const hailWindFlow = {
  schema_version: "1.0.0",
  metadata: {
    name: "Hail & Wind Damage Inspection",
    description: "Comprehensive inspection for hail and wind damage claims",
    estimated_duration_minutes: 60,
    primary_peril: "hail_wind",
    secondary_perils: ["water", "structural"]
  },
  phases: [
    {
      id: "phase-overview",
      name: "Property Overview",
      description: "Establish property context and storm correlation",
      sequence_order: 1,
      movements: [
        {
          id: "mov-property-front",
          name: "Property Front",
          description: "Photograph front of property with address visible",
          sequence_order: 1,
          is_required: true,
          criticality: "high",
          guidance: {
            instruction: "Photograph the front of the property with address visible",
            tts_text: "Start with the front of the property. Get the address in the shot if possible.",
            tips: [
              "Full structure shot",
              "Note roof type visible from ground",
              "Include address or house number"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Front elevation with address",
              is_required: true,
              quantity_min: 1,
              quantity_max: 2,
              taxonomy_prefix: "OV-EXT-FRONT"
            }
          ],
          estimated_minutes: 2
        },
        {
          id: "mov-all-elevations",
          name: "All Elevations",
          description: "Photograph all four sides of the structure",
          sequence_order: 2,
          is_required: true,
          criticality: "high",
          guidance: {
            instruction: "Walk around and photograph all sides of the structure",
            tts_text: "Photograph all four sides of the property. Note which direction faced the storm.",
            tips: [
              "Note compass direction of each side",
              "Document any visible exterior damage",
              "Show relationship to neighboring structures"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "All four elevations",
              is_required: true,
              quantity_min: 4,
              quantity_max: 8,
              taxonomy_prefix: "OV-EXT-SIDE"
            }
          ],
          estimated_minutes: 4
        },
        {
          id: "mov-soft-metals",
          name: "Soft Metal Test",
          description: "Photograph soft metal damage indicators",
          sequence_order: 3,
          is_required: true,
          criticality: "high",
          guidance: {
            instruction: "Document hail damage on soft metals around the property",
            tts_text: "Check soft metals for hail damage. AC unit, mailbox, light fixtures, downspouts, and vents. These confirm hail size.",
            tips: [
              "AC unit fins and coils are great indicators",
              "Check mailbox top surface",
              "Garage door panels",
              "Soft metal vents on roof if visible",
              "Downspout dents"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Soft metal hail indicators",
              is_required: true,
              quantity_min: 2,
              quantity_max: 8,
              taxonomy_prefix: "HAIL-SOFT-METAL"
            }
          ],
          estimated_minutes: 5
        }
      ]
    },
    {
      id: "phase-roof",
      name: "Roof Inspection",
      description: "Systematic roof surface inspection",
      sequence_order: 2,
      movements: [
        {
          id: "mov-roof-access",
          name: "Roof Access",
          description: "Document roof access method",
          sequence_order: 1,
          is_required: true,
          criticality: "medium",
          guidance: {
            instruction: "Document how you're accessing the roof",
            tts_text: "Document your roof access method. Ladder, drone, or ground-only inspection.",
            tips: [
              "Photo of ladder placement",
              "Note any safety concerns",
              "If ground-only, note why roof access wasn't possible"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Roof access method",
              is_required: true,
              quantity_min: 1,
              quantity_max: 2,
              taxonomy_prefix: "RF-ACCESS"
            }
          ],
          estimated_minutes: 2
        },
        {
          id: "mov-roof-overview",
          name: "Roof Overview",
          description: "Photograph overall roof from multiple angles",
          sequence_order: 2,
          is_required: true,
          criticality: "high",
          guidance: {
            instruction: "Get overview shots of the entire roof",
            tts_text: "Photograph the overall roof from multiple angles. Show all roof planes, material type, and general condition.",
            tips: [
              "Capture all roof planes/slopes",
              "Document material type and approximate age",
              "Show ridges, hips, and valleys",
              "Note any previous repairs visible"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Roof overview all planes",
              is_required: true,
              quantity_min: 4,
              quantity_max: 10,
              taxonomy_prefix: "RF-OV"
            }
          ],
          estimated_minutes: 5
        },
        {
          id: "mov-hail-damage",
          name: "Hail Impact Damage",
          description: "Document hail strikes on roofing material",
          sequence_order: 3,
          is_required: true,
          criticality: "high",
          guidance: {
            instruction: "Document hail impact damage on the roof",
            tts_text: "Document hail strikes. Get close-ups of impacts. Use chalk circles if needed. Note pattern and density.",
            tips: [
              "Close-up of individual impacts",
              "Use chalk circle method to highlight",
              "Show impact pattern and density",
              "Compare front slope to back slope",
              "Do test square if carrier requires"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Hail impact damage",
              is_required: true,
              quantity_min: 5,
              quantity_max: 30,
              taxonomy_prefix: "RF-HAIL-DMG"
            }
          ],
          estimated_minutes: 10
        },
        {
          id: "mov-wind-damage",
          name: "Wind Damage",
          description: "Document wind-related damage",
          sequence_order: 4,
          is_required: true,
          criticality: "high",
          guidance: {
            instruction: "Document any wind damage to the roof",
            tts_text: "Look for wind damage. Lifted shingles, creased shingles, missing shingles, or exposed felt.",
            tips: [
              "Check edges and ridges for lifting",
              "Look for creasing at seal lines",
              "Document missing shingles",
              "Note exposed felt or underlayment"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Wind damage documentation",
              is_required: false,
              quantity_min: 0,
              quantity_max: 20,
              taxonomy_prefix: "RF-WIND-DMG"
            }
          ],
          estimated_minutes: 5
        },
        {
          id: "mov-penetrations",
          name: "Roof Penetrations",
          description: "Document all roof penetrations",
          sequence_order: 5,
          is_required: true,
          criticality: "medium",
          guidance: {
            instruction: "Document all roof penetrations and their condition",
            tts_text: "Check all roof penetrations. Vents, pipes, skylights, chimney. These are common leak points.",
            tips: [
              "Plumbing vents and pipe boots",
              "Ridge vents and box vents",
              "Skylights and their flashing",
              "Chimney flashing",
              "Check for hail damage on metal components"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Roof penetrations",
              is_required: true,
              quantity_min: 3,
              quantity_max: 12,
              taxonomy_prefix: "RF-VENT"
            }
          ],
          estimated_minutes: 5
        },
        {
          id: "mov-roof-measurements",
          name: "Roof Measurements",
          description: "Document roof dimensions",
          sequence_order: 6,
          is_required: true,
          criticality: "high",
          guidance: {
            instruction: "Capture roof measurements or estimation",
            tts_text: "Measure or estimate the roof. Total squares, pitch, and complexity.",
            tips: [
              "Measure main planes if possible",
              "Note pitch (4/12, 6/12, etc.)",
              "Count stories from ground",
              "Can use satellite estimation for verification"
            ]
          },
          evidence_requirements: [
            {
              type: "measurement",
              description: "Total roof squares",
              is_required: true,
              quantity_min: 1,
              quantity_max: 1
            },
            {
              type: "measurement",
              description: "Roof pitch",
              is_required: true,
              quantity_min: 1,
              quantity_max: 1
            },
            {
              type: "measurement",
              description: "Number of stories",
              is_required: true,
              quantity_min: 1,
              quantity_max: 1
            }
          ],
          estimated_minutes: 5
        }
      ]
    },
    {
      id: "phase-exterior",
      name: "Exterior Components",
      description: "Document collateral exterior damage",
      sequence_order: 3,
      movements: [
        {
          id: "mov-gutters",
          name: "Gutter Damage",
          description: "Document gutter and downspout damage",
          sequence_order: 1,
          is_required: true,
          criticality: "medium",
          guidance: {
            instruction: "Document damage to gutters and downspouts",
            tts_text: "Check gutters and downspouts. Look for dents, seam splits, loose hangers.",
            tips: [
              "Dents on horizontal runs",
              "Seam separations",
              "Pulled or damaged hangers",
              "Downspout damage",
              "Measure linear feet affected"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Gutter damage",
              is_required: false,
              quantity_min: 0,
              quantity_max: 12,
              taxonomy_prefix: "EXT-GUTTER"
            }
          ],
          estimated_minutes: 4
        },
        {
          id: "mov-siding",
          name: "Siding Damage",
          description: "Document siding damage",
          sequence_order: 2,
          is_required: true,
          criticality: "medium",
          guidance: {
            instruction: "Document damage to siding",
            tts_text: "Check all siding. Note the type - vinyl, aluminum, wood, fiber cement, stucco. Document hits, cracks, holes.",
            tips: [
              "Identify siding type first",
              "Vinyl may crack, aluminum will dent",
              "Check all exposures, especially storm-facing",
              "Document height of damage for accessibility"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Siding damage",
              is_required: false,
              quantity_min: 0,
              quantity_max: 20,
              taxonomy_prefix: "EXT-SIDING"
            }
          ],
          estimated_minutes: 5
        },
        {
          id: "mov-windows",
          name: "Window & Door Damage",
          description: "Document window and door damage",
          sequence_order: 3,
          is_required: true,
          criticality: "medium",
          guidance: {
            instruction: "Check all windows and doors for damage",
            tts_text: "Check windows and doors. Look at screens, glass, frames, and trim.",
            tips: [
              "Window screens often show damage",
              "Check for cracked or broken glass",
              "Inspect frames and trim",
              "Check exterior doors"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Window and door damage",
              is_required: false,
              quantity_min: 0,
              quantity_max: 15,
              taxonomy_prefix: "EXT-WINDOW"
            }
          ],
          estimated_minutes: 4
        }
      ]
    },
    {
      id: "phase-interior",
      name: "Interior Inspection",
      description: "Document interior damage from leaks",
      sequence_order: 4,
      movements: [
        {
          id: "mov-interior-leaks",
          name: "Interior Leak Evidence",
          description: "Document water intrusion from roof damage",
          sequence_order: 1,
          is_required: true,
          criticality: "medium",
          guidance: {
            instruction: "Document any interior water damage from roof leaks",
            tts_text: "Check inside for leak evidence. Ceiling stains, wall stains, wet carpet. Correlate with exterior damage locations.",
            tips: [
              "Check ceilings below damaged roof areas",
              "Look for water stains or active leaks",
              "Check attic if accessible",
              "Correlate interior damage to exterior"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Interior leak evidence",
              is_required: false,
              quantity_min: 0,
              quantity_max: 10,
              taxonomy_prefix: "INT-LEAK"
            }
          ],
          estimated_minutes: 5
        },
        {
          id: "mov-attic",
          name: "Attic Inspection",
          description: "Inspect attic for leak evidence",
          sequence_order: 2,
          is_required: false,
          criticality: "medium",
          guidance: {
            instruction: "Inspect the attic if accessible",
            tts_text: "If you can safely access the attic, check for daylight, water staining on decking, or wet insulation.",
            tips: [
              "Look for daylight through roof",
              "Check decking for water stains",
              "Feel insulation for moisture",
              "Note any active leaks"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Attic condition",
              is_required: false,
              quantity_min: 0,
              quantity_max: 8,
              taxonomy_prefix: "INT-ATTIC"
            }
          ],
          estimated_minutes: 5
        }
      ]
    },
    {
      id: "phase-wrapup",
      name: "Wrap-Up",
      description: "Final documentation",
      sequence_order: 5,
      movements: [
        {
          id: "mov-test-square",
          name: "Test Square",
          description: "Document test square if performed",
          sequence_order: 1,
          is_required: false,
          criticality: "low",
          guidance: {
            instruction: "If required, document a 10x10 test square",
            tts_text: "If you did a test square, document the location and count the hits.",
            tips: [
              "Mark 10x10 foot area",
              "Circle each hit with chalk",
              "Count and document total",
              "Include close-ups of marked hits"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Test square documentation",
              is_required: false,
              quantity_min: 0,
              quantity_max: 5,
              taxonomy_prefix: "RF-TEST-SQ"
            }
          ],
          estimated_minutes: 5
        },
        {
          id: "mov-additional",
          name: "Additional Documentation",
          description: "Any additional relevant photos",
          sequence_order: 2,
          is_required: false,
          criticality: "low",
          guidance: {
            instruction: "Capture any other relevant documentation",
            tts_text: "Anything else to document? Previous repairs, pre-existing conditions, other damage.",
            tips: [
              "Previous patch repairs",
              "Pre-existing conditions",
              "Neighbor damage for pattern",
              "Landscaping damage"
            ]
          },
          evidence_requirements: [
            {
              type: "photo",
              description: "Additional photos",
              is_required: false,
              quantity_min: 0,
              quantity_max: 20,
              taxonomy_prefix: "MISC"
            }
          ],
          estimated_minutes: 3
        }
      ]
    }
  ],
  gates: [
    {
      id: "gate-overview-to-roof",
      name: "Property Documented",
      from_phase: "phase-overview",
      to_phase: "phase-roof",
      gate_type: "automatic",
      evaluation_criteria: "Property overview and soft metals documented"
    },
    {
      id: "gate-roof-to-exterior",
      name: "Roof Complete",
      from_phase: "phase-roof",
      to_phase: "phase-exterior",
      gate_type: "automatic",
      evaluation_criteria: "Roof inspection completed with measurements"
    },
    {
      id: "gate-exterior-to-interior",
      name: "Exterior Complete",
      from_phase: "phase-exterior",
      to_phase: "phase-interior",
      gate_type: "automatic",
      evaluation_criteria: "Exterior components documented"
    },
    {
      id: "gate-interior-to-wrapup",
      name: "Interior Complete",
      from_phase: "phase-interior",
      to_phase: "phase-wrapup",
      gate_type: "automatic",
      evaluation_criteria: "Interior checked for leaks"
    }
  ]
};

async function seedFlows() {
  console.log('Seeding flow definitions...');

  const flows = [
    {
      name: waterDamageFlow.metadata.name,
      description: waterDamageFlow.metadata.description,
      peril_type: waterDamageFlow.metadata.primary_peril,
      property_type: 'residential',
      flow_json: waterDamageFlow,
      version: 1,
      is_active: true,
    },
    {
      name: hailWindFlow.metadata.name,
      description: hailWindFlow.metadata.description,
      peril_type: hailWindFlow.metadata.primary_peril,
      property_type: 'residential',
      flow_json: hailWindFlow,
      version: 1,
      is_active: true,
    }
  ];

  for (const flow of flows) {
    // Check if flow already exists
    const { data: existing } = await supabase
      .from('flow_definitions')
      .select('id')
      .eq('name', flow.name)
      .eq('peril_type', flow.peril_type)
      .single();

    if (existing) {
      console.log(`Flow "${flow.name}" already exists, updating...`);
      const { error } = await supabase
        .from('flow_definitions')
        .update({
          description: flow.description,
          flow_json: flow.flow_json,
          version: flow.version,
          is_active: flow.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (error) {
        console.error(`Error updating flow "${flow.name}":`, error);
      } else {
        console.log(`Updated flow: ${flow.name}`);
      }
    } else {
      console.log(`Creating flow "${flow.name}"...`);
      const { error } = await supabase
        .from('flow_definitions')
        .insert(flow);

      if (error) {
        console.error(`Error creating flow "${flow.name}":`, error);
      } else {
        console.log(`Created flow: ${flow.name}`);
      }
    }
  }

  console.log('Flow seeding complete!');
}

seedFlows()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
