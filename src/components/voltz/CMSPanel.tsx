import React, { useState } from 'react';
import {
  Settings, X, ChevronUp, ChevronDown, Eye, EyeOff,
  RotateCcw, GripVertical, Minus, Plus, Layout, Save, Check
} from 'lucide-react';
import { useCMS, SectionConfig } from '@/contexts/CMSContext';
import { broadcastCMSUpdate } from '@/lib/cmsCache';
import { saveConfig as dbSaveConfig } from '@/lib/cmsData';

const SectionRow: React.FC<{
  section: SectionConfig;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggle: () => void;
  onMarginChange: (val: number) => void;
}> = ({ section, index, total, onMoveUp, onMoveDown, onToggle, onMarginChange }) => {
  const [showSpacing, setShowSpacing] = useState(false);

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        section.visible
          ? 'bg-white border-gray-200 shadow-sm'
          : 'bg-gray-50 border-gray-100 opacity-60'
      }`}
    >
      <div className="flex items-center gap-2 p-3">
        {/* Grip Handle */}
        <div className="text-gray-300 flex-shrink-0 cursor-grab">
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Order Badge */}
        <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-gray-500">{index + 1}</span>
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          <span className={`text-xs sm:text-sm font-semibold truncate block ${
            section.visible ? 'text-[#1a2332]' : 'text-gray-400 line-through'
          }`}>
            {section.label}
          </span>
          {section.marginTop !== 0 && (
            <span className="text-[10px] text-gray-400">
              Offset: {section.marginTop}px
            </span>
          )}
        </div>

        {/* Actions - larger touch targets on mobile */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => setShowSpacing(!showSpacing)}
            className={`w-9 h-9 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center transition-colors ${
              showSpacing ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-400'
            }`}
            title="Adjust spacing"
          >
            <Layout className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-[#1a2332] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move up"
          >
            <ChevronUp className="w-4 h-4" />
          </button>

          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-[#1a2332] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move down"
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          <button
            onClick={onToggle}
            className={`w-9 h-9 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center transition-colors ${
              section.visible
                ? 'hover:bg-green-50 text-green-600'
                : 'hover:bg-red-50 text-red-400'
            }`}
            title={section.visible ? 'Hide section' : 'Show section'}
          >
            {section.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Spacing Controls */}
      {showSpacing && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xs text-gray-500 whitespace-nowrap">Top Offset</span>
            <div className="flex items-center gap-1 flex-1">
              <button
                onClick={() => onMarginChange(Math.max(section.marginTop - 5, -50))}
                className="w-8 h-8 sm:w-6 sm:h-6 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0"
              >
                <Minus className="w-3 h-3 text-gray-600" />
              </button>
              <div className="flex-1 relative">
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={1}
                  value={section.marginTop}
                  onChange={(e) => onMarginChange(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#e31e24]"
                />
              </div>
              <button
                onClick={() => onMarginChange(Math.min(section.marginTop + 5, 50))}
                className="w-8 h-8 sm:w-6 sm:h-6 rounded-md bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors flex-shrink-0"
              >
                <Plus className="w-3 h-3 text-gray-600" />
              </button>
            </div>
            <span className="text-xs font-mono text-gray-500 w-10 text-right">
              {section.marginTop}px
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

const CMSPanel: React.FC = () => {
  const {
    sections,
    cmsPanelOpen,
    toggleCMSPanel,
    moveSection,
    toggleVisibility,
    updateMarginTop,
    resetToDefaults,
  } = useCMS();

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const visibleCount = sorted.filter(s => s.visible).length;
  const totalCount = sorted.length;

  const handleSave = async () => {
    setSaving(true);
    try {
      await dbSaveConfig('cms_sections', sections);
      window.dispatchEvent(new CustomEvent('voltz-sections-updated'));
      await broadcastCMSUpdate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save sections:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Floating CMS Toggle Button */}
      <button
        onClick={toggleCMSPanel}
        className={`fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-[60] w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300 group ${
          cmsPanelOpen
            ? 'bg-[#1a2332] text-white rotate-90'
            : 'bg-gradient-to-br from-[#e31e24] to-[#c91a1f] text-white hover:shadow-red-300/50 hover:scale-105'
        }`}
        title="Content Management"
      >
        <Settings className="w-5 h-5 sm:w-6 sm:h-6 transition-transform group-hover:rotate-45" />
      </button>

      {/* Backdrop */}
      {cmsPanelOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[65] transition-opacity"
          onClick={toggleCMSPanel}
        />
      )}

      {/* CMS Panel Drawer - full width on mobile, max 420px on larger screens */}
      <div
        className={`fixed top-0 left-0 h-full w-full sm:w-[420px] sm:max-w-[90vw] bg-gray-50 z-[70] shadow-2xl transform transition-transform duration-300 ease-out flex flex-col ${
          cmsPanelOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Panel Header */}
        <div className="bg-gradient-to-r from-[#1a2332] to-[#0f1923] text-white px-4 sm:px-6 py-4 sm:py-5 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <Layout className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold">Section Manager</h2>
                <p className="text-[10px] sm:text-xs text-gray-400">Reorder, show/hide, and adjust spacing</p>
              </div>
            </div>
            <button
              onClick={toggleCMSPanel}
              className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-300">
              <Eye className="w-3.5 h-3.5 text-green-400" />
              <span>{visibleCount} visible</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-300">
              <EyeOff className="w-3.5 h-3.5 text-gray-500" />
              <span>{totalCount - visibleCount} hidden</span>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="px-4 sm:px-6 py-3 bg-blue-50 border-b border-blue-100 flex-shrink-0">
          <p className="text-[10px] sm:text-xs text-blue-700 leading-relaxed">
            Use the <strong>arrow buttons</strong> to reorder sections, the <strong>eye icon</strong> to show/hide, 
            and the <strong>layout icon</strong> to adjust spacing between sections. 
            Use negative offset values to overlap sections and remove gaps.
          </p>
        </div>

        {/* Section List - scrollable area */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-2">
          {sorted.map((section, idx) => (
            <SectionRow
              key={section.id}
              section={section}
              index={idx}
              total={sorted.length}
              onMoveUp={() => moveSection(section.id, 'up')}
              onMoveDown={() => moveSection(section.id, 'down')}
              onToggle={() => toggleVisibility(section.id)}
              onMarginChange={(val) => updateMarginTop(section.id, val)}
            />
          ))}
        </div>

        {/* Panel Footer - always at bottom */}
        <div className="bg-white border-t border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={resetToDefaults}
              className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 rounded-xl text-sm font-semibold transition-all ${
                saved
                  ? 'bg-green-600 text-white'
                  : saving
                  ? 'bg-gray-400 text-white cursor-wait'
                  : 'bg-[#e31e24] text-white hover:bg-[#c91a1f] shadow-md shadow-red-200'
              }`}
            >
              {saved ? (
                <><Check className="w-4 h-4" /> Saved!</>
              ) : saving ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
              ) : (
                <><Save className="w-4 h-4" /> Save Changes</>
              )}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-2 text-center">
            Changes are saved to the server and reflected on all visitor devices immediately.
          </p>
        </div>
      </div>
    </>
  );
};

export default CMSPanel;
