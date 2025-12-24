import { db } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import {
  Peril,
  ClaimSeverity,
  ChecklistCategory,
  ChecklistTemplateItem,
  claimChecklists,
  claimChecklistItems,
  type ClaimChecklist,
  type ClaimChecklistItem,
} from '../../shared/schema';

const TEMPLATE_VERSION = '1.0';

const CHECKLIST_TEMPLATES: ChecklistTemplateItem[] = [
  {
    id: 'doc-fnol',
    title: 'FNOL Document Received',
    description: 'Verify First Notice of Loss document is complete and legible',
    category: ChecklistCategory.DOCUMENTATION,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 1,
  },
  {
    id: 'doc-policy',
    title: 'Policy Declarations Verified',
    description: 'Confirm policy is active and coverage limits are documented',
    category: ChecklistCategory.DOCUMENTATION,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 2,
  },
  {
    id: 'doc-endorsements',
    title: 'Endorsements Reviewed',
    description: 'Review all policy endorsements for coverage modifications',
    category: ChecklistCategory.DOCUMENTATION,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 3,
  },
  {
    id: 'doc-photos-exterior',
    title: 'Exterior Photos Collected',
    description: 'Collect comprehensive exterior damage documentation photos',
    category: ChecklistCategory.DOCUMENTATION,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 4,
  },
  {
    id: 'doc-photos-interior',
    title: 'Interior Photos Collected',
    description: 'Collect comprehensive interior damage documentation photos',
    category: ChecklistCategory.DOCUMENTATION,
    requiredForPerils: [Peril.WATER, Peril.FIRE, Peril.SMOKE, Peril.FLOOD, Peril.MOLD],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 5,
  },
  {
    id: 'verify-insured-contact',
    title: 'Insured Contact Verified',
    description: 'Confirm contact information and preferred communication method',
    category: ChecklistCategory.VERIFICATION,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 10,
  },
  {
    id: 'verify-property-address',
    title: 'Property Address Confirmed',
    description: 'Verify loss location matches policy and is accessible',
    category: ChecklistCategory.VERIFICATION,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 11,
  },
  {
    id: 'verify-mortgage',
    title: 'Mortgagee Verified',
    description: 'Confirm mortgagee information for claim payment',
    category: ChecklistCategory.VERIFICATION,
    requiredForPerils: [],
    requiredForSeverities: [ClaimSeverity.SEVERE, ClaimSeverity.CATASTROPHIC],
    required: true,
    priority: 2,
    sortOrder: 12,
  },
  {
    id: 'verify-prior-claims',
    title: 'Prior Claims Checked',
    description: 'Review claim history for prior damage at this location',
    category: ChecklistCategory.VERIFICATION,
    requiredForPerils: [],
    requiredForSeverities: [ClaimSeverity.MODERATE, ClaimSeverity.SEVERE, ClaimSeverity.CATASTROPHIC],
    required: true,
    priority: 2,
    sortOrder: 13,
  },
  {
    id: 'inspect-exterior',
    title: 'Exterior Inspection Complete',
    description: 'Complete exterior damage assessment including roof, siding, windows',
    category: ChecklistCategory.INSPECTION,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 20,
  },
  {
    id: 'inspect-interior',
    title: 'Interior Inspection Complete',
    description: 'Complete interior damage assessment for all affected areas',
    category: ChecklistCategory.INSPECTION,
    requiredForPerils: [Peril.WATER, Peril.FIRE, Peril.SMOKE, Peril.FLOOD, Peril.MOLD],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 21,
  },
  {
    id: 'inspect-roof',
    title: 'Roof Inspection Complete',
    description: 'Detailed roof inspection including shingles, flashing, vents',
    category: ChecklistCategory.INSPECTION,
    requiredForPerils: [Peril.WIND_HAIL, Peril.IMPACT],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 22,
  },
  {
    id: 'inspect-gutters',
    title: 'Gutters & Downspouts Inspected',
    description: 'Check gutters and downspouts for damage',
    category: ChecklistCategory.INSPECTION,
    requiredForPerils: [Peril.WIND_HAIL],
    requiredForSeverities: [],
    required: true,
    priority: 2,
    sortOrder: 23,
  },
  {
    id: 'inspect-hvac',
    title: 'HVAC System Checked',
    description: 'Inspect HVAC units for damage and operational status',
    category: ChecklistCategory.INSPECTION,
    requiredForPerils: [Peril.WIND_HAIL, Peril.FLOOD, Peril.FIRE],
    requiredForSeverities: [ClaimSeverity.MODERATE, ClaimSeverity.SEVERE, ClaimSeverity.CATASTROPHIC],
    required: true,
    priority: 2,
    sortOrder: 24,
  },
  {
    id: 'inspect-moisture',
    title: 'Moisture Readings Taken',
    description: 'Take moisture meter readings in affected areas',
    category: ChecklistCategory.INSPECTION,
    requiredForPerils: [Peril.WATER, Peril.FLOOD],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 25,
  },
  {
    id: 'inspect-mold',
    title: 'Mold Assessment Complete',
    description: 'Visual mold inspection and testing if required',
    category: ChecklistCategory.INSPECTION,
    requiredForPerils: [Peril.WATER, Peril.FLOOD, Peril.MOLD],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 26,
  },
  {
    id: 'inspect-fire-origin',
    title: 'Fire Origin Documented',
    description: 'Document fire origin and cause determination',
    category: ChecklistCategory.INSPECTION,
    requiredForPerils: [Peril.FIRE],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 27,
  },
  {
    id: 'inspect-smoke-migration',
    title: 'Smoke Migration Mapped',
    description: 'Document smoke migration pattern through structure',
    category: ChecklistCategory.INSPECTION,
    requiredForPerils: [Peril.FIRE, Peril.SMOKE],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 28,
  },
  {
    id: 'inspect-structural',
    title: 'Structural Assessment Complete',
    description: 'Assess structural integrity and safety concerns',
    category: ChecklistCategory.INSPECTION,
    requiredForPerils: [Peril.FIRE, Peril.IMPACT, Peril.FLOOD],
    requiredForSeverities: [ClaimSeverity.SEVERE, ClaimSeverity.CATASTROPHIC],
    required: true,
    priority: 1,
    sortOrder: 29,
  },
  {
    id: 'inspect-contents',
    title: 'Contents Inventory Started',
    description: 'Begin documenting damaged personal property',
    category: ChecklistCategory.INSPECTION,
    requiredForPerils: [],
    requiredForSeverities: [ClaimSeverity.MODERATE, ClaimSeverity.SEVERE, ClaimSeverity.CATASTROPHIC],
    required: true,
    priority: 2,
    sortOrder: 30,
  },
  {
    id: 'est-scope',
    title: 'Scope of Loss Defined',
    description: 'Complete scope of repairs documented',
    category: ChecklistCategory.ESTIMATION,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 40,
  },
  {
    id: 'est-measurements',
    title: 'Measurements Complete',
    description: 'All required measurements for estimate documented',
    category: ChecklistCategory.ESTIMATION,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 41,
  },
  {
    id: 'est-pricing',
    title: 'Pricing Verified',
    description: 'Line item pricing verified against current price list',
    category: ChecklistCategory.ESTIMATION,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 42,
  },
  {
    id: 'est-depreciation',
    title: 'Depreciation Applied',
    description: 'Age and condition depreciation calculated',
    category: ChecklistCategory.ESTIMATION,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 2,
    sortOrder: 43,
  },
  {
    id: 'est-mitigation',
    title: 'Mitigation Costs Included',
    description: 'Emergency mitigation and temporary repairs included',
    category: ChecklistCategory.ESTIMATION,
    requiredForPerils: [Peril.WATER, Peril.FIRE, Peril.FLOOD],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 44,
  },
  {
    id: 'est-code-upgrade',
    title: 'Code Upgrades Evaluated',
    description: 'Assess building code upgrade requirements',
    category: ChecklistCategory.ESTIMATION,
    requiredForPerils: [],
    requiredForSeverities: [ClaimSeverity.SEVERE, ClaimSeverity.CATASTROPHIC],
    required: true,
    priority: 2,
    sortOrder: 45,
  },
  {
    id: 'est-ale',
    title: 'ALE Evaluated',
    description: 'Additional Living Expense needs assessed',
    category: ChecklistCategory.ESTIMATION,
    requiredForPerils: [Peril.FIRE, Peril.FLOOD],
    requiredForSeverities: [ClaimSeverity.SEVERE, ClaimSeverity.CATASTROPHIC],
    required: true,
    priority: 2,
    sortOrder: 46,
  },
  {
    id: 'review-coverage',
    title: 'Coverage Analysis Complete',
    description: 'Verify all damages are covered under policy',
    category: ChecklistCategory.REVIEW,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 50,
  },
  {
    id: 'review-deductible',
    title: 'Deductible Confirmed',
    description: 'Confirm applicable deductible amount',
    category: ChecklistCategory.REVIEW,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 51,
  },
  {
    id: 'review-sublimits',
    title: 'Sublimits Checked',
    description: 'Verify no sublimits apply to claimed damages',
    category: ChecklistCategory.REVIEW,
    requiredForPerils: [],
    requiredForSeverities: [ClaimSeverity.MODERATE, ClaimSeverity.SEVERE, ClaimSeverity.CATASTROPHIC],
    required: true,
    priority: 2,
    sortOrder: 52,
  },
  {
    id: 'review-qa',
    title: 'QA Review Complete',
    description: 'Internal quality assurance review completed',
    category: ChecklistCategory.REVIEW,
    requiredForPerils: [],
    requiredForSeverities: [ClaimSeverity.SEVERE, ClaimSeverity.CATASTROPHIC],
    required: true,
    priority: 1,
    sortOrder: 53,
  },
  {
    id: 'review-supervisor',
    title: 'Supervisor Review Complete',
    description: 'Supervisor approval for large loss',
    category: ChecklistCategory.REVIEW,
    requiredForPerils: [],
    requiredForSeverities: [ClaimSeverity.CATASTROPHIC],
    required: true,
    priority: 1,
    sortOrder: 54,
  },
  {
    id: 'settle-insured-review',
    title: 'Estimate Reviewed with Insured',
    description: 'Walk through estimate with insured and address questions',
    category: ChecklistCategory.SETTLEMENT,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 60,
  },
  {
    id: 'settle-agreement',
    title: 'Settlement Agreement Signed',
    description: 'Obtain signed settlement agreement',
    category: ChecklistCategory.SETTLEMENT,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 61,
  },
  {
    id: 'settle-payment',
    title: 'Payment Processed',
    description: 'Claim payment submitted for processing',
    category: ChecklistCategory.SETTLEMENT,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 62,
  },
  {
    id: 'settle-close',
    title: 'Claim Closed',
    description: 'All documentation complete and claim closed',
    category: ChecklistCategory.SETTLEMENT,
    requiredForPerils: [],
    requiredForSeverities: [],
    required: true,
    priority: 1,
    sortOrder: 63,
  },
];

function itemApplies(
  item: ChecklistTemplateItem,
  peril: Peril,
  severity: ClaimSeverity
): boolean {
  const perilMatch =
    item.requiredForPerils.length === 0 ||
    item.requiredForPerils.includes(peril);

  const severityMatch =
    item.requiredForSeverities.length === 0 ||
    item.requiredForSeverities.includes(severity);

  return perilMatch && severityMatch;
}

export function getApplicableTemplateItems(
  peril: Peril,
  severity: ClaimSeverity
): ChecklistTemplateItem[] {
  return CHECKLIST_TEMPLATES.filter(item => itemApplies(item, peril, severity))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function generateChecklistForClaim(
  claimId: string,
  organizationId: string,
  peril: Peril,
  severity: ClaimSeverity
): Promise<{ success: boolean; checklist?: ClaimChecklist; error?: string }> {
  try {
    const existingChecklists = await db
      .select()
      .from(claimChecklists)
      .where(and(eq(claimChecklists.claimId, claimId), eq(claimChecklists.status, 'active')))
      .limit(1);

    if (existingChecklists.length > 0) {
      return { success: true, checklist: existingChecklists[0] };
    }

    const applicableItems = getApplicableTemplateItems(peril, severity);
    const perilLabel = peril.charAt(0).toUpperCase() + peril.slice(1).replace('_', ' ');
    const severityLabel = severity.charAt(0).toUpperCase() + severity.slice(1);

    const insertedChecklists = await db
      .insert(claimChecklists)
      .values({
        claimId,
        organizationId,
        name: `${perilLabel} Claim Checklist`,
        description: `Processing checklist for ${severityLabel.toLowerCase()} ${perilLabel.toLowerCase()} claim`,
        peril,
        severity,
        templateVersion: TEMPLATE_VERSION,
        totalItems: applicableItems.length,
        completedItems: 0,
        status: 'active',
      })
      .returning();

    if (!insertedChecklists.length) {
      return { success: false, error: 'Failed to create checklist' };
    }

    const checklist = insertedChecklists[0];

    const itemsToInsert = applicableItems.map((item, index) => ({
      checklistId: checklist.id,
      title: item.title,
      description: item.description || null,
      category: item.category,
      requiredForPerils: item.requiredForPerils,
      requiredForSeverities: item.requiredForSeverities,
      required: item.required,
      priority: item.priority,
      sortOrder: index,
      status: 'pending',
    }));

    await db.insert(claimChecklistItems).values(itemsToInsert);

    return { success: true, checklist };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getChecklistForClaim(
  claimId: string
): Promise<{ checklist: ClaimChecklist | null; items: ClaimChecklistItem[] }> {
  const checklists = await db
    .select()
    .from(claimChecklists)
    .where(and(eq(claimChecklists.claimId, claimId), eq(claimChecklists.status, 'active')))
    .limit(1);

  if (checklists.length === 0) {
    return { checklist: null, items: [] };
  }

  const checklist = checklists[0];

  const items = await db
    .select()
    .from(claimChecklistItems)
    .where(eq(claimChecklistItems.checklistId, checklist.id))
    .orderBy(claimChecklistItems.sortOrder);

  return { checklist, items };
}

export async function updateChecklistItemStatus(
  itemId: string,
  status: string,
  userId?: string,
  notes?: string,
  skippedReason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: Partial<ClaimChecklistItem> = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'completed') {
      updateData.completedBy = userId || null;
      updateData.completedAt = new Date();
    } else if (status === 'skipped' && skippedReason) {
      updateData.skippedReason = skippedReason;
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const updated = await db
      .update(claimChecklistItems)
      .set(updateData)
      .where(eq(claimChecklistItems.id, itemId))
      .returning();

    if (!updated.length) {
      return { success: false, error: 'Item not found' };
    }

    const item = updated[0];

    const allItems = await db
      .select({ status: claimChecklistItems.status })
      .from(claimChecklistItems)
      .where(eq(claimChecklistItems.checklistId, item.checklistId));

    const completedCount = allItems.filter(s => s.status === 'completed').length;
    const totalCount = allItems.length;
    const allComplete = completedCount === totalCount;

    await db
      .update(claimChecklists)
      .set({
        completedItems: completedCount,
        status: allComplete ? 'completed' : 'active',
        completedAt: allComplete ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(claimChecklists.id, item.checklistId));

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function addCustomChecklistItem(
  checklistId: string,
  title: string,
  category: ChecklistCategory,
  options?: {
    description?: string;
    required?: boolean;
    priority?: 1 | 2 | 3;
  }
): Promise<{ success: boolean; item?: ClaimChecklistItem; error?: string }> {
  try {
    const maxOrderResult = await db
      .select({ sortOrder: claimChecklistItems.sortOrder })
      .from(claimChecklistItems)
      .where(eq(claimChecklistItems.checklistId, checklistId))
      .orderBy(desc(claimChecklistItems.sortOrder))
      .limit(1);

    const nextOrder = (maxOrderResult[0]?.sortOrder || 0) + 1;

    const inserted = await db
      .insert(claimChecklistItems)
      .values({
        checklistId,
        title,
        description: options?.description || null,
        category,
        required: options?.required ?? false,
        priority: options?.priority || 2,
        sortOrder: nextOrder,
        status: 'pending',
      })
      .returning();

    if (!inserted.length) {
      return { success: false, error: 'Failed to create item' };
    }

    const itemCount = await db
      .select({ count: claimChecklistItems.id })
      .from(claimChecklistItems)
      .where(eq(claimChecklistItems.checklistId, checklistId));

    const newTotalItems = itemCount.length;

    await db
      .update(claimChecklists)
      .set({
        totalItems: newTotalItems,
        updatedAt: new Date(),
      })
      .where(eq(claimChecklists.id, checklistId));

    return { success: true, item: inserted[0] };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export function inferSeverityFromClaim(claim: {
  reserveAmount?: number | null;
  metadata?: Record<string, any> | null;
}): ClaimSeverity {
  const reserve = claim.reserveAmount ? Number(claim.reserveAmount) : 0;

  if (reserve >= 100000) return ClaimSeverity.CATASTROPHIC;
  if (reserve >= 50000) return ClaimSeverity.SEVERE;
  if (reserve >= 10000) return ClaimSeverity.MODERATE;
  if (reserve > 0) return ClaimSeverity.MINOR;

  const metadata = claim.metadata as Record<string, any> | null;
  const isCatClaim = metadata?.catCode || metadata?.isCatastrophe;
  if (isCatClaim) return ClaimSeverity.CATASTROPHIC;

  return ClaimSeverity.MODERATE;
}
