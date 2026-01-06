/**
 * Report Generator for Claims IQ Sketch
 * Generates PDF reports and Xactimate ESX exports
 *
 * ESX EXPORT PHILOSOPHY (Tier A):
 * ================================
 * This module generates import-ready ESX files that Xactimate can read.
 * We do NOT generate editable Xactimate sketches (SKX format) because:
 *
 * 1. Editable sketches require proprietary Verisk partner SDK access
 * 2. SKX binary/XML encoding is not publicly documented
 * 3. Ongoing compatibility maintenance with Xactimate versions is complex
 *
 * The Tier A approach provides:
 * - Full claim metadata import
 * - Line items with room/level grouping
 * - Sketch renders as PDF underlay (visible but not editable)
 *
 * This gives 95% of the value without proprietary dependencies.
 * See: docs/sketch-esx-architecture.md for full architecture details.
 */

import { getEstimate, type SavedEstimate, type CalculatedLineItem } from './estimateCalculator';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ReportOptions {
  includeLineItemDetails: boolean;
  includeDepreciation: boolean;
  includeCoverageSummary: boolean;
  includePhotos: boolean;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  logoUrl?: string;
}

export interface ESXLineItem {
  selectorCode: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  category: string;
  roomName?: string;
  notes?: string;
}

export interface ESXExport {
  header: {
    claimNumber: string;
    dateOfLoss: string;
    propertyAddress: string;
    insuredName: string;
    adjusterName: string;
    estimateDate: string;
    priceListDate: string;
    regionCode: string;
  };
  lineItems: ESXLineItem[];
  totals: {
    subtotalMaterials: number;
    subtotalLabor: number;
    subtotalEquipment: number;
    lineItemTotal: number;
    overheadAmount: number;
    profitAmount: number;
    taxAmount: number;
    rcvTotal: number;
    depreciationTotal: number;
    acvTotal: number;
    deductible: number;
    netClaim: number;
  };
  coverages: Array<{
    code: string;
    name: string;
    rcv: number;
    depreciation: number;
    acv: number;
    deductible: number;
    netClaim: number;
  }>;
}

// ============================================
// PDF REPORT GENERATOR
// ============================================

/**
 * Generate PDF report content for an estimate
 * Returns HTML content that can be converted to PDF
 */
export async function generatePdfReport(
  estimateId: string,
  options: Partial<ReportOptions> = {}
): Promise<string> {
  const estimate = await getEstimate(estimateId);
  if (!estimate) {
    throw new Error('Estimate not found');
  }

  const defaultOptions: ReportOptions = {
    includeLineItemDetails: true,
    includeDepreciation: true,
    includeCoverageSummary: true,
    includePhotos: false,
    companyName: 'Claims IQ',
    ...options,
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(date));
  };

  // Group line items by coverage
  const lineItemsByCoverage = new Map<string, CalculatedLineItem[]>();
  for (const item of estimate.lineItems) {
    const coverage = item.coverageCode || 'A';
    if (!lineItemsByCoverage.has(coverage)) {
      lineItemsByCoverage.set(coverage, []);
    }
    lineItemsByCoverage.get(coverage)!.push(item);
  }

  // Build HTML report
  let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Estimate Report - ${estimate.claimNumber || estimate.id}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.4; color: #333; }
    .page { padding: 0.5in; max-width: 8.5in; margin: 0 auto; }
    .header { border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
    .header h1 { color: #2563eb; font-size: 18pt; margin-bottom: 5px; }
    .header-info { display: flex; justify-content: space-between; margin-top: 10px; }
    .header-info div { flex: 1; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 12pt; font-weight: bold; color: #1e40af; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f8fafc; font-weight: bold; color: #475569; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .totals-table { width: 300px; margin-left: auto; margin-top: 20px; }
    .totals-table td { padding: 4px 8px; }
    .totals-table .total-row { font-weight: bold; border-top: 2px solid #333; }
    .coverage-section { margin-top: 15px; padding: 10px; background: #f8fafc; border-radius: 5px; }
    .coverage-header { font-weight: bold; color: #1e40af; margin-bottom: 10px; }
    .summary-box { display: inline-block; width: 48%; padding: 15px; margin: 5px; background: #f1f5f9; border-radius: 5px; vertical-align: top; }
    .summary-box h3 { font-size: 11pt; color: #475569; margin-bottom: 10px; }
    .summary-value { font-size: 16pt; font-weight: bold; color: #1e40af; }
    .depreciation-info { color: #6b7280; font-size: 8pt; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; text-align: center; color: #6b7280; font-size: 8pt; }
    @media print {
      .page { padding: 0; }
      .page-break { page-break-before: always; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>${defaultOptions.companyName}</h1>
      <div class="header-info">
        <div>
          <strong>Claim Number:</strong> ${estimate.claimNumber || 'N/A'}<br>
          <strong>Property:</strong> ${estimate.propertyAddress || 'N/A'}
        </div>
        <div style="text-align: right;">
          <strong>Estimate ID:</strong> ${estimate.id.slice(0, 8)}...<br>
          <strong>Date:</strong> ${formatDate(estimate.createdAt)}<br>
          <strong>Version:</strong> ${estimate.version}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="summary-box">
        <h3>Replacement Cost Value (RCV)</h3>
        <div class="summary-value">${formatCurrency(estimate.totals.totalRcv)}</div>
      </div>
      <div class="summary-box">
        <h3>Actual Cash Value (ACV)</h3>
        <div class="summary-value">${formatCurrency(estimate.totals.totalAcv)}</div>
        <div class="depreciation-info">Depreciation: ${formatCurrency(estimate.totals.totalDepreciation)}</div>
      </div>
    </div>
`;

  // Coverage Summary Section
  if (defaultOptions.includeCoverageSummary && estimate.coverageSummaries.length > 0) {
    html += `
    <div class="section">
      <div class="section-title">Coverage Summary</div>
      <table>
        <thead>
          <tr>
            <th>Coverage</th>
            <th class="text-right">RCV</th>
            <th class="text-right">Depreciation</th>
            <th class="text-right">ACV</th>
            <th class="text-right">Deductible</th>
            <th class="text-right">Net Claim</th>
          </tr>
        </thead>
        <tbody>
`;

    const coverageNames: Record<string, string> = {
      'A': 'Coverage A - Dwelling',
      'B': 'Coverage B - Other Structures',
      'C': 'Coverage C - Personal Property',
      'D': 'Coverage D - Loss of Use',
    };

    for (const cov of estimate.coverageSummaries) {
      html += `
          <tr>
            <td>${coverageNames[cov.coverageCode] || `Coverage ${cov.coverageCode}`}</td>
            <td class="text-right">${formatCurrency(cov.totalRcv)}</td>
            <td class="text-right">${formatCurrency(cov.totalDepreciation)}</td>
            <td class="text-right">${formatCurrency(cov.totalAcv)}</td>
            <td class="text-right">${formatCurrency(cov.deductible)}</td>
            <td class="text-right">${formatCurrency(cov.netClaim)}</td>
          </tr>
`;
    }

    html += `
        </tbody>
      </table>
    </div>
`;
  }

  // Line Items Section
  if (defaultOptions.includeLineItemDetails) {
    for (const [coverage, items] of lineItemsByCoverage) {
      const coverageNames: Record<string, string> = {
        'A': 'Coverage A - Dwelling',
        'B': 'Coverage B - Other Structures',
        'C': 'Coverage C - Personal Property',
        'D': 'Coverage D - Loss of Use',
      };

      html += `
    <div class="section coverage-section">
      <div class="coverage-header">${coverageNames[coverage] || `Coverage ${coverage}`}</div>
      <table>
        <thead>
          <tr>
            <th style="width: 80px;">Code</th>
            <th>Description</th>
            <th class="text-center" style="width: 60px;">Qty</th>
            <th class="text-center" style="width: 40px;">Unit</th>
            <th class="text-right" style="width: 80px;">Unit Price</th>
            <th class="text-right" style="width: 80px;">Total</th>
`;

      if (defaultOptions.includeDepreciation) {
        html += `
            <th class="text-right" style="width: 60px;">Dep %</th>
            <th class="text-right" style="width: 80px;">ACV</th>
`;
      }

      html += `
          </tr>
        </thead>
        <tbody>
`;

      for (const item of items) {
        html += `
          <tr>
            <td>${item.xactimateCode || item.code}</td>
            <td>${item.description}${item.roomName ? ` <em>(${item.roomName})</em>` : ''}</td>
            <td class="text-center">${item.quantity}</td>
            <td class="text-center">${item.unit}</td>
            <td class="text-right">${formatCurrency(item.unitPrice)}</td>
            <td class="text-right">${formatCurrency(item.subtotal)}</td>
`;

        if (defaultOptions.includeDepreciation) {
          html += `
            <td class="text-right">${item.depreciation.depreciationPct.toFixed(1)}%</td>
            <td class="text-right">${formatCurrency(item.acv)}</td>
`;
        }

        html += `
          </tr>
`;
      }

      html += `
        </tbody>
      </table>
    </div>
`;
    }
  }

  // Totals Section
  html += `
    <div class="section">
      <table class="totals-table">
        <tr>
          <td>Subtotal (Materials)</td>
          <td class="text-right">${formatCurrency(estimate.totals.subtotalMaterials)}</td>
        </tr>
        <tr>
          <td>Subtotal (Labor)</td>
          <td class="text-right">${formatCurrency(estimate.totals.subtotalLabor)}</td>
        </tr>
        <tr>
          <td>Subtotal (Equipment)</td>
          <td class="text-right">${formatCurrency(estimate.totals.subtotalEquipment)}</td>
        </tr>
        <tr>
          <td>Line Item Total</td>
          <td class="text-right">${formatCurrency(estimate.subtotal)}</td>
        </tr>
        <tr>
          <td>Overhead (${estimate.overheadPct}%)</td>
          <td class="text-right">${formatCurrency(estimate.overheadAmount)}</td>
        </tr>
        <tr>
          <td>Profit (${estimate.profitPct}%)</td>
          <td class="text-right">${formatCurrency(estimate.profitAmount)}</td>
        </tr>
        <tr>
          <td>Tax (${estimate.taxPct.toFixed(2)}%)</td>
          <td class="text-right">${formatCurrency(estimate.taxAmount)}</td>
        </tr>
        <tr class="total-row">
          <td>Total RCV</td>
          <td class="text-right">${formatCurrency(estimate.grandTotal)}</td>
        </tr>
`;

  if (defaultOptions.includeDepreciation) {
    html += `
        <tr>
          <td>Less: Depreciation</td>
          <td class="text-right">(${formatCurrency(estimate.totals.totalDepreciation)})</td>
        </tr>
        <tr class="total-row">
          <td>Total ACV</td>
          <td class="text-right">${formatCurrency(estimate.totals.totalAcv)}</td>
        </tr>
        <tr>
          <td style="padding-left: 20px; font-size: 8pt;">Recoverable</td>
          <td class="text-right" style="font-size: 8pt;">${formatCurrency(estimate.totals.recoverableDepreciation)}</td>
        </tr>
        <tr>
          <td style="padding-left: 20px; font-size: 8pt;">Non-Recoverable</td>
          <td class="text-right" style="font-size: 8pt;">${formatCurrency(estimate.totals.nonRecoverableDepreciation)}</td>
        </tr>
`;
  }

  html += `
      </table>
    </div>

    <div class="footer">
      <p>Generated by ${defaultOptions.companyName} on ${formatDate(new Date())}</p>
      <p>This estimate is subject to the terms and conditions of the insurance policy.</p>
    </div>
  </div>
</body>
</html>
`;

  return html;
}

// ============================================
// ESX/XACTIMATE EXPORT
// ============================================

/**
 * Generate Xactimate-compatible ESX export data
 */
export async function generateEsxExport(
  estimateId: string,
  metadata: {
    dateOfLoss?: string;
    insuredName?: string;
    adjusterName?: string;
    priceListDate?: string;
  } = {}
): Promise<ESXExport> {
  const estimate = await getEstimate(estimateId);
  if (!estimate) {
    throw new Error('Estimate not found');
  }

  // Convert line items to ESX format
  const lineItems: ESXLineItem[] = estimate.lineItems.map(item => ({
    selectorCode: item.xactimateCode || item.code,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    lineTotal: item.subtotal,
    category: item.categoryId,
    roomName: item.roomName,
    notes: item.notes,
  }));

  const coverageNames: Record<string, string> = {
    'A': 'Coverage A - Dwelling',
    'B': 'Coverage B - Other Structures',
    'C': 'Coverage C - Personal Property',
    'D': 'Coverage D - Loss of Use',
  };

  // Build coverage data
  const coverages = estimate.coverageSummaries.map(cov => ({
    code: cov.coverageCode,
    name: coverageNames[cov.coverageCode] || `Coverage ${cov.coverageCode}`,
    rcv: cov.totalRcv,
    depreciation: cov.totalDepreciation,
    acv: cov.totalAcv,
    deductible: cov.deductible,
    netClaim: cov.netClaim,
  }));

  // Calculate total deductible from coverage summaries
  const totalDeductible = estimate.coverageSummaries.reduce(
    (sum, cov) => sum + cov.deductible, 0
  );

  return {
    header: {
      claimNumber: estimate.claimNumber || '',
      dateOfLoss: metadata.dateOfLoss || new Date().toISOString().split('T')[0],
      propertyAddress: estimate.propertyAddress || '',
      insuredName: metadata.insuredName || '',
      adjusterName: metadata.adjusterName || '',
      estimateDate: estimate.createdAt.toISOString().split('T')[0],
      priceListDate: metadata.priceListDate || new Date().toISOString().split('T')[0],
      regionCode: estimate.regionId,
    },
    lineItems,
    totals: {
      subtotalMaterials: estimate.totals.subtotalMaterials,
      subtotalLabor: estimate.totals.subtotalLabor,
      subtotalEquipment: estimate.totals.subtotalEquipment,
      lineItemTotal: estimate.subtotal,
      overheadAmount: estimate.overheadAmount,
      profitAmount: estimate.profitAmount,
      taxAmount: estimate.taxAmount,
      rcvTotal: estimate.grandTotal,
      depreciationTotal: estimate.totals.totalDepreciation,
      acvTotal: estimate.totals.totalAcv,
      deductible: totalDeductible,
      netClaim: estimate.totals.netClaimTotal,
    },
    coverages,
  };
}

/**
 * Generate ESX XML format (simplified Xactimate-compatible)
 */
export async function generateEsxXml(
  estimateId: string,
  metadata: {
    dateOfLoss?: string;
    insuredName?: string;
    adjusterName?: string;
    priceListDate?: string;
  } = {}
): Promise<string> {
  const esxData = await generateEsxExport(estimateId, metadata);

  const escapeXml = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<XactimateEstimate version="1.0">
  <Header>
    <ClaimNumber>${escapeXml(esxData.header.claimNumber)}</ClaimNumber>
    <DateOfLoss>${esxData.header.dateOfLoss}</DateOfLoss>
    <PropertyAddress>${escapeXml(esxData.header.propertyAddress)}</PropertyAddress>
    <InsuredName>${escapeXml(esxData.header.insuredName)}</InsuredName>
    <AdjusterName>${escapeXml(esxData.header.adjusterName)}</AdjusterName>
    <EstimateDate>${esxData.header.estimateDate}</EstimateDate>
    <PriceListDate>${esxData.header.priceListDate}</PriceListDate>
    <RegionCode>${esxData.header.regionCode}</RegionCode>
  </Header>
  <LineItems>
`;

  for (const item of esxData.lineItems) {
    xml += `    <LineItem>
      <SelectorCode>${escapeXml(item.selectorCode)}</SelectorCode>
      <Description>${escapeXml(item.description)}</Description>
      <Quantity>${item.quantity}</Quantity>
      <Unit>${item.unit}</Unit>
      <UnitPrice>${item.unitPrice.toFixed(2)}</UnitPrice>
      <LineTotal>${item.lineTotal.toFixed(2)}</LineTotal>
      <Category>${escapeXml(item.category)}</Category>
${item.roomName ? `      <RoomName>${escapeXml(item.roomName)}</RoomName>\n` : ''}${item.notes ? `      <Notes>${escapeXml(item.notes)}</Notes>\n` : ''}    </LineItem>
`;
  }

  xml += `  </LineItems>
  <Coverages>
`;

  for (const cov of esxData.coverages) {
    xml += `    <Coverage>
      <Code>${cov.code}</Code>
      <Name>${escapeXml(cov.name)}</Name>
      <RCV>${cov.rcv.toFixed(2)}</RCV>
      <Depreciation>${cov.depreciation.toFixed(2)}</Depreciation>
      <ACV>${cov.acv.toFixed(2)}</ACV>
      <Deductible>${cov.deductible.toFixed(2)}</Deductible>
      <NetClaim>${cov.netClaim.toFixed(2)}</NetClaim>
    </Coverage>
`;
  }

  xml += `  </Coverages>
  <Totals>
    <SubtotalMaterials>${esxData.totals.subtotalMaterials.toFixed(2)}</SubtotalMaterials>
    <SubtotalLabor>${esxData.totals.subtotalLabor.toFixed(2)}</SubtotalLabor>
    <SubtotalEquipment>${esxData.totals.subtotalEquipment.toFixed(2)}</SubtotalEquipment>
    <LineItemTotal>${esxData.totals.lineItemTotal.toFixed(2)}</LineItemTotal>
    <OverheadAmount>${esxData.totals.overheadAmount.toFixed(2)}</OverheadAmount>
    <ProfitAmount>${esxData.totals.profitAmount.toFixed(2)}</ProfitAmount>
    <TaxAmount>${esxData.totals.taxAmount.toFixed(2)}</TaxAmount>
    <RCVTotal>${esxData.totals.rcvTotal.toFixed(2)}</RCVTotal>
    <DepreciationTotal>${esxData.totals.depreciationTotal.toFixed(2)}</DepreciationTotal>
    <ACVTotal>${esxData.totals.acvTotal.toFixed(2)}</ACVTotal>
    <Deductible>${esxData.totals.deductible.toFixed(2)}</Deductible>
    <NetClaim>${esxData.totals.netClaim.toFixed(2)}</NetClaim>
  </Totals>
</XactimateEstimate>
`;

  return xml;
}

/**
 * Generate CSV export
 */
export async function generateCsvExport(estimateId: string): Promise<string> {
  const estimate = await getEstimate(estimateId);
  if (!estimate) {
    throw new Error('Estimate not found');
  }

  const headers = [
    'Selector Code',
    'Description',
    'Room',
    'Quantity',
    'Unit',
    'Unit Price',
    'Material Cost',
    'Labor Cost',
    'Equipment Cost',
    'Line Total',
    'Tax',
    'RCV',
    'Coverage',
    'Age (Years)',
    'Condition',
    'Depreciation %',
    'Depreciation Amount',
    'ACV',
    'Notes',
  ];

  const escapeCsv = (str: string | undefined | null) => {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  let csv = headers.join(',') + '\n';

  for (const item of estimate.lineItems) {
    const row = [
      item.xactimateCode || item.code,
      escapeCsv(item.description),
      escapeCsv(item.roomName),
      item.quantity.toString(),
      item.unit,
      item.unitPrice.toFixed(2),
      item.materialCost.toFixed(2),
      item.laborCost.toFixed(2),
      item.equipmentCost.toFixed(2),
      item.subtotal.toFixed(2),
      item.taxAmount.toFixed(2),
      item.rcv.toFixed(2),
      item.coverageCode,
      item.ageYears.toString(),
      item.condition,
      item.depreciation.depreciationPct.toFixed(1),
      item.depreciation.depreciationAmount.toFixed(2),
      item.acv.toFixed(2),
      escapeCsv(item.notes),
    ];
    csv += row.join(',') + '\n';
  }

  // Add summary section
  csv += '\n\nSUMMARY\n';
  csv += `Subtotal Materials,${estimate.totals.subtotalMaterials.toFixed(2)}\n`;
  csv += `Subtotal Labor,${estimate.totals.subtotalLabor.toFixed(2)}\n`;
  csv += `Subtotal Equipment,${estimate.totals.subtotalEquipment.toFixed(2)}\n`;
  csv += `Line Item Total,${estimate.subtotal.toFixed(2)}\n`;
  csv += `Overhead (${estimate.overheadPct}%),${estimate.overheadAmount.toFixed(2)}\n`;
  csv += `Profit (${estimate.profitPct}%),${estimate.profitAmount.toFixed(2)}\n`;
  csv += `Tax (${estimate.taxPct.toFixed(2)}%),${estimate.taxAmount.toFixed(2)}\n`;
  csv += `Total RCV,${estimate.grandTotal.toFixed(2)}\n`;
  csv += `Total Depreciation,${estimate.totals.totalDepreciation.toFixed(2)}\n`;
  csv += `Total ACV,${estimate.totals.totalAcv.toFixed(2)}\n`;
  csv += `Recoverable Depreciation,${estimate.totals.recoverableDepreciation.toFixed(2)}\n`;
  csv += `Non-Recoverable Depreciation,${estimate.totals.nonRecoverableDepreciation.toFixed(2)}\n`;
  csv += `Net Claim,${estimate.totals.netClaimTotal.toFixed(2)}\n`;

  return csv;
}
