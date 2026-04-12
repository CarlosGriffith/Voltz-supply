import React, { useState, useEffect } from 'react';
import {
  Building2, Plus, Trash2, Save, Check, ChevronDown, ChevronUp,
  AlertCircle, Target, BarChart3, Award, Users, Clock, Shield
} from 'lucide-react';
import { useCMS, type CompanyProfileData } from '@/contexts/CMSContext';
import { useCMSNotification } from '@/contexts/CMSNotificationContext';

/* ─── Collapsible Section Wrapper ─── */
const CollapsibleSection: React.FC<{
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, subtitle, icon, iconBg, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 sm:gap-3 p-3 sm:p-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-[#1a2332] text-xs sm:text-sm">{title}</h3>
          <p className="text-[10px] sm:text-xs text-gray-400">{subtitle}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>
      {open && <div className="border-t border-gray-100 p-3 sm:p-4 bg-gray-50/50">{children}</div>}
    </div>
  );
};

const CMSCompanyProfileManager: React.FC = () => {
  const { notify } = useCMSNotification();
  const { companyProfile, updateCompanyProfile } = useCMS();
  const [draft, setDraft] = useState<CompanyProfileData>(companyProfile);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(companyProfile);
  }, [companyProfile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCompanyProfile(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      notify({ variant: 'success', title: 'Changes saved', subtitle: 'Website → Company profile' });
    } catch (err) {
      console.error('[CMSCompanyProfileManager] Save failed:', err);
      notify({
        variant: 'error',
        title: 'Changes not saved',
        subtitle: `Website → Company profile — ${err instanceof Error ? err.message : 'Error'}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const set = (field: keyof CompanyProfileData, value: any) => {
    setDraft(d => ({ ...d, [field]: value }));
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 sm:p-4 mb-2">
        <div className="flex items-start gap-2 sm:gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs sm:text-sm text-blue-700 leading-relaxed">
            Edit your company profile content below. All changes will be reflected on the <strong>Company Profile</strong> page across all visitor devices immediately after saving.
          </p>
        </div>
      </div>

      {/* ─── Hero Section ─── */}
      <CollapsibleSection
        title="Hero Section"
        subtitle="Main heading, highlight text, and description"
        icon={<Building2 className="w-4 h-4 text-red-600" />}
        iconBg="bg-red-100"
        defaultOpen={true}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Hero Title</label>
            <input type="text" value={draft.heroTitle} onChange={(e) => set('heroTitle', e.target.value)}
              className="w-full px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24] bg-white" placeholder="Powering Industry" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Highlight Text (colored)</label>
            <input type="text" value={draft.heroHighlight} onChange={(e) => set('heroHighlight', e.target.value)}
              className="w-full px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24] bg-white" placeholder="Since 2001" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
            <textarea value={draft.heroDescription} onChange={(e) => set('heroDescription', e.target.value)} rows={3}
              className="w-full px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24] bg-white resize-none" />
          </div>
        </div>
      </CollapsibleSection>

      {/* ─── Mission ─── */}
      <CollapsibleSection
        title="Mission Section"
        subtitle="Mission title and paragraphs"
        icon={<Target className="w-4 h-4 text-blue-600" />}
        iconBg="bg-blue-100"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Mission Title</label>
            <input type="text" value={draft.missionTitle} onChange={(e) => set('missionTitle', e.target.value)}
              className="w-full px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24] bg-white" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-600">Mission Paragraphs</label>
              <button onClick={() => set('missionParagraphs', [...draft.missionParagraphs, ''])}
                className="flex items-center gap-1 text-xs text-blue-600 font-semibold hover:text-blue-800">
                <Plus className="w-3 h-3" /> Add Paragraph
              </button>
            </div>
            {draft.missionParagraphs.map((p, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <textarea value={p} rows={3}
                  onChange={(e) => {
                    const updated = [...draft.missionParagraphs];
                    updated[idx] = e.target.value;
                    set('missionParagraphs', updated);
                  }}
                  className="flex-1 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24] bg-white resize-none" />
                <button onClick={() => set('missionParagraphs', draft.missionParagraphs.filter((_, i) => i !== idx))}
                  className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0 mt-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* ─── Stats ─── */}
      <CollapsibleSection
        title="Statistics"
        subtitle="Key numbers displayed on the profile page"
        icon={<BarChart3 className="w-4 h-4 text-green-600" />}
        iconBg="bg-green-100"
      >
        <div className="space-y-2">
          {draft.stats.map((stat, idx) => (
            <div key={idx} className="bg-white rounded-lg p-2 sm:p-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input type="text" value={stat.value}
                  onChange={(e) => {
                    const updated = [...draft.stats];
                    updated[idx] = { ...stat, value: e.target.value };
                    set('stats', updated);
                  }}
                  placeholder="Value (e.g. 25+)"
                  className="sm:w-28 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24] font-bold" />
                <div className="flex gap-2 flex-1">
                  <input type="text" value={stat.label}
                    onChange={(e) => {
                      const updated = [...draft.stats];
                      updated[idx] = { ...stat, label: e.target.value };
                      set('stats', updated);
                    }}
                    placeholder="Label"
                    className="flex-1 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24]" />
                  <button onClick={() => set('stats', draft.stats.filter((_, i) => i !== idx))}
                    className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => set('stats', [...draft.stats, { label: '', value: '' }])}
            className="flex items-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg bg-green-50 text-green-700 text-sm font-semibold hover:bg-green-100 transition-colors w-full justify-center">
            <Plus className="w-4 h-4" /> Add Statistic
          </button>
        </div>
      </CollapsibleSection>

      {/* ─── Core Values ─── */}
      <CollapsibleSection
        title="Core Values"
        subtitle="Company values displayed in the mission section"
        icon={<Shield className="w-4 h-4 text-purple-600" />}
        iconBg="bg-purple-100"
      >
        <div className="space-y-3">
          {draft.values.map((val, idx) => (
            <div key={idx} className="bg-white rounded-lg p-2 sm:p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input type="text" value={val.title}
                  onChange={(e) => {
                    const updated = [...draft.values];
                    updated[idx] = { ...val, title: e.target.value };
                    set('values', updated);
                  }}
                  placeholder="Value title"
                  className="flex-1 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm font-semibold outline-none focus:border-[#e31e24]" />
                <button onClick={() => set('values', draft.values.filter((_, i) => i !== idx))}
                  className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <textarea value={val.description} rows={2}
                onChange={(e) => {
                  const updated = [...draft.values];
                  updated[idx] = { ...val, description: e.target.value };
                  set('values', updated);
                }}
                placeholder="Description"
                className="w-full px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24] resize-none" />
            </div>
          ))}
          <button onClick={() => set('values', [...draft.values, { title: '', description: '' }])}
            className="flex items-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg bg-purple-50 text-purple-700 text-sm font-semibold hover:bg-purple-100 transition-colors w-full justify-center">
            <Plus className="w-4 h-4" /> Add Value
          </button>
        </div>
      </CollapsibleSection>

      {/* ─── Milestones ─── */}
      <CollapsibleSection
        title="Company Milestones"
        subtitle="Timeline of key events in company history"
        icon={<Clock className="w-4 h-4 text-amber-600" />}
        iconBg="bg-amber-100"
      >
        <div className="space-y-2">
          {draft.milestones.map((m, idx) => (
            <div key={idx} className="bg-white rounded-lg p-2 sm:p-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex gap-2">
                  <input type="text" value={m.year}
                    onChange={(e) => {
                      const updated = [...draft.milestones];
                      updated[idx] = { ...m, year: e.target.value };
                      set('milestones', updated);
                    }}
                    placeholder="Year"
                    className="w-20 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm font-bold outline-none focus:border-[#e31e24]" />
                  <input type="text" value={m.title}
                    onChange={(e) => {
                      const updated = [...draft.milestones];
                      updated[idx] = { ...m, title: e.target.value };
                      set('milestones', updated);
                    }}
                    placeholder="Title"
                    className="flex-1 sm:w-40 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24]" />
                </div>
                <div className="flex gap-2 flex-1">
                  <input type="text" value={m.desc}
                    onChange={(e) => {
                      const updated = [...draft.milestones];
                      updated[idx] = { ...m, desc: e.target.value };
                      set('milestones', updated);
                    }}
                    placeholder="Description"
                    className="flex-1 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24]" />
                  <button onClick={() => set('milestones', draft.milestones.filter((_, i) => i !== idx))}
                    className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => set('milestones', [...draft.milestones, { year: '', title: '', desc: '' }])}
            className="flex items-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 transition-colors w-full justify-center">
            <Plus className="w-4 h-4" /> Add Milestone
          </button>
        </div>
      </CollapsibleSection>

      {/* ─── Leadership Team ─── */}
      <CollapsibleSection
        title="Leadership Team"
        subtitle="Team members displayed on the profile page"
        icon={<Users className="w-4 h-4 text-cyan-600" />}
        iconBg="bg-cyan-100"
      >
        <div className="space-y-2">
          {draft.team.map((member, idx) => (
            <div key={idx} className="bg-white rounded-lg p-2 sm:p-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex gap-2">
                  <input type="text" value={member.name}
                    onChange={(e) => {
                      const updated = [...draft.team];
                      updated[idx] = { ...member, name: e.target.value };
                      set('team', updated);
                    }}
                    placeholder="Name"
                    className="flex-1 sm:w-36 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24]" />
                  <input type="text" value={member.role}
                    onChange={(e) => {
                      const updated = [...draft.team];
                      updated[idx] = { ...member, role: e.target.value };
                      set('team', updated);
                    }}
                    placeholder="Role"
                    className="flex-1 sm:w-40 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24]" />
                </div>
                <div className="flex gap-2 flex-1">
                  <input type="text" value={member.desc}
                    onChange={(e) => {
                      const updated = [...draft.team];
                      updated[idx] = { ...member, desc: e.target.value };
                      set('team', updated);
                    }}
                    placeholder="Short description"
                    className="flex-1 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24]" />
                  <button onClick={() => set('team', draft.team.filter((_, i) => i !== idx))}
                    className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => set('team', [...draft.team, { name: '', role: '', desc: '' }])}
            className="flex items-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg bg-cyan-50 text-cyan-700 text-sm font-semibold hover:bg-cyan-100 transition-colors w-full justify-center">
            <Plus className="w-4 h-4" /> Add Team Member
          </button>
        </div>
      </CollapsibleSection>

      {/* ─── Certifications ─── */}
      <CollapsibleSection
        title="Certifications & Partnerships"
        subtitle="Industry certifications and partner badges"
        icon={<Award className="w-4 h-4 text-rose-600" />}
        iconBg="bg-rose-100"
      >
        <div className="space-y-2">
          {draft.certifications.map((cert, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-white rounded-lg p-2">
              <input type="text" value={cert}
                onChange={(e) => {
                  const updated = [...draft.certifications];
                  updated[idx] = e.target.value;
                  set('certifications', updated);
                }}
                placeholder="Certification name"
                className="flex-1 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24]" />
              <button onClick={() => set('certifications', draft.certifications.filter((_, i) => i !== idx))}
                className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button onClick={() => set('certifications', [...draft.certifications, ''])}
            className="flex items-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg bg-rose-50 text-rose-700 text-sm font-semibold hover:bg-rose-100 transition-colors w-full justify-center">
            <Plus className="w-4 h-4" /> Add Certification
          </button>
        </div>
      </CollapsibleSection>

      {/* ─── Why Choose Us ─── */}
      <CollapsibleSection
        title="Why Choose Us"
        subtitle="Key selling points displayed at the bottom"
        icon={<BarChart3 className="w-4 h-4 text-indigo-600" />}
        iconBg="bg-indigo-100"
      >
        <div className="space-y-3">
          {draft.whyChooseUs.map((item, idx) => (
            <div key={idx} className="bg-white rounded-lg p-2 sm:p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input type="text" value={item.title}
                  onChange={(e) => {
                    const updated = [...draft.whyChooseUs];
                    updated[idx] = { ...item, title: e.target.value };
                    set('whyChooseUs', updated);
                  }}
                  placeholder="Title"
                  className="flex-1 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm font-semibold outline-none focus:border-[#e31e24]" />
                <button onClick={() => set('whyChooseUs', draft.whyChooseUs.filter((_, i) => i !== idx))}
                  className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <input type="text" value={item.desc}
                onChange={(e) => {
                  const updated = [...draft.whyChooseUs];
                  updated[idx] = { ...item, desc: e.target.value };
                  set('whyChooseUs', updated);
                }}
                placeholder="Description"
                className="w-full px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24]" />
            </div>
          ))}
          <button onClick={() => set('whyChooseUs', [...draft.whyChooseUs, { title: '', desc: '' }])}
            className="flex items-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-semibold hover:bg-indigo-100 transition-colors w-full justify-center">
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>
      </CollapsibleSection>

      {/* ─── Save Button ─── */}
      <div className="pt-4 border-t border-gray-200">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full flex items-center justify-center gap-2 px-5 py-3.5 sm:py-3 rounded-xl text-sm font-bold transition-all ${
            saved
              ? 'bg-green-600 text-white'
              : saving
              ? 'bg-gray-400 text-white cursor-wait'
              : 'bg-[#e31e24] text-white hover:bg-[#c91a1f] shadow-md shadow-red-200'
          }`}
        >
          {saved ? (
            <><Check className="w-4 h-4" /> Company Profile Saved!</>
          ) : saving ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
          ) : (
            <><Save className="w-4 h-4" /> Save Company Profile</>
          )}
        </button>
        <p className="text-[10px] text-gray-400 mt-2 text-center">
          Changes will be reflected on the Company Profile page across all devices.
        </p>
      </div>
    </div>
  );
};

export default CMSCompanyProfileManager;
