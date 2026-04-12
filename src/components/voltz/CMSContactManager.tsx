import React, { useState, useEffect } from 'react';
import {
  Phone, Mail, MapPin, Clock, Plus, Trash2, Save, Check, AlertCircle
} from 'lucide-react';
import { useCMS, type ContactDetails, type ContactPhone, type ContactEmail, type ContactAddress, type BusinessHour } from '@/contexts/CMSContext';
import { useCMSNotification } from '@/contexts/CMSNotificationContext';

const CMSContactManager: React.FC = () => {
  const { notify } = useCMSNotification();
  const { contactDetails, updateContactDetails } = useCMS();
  const [draft, setDraft] = useState<ContactDetails>(contactDetails);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(contactDetails);
  }, [contactDetails]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateContactDetails(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      notify({ variant: 'success', title: 'Changes saved', subtitle: 'Website → Contact details' });
    } catch (err) {
      console.error('[CMSContactManager] Save failed:', err);
      notify({
        variant: 'error',
        title: 'Changes not saved',
        subtitle: `Website → Contact details — ${err instanceof Error ? err.message : 'Error'}`,
      });
    } finally {
      setSaving(false);
    }
  };

  // ─── Phone helpers ───
  const addPhone = () => setDraft(d => ({ ...d, phones: [...d.phones, { label: '', number: '' }] }));
  const updatePhone = (idx: number, field: keyof ContactPhone, val: string) => {
    setDraft(d => ({
      ...d,
      phones: d.phones.map((p, i) => i === idx ? { ...p, [field]: val } : p),
    }));
  };
  const removePhone = (idx: number) => setDraft(d => ({ ...d, phones: d.phones.filter((_, i) => i !== idx) }));

  // ─── Email helpers ───
  const addEmail = () => setDraft(d => ({ ...d, emails: [...d.emails, { label: '', address: '' }] }));
  const updateEmail = (idx: number, field: keyof ContactEmail, val: string) => {
    setDraft(d => ({
      ...d,
      emails: d.emails.map((e, i) => i === idx ? { ...e, [field]: val } : e),
    }));
  };
  const removeEmail = (idx: number) => setDraft(d => ({ ...d, emails: d.emails.filter((_, i) => i !== idx) }));

  // ─── Address helpers ───
  const addAddress = () => setDraft(d => ({ ...d, addresses: [...d.addresses, { label: '', address: '' }] }));
  const updateAddress = (idx: number, field: keyof ContactAddress, val: string) => {
    setDraft(d => ({
      ...d,
      addresses: d.addresses.map((a, i) => i === idx ? { ...a, [field]: val } : a),
    }));
  };
  const removeAddress = (idx: number) => setDraft(d => ({ ...d, addresses: d.addresses.filter((_, i) => i !== idx) }));

  // ─── Business Hours helpers ───
  const addHour = () => setDraft(d => ({ ...d, businessHours: [...d.businessHours, { day: '', hours: '' }] }));
  const updateHour = (idx: number, field: keyof BusinessHour, val: string) => {
    setDraft(d => ({
      ...d,
      businessHours: d.businessHours.map((h, i) => i === idx ? { ...h, [field]: val } : h),
    }));
  };
  const removeHour = (idx: number) => setDraft(d => ({ ...d, businessHours: d.businessHours.filter((_, i) => i !== idx) }));

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 sm:p-4">
        <div className="flex items-start gap-2 sm:gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs sm:text-sm text-blue-700 leading-relaxed">
            Update your business contact information below. Changes will be reflected across the entire website — including the header, footer, contact section, and company profile page — on all visitor devices immediately after saving.
          </p>
        </div>
      </div>

      {/* ─── Phone Numbers ─── */}
      <div>
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
              <Phone className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <h3 className="font-bold text-[#1a2332] text-sm sm:text-base">Phone Numbers</h3>
              <p className="text-[10px] sm:text-xs text-gray-400">Add one or more contact numbers</p>
            </div>
          </div>
          <button onClick={addPhone}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-green-50 text-green-700 text-xs sm:text-sm font-semibold hover:bg-green-100 transition-colors">
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden xs:inline">Add</span> Phone
          </button>
        </div>
        <div className="space-y-3">
          {draft.phones.map((phone, idx) => (
            <div key={idx} className="bg-gray-50 rounded-xl p-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <input
                  type="text"
                  value={phone.label}
                  onChange={(e) => updatePhone(idx, 'label', e.target.value)}
                  placeholder="Label (e.g. Main Office)"
                  className="flex-1 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24] focus:ring-1 focus:ring-[#e31e24]/20 bg-white"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={phone.number}
                    onChange={(e) => updatePhone(idx, 'number', e.target.value)}
                    placeholder="Phone number"
                    className="flex-1 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24] focus:ring-1 focus:ring-[#e31e24]/20 bg-white"
                  />
                  <button onClick={() => removePhone(idx)}
                    className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0 self-center">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {draft.phones.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-4">No phone numbers added. Click "Add Phone" to add one.</p>
          )}
        </div>
      </div>

      {/* ─── Email Addresses ─── */}
      <div>
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Mail className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-[#1a2332] text-sm sm:text-base">Email Addresses</h3>
              <p className="text-[10px] sm:text-xs text-gray-400">Add one or more email addresses</p>
            </div>
          </div>
          <button onClick={addEmail}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-blue-50 text-blue-700 text-xs sm:text-sm font-semibold hover:bg-blue-100 transition-colors">
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden xs:inline">Add</span> Email
          </button>
        </div>
        <div className="space-y-3">
          {draft.emails.map((email, idx) => (
            <div key={idx} className="bg-gray-50 rounded-xl p-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <input
                  type="text"
                  value={email.label}
                  onChange={(e) => updateEmail(idx, 'label', e.target.value)}
                  placeholder="Label (e.g. Sales)"
                  className="flex-1 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24] focus:ring-1 focus:ring-[#e31e24]/20 bg-white"
                />
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email.address}
                    onChange={(e) => updateEmail(idx, 'address', e.target.value)}
                    placeholder="Email address"
                    className="flex-1 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24] focus:ring-1 focus:ring-[#e31e24]/20 bg-white"
                  />
                  <button onClick={() => removeEmail(idx)}
                    className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0 self-center">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {draft.emails.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-4">No email addresses added. Click "Add Email" to add one.</p>
          )}
        </div>
      </div>

      {/* ─── Store Addresses ─── */}
      <div>
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h3 className="font-bold text-[#1a2332] text-sm sm:text-base">Store Addresses</h3>
              <p className="text-[10px] sm:text-xs text-gray-400">Add one or more physical locations</p>
            </div>
          </div>
          <button onClick={addAddress}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-purple-50 text-purple-700 text-xs sm:text-sm font-semibold hover:bg-purple-100 transition-colors">
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden xs:inline">Add</span> Address
          </button>
        </div>
        <div className="space-y-3">
          {draft.addresses.map((addr, idx) => (
            <div key={idx} className="bg-gray-50 rounded-xl p-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <input
                  type="text"
                  value={addr.label}
                  onChange={(e) => updateAddress(idx, 'label', e.target.value)}
                  placeholder="Label (e.g. Head Office)"
                  className="sm:w-40 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24] focus:ring-1 focus:ring-[#e31e24]/20 bg-white"
                />
                <div className="flex gap-2 flex-1">
                  <input
                    type="text"
                    value={addr.address}
                    onChange={(e) => updateAddress(idx, 'address', e.target.value)}
                    placeholder="Full address"
                    className="flex-1 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24] focus:ring-1 focus:ring-[#e31e24]/20 bg-white"
                  />
                  <button onClick={() => removeAddress(idx)}
                    className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0 self-center">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {draft.addresses.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-4">No addresses added. Click "Add Address" to add one.</p>
          )}
        </div>
      </div>

      {/* ─── Business Hours ─── */}
      <div>
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-[#1a2332] text-sm sm:text-base">Business Hours</h3>
              <p className="text-[10px] sm:text-xs text-gray-400">Set your operating hours for each day</p>
            </div>
          </div>
          <button onClick={addHour}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-amber-50 text-amber-700 text-xs sm:text-sm font-semibold hover:bg-amber-100 transition-colors">
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden xs:inline">Add</span> Hours
          </button>
        </div>
        <div className="space-y-3">
          {draft.businessHours.map((hour, idx) => (
            <div key={idx} className="bg-gray-50 rounded-xl p-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <input
                  type="text"
                  value={hour.day}
                  onChange={(e) => updateHour(idx, 'day', e.target.value)}
                  placeholder="Day(s) (e.g. Mon–Fri)"
                  className="sm:w-40 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24] focus:ring-1 focus:ring-[#e31e24]/20 bg-white"
                />
                <div className="flex gap-2 flex-1">
                  <input
                    type="text"
                    value={hour.hours}
                    onChange={(e) => updateHour(idx, 'hours', e.target.value)}
                    placeholder="Hours (e.g. 7:00 AM – 6:00 PM EST)"
                    className="flex-1 px-3 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#e31e24] focus:ring-1 focus:ring-[#e31e24]/20 bg-white"
                  />
                  <button onClick={() => removeHour(idx)}
                    className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0 self-center">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {draft.businessHours.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center py-4">No business hours added. Click "Add Hours" to add one.</p>
          )}
        </div>
      </div>

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
            <><Check className="w-4 h-4" /> Contact Details Saved &amp; Synced!</>
          ) : saving ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving &amp; syncing to all devices...</>
          ) : (
            <><Save className="w-4 h-4" /> Save Contact Details</>
          )}
        </button>
        <p className="text-[10px] text-gray-400 mt-2 text-center">
          Changes are saved to the database and pushed to the header, footer, contact section, and company profile page on all visitor devices instantly.
        </p>
      </div>
    </div>
  );
};

export default CMSContactManager;
