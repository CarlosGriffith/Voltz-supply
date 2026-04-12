import React, { useState } from 'react';
import {
  ArrowLeft,
  Plus, Edit3, Trash2, Save, X, Check, Eye, EyeOff,
  FolderOpen, Palette, Tag, AlertCircle, RotateCcw, Package
} from 'lucide-react';
import { useCMS, CMSCategory } from '@/contexts/CMSContext';
import { useCMSNotification } from '@/contexts/CMSNotificationContext';

const ICON_OPTIONS = [
  'Zap', 'Cpu', 'ToggleLeft', 'BatteryCharging', 'Radio', 'Gauge',
  'Droplets', 'Cable', 'Wrench', 'Power', 'Cog', 'Waves', 'ShieldOff',
  'Box', 'CircuitBoard', 'Plug', 'Thermometer', 'Lightbulb', 'Settings',
];

const COLOR_OPTIONS = [
  '#e31e24', '#2563eb', '#7c3aed', '#16a34a', '#9333ea', '#ea580c',
  '#0891b2', '#059669', '#6366f1', '#dc2626', '#ca8a04', '#0284c7',
  '#be123c', '#4f46e5', '#0d9488', '#d97706',
];

interface CategoryForm {
  name: string;
  slug: string;
  description: string;
  color: string;
  icon: string;
  visible: boolean;
}

const emptyCategoryForm: CategoryForm = {
  name: '',
  slug: '',
  description: '',
  color: '#e31e24',
  icon: 'Zap',
  visible: true,
};

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

const CMSCategoryManager: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { notify } = useCMSNotification();
  const { categories, addCategory, updateCategory, deleteCategory } = useCMS();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyCategoryForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  const visibleCount = categories.filter(c => c.visible).length;

  const startAdd = () => {
    setShowAddForm(true);
    setEditingId(null);
    setForm(emptyCategoryForm);
  };

  const startEdit = (cat: CMSCategory) => {
    setEditingId(cat.id);
    setShowAddForm(false);
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      color: cat.color,
      icon: cat.icon,
      visible: cat.visible,
    });
  };

  const handleSaveNew = () => {
    if (!form.name.trim()) return;
    addCategory({
      slug: form.slug || generateSlug(form.name),
      name: form.name.trim(),
      description: form.description.trim(),
      color: form.color,
      icon: form.icon,
      productCount: 0,
      visible: form.visible,
    });
    setShowAddForm(false);
    setForm(emptyCategoryForm);
    showSaved('added');
  };

  const handleSaveEdit = () => {
    if (!editingId || !form.name.trim()) return;
    updateCategory(editingId, {
      name: form.name.trim(),
      slug: form.slug || generateSlug(form.name),
      description: form.description.trim(),
      color: form.color,
      icon: form.icon,
      visible: form.visible,
    });
    setEditingId(null);
    setForm(emptyCategoryForm);
    showSaved('updated');
  };

  const handleDelete = (id: string) => {
    deleteCategory(id);
    setDeleteConfirm(null);
    showSaved('deleted');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowAddForm(false);
    setForm(emptyCategoryForm);
  };

  const showSaved = (action: 'added' | 'updated' | 'deleted') => {
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
    const detail =
      action === 'added' ? 'Category added' : action === 'updated' ? 'Category updated' : 'Category deleted';
    notify({ variant: 'success', title: 'Changes saved', subtitle: `Website → Categories — ${detail}` });
  };

  const renderForm = (isNew: boolean) => (
    <div className={`${isNew ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'} border rounded-xl sm:rounded-2xl p-4 sm:p-6 mb-6`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-[#1a2332] flex items-center gap-2 text-sm sm:text-base">
          {isNew ? <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" /> : <Edit3 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />}
          {isNew ? 'Add New Category' : 'Edit Category'}
        </h3>
        <button onClick={cancelEdit} className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Category Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => {
              setForm(f => ({
                ...f,
                name: e.target.value,
                slug: generateSlug(e.target.value),
              }));
            }}
            placeholder="e.g. Circuit Breakers"
            className={`w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none ${isNew ? 'focus:border-green-500' : 'focus:border-blue-500'}`}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">URL Slug</label>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))}
            placeholder="auto-generated-from-name"
            className={`w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none ${isNew ? 'focus:border-green-500' : 'focus:border-blue-500'}`}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Brief description of this category..."
            rows={2}
            className={`w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none resize-none ${isNew ? 'focus:border-green-500' : 'focus:border-blue-500'}`}
          />
        </div>

        {/* Color Picker */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
            <Palette className="w-3 h-3" /> Category Color
          </label>
          <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => setForm(f => ({ ...f, color }))}
                className={`w-9 h-9 sm:w-8 sm:h-8 rounded-lg border-2 transition-all ${
                  form.color === color ? 'border-gray-800 scale-110 shadow-md' : 'border-transparent hover:border-gray-300'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {/* Icon Selector */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
            <Tag className="w-3 h-3" /> Icon Name
          </label>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {ICON_OPTIONS.map(icon => (
              <button
                key={icon}
                type="button"
                onClick={() => setForm(f => ({ ...f, icon }))}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-all ${
                  form.icon === icon
                    ? 'bg-[#1a2332] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* Visible Toggle */}
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.visible}
              onChange={(e) => setForm(f => ({ ...f, visible: e.target.checked }))}
              className="w-5 h-5 sm:w-4 sm:h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm font-medium text-gray-700">Visible on website</span>
          </label>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 mt-4">
        <button onClick={cancelEdit} className="px-4 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 text-center">
          Cancel
        </button>
        <button
          onClick={isNew ? handleSaveNew : handleSaveEdit}
          disabled={!form.name.trim()}
          className={`flex items-center justify-center gap-2 px-5 py-2.5 sm:py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed ${
            isNew ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isNew ? <Plus className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          {isNew ? 'Add Category' : 'Save Changes'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Info */}
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => (onBack ? onBack() : window.history.back())}
          className="mt-1 p-2 rounded-lg hover:bg-gray-100 text-gray-600"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 bg-blue-50 border border-blue-100 rounded-xl p-3 sm:p-4">
          <p className="text-xs sm:text-sm text-blue-700 leading-relaxed">
            Manage your product categories here. You can <strong>add new categories</strong>, <strong>edit existing ones</strong>,
            <strong> hide/show</strong> categories on the website, and <strong>delete</strong> categories.
            Product counts are calculated automatically based on the products assigned to each category.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 sm:gap-4 bg-gray-50 rounded-xl px-3 sm:px-5 py-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <FolderOpen className="w-4 h-4 text-[#e31e24]" />
          <span className="font-semibold text-[#1a2332]">{categories.length}</span>
          <span className="text-gray-500">total</span>
        </div>
        <div className="w-px h-4 bg-gray-300" />
        <div className="flex items-center gap-2 text-sm">
          <Eye className="w-4 h-4 text-green-500" />
          <span className="font-semibold text-[#1a2332]">{visibleCount}</span>
          <span className="text-gray-500">visible</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={startAdd}
          className="flex items-center gap-1.5 sm:gap-2 bg-[#e31e24] text-white px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold hover:bg-[#c91a1f] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Category
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && renderForm(true)}

      {/* Category List */}
      <div className="space-y-2">
        {categories.map((cat) => (
          <div key={cat.id}>
            {editingId === cat.id ? (
              renderForm(false)
            ) : (
              <div className={`rounded-xl border transition-all ${
                cat.visible ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-60'
              }`}>
                <div className="flex items-center gap-2 sm:gap-4 p-3 sm:p-4">
                  {/* Color dot */}
                  <div
                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${cat.color}15` }}
                  >
                    <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full" style={{ backgroundColor: cat.color }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className={`font-bold text-xs sm:text-sm ${cat.visible ? 'text-[#1a2332]' : 'text-gray-400 line-through'}`}>
                        {cat.name}
                      </h4>
                      {!cat.visible && (
                        <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">HIDDEN</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 mt-0.5 flex-wrap">
                      <span className="text-[10px] sm:text-xs text-gray-500">/{cat.slug}</span>
                      <span className="text-[10px] sm:text-xs text-gray-300 hidden sm:inline">|</span>
                      <span className="text-[10px] sm:text-xs text-gray-500 flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        {cat.productCount}
                      </span>
                    </div>
                    {cat.description && (
                      <p className="text-[10px] sm:text-xs text-gray-400 mt-1 truncate hidden sm:block">{cat.description}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                    <button
                      onClick={() => updateCategory(cat.id, { visible: !cat.visible })}
                      className={`w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors ${
                        cat.visible ? 'hover:bg-green-50 text-green-600' : 'hover:bg-red-50 text-red-400'
                      }`}
                      title={cat.visible ? 'Hide category' : 'Show category'}
                    >
                      {cat.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => startEdit(cat)}
                      className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg hover:bg-blue-50 flex items-center justify-center text-gray-400 hover:text-blue-600"
                      title="Edit category"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(cat.id)}
                      className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-600"
                      title="Delete category"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Delete Confirmation - responsive */}
                {deleteConfirm === cat.id && (
                  <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-1 border-t border-red-100 bg-red-50/30">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                      <div className="flex items-start gap-2 flex-1">
                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5 sm:mt-0" />
                        <p className="text-xs sm:text-sm text-red-700">
                          Delete <strong>{cat.name}</strong>? This cannot be undone.
                        </p>
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50 text-center"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDelete(cat.id)}
                          className="flex-1 sm:flex-none px-3 py-2 sm:py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 text-center"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Save Status */}
      {saveStatus === 'saved' && (
        <div className="fixed bottom-6 right-6 bg-green-600 text-white px-4 sm:px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in z-50">
          <Check className="w-5 h-5" />
          <span className="font-semibold text-sm">Changes saved!</span>
        </div>
      )}
    </div>
  );
};

export default CMSCategoryManager;
