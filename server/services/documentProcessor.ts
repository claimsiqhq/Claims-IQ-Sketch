import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { inferPeril, type PerilInferenceInput } from './perilNormalizer';
import { Peril, PromptKey } from '../../shared/schema';
import { getSupabaseAdmin } from '../lib/supabase';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { getPromptWithFallback, substituteVariables } from './promptService';
import { recomputeEffectivePolicyIfNeeded } from './effectivePolicyService';

const execAsync = promisify(exec);

// Using user's own OpenAI API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TEMP_DIR = path.join(os.tmpdir(), 'claimsiq-pdf');
const DOCUMENTS_BUCKET = 'documents';

/**
 * Download a file from Supabase Storage to a local temp path
 */
async function downloadFromStorage(storagePath: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  
  // Download file from Supabase Storage
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .download(storagePath);
  
  if (error || !data) {
    throw new Error(`Failed to download from storage: ${error?.message || 'No data returned'}`);
  }
  
  // Create temp directory if needed
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
  
  // Write to temp file
  const ext = path.extname(storagePath) || '.bin';
  const tempPath = path.join(TEMP_DIR, `doc-${Date.now()}${ext}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(tempPath, buffer);
  
  return tempPath;
}

// Coverage details interface
export interface CoverageDetail {
  code: string; // A, B, C, D, E, F
  name: string;
  limit?: string;
  percentage?: string;
  valuationMethod?: string;
  deductible?: string;
}

// Scheduled structure interface
export interface ScheduledStructure {
  description: string;
  value: string;
  articleNumber?: string;
  valuationMethod?: string;
}

// Key amendment structure for endorsements (legacy format)
export interface KeyAmendment {
  provisionAmended: string;
  summaryOfChange: string;
  newLimitOrValue: string | null;
}

// Endorsement detail interface - updated to support detailed extraction
export interface EndorsementDetail {
  formNumber: string;
  name?: string;
  documentTitle?: string;
  appliesToState?: string | null;
  keyAmendments?: KeyAmendment[];
  additionalInfo?: string;
  description?: string; // For backward compatibility
}

// Comprehensive endorsement extraction types (new format)
export interface EndorsementMetadata {
  formCode: string;
  title: string;
  editionDate?: string | null;
  jurisdiction?: string | null;
  pageCount?: number;
  appliesToPolicyForms?: string[];
}

export interface EndorsementModifications {
  definitions?: {
    added?: { term: string; definition: string }[];
    deleted?: string[];
    replaced?: { term: string; newDefinition: string }[];
  };
  coverages?: {
    added?: string[];
    deleted?: string[];
    modified?: { coverage: string; changeType: string; details: string }[];
  };
  perils?: {
    added?: string[];
    deleted?: string[];
    modified?: string[];
  };
  exclusions?: {
    added?: string[];
    deleted?: string[];
    modified?: string[];
  };
  conditions?: {
    added?: string[];
    deleted?: string[];
    modified?: string[];
  };
  lossSettlement?: {
    replacedSections?: { policySection: string; newRule: string }[];
  };
}

export interface EndorsementTable {
  tableType: string;
  appliesWhen?: { coverage?: string[]; peril?: string[] };
  data?: Record<string, any>;
}

export interface ComprehensiveEndorsement {
  endorsementMetadata: EndorsementMetadata;
  modifications: EndorsementModifications;
  tables?: EndorsementTable[];
  rawText: string;
}

// Document type definitions - matches FNOL JSON format
export interface ExtractedClaimData {
  // Claim identifier
  claimId?: string;

  // Policyholder info
  policyholder?: string;
  policyholderSecondary?: string; // Second named insured
  contactPhone?: string;
  contactEmail?: string;
  insuredAddress?: string; // Full insured address
  policyholderAddress?: string; // Primary policyholder mailing address

  // Property address (separate from insured address) - expanded for better parsing
  propertyAddress?: string;
  propertyStreetAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyZipCode?: string;

  // Loss details
  dateOfLoss?: string; // Format: "MM/DD/YYYY@HH:MM AM/PM"
  riskLocation?: string; // Full property address string (legacy)
  causeOfLoss?: string; // Hail, Fire, Water, Wind, etc.
  lossDescription?: string;
  dwellingDamageDescription?: string;
  otherStructureDamageDescription?: string;
  damageLocation?: string; // Interior, Exterior, Both

  // Property details
  yearBuilt?: string;
  yearRoofInstall?: string; // Format: "MM-DD-YYYY" or year
  isWoodRoof?: boolean;
  roofDamageReported?: string; // New field for roof damage status
  numberOfStories?: string; // New field for number of stories

  // Policy info
  policyNumber?: string;
  state?: string;
  carrier?: string;
  lineOfBusiness?: string;
  policyStatus?: string;
  policyInceptionDate?: string;
  claimStatus?: string; // New field for claim status

  // Deductibles
  policyDeductible?: string;
  windHailDeductible?: string;
  windHailDeductiblePercent?: string;

  // Coverages (comprehensive)
  coverages?: CoverageDetail[];
  dwellingLimit?: string; // Coverage A
  otherStructuresLimit?: string; // Coverage B
  personalPropertyLimit?: string; // Coverage C
  lossOfUseLimit?: string; // Coverage D
  liabilityLimit?: string; // Coverage E
  medicalLimit?: string; // Coverage F

  // Scheduled structures (Coverage B - Scheduled)
  scheduledStructures?: ScheduledStructure[];
  unscheduledStructuresLimit?: string;

  // Additional coverages
  additionalCoverages?: {
    name: string;
    limit?: string;
    deductible?: string;
  }[];

  // Endorsements
  endorsementsListed?: string[]; // Simple list of endorsement codes
  endorsementDetails?: EndorsementDetail[]; // Detailed endorsement info
  endorsements?: EndorsementDetail[]; // Raw endorsements array from new prompt (will be merged into endorsementDetails)
  comprehensiveEndorsements?: ComprehensiveEndorsement[]; // New comprehensive format with delta changes

  // Third parties
  mortgagee?: string;
  thirdPartyInterest?: string; // New field for third party interest
  producer?: string;
  producerPhone?: string;
  producerEmail?: string;

  // Assignment info
  reportedBy?: string;
  reportedDate?: string;
  droneEligible?: boolean;
  droneEligibleAtFNOL?: string; // New field for drone eligibility at FNOL

  // Weather and alerts
  weatherData?: string;
  endorsementAlert?: string;

  // Legacy policyDetails for backward compatibility
  policyDetails?: {
    policyNumber?: string;
    state?: string;
    yearRoofInstall?: string;
    windHailDeductible?: string;
    dwellingLimit?: string;
    endorsementsListed?: string[];
  };

  // HO Policy Form structure fields (new)
  documentType?: string;
  formNumber?: string;
  documentTitle?: string;
  baseStructure?: {
    sectionHeadings?: string[];
    definitionOfACV?: string;
  };
  defaultPolicyProvisionSummary?: {
    windHailLossSettlement?: string;
    unoccupiedExclusionPeriod?: string;
  };

  // Raw text (for reference)
  rawText?: string;

  // Full text extraction fields
  pageTexts?: string[];
  fullText?: string;

  // New nested structure fields (from OpenAI response)
  claims?: FNOLClaimExtraction[];

  // Comprehensive policy extraction fields (new format)
  documentMetadata?: {
    documentType?: string;
    policyFormCode?: string;
    policyFormName?: string | null;
    editionDate?: string | null;
    pageCount?: number;
  };
  policyStructure?: {
    tableOfContents?: string[];
    policyStatement?: string;
    agreement?: string;
  };
  definitions?: {
    term: string;
    definition: string;
    subClauses?: string[];
    exceptions?: string[];
  }[];
  sectionI?: {
    propertyCoverage?: {
      coverageA?: { name?: string; covers?: string[]; excludes?: string[] };
      coverageB?: { name?: string; covers?: string[]; excludes?: string[]; specialConditions?: string[] };
      coverageC?: { name?: string; scope?: string; specialLimits?: { propertyType: string; limit: string; conditions?: string }[]; notCovered?: string[] };
      coverageD?: { name?: string; subCoverages?: string[]; timeLimits?: string };
    };
    perils?: { coverageA_B?: string; coverageC?: string[] };
    exclusions?: { global?: string[]; coverageA_B_specific?: string[] };
    additionalCoverages?: { name: string; description?: string; limit?: string; conditions?: string }[];
    conditions?: string[];
    lossSettlement?: {
      dwellingAndStructures?: { basis?: string; repairRequirements?: string; timeLimit?: string; matchingRules?: string };
      roofingSystem?: { definition?: string; hailSettlement?: string; metalRestrictions?: string };
      personalProperty?: { settlementBasis?: string[]; specialHandling?: string };
    };
  };
  sectionII?: {
    liabilityCoverages?: {
      coverageE?: { name?: string; insuringAgreement?: string; dutyToDefend?: boolean };
      coverageF?: { name?: string; insuringAgreement?: string; timeLimit?: string };
    };
    exclusions?: string[];
    additionalCoverages?: { name: string; description?: string; limit?: string }[];
    conditions?: string[];
  };
  generalConditions?: string[];
  rawPageText?: string;
}

// Address component structure
export interface AddressComponents {
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  fullAddress?: string;
}

// FNOL claim extraction structure - matches updated prompt format
export interface FNOLClaimExtraction {
  // New expanded structure from updated prompt
  claimInformation?: {
    claimNumber?: string;
    catastrophe?: {
      isCat?: boolean;
      catCode?: string;
    };
    dateOfLoss?: string;
    claimStatus?: string;
    operatingCompany?: string;
    causeOfLoss?: string;
    lossDescription?: string;
    weatherData?: {
      status?: string;
      message?: string;
    };
    droneEligibleAtFNOL?: boolean | string;
  };
  propertyAddress?: AddressComponents;
  insuredInformation?: {
    policyholderName1?: string;
    policyholderAddress1?: AddressComponents;
    policyholderName2?: string;
    policyholderAddress2?: AddressComponents;
    contactPhone?: string;
    contactMobilePhone?: string;
    contactEmail?: string;
    preferredContactMethod?: string;
    reportedBy?: string;
    reportedByPhone?: string;
    reportedDate?: string;
  };
  propertyDetails?: {
    yearBuilt?: string;
    numberOfStories?: string;
    roof?: {
      roofDamageReported?: string;
      damageScope?: string;
      roofMaterial?: string;
      woodRoof?: boolean;
      yearRoofInstall?: string;
    };
  };
  propertyDamageDetails?: {
    dwellingDamageDescription?: string;
    otherStructuresDamageDescription?: string;
    personalPropertyDamageDescription?: string;
    damagesLocation?: string;
    // Legacy fields for backward compatibility
    roofDamageReported?: string;
    numberOfStories?: string;
    woodRoof?: string;
    yearBuilt?: string;
    yearRoofInstall?: string;
  };
  policyDetails?: {
    policyNumber?: string;
    policyStatus?: string;
    policyType?: string;
    lineOfBusiness?: string;
    inceptionDate?: string;
    legalDescription?: string;
    producer?: {
      name?: string;
      address?: string;
      phone?: string;
      email?: string;
    };
    thirdPartyInterests?: Array<{
      name?: string;
      type?: string;
    }>;
    thirdPartyInterest?: string; // Legacy single field
    deductibles?: {
      policyDeductible?: string;
      windHailDeductible?: string;
    };
  };
  coverages?: Array<{
    coverageName?: string;
    coverageCode?: string;
    limit?: string;
    limitPercentage?: string;
    valuationMethod?: string;
    terms?: string;
  }>;
  endorsementsListed?: Array<{
    formNumber?: string;
    title?: string;
    notes?: string;
  } | string>;
  assignment?: {
    enteredBy?: string;
    enteredDate?: string;
  };
  comments?: string;

  // Legacy structure support (for backward compatibility with old extractions)
  claim?: {
    claimNumber?: string;
    endorsementAlert?: string;
    dateOfLoss?: string;
    policyNumber?: string;
    policyholders?: string;
    status?: string;
    operatingCompany?: string;
  };
  loss?: {
    cause?: string;
    location?: string;
    description?: string;
    weatherData?: string;
    droneEligible?: string;
  };
  insured?: {
    name1?: string;
    name2?: string;
    address?: string;
    mobilePhone?: string;
    primaryPhoneType?: string;
    email?: string;
  };
  propertyDamage?: {
    dwellingDamages?: string;
    roofDamage?: string;
    damages?: string;
    woodRoof?: string;
    roofInstallYear?: string;
    yearBuilt?: string;
  };
  policy?: {
    producer?: {
      name?: string;
      address?: string;
      phone?: string;
      email?: string;
    };
    propertyAddress?: string;
    type?: string;
    status?: string;
    inceptionDate?: string;
    legalDescription?: string;
    thirdPartyInterest?: string;
  };
  deductibles?: Record<string, string>;
  endorsements?: any[];
}

/**
 * Transform FNOL extraction to flat ExtractedClaimData format
 * Supports both the new expanded structure and legacy structure
 */
export function transformFNOLExtractionToFlat(extraction: FNOLClaimExtraction): ExtractedClaimData {
  // Check if this is the new expanded format or legacy format
  const isNewFormat = !!(extraction.claimInformation || extraction.insuredInformation || extraction.propertyDamageDetails || extraction.propertyDetails || extraction.policyDetails);

  if (isNewFormat) {
    // New expanded format
    const claimInfo = extraction.claimInformation || {};
    const propAddr = extraction.propertyAddress || {};
    const insuredInfo = extraction.insuredInformation || {};
    const propDetails = extraction.propertyDetails || {};
    const roofDetails = propDetails.roof || {};
    const propDmg = extraction.propertyDamageDetails || {};
    const polDetails = extraction.policyDetails || {};
    const ded = polDetails.deductibles || {};
    const assign = extraction.assignment || {};

    // Build full address from components if not provided
    const buildFullAddress = (addr: AddressComponents | undefined): string | undefined => {
      if (!addr) return undefined;
      if (addr.fullAddress) return addr.fullAddress;
      const parts = [addr.streetAddress, addr.city, addr.state, addr.zipCode].filter(Boolean);
      return parts.length > 0 ? parts.join(', ') : undefined;
    };

    // Extract third party interests as a formatted string
    const thirdPartyInterestStr = polDetails.thirdPartyInterests && polDetails.thirdPartyInterests.length > 0
      ? polDetails.thirdPartyInterests.map(tp => tp.name + (tp.type ? ` (${tp.type})` : '')).join('; ')
      : polDetails.thirdPartyInterest || undefined;

    // Handle droneEligibleAtFNOL as either boolean or string
    const droneEligible = typeof claimInfo.droneEligibleAtFNOL === 'boolean'
      ? (claimInfo.droneEligibleAtFNOL ? 'Yes' : 'No')
      : claimInfo.droneEligibleAtFNOL || undefined;

    // Handle woodRoof from either propertyDetails.roof or propertyDamageDetails
    const woodRoofValue = roofDetails.woodRoof !== undefined
      ? roofDetails.woodRoof
      : (propDmg.woodRoof ? (propDmg.woodRoof.toLowerCase() === 'yes' || propDmg.woodRoof.toLowerCase() === 'true') : undefined);

    const result: ExtractedClaimData = {
      // Claim Information
      claimId: claimInfo.claimNumber || undefined,
      dateOfLoss: claimInfo.dateOfLoss || undefined,
      claimStatus: claimInfo.claimStatus || undefined,
      carrier: claimInfo.operatingCompany || undefined,
      causeOfLoss: claimInfo.causeOfLoss || undefined,
      lossDescription: claimInfo.lossDescription || undefined,
      droneEligibleAtFNOL: droneEligible,
      weatherData: claimInfo.weatherData?.message || claimInfo.weatherData?.status || undefined,

      // Property Address (expanded) - support both full address and components
      propertyAddress: propAddr.fullAddress || buildFullAddress(propAddr) || undefined,
      propertyStreetAddress: propAddr.streetAddress || undefined,
      propertyCity: propAddr.city || undefined,
      propertyState: propAddr.state || undefined,
      propertyZipCode: propAddr.zipCode || undefined,
      state: propAddr.state || undefined, // Also set top-level state
      riskLocation: propAddr.fullAddress || buildFullAddress(propAddr) || undefined, // Legacy field

      // Insured Information
      policyholder: insuredInfo.policyholderName1 || undefined,
      policyholderSecondary: insuredInfo.policyholderName2 || undefined,
      contactPhone: insuredInfo.contactPhone || insuredInfo.contactMobilePhone || undefined,
      contactEmail: insuredInfo.contactEmail || undefined,
      insuredAddress: insuredInfo.policyholderAddress1?.fullAddress || buildFullAddress(insuredInfo.policyholderAddress1),
      policyholderAddress: insuredInfo.policyholderAddress1?.fullAddress || buildFullAddress(insuredInfo.policyholderAddress1),
      reportedBy: insuredInfo.reportedBy || undefined,
      reportedDate: insuredInfo.reportedDate || undefined,

      // Property Details (from new propertyDetails section)
      yearBuilt: propDetails.yearBuilt || propDmg.yearBuilt || undefined,
      numberOfStories: propDetails.numberOfStories || propDmg.numberOfStories || undefined,

      // Roof Details (from propertyDetails.roof or legacy propertyDamageDetails)
      yearRoofInstall: roofDetails.yearRoofInstall || propDmg.yearRoofInstall || undefined,
      roofDamageReported: roofDetails.roofDamageReported || propDmg.roofDamageReported || undefined,
      isWoodRoof: woodRoofValue,

      // Property Damage Details
      dwellingDamageDescription: propDmg.dwellingDamageDescription || undefined,
      otherStructureDamageDescription: propDmg.otherStructuresDamageDescription || undefined,
      damageLocation: propDmg.damagesLocation || undefined,

      // Policy Details
      policyNumber: polDetails.policyNumber || undefined,
      policyStatus: polDetails.policyStatus || undefined,
      policyInceptionDate: polDetails.inceptionDate || undefined,
      lineOfBusiness: polDetails.lineOfBusiness || polDetails.policyType || undefined,
      producer: polDetails.producer?.name || undefined,
      producerPhone: polDetails.producer?.phone || undefined,
      producerEmail: polDetails.producer?.email || undefined,
      thirdPartyInterest: thirdPartyInterestStr,
      mortgagee: thirdPartyInterestStr,

      // Deductibles
      policyDeductible: ded.policyDeductible || undefined,
      windHailDeductible: ded.windHailDeductible || undefined,

      // Coverages
      coverages: extraction.coverages?.map((cov, index) => ({
        code: cov.coverageCode || String.fromCharCode(65 + index),
        name: cov.coverageName || `Coverage ${String.fromCharCode(65 + index)}`,
        limit: cov.limit || undefined,
        valuationMethod: cov.valuationMethod || undefined,
        percentage: cov.limitPercentage || undefined,
      })) || undefined,

      // Extract dwelling limit from coverages
      dwellingLimit: extraction.coverages?.find(c =>
        (c.coverageName || '').toLowerCase().includes('dwelling') ||
        (c.coverageName || '').toLowerCase().includes('coverage a')
      )?.limit || undefined,

      // Extract other structure limit from coverages
      otherStructuresLimit: extraction.coverages?.find(c =>
        (c.coverageName || '').toLowerCase().includes('other structure') ||
        (c.coverageName || '').toLowerCase().includes('coverage b')
      )?.limit || undefined,

      // Extract personal property limit from coverages
      personalPropertyLimit: extraction.coverages?.find(c =>
        (c.coverageName || '').toLowerCase().includes('personal property') ||
        (c.coverageName || '').toLowerCase().includes('coverage c')
      )?.limit || undefined,

      // Extract loss of use limit from coverages
      lossOfUseLimit: extraction.coverages?.find(c =>
        (c.coverageName || '').toLowerCase().includes('loss of use') ||
        (c.coverageName || '').toLowerCase().includes('coverage d')
      )?.limit || undefined,

      // Endorsements (handle both object and string formats)
      endorsementsListed: extraction.endorsementsListed?.map(e =>
        typeof e === 'string' ? e : (e.formNumber || e.title || '')
      ).filter(Boolean) || undefined,

      endorsementDetails: extraction.endorsementsListed?.filter(e => typeof e !== 'string').map(e => {
        if (typeof e === 'string') return { formNumber: e };
        return {
          formNumber: e.formNumber || '',
          name: e.title,
          additionalInfo: e.notes,
        };
      }) || undefined,
    };

    // Remove undefined values
    Object.keys(result).forEach(key => {
      if ((result as any)[key] === undefined) {
        delete (result as any)[key];
      }
    });

    return result;
  }

  // Legacy format handling
  const cl = extraction.claim || {};
  const loss = extraction.loss || {};
  const ins = extraction.insured || {};
  const propDmg = extraction.propertyDamage || {};
  const pol = extraction.policy || {};
  const ded = extraction.deductibles || {};
  const comments = typeof extraction.comments === 'string' ? {} : (extraction.comments || {});

  const result: ExtractedClaimData = {
    // Claim Information
    claimId: cl.claimNumber || undefined,
    dateOfLoss: cl.dateOfLoss || undefined,
    claimStatus: cl.status || undefined,
    carrier: cl.operatingCompany || undefined,
    causeOfLoss: loss.cause || undefined,
    riskLocation: loss.location || undefined,
    lossDescription: loss.description || undefined,
    droneEligibleAtFNOL: loss.droneEligible || undefined,

    // Insured Information
    policyholder: ins.name1 || cl.policyholders || undefined,
    policyholderSecondary: ins.name2 || undefined,
    contactPhone: ins.mobilePhone || undefined,
    contactEmail: ins.email || undefined,
    insuredAddress: ins.address || undefined,

    // Property Damage Details
    yearBuilt: propDmg.yearBuilt || undefined,
    yearRoofInstall: propDmg.roofInstallYear || undefined,
    roofDamageReported: propDmg.roofDamage || undefined,
    isWoodRoof: propDmg.woodRoof ? (propDmg.woodRoof.toLowerCase() === 'yes' || propDmg.woodRoof.toLowerCase() === 'true') : undefined,
    dwellingDamageDescription: propDmg.dwellingDamages || propDmg.damages || undefined,

    // Policy Details
    policyNumber: cl.policyNumber || undefined,
    policyInceptionDate: pol.inceptionDate || undefined,
    producer: pol.producer?.name || undefined,
    producerPhone: pol.producer?.phone || undefined,
    producerEmail: pol.producer?.email || undefined,
    thirdPartyInterest: pol.thirdPartyInterest || undefined,
    mortgagee: pol.thirdPartyInterest || undefined,
    propertyAddress: pol.propertyAddress || undefined,
    lineOfBusiness: pol.type || undefined,

    // Deductibles
    policyDeductible: ded.policyDeductible || ded.policy || undefined,
    windHailDeductible: ded.windHailDeductible || ded.windHail || undefined,

    // Coverages
    coverages: extraction.coverages?.map((cov: any, index: number) => ({
      code: cov.code || String.fromCharCode(65 + index),
      name: cov.name || cov.coverageName || `Coverage ${String.fromCharCode(65 + index)}`,
      limit: cov.limit || undefined,
      valuationMethod: cov.valuationMethod || undefined,
      percentage: cov.percentage || undefined,
    })) || undefined,

    // Extract dwelling limit from coverages
    dwellingLimit: extraction.coverages?.find((c: any) =>
      (c.name || c.coverageName || '').toLowerCase().includes('dwelling') ||
      (c.name || c.coverageName || '').toLowerCase().includes('coverage a')
    )?.limit || undefined,

    // Endorsements
    endorsementsListed: extraction.endorsements?.map((e: any) => 
      typeof e === 'string' ? e : (e.formNumber || e.name || JSON.stringify(e))
    ) || undefined,

    // Weather data
    weatherData: loss.weatherData || undefined,

    // Endorsement alert
    endorsementAlert: cl.endorsementAlert || undefined,
  };

  // Remove undefined values
  Object.keys(result).forEach(key => {
    if ((result as any)[key] === undefined) {
      delete (result as any)[key];
    }
  });

  return result;
}

/**
 * Transform endorsement extraction to flat ExtractedClaimData
 * Supports both legacy format and new comprehensive delta format
 */
function transformEndorsementExtractionToFlat(response: any): ExtractedClaimData {
  const result: ExtractedClaimData = {
    policyNumber: response.policyNumber || undefined,
    endorsementsListed: response.endorsementsListed || [],
    endorsementDetails: [],
    comprehensiveEndorsements: [],
  };

  // Map endorsements array to endorsementDetails
  if (response.endorsements && Array.isArray(response.endorsements)) {
    // Check if this is the new comprehensive format (has endorsementMetadata)
    const isComprehensiveFormat = response.endorsements.some((e: any) => e.endorsementMetadata);
    
    if (isComprehensiveFormat) {
      // New comprehensive format with delta changes
      result.comprehensiveEndorsements = response.endorsements.map((e: any) => ({
        endorsementMetadata: {
          formCode: e.endorsementMetadata?.formCode || '',
          title: e.endorsementMetadata?.title || '',
          editionDate: e.endorsementMetadata?.editionDate || null,
          jurisdiction: e.endorsementMetadata?.jurisdiction || null,
          pageCount: e.endorsementMetadata?.pageCount || 1,
          appliesToPolicyForms: e.endorsementMetadata?.appliesToPolicyForms || [],
        },
        modifications: e.modifications || {},
        tables: e.tables || [],
        rawText: e.rawText || '',
      }));
      
      // Also populate legacy format for backward compatibility
      result.endorsementDetails = response.endorsements.map((e: any) => ({
        formNumber: e.endorsementMetadata?.formCode || '',
        name: e.endorsementMetadata?.title || '',
        documentTitle: e.endorsementMetadata?.title || '',
        description: '',
        appliesToState: e.endorsementMetadata?.jurisdiction || undefined,
        keyAmendments: [],
        additionalInfo: '',
      }));
      
      // Populate endorsementsListed
      result.endorsementsListed = response.endorsements
        .map((e: any) => e.endorsementMetadata?.formCode)
        .filter(Boolean);
    } else {
      // Legacy format
      result.endorsementDetails = response.endorsements.map((e: any) => ({
        formNumber: e.formNumber || '',
        name: e.documentTitle || e.name || e.title || '',
        documentTitle: e.documentTitle || e.title || '',
        description: e.description || '',
        appliesToState: e.appliesToState || undefined,
        keyAmendments: e.keyAmendments || [],
        additionalInfo: e.additionalInfo || e.notes || '',
      }));
      
      // Also populate endorsementsListed from endorsements if not already set
      if (!result.endorsementsListed || result.endorsementsListed.length === 0) {
        result.endorsementsListed = response.endorsements
          .map((e: any) => e.formNumber)
          .filter(Boolean);
      }
    }
  }

  // Remove undefined values
  Object.keys(result).forEach(key => {
    if ((result as any)[key] === undefined) {
      delete (result as any)[key];
    }
  });

  return result;
}

/**
 * Transform policy extraction to flat ExtractedClaimData
 * Preserves all policy form fields including formNumber, documentTitle, baseStructure, etc.
 */
function transformPolicyExtractionToFlat(response: any): ExtractedClaimData {
  const result: ExtractedClaimData = {
    // Core policyholder info
    policyholder: response.policyholder || undefined,
    policyholderSecondary: response.policyholderSecondary || undefined,
    riskLocation: response.riskLocation || undefined,
    propertyAddress: response.riskLocation || response.propertyAddress || undefined,
    policyNumber: response.policyNumber || undefined,
    state: response.state || undefined,
    carrier: response.carrier || undefined,
    yearRoofInstall: response.yearRoofInstall || undefined,
    policyDeductible: response.policyDeductible || undefined,
    windHailDeductible: response.windHailDeductible || undefined,
    dwellingLimit: response.dwellingLimit || undefined,
    mortgagee: response.mortgagee || undefined,
    
    // Coverages
    coverages: response.coverages?.map((c: any, i: number) => ({
      code: c.code || String.fromCharCode(65 + i),
      name: c.name || c.coverageName || '',
      limit: c.limit || undefined,
      valuationMethod: c.valuationMethod || undefined,
    })) || undefined,
    scheduledStructures: response.scheduledStructures || undefined,
    
    // Endorsements
    endorsementsListed: response.endorsementsListed || [],
    endorsementDetails: response.endorsementDetails?.map((e: any) => ({
      formNumber: e.formNumber || '',
      name: e.name || e.documentTitle || '',
      documentTitle: e.documentTitle || e.name || '',
      additionalInfo: e.additionalInfo || '',
    })) || undefined,
    
    // CRITICAL: Policy form structure fields needed for policy_forms upsert
    documentType: response.documentType || undefined,
    formNumber: response.formNumber || undefined,
    documentTitle: response.documentTitle || undefined,
    baseStructure: response.baseStructure || undefined,
    defaultPolicyProvisionSummary: response.defaultPolicyProvisionSummary || undefined,
    
    // Additional coverage limits if extracted separately
    otherStructuresLimit: response.otherStructuresLimit || undefined,
    personalPropertyLimit: response.personalPropertyLimit || undefined,
    lossOfUseLimit: response.lossOfUseLimit || undefined,
    liabilityLimit: response.liabilityLimit || undefined,
    medicalLimit: response.medicalLimit || undefined,
    unscheduledStructuresLimit: response.unscheduledStructuresLimit || undefined,
    additionalCoverages: response.additionalCoverages || undefined,
    
    // Third party and producer
    thirdPartyInterest: response.thirdPartyInterest || undefined,
    producer: response.producer || undefined,
    producerPhone: response.producerPhone || undefined,
    producerEmail: response.producerEmail || undefined,
    
    // Deductible details if available as percentages
    windHailDeductiblePercent: response.windHailDeductiblePercent || undefined,
    
    // Raw text if provided
    rawText: response.rawText || undefined,
    pageTexts: response.pageTexts || undefined,
    fullText: response.fullText || undefined,
  };

  // Remove undefined values
  Object.keys(result).forEach(key => {
    if ((result as any)[key] === undefined) {
      delete (result as any)[key];
    }
  });

  return result;
}

/**
 * Transform OpenAI response to flat ExtractedClaimData
 */
export function transformOpenAIResponse(response: any): ExtractedClaimData {
  // Handle claims array wrapper (new FNOL prompt returns { "claims": [{ claimInformation, ... }] })
  if (response.claims && Array.isArray(response.claims) && response.claims.length > 0) {
    const claim = response.claims[0];
    // Recursively transform the unwrapped claim
    const transformed = transformOpenAIResponse(claim);
    // Preserve pageText if it exists at root level (for PageExtractionResult)
    if (response.pageText) {
      (transformed as any).pageText = response.pageText;
    }
    return transformed;
  }

  // New expanded prompt structure: claimInformation/propertyAddress/insuredInformation/etc (FNOL)
  if (response.claimInformation || response.insuredInformation || response.propertyDamageDetails || response.propertyDetails) {
    return transformFNOLExtractionToFlat(response as FNOLClaimExtraction);
  }
  
  // Legacy prompt structure: claim/loss/insured/etc at root level (FNOL)
  if (response.claim || response.loss || response.insured || response.propertyDamage || response.policy) {
    return transformFNOLExtractionToFlat(response as FNOLClaimExtraction);
  }

  // Endorsement document structure: has endorsements array with keyAmendments
  if (response.endorsements && Array.isArray(response.endorsements)) {
    return transformEndorsementExtractionToFlat(response);
  }

  // Policy document structure: has policy-specific fields at root level
  if (response.policyholder || response.coverages || response.dwellingLimit || response.scheduledStructures) {
    return transformPolicyExtractionToFlat(response);
  }

  // Return as-is if already flat
  return response as ExtractedClaimData;
}

// Extended result from single page extraction
interface PageExtractionResult extends ExtractedClaimData {
  pageText?: string;
}

/**
 * Process a document and extract claim-relevant data using AI
 */
export async function processDocument(
  documentId: string,
  organizationId: string
): Promise<ExtractedClaimData> {
  // Get document info
  const { data: doc, error: docError } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .eq('organization_id', organizationId)
    .single();

  if (docError || !doc) {
    throw new Error('Document not found');
  }

  // Update status to processing
  await supabaseAdmin
    .from('documents')
    .update({ processing_status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', documentId);

  try {

    let extractedData: ExtractedClaimData = {};

    try {
      // Check if OpenAI is configured
      if (!process.env.OPENAI_API_KEY) {
        console.warn('OpenAI API key not configured, skipping AI extraction');
        extractedData = { rawText: 'AI extraction not available - OPENAI_API_KEY not configured' };
      } else {
        // Download file from Supabase Storage to temp location
        let tempFilePath: string | null = null;
        try {
          console.log(`Downloading document from storage: ${doc.storage_path}`);
          tempFilePath = await downloadFromStorage(doc.storage_path);
          console.log(`Downloaded to temp: ${tempFilePath}`);

          // Process based on document type
          if (doc.mime_type === 'application/pdf') {
            extractedData = await extractFromPDF(tempFilePath, doc.type);
          } else if (doc.mime_type.startsWith('image/')) {
            extractedData = await extractFromImage(tempFilePath, doc.type);
          } else {
            extractedData = { rawText: 'Unsupported file type for extraction' };
          }
        } finally {
          // Clean up temp file
          if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
              fs.unlinkSync(tempFilePath);
            } catch (cleanupErr) {
              console.warn('Failed to cleanup temp file:', tempFilePath);
            }
          }
        }
      }

      // Update document with extracted data including full text
      await supabaseAdmin
        .from('documents')
        .update({
          extracted_data: extractedData,
          full_text: extractedData.fullText || null,
          page_texts: extractedData.pageTexts || [],
          processing_status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);

      // For policy documents, create/update comprehensive policy form extraction
      if (doc.type === 'policy') {
        // Check for new comprehensive extraction format (documentMetadata, sectionI, etc.)
        const hasComprehensiveFormat = extractedData.documentMetadata || extractedData.sectionI || extractedData.definitions;
        
        if (hasComprehensiveFormat) {
          // Save to policy_form_extractions table (new comprehensive format)
          const policyExtraction = {
            organization_id: organizationId,
            claim_id: doc.claim_id || null,
            document_id: documentId,
            document_type: extractedData.documentMetadata?.documentType || 'PolicyForm',
            policy_form_code: extractedData.documentMetadata?.policyFormCode || extractedData.formNumber || null,
            policy_form_name: extractedData.documentMetadata?.policyFormName || extractedData.documentTitle || null,
            edition_date: extractedData.documentMetadata?.editionDate || null,
            page_count: extractedData.documentMetadata?.pageCount || extractedData.pageTexts?.length || null,
            policy_structure: extractedData.policyStructure || {},
            definitions: extractedData.definitions || [],
            section_i: extractedData.sectionI || {},
            section_ii: extractedData.sectionII || {},
            general_conditions: extractedData.generalConditions || [],
            raw_page_text: extractedData.rawPageText || extractedData.fullText || null,
            extraction_model: 'gpt-4.1-2025-04-14',
            extraction_version: '2.0',
            status: 'completed'
          };

          // Check if extraction already exists for this document
          const { data: existingExtractions } = await supabaseAdmin
            .from('policy_form_extractions')
            .select('id')
            .eq('document_id', documentId)
            .limit(1);

          if (existingExtractions && existingExtractions.length > 0) {
            await supabaseAdmin
              .from('policy_form_extractions')
              .update({ ...policyExtraction, updated_at: new Date().toISOString() })
              .eq('id', existingExtractions[0].id);
          } else {
            await supabaseAdmin
              .from('policy_form_extractions')
              .insert(policyExtraction);
          }

          console.log(`[PolicyExtraction] Saved comprehensive extraction for document ${documentId}`);
        }

        // Also maintain backward compatibility with policy_forms table
        if (extractedData.formNumber || extractedData.documentTitle || extractedData.documentMetadata?.policyFormCode) {
          const formNumber = extractedData.formNumber || extractedData.documentMetadata?.policyFormCode || 'UNKNOWN';
          const keyProvisions = {
            sectionHeadings: extractedData.baseStructure?.sectionHeadings || extractedData.policyStructure?.tableOfContents || [],
            definitionOfACV: extractedData.baseStructure?.definitionOfACV || null,
            windHailLossSettlement: extractedData.defaultPolicyProvisionSummary?.windHailLossSettlement || 
              extractedData.sectionI?.lossSettlement?.dwellingAndStructures?.basis || null,
            unoccupiedExclusionPeriod: extractedData.defaultPolicyProvisionSummary?.unoccupiedExclusionPeriod || null,
            definitions: extractedData.definitions || [],
            sectionI: extractedData.sectionI || null,
            sectionII: extractedData.sectionII || null,
          };

          const { data: existingForms } = await supabaseAdmin
            .from('policy_forms')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('claim_id', doc.claim_id)
            .eq('form_number', formNumber)
            .limit(1);

          if (existingForms && existingForms.length > 0) {
            await supabaseAdmin
              .from('policy_forms')
              .update({
                document_title: extractedData.documentTitle || extractedData.documentMetadata?.policyFormName || null,
                key_provisions: keyProvisions,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingForms[0].id);
          } else if (doc.claim_id) {
            await supabaseAdmin
              .from('policy_forms')
              .insert({
                organization_id: organizationId,
                claim_id: doc.claim_id,
                form_type: extractedData.documentType || extractedData.documentMetadata?.documentType || 'Policy Form',
                form_number: formNumber,
                document_title: extractedData.documentTitle || extractedData.documentMetadata?.policyFormName || null,
                key_provisions: keyProvisions
              });
          }
        }

        // Trigger effective policy recomputation when policy forms change
        if (doc.claim_id && organizationId) {
          try {
            await recomputeEffectivePolicyIfNeeded(doc.claim_id, organizationId);
            console.log(`[EffectivePolicy] Triggered recomputation for claim ${doc.claim_id} after policy form extraction`);
          } catch (recomputeError) {
            console.error('[EffectivePolicy] Error triggering recomputation:', recomputeError);
            // Don't fail document processing if policy recomputation fails
          }
        }
      }

      return extractedData;

    } catch (error) {
      // Update status to failed
      await supabaseAdmin
        .from('documents')
        .update({
          processing_status: 'failed',
          extracted_data: { error: (error as Error).message },
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);
      throw error;
    }
  } catch (error) {
    console.error('Document processing error:', error);
    throw error;
  }
}

/**
 * Convert PDF pages to images using pdftoppm command (poppler-utils)
 */
async function convertPdfToImages(pdfPath: string): Promise<string[]> {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const baseName = path.basename(pdfPath, '.pdf').replace(/[^a-zA-Z0-9-_]/g, '_');
  const timestamp = Date.now();
  const outputPrefix = path.join(TEMP_DIR, `${baseName}-${timestamp}`);

  try {
    await execAsync(`pdftoppm -png -r 200 "${pdfPath}" "${outputPrefix}"`);
  } catch (error) {
    console.error('pdftoppm error:', error);
    throw new Error(`PDF conversion failed: ${(error as Error).message}`);
  }

  const files = fs.readdirSync(TEMP_DIR);
  const imageFiles = files
    .filter((f: string) => f.startsWith(`${baseName}-${timestamp}`) && f.endsWith('.png'))
    .sort()
    .map((f: string) => path.join(TEMP_DIR, f));

  return imageFiles;
}

/**
 * Clean up temporary image files
 */
function cleanupTempImages(imagePaths: string[]): void {
  for (const imgPath of imagePaths) {
    try {
      if (fs.existsSync(imgPath)) {
        fs.unlinkSync(imgPath);
      }
    } catch (e) {
      console.warn('Failed to cleanup temp image:', imgPath);
    }
  }
}

/**
 * Get the prompt key for a document type
 */
function getPromptKeyForDocumentType(documentType: string): PromptKey {
  switch (documentType) {
    case 'fnol':
      return PromptKey.DOCUMENT_EXTRACTION_FNOL;
    case 'policy':
      return PromptKey.DOCUMENT_EXTRACTION_POLICY;
    case 'endorsement':
      return PromptKey.DOCUMENT_EXTRACTION_ENDORSEMENT;
    default:
      return PromptKey.DOCUMENT_EXTRACTION_FNOL; // Default to FNOL for unknown types
  }
}

/**
 * Extract data from a single image using Vision API
 * Also extracts the complete page text for full document storage
 */
async function extractFromSingleImage(
  imagePath: string,
  documentType: string,
  pageNum: number,
  totalPages: number
): Promise<PageExtractionResult> {
  const fileBuffer = fs.readFileSync(imagePath);
  const base64 = fileBuffer.toString('base64');

  // Get prompt from database (falls back to hardcoded if not available)
  const promptKey = getPromptKeyForDocumentType(documentType);
  const promptConfig = await getPromptWithFallback(promptKey);

  // Build the user prompt with variable substitution
  const userPromptText = promptConfig.userPromptTemplate
    ? substituteVariables(promptConfig.userPromptTemplate, {
        pageNum: String(pageNum),
        totalPages: String(totalPages),
      })
    : `This is page ${pageNum} of ${totalPages} of a ${documentType} document. Extract all relevant information AND transcribe the complete text from this page. Return ONLY valid JSON with extracted fields and "pageText" containing the full page text.`;

  const response = await openai.chat.completions.create({
    model: promptConfig.model,
    messages: [
      {
        role: 'system',
        content: promptConfig.systemPrompt
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${base64}`,
              detail: 'high'
            }
          },
          {
            type: 'text',
            text: userPromptText
          }
        ]
      }
    ],
    max_tokens: promptConfig.maxTokens || 4000,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return {};
  }

  const parsed = JSON.parse(content);
  // Transform the response to handle new nested claims array format
  return transformOpenAIResponse(parsed) as PageExtractionResult;
}

/**
 * Extract data from a PDF document by converting to images first
 * Collects both structured data and full page text from each page
 */
async function extractFromPDF(
  filePath: string,
  documentType: string
): Promise<ExtractedClaimData> {
  let imagePaths: string[] = [];

  try {
    console.log(`Converting PDF to images: ${filePath}`);
    imagePaths = await convertPdfToImages(filePath);

    if (imagePaths.length === 0) {
      return { rawText: 'No pages could be extracted from PDF' };
    }

    console.log(`Processing ${imagePaths.length} page(s) with Vision API`);

    const pageResults: PageExtractionResult[] = [];
    const pageTexts: string[] = [];
    
    for (let i = 0; i < imagePaths.length; i++) {
      try {
        const pageData = await extractFromSingleImage(
          imagePaths[i],
          documentType,
          i + 1,
          imagePaths.length
        );
        pageResults.push(pageData);
        
        // Collect page text if available
        if (pageData.pageText) {
          pageTexts.push(pageData.pageText);
        }
      } catch (pageError) {
        console.error(`Error processing page ${i + 1}:`, pageError);
        pageTexts.push(`[Error extracting page ${i + 1}]`);
      }
    }

    const merged = mergeExtractedData(...pageResults);
    merged.rawText = `Successfully extracted from ${pageResults.length} page(s)`;
    
    // Add full text extraction results
    merged.pageTexts = pageTexts;
    merged.fullText = pageTexts.join('\n\n--- Page Break ---\n\n');
    
    return merged;

  } catch (error) {
    console.error('PDF extraction error:', error);
    return { rawText: `Extraction failed: ${(error as Error).message}` };
  } finally {
    cleanupTempImages(imagePaths);
  }
}

/**
 * Extract data from an image document
 * Also extracts the complete page text for full document storage
 */
async function extractFromImage(
  filePath: string,
  documentType: string
): Promise<ExtractedClaimData> {
  const fileBuffer = fs.readFileSync(filePath);
  const base64 = fileBuffer.toString('base64');
  const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  const systemPrompt = getExtractionPrompt(documentType);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt + `\n\nADDITIONALLY: Include a "pageText" field in your JSON response containing the complete verbatim text from this document, preserving the original layout as much as possible.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: 'high'
              }
            },
            {
              type: 'text',
              text: `Extract all relevant information AND transcribe the complete text from this ${documentType} document. Return ONLY valid JSON with extracted fields and "pageText" containing the full document text.`
            }
          ]
        }
      ],
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { rawText: 'No content extracted' };
    }

    const parsed = JSON.parse(content);
    // Transform the response to handle new nested claims array format
    const result = transformOpenAIResponse(parsed) as PageExtractionResult;

    // Set full text fields for single image documents
    if (result.pageText) {
      result.pageTexts = [result.pageText];
      result.fullText = result.pageText;
    }

    return result;

  } catch (error) {
    console.error('Image extraction error:', error);
    return { rawText: `Extraction failed: ${(error as Error).message}` };
  }
}

/**
 * Get the appropriate extraction prompt based on document type
 */
function getExtractionPrompt(documentType: string): string {
  switch (documentType) {
    case 'fnol':
      return `You are an expert insurance document analyzer with a specialty in First Notice of Loss (FNOL) reports. Your task is to analyze the provided text/document content, which may contain one or more FNOL reports, and extract all relevant information for each claim into a structured JSON array.

Output Rules:
1. The output MUST be a single JSON array containing one object for each distinct claim found in the source text.
2. Strictly adhere to the field names, hierarchy, and data types specified in the template below.
3. Use the most accurate and complete information directly from the source.
4. For missing data, set the value to null.
5. Date/Time Format: Strictly use "MM/DD/YYYY@HH:MM AM/PM" (e.g., 05/24/2025@1:29 PM).
6. Limit/Currency Format: Preserve the format found in the source (e.g., "$7,932 1%").
7. Address Parsing: Extract property address into separate components (street, city, state, zip).

JSON Template:
{
  "claims": [
    {
      "claimInformation": {
        "claimNumber": "STRING - Full claim number including any CAT/PCS designations",
        "dateOfLoss": "STRING",
        "claimStatus": "STRING",
        "operatingCompany": "STRING",
        "causeOfLoss": "STRING",
        "lossDescription": "STRING",
        "droneEligibleAtFNOL": "STRING"
      },
      "propertyAddress": {
        "streetAddress": "STRING - Street number and name",
        "city": "STRING - City name",
        "state": "STRING - State abbreviation",
        "zipCode": "STRING - ZIP code",
        "fullAddress": "STRING - Complete formatted address"
      },
      "insuredInformation": {
        "policyholderName1": "STRING",
        "policyholderAddress1": { "streetAddress": "STRING", "city": "STRING", "state": "STRING", "zipCode": "STRING" },
        "policyholderName2": "STRING",
        "policyholderAddress2": { "streetAddress": "STRING", "city": "STRING", "state": "STRING", "zipCode": "STRING" },
        "contactPhone": "STRING",
        "contactMobilePhone": "STRING",
        "contactEmail": "STRING",
        "reportedBy": "STRING",
        "reportedByPhone": "STRING",
        "reportedDate": "STRING"
      },
      "propertyDamageDetails": {
        "dwellingDamageDescription": "STRING",
        "roofDamageReported": "STRING",
        "damagesLocation": "STRING",
        "numberOfStories": "STRING",
        "woodRoof": "STRING",
        "yearBuilt": "STRING",
        "yearRoofInstall": "STRING"
      },
      "policyDetails": {
        "policyNumber": "STRING",
        "policyStatus": "STRING",
        "policyType": "STRING",
        "inceptionDate": "STRING",
        "producer": { "name": "STRING", "address": "STRING", "phone": "STRING", "email": "STRING" },
        "legalDescription": "STRING",
        "thirdPartyInterest": "STRING",
        "lineOfBusiness": "STRING",
        "deductibles": { "policyDeductible": "STRING", "windHailDeductible": "STRING" }
      },
      "coverages": [
        { "coverageName": "STRING", "coverageCode": "STRING", "limit": "STRING", "limitPercentage": "STRING", "valuationMethod": "STRING", "terms": "STRING" }
      ],
      "endorsementsListed": [
        { "formNumber": "STRING", "title": "STRING", "notes": "STRING" }
      ],
      "assignment": { "enteredBy": "STRING", "enteredDate": "STRING" },
      "comments": "STRING"
    }
  ]
}`;

    case 'policy':
      return `You are an expert insurance document analyzer. Extract structured data from the document image provided.
Return a JSON object with the following fields (use null for missing values):
{
  "policyholder": "Named insured on the policy",
  "policyholderSecondary": "Second named insured",
  "riskLocation": "Full insured property address",
  "policyNumber": "Policy number",
  "state": "State code (2-letter)",
  "carrier": "Insurance company name",
  "yearRoofInstall": "Roof installation date if available",
  "policyDeductible": "Policy deductible ($X,XXX)",
  "windHailDeductible": "Wind/hail deductible ($X,XXX X%)",
  "coverages": [
    {"code": "A", "name": "Coverage A - Dwelling", "limit": "$XXX,XXX", "valuationMethod": "RCV or ACV"},
    {"code": "B", "name": "Coverage B - Other Structures", "limit": "$XXX,XXX"},
    {"code": "C", "name": "Coverage C - Personal Property", "limit": "$XXX,XXX"},
    {"code": "D", "name": "Coverage D - Loss of Use", "limit": "$XXX,XXX"}
  ],
  "dwellingLimit": "Coverage A limit",
  "scheduledStructures": [{"description": "Description", "value": "$XX,XXX"}],
  "endorsementDetails": [{"formNumber": "HO XX XX", "name": "Endorsement name"}],
  "endorsementsListed": ["Array of endorsement form numbers"],
  "mortgagee": "Mortgagee/lender info"
}`;

    case 'endorsement':
      return `You are an expert insurance document analyzer. Extract structured data from the document image provided.
Return a JSON object with the following fields (use null for missing values):
{
  "endorsements": [
    {
      "documentType": "Endorsement",
      "formNumber": "STRING (e.g., HO 84 28)",
      "documentTitle": "STRING (Full endorsement name/title)",
      "appliesToState": "STRING (The state the endorsement amends the policy for, if specified, e.g., Wisconsin, or null)",
      "keyAmendments": [
        {
          "provisionAmended": "STRING (The specific clause or provision being amended)",
          "summaryOfChange": "STRING (A clear, concise summary of how this endorsement alters the rule)",
          "newLimitOrValue": "STRING (The explicit new time period, limit, or rule value, or null)"
        }
      ]
    }
  ],
  "policyNumber": "Policy number this endorsement applies to (if visible)",
  "endorsementsListed": ["Array of all endorsement form numbers found"]
}`;

    default:
      return `You are an expert insurance document analyzer. Extract structured data from the document image provided.
Return a JSON object with the following fields (use null for missing values):
Extract any insurance-related information you can find including:
- Policyholder name(s) and contact info
- Risk location/property address
- Policy number, state, carrier
- All coverage limits (A through F)
- Deductibles (policy, wind/hail)
- Scheduled structures with values
- All endorsements listed
- Claim/loss information if present
- Mortgagee and producer info`;
  }
}

/**
 * Helper to merge two objects, filling in missing fields from source
 */
function enrichObject<T extends Record<string, any>>(existing: T, source: T): T {
  const result = { ...existing };
  for (const [key, value] of Object.entries(source)) {
    if (value !== null && value !== undefined && value !== '' && !result[key]) {
      (result as any)[key] = value;
    }
  }
  return result;
}

/**
 * Merge extracted data from multiple documents/pages
 * Properly handles arrays by deduplicating and enriching existing entries
 */
export function mergeExtractedData(
  ...documents: ExtractedClaimData[]
): ExtractedClaimData {
  const merged: ExtractedClaimData = {};

  for (const doc of documents) {
    if (!doc) continue;

    for (const [key, value] of Object.entries(doc)) {
      if (value === null || value === undefined || value === '') continue;

      // Handle array fields with proper merging and enrichment
      if (key === 'coverages' && Array.isArray(value)) {
        const existing = merged.coverages || [];
        const byCode = new Map(existing.map(c => [c.code, c]));
        for (const cov of value as CoverageDetail[]) {
          const prev = byCode.get(cov.code);
          byCode.set(cov.code, prev ? enrichObject(prev, cov) : cov);
        }
        merged.coverages = Array.from(byCode.values());
      } else if (key === 'scheduledStructures' && Array.isArray(value)) {
        const existing = merged.scheduledStructures || [];
        const byDesc = new Map(existing.map(s => [s.description, s]));
        for (const str of value as ScheduledStructure[]) {
          const prev = byDesc.get(str.description);
          byDesc.set(str.description, prev ? enrichObject(prev, str) : str);
        }
        merged.scheduledStructures = Array.from(byDesc.values());
      } else if (key === 'additionalCoverages' && Array.isArray(value)) {
        const existing = merged.additionalCoverages || [];
        const byName = new Map(existing.map(c => [c.name, c]));
        for (const cov of value as { name: string; limit?: string; deductible?: string }[]) {
          const prev = byName.get(cov.name);
          byName.set(cov.name, prev ? enrichObject(prev, cov) : cov);
        }
        merged.additionalCoverages = Array.from(byName.values());
      } else if ((key === 'endorsementDetails' || key === 'endorsements') && Array.isArray(value)) {
        // Merge both endorsementDetails and endorsements arrays into endorsementDetails
        const existing = merged.endorsementDetails || [];
        const byForm = new Map(existing.map(e => [e.formNumber, e]));
        for (const end of value as EndorsementDetail[]) {
          const prev = byForm.get(end.formNumber);
          byForm.set(end.formNumber, prev ? enrichObject(prev, end) : end);
        }
        merged.endorsementDetails = Array.from(byForm.values());
      } else if (key === 'endorsementsListed' && Array.isArray(value)) {
        const existing = merged.endorsementsListed || [];
        merged.endorsementsListed = [...new Set([...existing, ...value])];
      } else if (!(merged as any)[key]) {
        // For scalar fields, prefer first non-null value
        (merged as any)[key] = value;
      }
    }
  }

  return merged;
}

/**
 * Create a claim from extracted document data
 */
export async function createClaimFromDocuments(
  organizationId: string,
  documentIds: string[],
  overrides?: Partial<ExtractedClaimData>
): Promise<string> {
  // Get all documents and their extracted data
  const { data: docs, error: docsError } = await supabaseAdmin
    .from('documents')
    .select('id, type, extracted_data')
    .in('id', documentIds)
    .eq('organization_id', organizationId);

  if (docsError || !docs) {
    throw new Error(`Failed to fetch documents: ${docsError?.message}`);
  }

  // Merge extracted data from all documents
  const extractedDatas = docs
    .map(d => d.extracted_data as ExtractedClaimData)
    .filter(Boolean);

  let claimData = mergeExtractedData(...extractedDatas);

  // Apply any overrides
  if (overrides) {
    claimData = { ...claimData, ...overrides };
  }

  // Flatten policy details if nested
  const policyDetails = claimData.policyDetails || {};
  const policyNumber = claimData.policyNumber || policyDetails.policyNumber || null;
  const dwellingLimit = claimData.dwellingLimit || policyDetails.dwellingLimit || null;
  const state = claimData.state || policyDetails.state || null;
  const yearRoofInstall = claimData.yearRoofInstall || policyDetails.yearRoofInstall || null;
  const windHailDeductible = claimData.windHailDeductible || policyDetails.windHailDeductible || null;
  const endorsementsListed = claimData.endorsementsListed || policyDetails.endorsementsListed || [];

  // Generate claim ID if not provided
  const generatedClaimId = claimData.claimId || await generateClaimId(organizationId);

  // ========================================
  // PERIL NORMALIZATION (Peril Parity)
  // ========================================
  const perilInput: PerilInferenceInput = {
    causeOfLoss: claimData.causeOfLoss,
    lossDescription: claimData.lossDescription,
    damageLocation: claimData.damageLocation,
    dwellingDamageDescription: claimData.dwellingDamageDescription,
    otherStructureDamageDescription: claimData.otherStructureDamageDescription,
    fullText: claimData.fullText,
  };

  const perilInference = inferPeril(perilInput);

  console.log(`[Peril Normalization] Claim ${generatedClaimId}:`, {
    primaryPeril: perilInference.primaryPeril,
    secondaryPerils: perilInference.secondaryPerils,
    confidence: perilInference.confidence,
    reasoning: perilInference.inferenceReasoning
  });

  // Derive property address from new expanded format or fall back to riskLocation
  const propertyAddress = claimData.propertyAddress || claimData.propertyStreetAddress || claimData.riskLocation || null;
  const propertyCity = claimData.propertyCity || null;
  const propertyState = claimData.propertyState || state || null;
  const propertyZip = claimData.propertyZipCode || null;

  // Create claim with Supabase
  const { data: newClaim, error: claimError } = await supabaseAdmin
    .from('claims')
    .insert({
      organization_id: organizationId,
      claim_number: generatedClaimId,
      insured_name: claimData.policyholder || null,
      date_of_loss: claimData.dateOfLoss || null,
      property_address: propertyAddress,
      property_city: propertyCity,
      property_state: propertyState,
      property_zip: propertyZip,
      loss_type: claimData.causeOfLoss || null,
      loss_description: claimData.lossDescription || null,
      policy_number: policyNumber,
      year_roof_install: yearRoofInstall,
      wind_hail_deductible: windHailDeductible,
      dwelling_limit: dwellingLimit,
      endorsements_listed: endorsementsListed,
      primary_peril: perilInference.primaryPeril,
      secondary_perils: perilInference.secondaryPerils,
      peril_confidence: perilInference.confidence,
      peril_metadata: perilInference.perilMetadata,
      status: 'fnol',
      metadata: {
        extractedFrom: documentIds,
        riskLocation: claimData.riskLocation,
        propertyAddress: claimData.propertyAddress,
        propertyStreetAddress: claimData.propertyStreetAddress,
        propertyCity: claimData.propertyCity,
        propertyState: claimData.propertyState,
        propertyZipCode: claimData.propertyZipCode,
        policyholderSecondary: claimData.policyholderSecondary,
        contactPhone: claimData.contactPhone,
        contactEmail: claimData.contactEmail,
        yearBuilt: claimData.yearBuilt,
        carrier: claimData.carrier,
        claimStatus: claimData.claimStatus,
        droneEligibleAtFNOL: claimData.droneEligibleAtFNOL,
        lineOfBusiness: claimData.lineOfBusiness,
        policyInceptionDate: claimData.policyInceptionDate,
        policyStatus: claimData.policyStatus,
        policyDeductible: claimData.policyDeductible,
        coverages: claimData.coverages,
        scheduledStructures: claimData.scheduledStructures,
        additionalCoverages: claimData.additionalCoverages,
        endorsementDetails: claimData.endorsementDetails,
        mortgagee: claimData.mortgagee,
        thirdPartyInterest: claimData.thirdPartyInterest,
        producer: claimData.producer,
        producerPhone: claimData.producerPhone,
        producerEmail: claimData.producerEmail,
        reportedBy: claimData.reportedBy,
        roofDamageReported: claimData.roofDamageReported,
        numberOfStories: claimData.numberOfStories,
        isWoodRoof: claimData.isWoodRoof,
        dwellingDamageDescription: claimData.dwellingDamageDescription,
        damageLocation: claimData.damageLocation,
        insuredAddress: claimData.insuredAddress,
        perilInferenceReasoning: perilInference.inferenceReasoning,
      }
    })
    .select('id')
    .single();

  if (claimError || !newClaim) {
    throw new Error(`Failed to create claim: ${claimError?.message}`);
  }

  const claimId = newClaim.id;

  // Associate documents with claim
  for (const docId of documentIds) {
    await supabaseAdmin
      .from('documents')
      .update({ claim_id: claimId, updated_at: new Date().toISOString() })
      .eq('id', docId);
  }

  // Save comprehensive endorsement extractions to endorsement_extractions table
  if (claimData.comprehensiveEndorsements && claimData.comprehensiveEndorsements.length > 0) {
    for (const endorsement of claimData.comprehensiveEndorsements) {
      const formCode = endorsement.endorsementMetadata?.formCode || '';
      
      // Check if extraction already exists for this claim and form code
      const { data: existingExtractions } = await supabaseAdmin
        .from('endorsement_extractions')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('claim_id', claimId)
        .eq('form_code', formCode)
        .limit(1);

      const extractionData = {
        organization_id: organizationId,
        claim_id: claimId,
        form_code: formCode,
        title: endorsement.endorsementMetadata?.title || null,
        edition_date: endorsement.endorsementMetadata?.editionDate || null,
        jurisdiction: endorsement.endorsementMetadata?.jurisdiction || null,
        page_count: endorsement.endorsementMetadata?.pageCount || null,
        applies_to_policy_forms: endorsement.endorsementMetadata?.appliesToPolicyForms || [],
        modifications: endorsement.modifications || {},
        tables: endorsement.tables || [],
        raw_text: endorsement.rawText || null,
        extraction_model: 'gpt-4.1-2025-04-14',
        extraction_version: '2.0',
        status: 'completed'
      };

      if (existingExtractions && existingExtractions.length > 0) {
        await supabaseAdmin
          .from('endorsement_extractions')
          .update({ ...extractionData, updated_at: new Date().toISOString() })
          .eq('id', existingExtractions[0].id);
      } else {
        await supabaseAdmin
          .from('endorsement_extractions')
          .insert(extractionData);
      }

      console.log(`[EndorsementExtraction] Saved comprehensive extraction for ${formCode}`);
    }

    // Trigger effective policy recomputation when endorsements change
    // This ensures the effective policy reflects all endorsement modifications
    if (claimId && organizationId) {
      try {
        await recomputeEffectivePolicyIfNeeded(claimId, organizationId);
        console.log(`[EffectivePolicy] Triggered recomputation for claim ${claimId} after endorsement extraction`);
      } catch (recomputeError) {
        console.error('[EffectivePolicy] Error triggering recomputation:', recomputeError);
        // Don't fail document processing if policy recomputation fails
      }
    }
  }

  return claimId;
}

/**
 * Generate a unique claim ID in format XX-XXX-XXXXXX
 */
async function generateClaimId(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const startOfYear = `${year}-01-01T00:00:00.000Z`;
  
  const { count } = await supabaseAdmin
    .from('claims')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('created_at', startOfYear);

  const seq = String((count || 0) + 1).padStart(6, '0');
  return `01-${String(year).slice(-3)}-${seq}`;
}
