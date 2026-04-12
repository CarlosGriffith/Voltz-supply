import React, { useState } from 'react';
import { X, Printer, Minus, Plus, ChevronDown } from 'lucide-react';
import { productNameToCode, generateBarcodeSVG, generateBarcodePrintHTML } from '@/lib/barcodeGenerator';

const LABEL_SIZES = [
  { name: '1" x 0.5" (Small)', widthMM: 25.4, heightMM: 12.7 },
  { name: '1.25" x 1" (Standard)', widthMM: 31.75, heightMM: 25.4 },
  { name: '2" x 1" (Medium)', widthMM: 50.8, heightMM: 25.4 },
  { name: '2.25" x 1.25" (Shipping)', widthMM: 57.15, heightMM: 31.75 },
  { name: '2.625" x 1" (Address)', widthMM: 66.68, heightMM: 25.4 },
  { name: '3" x 1" (Wide)', widthMM: 76.2, heightMM: 25.4 },
  { name: '3" x 2" (Large)', widthMM: 76.2, heightMM: 50.8 },
  { name: '4" x 2" (Extra Large)', widthMM: 101.6, heightMM: 50.8 },
  { name: '4" x 3" (Warehouse)', widthMM: 101.6, heightMM: 76.2 },
  { name: '4" x 6" (Shipping Label)', widthMM: 101.6, heightMM: 152.4 },
];

interface BarcodePrintModalProps {
  productName: string;
  onClose: () => void;
}

const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({ productName, onClose }) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedSizeIdx, setSelectedSizeIdx] = useState(2); // Default: 2" x 1"
  const [showSizeDropdown, setShowSizeDropdown] = useState(false);

  const barcodeValue = productNameToCode(productName);
  const selectedSize = LABEL_SIZES[selectedSizeIdx];

  // Generate preview SVG
  const previewSvg = generateBarcodeSVG(barcodeValue, {
    width: 240,
    height: 100,
    showText: true,
    fontSize: 13,
    margin: 8,
  });

  const handlePrint = () => {
    const html = generateBarcodePrintHTML(productName, barcodeValue, quantity, selectedSize);
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  // Close on Escape
  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
              <Printer className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Print Barcode Labels</h3>
              <p className="text-gray-400 text-xs truncate max-w-[220px]">{productName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Barcode Preview */}
          <div className="bg-gray-50 rounded-xl p-4 flex flex-col items-center border border-gray-100">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Barcode Preview</p>
            <div
              className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm"
              dangerouslySetInnerHTML={{ __html: previewSvg }}
            />
            <p className="text-[10px] text-gray-400 mt-2">
              Unique Code: <span className="font-mono font-bold text-gray-600">{barcodeValue}</span>
            </p>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Number of Labels</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                min={1}
                max={500}
                value={quantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val >= 1 && val <= 500) setQuantity(val);
                }}
                className="w-20 text-center border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-bold text-[#1a2332] outline-none focus:border-[#e31e24]"
              />
              <button
                onClick={() => setQuantity(q => Math.min(500, q + 1))}
                className="w-10 h-10 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
              {/* Quick quantity buttons */}
              <div className="flex gap-1 ml-2">
                {[5, 10, 25, 50].map(n => (
                  <button
                    key={n}
                    onClick={() => setQuantity(n)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      quantity === n ? 'bg-[#e31e24] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Label Size */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Label Size</label>
            <div className="relative">
              <button
                onClick={() => setShowSizeDropdown(!showSizeDropdown)}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-left flex items-center justify-between hover:border-gray-300 transition-colors"
              >
                <span className="font-medium text-[#1a2332]">{selectedSize.name}</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showSizeDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showSizeDropdown && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                  <div className="p-1.5">
                    {LABEL_SIZES.map((size, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setSelectedSizeIdx(idx); setShowSizeDropdown(false); }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          idx === selectedSizeIdx
                            ? 'bg-[#e31e24]/5 text-[#e31e24] font-semibold'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span className="font-medium">{size.name}</span>
                        <span className="text-xs text-gray-400 ml-2">
                          ({size.widthMM.toFixed(1)} x {size.heightMM.toFixed(1)} mm)
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-700 font-medium">Total labels to print:</span>
              <span className="text-blue-900 font-bold text-lg">{quantity}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-blue-600 mt-1">
              <span>Label size: {selectedSize.name}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-[#e31e24] text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-[#c91a1f] transition-colors shadow-md shadow-red-200"
          >
            <Printer className="w-4 h-4" />
            Print {quantity} Label{quantity !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BarcodePrintModal;
