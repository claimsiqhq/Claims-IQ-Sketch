import { supabaseAdmin } from '../lib/supabaseAdmin';
import {
  Peril,
  ClaimSeverity,
  ChecklistCategory,
  ChecklistTemplateItem,
  type ClaimChecklist,
  type ClaimChecklistItem,
} from '../../shared/schema';

const TEMPLATE_VERSION = '1.0';

function mapChecklistFromDb(row: any): ClaimChecklist {
  return {
    id: row.id,
    claimId: row.claim_id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    peril: row.peril,
    severity: row.severity,
    templateVersion: row.template_version,
    templateId: row.template_id || null,
    totalItems: row.total_items,
    completedItems: row.completed_items,
    status: row.status,
    metadata: row.metadata || null,
    createdBy: row.created_by || null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
}

function mapChecklistItemFromDb(row: any): ClaimChecklistItem {
  return {
    id: row.id,
    checklistId: row.checklist_id,
    title: row.title,
    description: row.description,
    category: row.category,
    requiredForPerils: row.required_for_perils || [],
    requiredForSeverities: row.required_for_severities || [],
    required: row.required,
    priority: row.priority,
    sortOrder: row.sort_order,
    status: row.status,
    completedBy: row.completed_by,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    notes: row.notes,
    skippedReason: row.skipped_reason,
    conditionalLogic: row.conditional_logic || null,
    linkedDocumentIds: row.linked_document_ids || [],
    dueDate: row.due_date ? new Date(row.due_date) : null,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  };
}

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
  severity: ClaimSeverity,
  options?: {
    userId?: string;
    templateId?: string;
  }
): Promise<{ success: boolean; checklist?: ClaimChecklist; error?: string }> {
  try {
    console.log(`[Checklist] Generating checklist for claim ${claimId}, peril=${peril}, severity=${severity}`);
    const { data: existingChecklists } = await supabaseAdmin
      .from('claim_checklists')
      .select('*')
      .eq('claim_id', claimId)
      .eq('status', 'active')
      .limit(1);

    if (existingChecklists && existingChecklists.length > 0) {
      const existing = existingChecklists[0];
      // Check if checklist has items - if not, regenerate
      const { data: existingItems } = await supabaseAdmin
        .from('claim_checklist_items')
        .select('id')
        .eq('checklist_id', existing.id)
        .limit(1);
      
      if (existingItems && existingItems.length > 0) {
        return { success: true, checklist: mapChecklistFromDb(existing) };
      } else {
        // Checklist exists but has no items - archive it and regenerate
        console.warn(`[Checklist] Found checklist ${existing.id} with 0 items, archiving and regenerating`);
        await supabaseAdmin
          .from('claim_checklists')
          .update({ status: 'archived', updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      }
    }

    const applicableItems = getApplicableTemplateItems(peril, severity);
    console.log(`[Checklist] Found ${applicableItems.length} applicable items for peril=${peril}, severity=${severity}`);
    
    const perilLabel = peril.charAt(0).toUpperCase() + peril.slice(1).replace('_', ' ');
    const severityLabel = severity.charAt(0).toUpperCase() + severity.slice(1);

    const insertData: Record<string, any> = {
      claim_id: claimId,
      organization_id: organizationId,
      name: `${perilLabel} Claim Checklist`,
      description: `Processing checklist for ${severityLabel.toLowerCase()} ${perilLabel.toLowerCase()} claim`,
      peril,
      severity,
      template_version: TEMPLATE_VERSION,
      total_items: applicableItems.length,
      completed_items: 0,
      status: 'active',
    };

    // Add optional fields if provided
    if (options?.userId) {
      insertData.created_by = options.userId;
    }
    if (options?.templateId) {
      insertData.template_id = options.templateId;
    }

    const { data: insertedChecklist, error: insertError } = await supabaseAdmin
      .from('claim_checklists')
      .insert(insertData)
      .select()
      .single();

    if (insertError || !insertedChecklist) {
      return { success: false, error: insertError?.message || 'Failed to create checklist' };
    }

    const checklist = insertedChecklist;

    const itemsToInsert = applicableItems.map((item, index) => ({
      checklist_id: checklist.id,
      item_code: item.id,
      item_name: item.title,
      title: item.title,
      description: item.description || null,
      category: item.category,
      required_for_perils: item.requiredForPerils,
      required_for_severities: item.requiredForSeverities,
      required: item.required,
      priority: item.priority,
      sort_order: index,
      status: 'pending',
    }));

    if (itemsToInsert.length === 0) {
      console.warn(`[Checklist] No applicable items for peril=${peril}, severity=${severity}, claimId=${claimId}`);
      return { 
        success: false, 
        error: `No checklist items match peril "${peril}" and severity "${severity}". Please ensure the claim has a valid primary_peril set.` 
      };
    }

    const { error: insertItemsError } = await supabaseAdmin
      .from('claim_checklist_items')
      .insert(itemsToInsert);

    if (insertItemsError) {
      console.error(`[Checklist] Failed to insert items for checklist ${checklist.id}:`, insertItemsError);
      return { success: false, error: `Failed to create checklist items: ${insertItemsError.message}` };
    }

    return { success: true, checklist: mapChecklistFromDb(checklist) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getChecklistForClaim(
  claimId: string
): Promise<{ checklist: ClaimChecklist | null; items: ClaimChecklistItem[] }> {
  const { data: checklists } = await supabaseAdmin
    .from('claim_checklists')
    .select('*')
    .eq('claim_id', claimId)
    .eq('status', 'active')
    .limit(1);

  if (!checklists || checklists.length === 0) {
    return { checklist: null, items: [] };
  }

  const checklist = checklists[0];

  const { data: items } = await supabaseAdmin
    .from('claim_checklist_items')
    .select('*')
    .eq('checklist_id', checklist.id)
    .order('sort_order');

  return { 
    checklist: mapChecklistFromDb(checklist), 
    items: (items || []).map(mapChecklistItemFromDb) 
  };
}

export async function updateChecklistItemStatus(
  itemId: string,
  status: string,
  userId?: string,
  notes?: string,
  skippedReason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'completed') {
      updateData.completed_by = userId || null;
      updateData.completed_at = new Date().toISOString();
    } else if (status === 'skipped' && skippedReason) {
      updateData.skipped_reason = skippedReason;
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('claim_checklist_items')
      .update(updateData)
      .eq('id', itemId)
      .select()
      .single();

    if (updateError || !updated) {
      return { success: false, error: 'Item not found' };
    }

    const { data: allItems } = await supabaseAdmin
      .from('claim_checklist_items')
      .select('status')
      .eq('checklist_id', updated.checklist_id);

    const completedCount = (allItems || []).filter((s: any) => s.status === 'completed').length;
    const totalCount = (allItems || []).length;
    const allComplete = completedCount === totalCount;

    await supabaseAdmin
      .from('claim_checklists')
      .update({
        completed_items: completedCount,
        status: allComplete ? 'completed' : 'active',
        completed_at: allComplete ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', updated.checklist_id);

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
    const { data: maxOrderResult } = await supabaseAdmin
      .from('claim_checklist_items')
      .select('sort_order')
      .eq('checklist_id', checklistId)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextOrder = ((maxOrderResult?.[0] as any)?.sort_order || 0) + 1;

    const itemCode = `custom-${Date.now()}`;
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('claim_checklist_items')
      .insert({
        checklist_id: checklistId,
        item_code: itemCode,
        item_name: title,
        title,
        description: options?.description || null,
        category,
        required: options?.required ?? false,
        priority: options?.priority || 2,
        sort_order: nextOrder,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError || !inserted) {
      return { success: false, error: insertError?.message || 'Failed to create item' };
    }

    const { count } = await supabaseAdmin
      .from('claim_checklist_items')
      .select('*', { count: 'exact', head: true })
      .eq('checklist_id', checklistId);

    const newTotalItems = count || 0;

    await supabaseAdmin
      .from('claim_checklists')
      .update({
        total_items: newTotalItems,
        updated_at: new Date().toISOString(),
      })
      .eq('id', checklistId);

    return { success: true, item: mapChecklistItemFromDb(inserted) };
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
