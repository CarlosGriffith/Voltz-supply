import React from 'react';

const partners = [
  { name: 'Siemens', initials: 'S' },
  { name: 'ABB', initials: 'ABB' },
  { name: 'Schneider Electric', initials: 'SE' },
  { name: 'Allen-Bradley', initials: 'AB' },
  { name: 'Mitsubishi Electric', initials: 'ME' },
  { name: 'Omron', initials: 'O' },
  { name: 'Danfoss', initials: 'D' },
  { name: 'Eaton', initials: 'E' },
];

const certifications = [
  'ISO 9001:2015',
  'UL Listed',
  'CE Certified',
  'RoHS Compliant',
];

const Partners: React.FC = () => {
  return (
    <section className="py-16 lg:py-20 bg-gray-50 border-t border-gray-100">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-2">Authorized Distributor</p>
          <h3 className="text-2xl lg:text-3xl font-bold text-[#1a2332]">Trusted by Industry Leaders</h3>
        </div>

        {/* Partner Logos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 mb-12">
          {partners.map((partner, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center justify-center h-24 hover:border-[#e31e24]/30 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="text-xl font-extrabold text-gray-300 group-hover:text-[#e31e24] transition-colors">
                {partner.initials}
              </div>
              <div className="text-[10px] font-semibold text-gray-400 mt-1 text-center group-hover:text-gray-600 transition-colors">
                {partner.name}
              </div>
            </div>
          ))}
        </div>

        {/* Certifications */}
        <div className="flex flex-wrap items-center justify-center gap-4 lg:gap-6">
          {certifications.map((cert, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-5 py-2.5"
            >
              <svg className="w-5 h-5 text-[#e31e24]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="text-sm font-semibold text-[#1a2332]">{cert}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Partners;
