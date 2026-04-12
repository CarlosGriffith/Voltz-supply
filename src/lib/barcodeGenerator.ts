/**
 * Code128B Barcode Generator
 * Generates SVG barcode strings from product names.
 * Each product name gets a deterministic unique barcode.
 */

// Code128B encoding table (character index 0-106)
const CODE128B_PATTERNS: string[] = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '1100011101011',
];

// Start code B = 104, Stop = 106
const START_B = 104;
const STOP = 106;

/**
 * Generate a deterministic numeric code from a product name.
 * This creates a unique-ish barcode value for each product.
 */
export function productNameToCode(name: string): string {
  // Create a hash-like numeric string from the product name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const char = name.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Make it positive and pad to 12 digits
  const absHash = Math.abs(hash);
  const code = String(absHash).padStart(12, '0').slice(0, 12);
  return code;
}

/**
 * Encode a string into Code128B barcode pattern
 */
export function encodeCode128B(text: string): string {
  const values: number[] = [START_B];
  
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    if (charCode >= 32 && charCode <= 126) {
      values.push(charCode - 32);
    }
  }
  
  // Calculate checksum
  let checksum = values[0]; // Start with start code value
  for (let i = 1; i < values.length; i++) {
    checksum += values[i] * i;
  }
  checksum = checksum % 103;
  values.push(checksum);
  values.push(STOP);
  
  // Convert to bar pattern
  return values.map(v => CODE128B_PATTERNS[v]).join('');
}

/**
 * Generate an SVG barcode string
 */
export function generateBarcodeSVG(
  text: string,
  options: {
    width?: number;
    height?: number;
    showText?: boolean;
    fontSize?: number;
    margin?: number;
  } = {}
): string {
  const {
    width = 200,
    height = 80,
    showText = true,
    fontSize = 12,
    margin = 10,
  } = options;

  const pattern = encodeCode128B(text);
  const barWidth = (width - margin * 2) / pattern.length;
  const barHeight = showText ? height - margin * 2 - fontSize - 4 : height - margin * 2;
  
  let bars = '';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '1') {
      const x = margin + i * barWidth;
      bars += `<rect x="${x}" y="${margin}" width="${barWidth}" height="${barHeight}" fill="black"/>`;
    }
  }

  const textY = margin + barHeight + fontSize + 2;
  const textElement = showText
    ? `<text x="${width / 2}" y="${textY}" text-anchor="middle" font-family="monospace" font-size="${fontSize}" fill="black">${text}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="white"/>
    ${bars}
    ${textElement}
  </svg>`;
}

/**
 * Generate a print-ready HTML page with barcode labels
 */
export function generateBarcodePrintHTML(
  productName: string,
  barcodeValue: string,
  quantity: number,
  labelSize: { name: string; widthMM: number; heightMM: number }
): string {
  const { widthMM, heightMM } = labelSize;
  
  // Calculate barcode dimensions relative to label
  const barcodeWidthPx = Math.round(widthMM * 3.2); // ~3.2px per mm at screen res
  const barcodeHeightPx = Math.round(heightMM * 3.2);
  const barcodeSvgHeight = Math.max(40, barcodeHeightPx - 30);
  const fontSize = Math.max(8, Math.min(14, Math.round(widthMM * 0.12)));
  const nameFontSize = Math.max(7, Math.min(12, Math.round(widthMM * 0.1)));

  const pattern = encodeCode128B(barcodeValue);
  
  // Build barcode SVG inline
  const svgWidth = barcodeWidthPx - 10;
  const barUnitWidth = svgWidth / pattern.length;
  const barH = barcodeSvgHeight - 20;
  
  let barsHtml = '';
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === '1') {
      const x = i * barUnitWidth;
      barsHtml += `<rect x="${x}" y="0" width="${barUnitWidth}" height="${barH}" fill="black"/>`;
    }
  }

  const labelHtml = `
    <div class="label" style="width:${widthMM}mm;height:${heightMM}mm;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;padding:2mm;page-break-inside:avoid;overflow:hidden;">
      <div style="font-family:Arial,sans-serif;font-size:${nameFontSize}px;font-weight:bold;text-align:center;line-height:1.2;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:1mm;">${productName}</div>
      <svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${barcodeSvgHeight}" viewBox="0 0 ${svgWidth} ${barcodeSvgHeight}" style="max-width:100%;">
        ${barsHtml}
        <text x="${svgWidth / 2}" y="${barH + 14}" text-anchor="middle" font-family="monospace" font-size="${fontSize}" fill="black">${barcodeValue}</text>
      </svg>
    </div>
  `;

  const labels = Array(quantity).fill(labelHtml).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Barcode Labels - ${productName}</title>
  <style>
    @page {
      margin: 5mm;
    }
    body {
      margin: 0;
      padding: 5mm;
      font-family: Arial, sans-serif;
    }
    .labels-container {
      display: flex;
      flex-wrap: wrap;
      gap: 2mm;
    }
    .label {
      border: 0.5px dashed #ccc;
    }
    @media print {
      .label {
        border: none;
      }
    }
  </style>
</head>
<body>
  <div class="labels-container">
    ${labels}
  </div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;
}
