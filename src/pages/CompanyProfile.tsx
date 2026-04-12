import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, Users, Globe, Award, Target, Shield,
  Truck, Clock, Headphones, CheckCircle, MapPin, Phone, Mail,
  Zap, TrendingUp, Factory, Handshake, Cog
} from 'lucide-react';
import { useLiveContactDetails, useLiveCompanyProfile } from '@/hooks/useLiveCMSData';

const LOGO_URL = 'https://d64gsuwffb70l.cloudfront.net/6995573664728a165adc7a9f_1772110039178_7206a7df.png';

// Icon mapping for stats and values
const STAT_ICONS = [Clock, Zap, Globe, Users, Handshake, Truck, Award, TrendingUp, Factory, Cog];
const VALUE_ICONS = [Shield, Target, TrendingUp, Award, Headphones, Truck, Factory, Cog];
const WHY_ICONS = [Factory, Truck, Headphones, Shield, Award, TrendingUp, Zap, Cog];

const CompanyProfile: React.FC = () => {
  const navigate = useNavigate();
  const { companyProfile: profile } = useLiveCompanyProfile();
  const { contactDetails } = useLiveContactDetails();

  const phones = contactDetails.phones;
  const primaryEmail = contactDetails.emails[0];
  const primaryAddress = contactDetails.addresses[0];


  return (
    <div className="min-h-screen bg-white">
      {/* Header Bar */}
      <div className="bg-[#0f1923] text-white">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-4 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 group">
            <img src={LOGO_URL} alt="Voltz" className="h-10 w-auto" />
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors text-sm font-medium group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Home
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-[#1a2332] via-[#0f1923] to-[#1a2332] text-white py-24 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '50px 50px',
          }} />
        </div>
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#e31e24]/5 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px]" />

        <div className="relative max-w-7xl mx-auto px-4 lg:px-6">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-[#e31e24]/10 rounded-full px-4 py-1.5 mb-6">
              <Building2 className="w-4 h-4 text-[#e31e24]" />
              <span className="text-[#e31e24] text-sm font-bold uppercase tracking-wider">Company Profile</span>
            </div>
            <h1 className="text-4xl lg:text-6xl font-extrabold mb-6 leading-tight">
              {profile.heroTitle} <br />
              <span className="text-[#e31e24]">{profile.heroHighlight}</span>
            </h1>
            <p className="text-xl text-gray-300 leading-relaxed max-w-2xl">
              {profile.heroDescription}
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative -mt-16 z-10 max-w-7xl mx-auto px-4 lg:px-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {profile.stats.map((stat, idx) => {
            const IconComp = STAT_ICONS[idx % STAT_ICONS.length];
            return (
              <div key={idx} className="bg-white rounded-2xl shadow-xl border border-gray-100 p-5 text-center hover:shadow-2xl transition-shadow">
                <div className="w-10 h-10 rounded-xl bg-[#e31e24]/10 flex items-center justify-center mx-auto mb-3">
                  <IconComp className="w-5 h-5 text-[#e31e24]" />
                </div>
                <div className="text-2xl font-extrabold text-[#1a2332]">{stat.value}</div>
                <div className="text-xs text-gray-500 font-medium mt-1">{stat.label}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* About / Mission */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-[#e31e24]/5 rounded-full px-4 py-1.5 mb-4">
                <Target className="w-4 h-4 text-[#e31e24]" />
                <span className="text-[#e31e24] text-sm font-semibold">Our Mission</span>
              </div>
              <h2 className="text-3xl lg:text-4xl font-extrabold text-[#1a2332] mb-6">
                {profile.missionTitle}
              </h2>
              <div className="space-y-4 text-gray-600 leading-relaxed">
                {profile.missionParagraphs.map((p, idx) => (
                  <p key={idx}>{p}</p>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {profile.values.map((val, idx) => {
                const IconComp = VALUE_ICONS[idx % VALUE_ICONS.length];
                return (
                  <div key={idx} className="bg-gray-50 rounded-2xl p-6 hover:bg-[#e31e24]/5 transition-colors group">
                    <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center mb-4 group-hover:bg-[#e31e24] transition-colors">
                      <IconComp className="w-6 h-6 text-[#e31e24] group-hover:text-white transition-colors" />
                    </div>
                    <h3 className="font-bold text-[#1a2332] mb-2">{val.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{val.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-20 lg:py-28 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 lg:px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#e31e24]/5 rounded-full px-4 py-1.5 mb-4">
              <Clock className="w-4 h-4 text-[#e31e24]" />
              <span className="text-[#e31e24] text-sm font-semibold">Our Journey</span>
            </div>
            <h2 className="text-3xl lg:text-4xl font-extrabold text-[#1a2332] mb-4">Company Milestones</h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              From a small distributor to a global industrial supply leader — here's our story.
            </p>
          </div>

          <div className="relative">
            <div className="absolute left-8 lg:left-1/2 top-0 bottom-0 w-0.5 bg-gray-200 lg:-translate-x-px" />
            <div className="space-y-8">
              {profile.milestones.map((m, idx) => (
                <div key={idx} className={`relative flex items-start gap-6 ${idx % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'}`}>
                  <div className={`flex-1 ml-16 lg:ml-0 ${idx % 2 === 0 ? 'lg:text-right lg:pr-12' : 'lg:text-left lg:pl-12'}`}>
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                      <span className="text-[#e31e24] font-extrabold text-lg">{m.year}</span>
                      <h3 className="font-bold text-[#1a2332] mt-1">{m.title}</h3>
                      <p className="text-sm text-gray-500 mt-1">{m.desc}</p>
                    </div>
                  </div>
                  <div className="absolute left-8 lg:left-1/2 w-4 h-4 bg-[#e31e24] rounded-full border-4 border-white shadow-md -translate-x-1/2 mt-6" />
                  <div className="hidden lg:block flex-1" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Leadership Team */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#e31e24]/5 rounded-full px-4 py-1.5 mb-4">
              <Users className="w-4 h-4 text-[#e31e24]" />
              <span className="text-[#e31e24] text-sm font-semibold">Leadership</span>
            </div>
            <h2 className="text-3xl lg:text-4xl font-extrabold text-[#1a2332] mb-4">Our Leadership Team</h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              Experienced professionals driving innovation and excellence in industrial distribution.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {profile.team.map((member, idx) => (
              <div key={idx} className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-lg transition-shadow group text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1a2332] to-[#0f1923] flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-extrabold text-white">
                    {member.name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <h3 className="font-bold text-[#1a2332] text-lg group-hover:text-[#e31e24] transition-colors">
                  {member.name}
                </h3>
                <p className="text-[#e31e24] text-sm font-semibold mt-1">{member.role}</p>
                <p className="text-gray-500 text-sm mt-2">{member.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Certifications */}
      <section className="py-20 lg:py-28 bg-gradient-to-br from-[#0f1923] to-[#1a2332] text-white">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#e31e24]/20 rounded-full px-4 py-1.5 mb-4">
              <Award className="w-4 h-4 text-[#e31e24]" />
              <span className="text-[#e31e24] text-sm font-semibold">Certifications</span>
            </div>
            <h2 className="text-3xl lg:text-4xl font-extrabold mb-4">Certifications & Partnerships</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              We maintain the highest industry standards and certifications.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {profile.certifications.map((cert, idx) => (
              <div key={idx} className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-5 flex items-center gap-3 hover:border-[#e31e24]/40 transition-colors">
                <CheckCircle className="w-5 h-5 text-[#e31e24] flex-shrink-0" />
                <span className="text-sm font-medium text-gray-200">{cert}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-extrabold text-[#1a2332] mb-4">Why Choose Voltz?</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {profile.whyChooseUs.map((item, idx) => {
              const IconComp = WHY_ICONS[idx % WHY_ICONS.length];
              return (
                <div key={idx} className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[#e31e24]/10 flex items-center justify-center mx-auto mb-4">
                    <IconComp className="w-8 h-8 text-[#e31e24]" />
                  </div>
                  <h3 className="font-bold text-[#1a2332] text-lg mb-2">{item.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-16 bg-[#e31e24]">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 text-center">
          <h2 className="text-3xl font-extrabold text-white mb-4">Ready to Partner with Us?</h2>
          <p className="text-white/80 text-lg mb-8 max-w-2xl mx-auto">
            Contact our team today to discuss your industrial supply needs and discover how we can help your business grow.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 flex-wrap">
            {/* Show ALL phone numbers from CMS */}
            {phones.map((phone, idx) => (
              <a
                key={`cta-phone-${idx}`}
                href={`tel:${phone.number.replace(/[^+\d]/g, '')}`}
                className="flex items-center gap-2 bg-white text-[#e31e24] px-8 py-3.5 rounded-xl font-bold hover:bg-gray-100 transition-colors"
              >
                <Phone className="w-5 h-5" />
                {phones.length > 1 && phone.label ? `${phone.label}: ` : ''}
                {phone.number}
              </a>
            ))}
            {primaryEmail && (
              <a
                href={`mailto:${primaryEmail.address}`}
                className="flex items-center gap-2 bg-white/10 text-white border border-white/30 px-8 py-3.5 rounded-xl font-bold hover:bg-white/20 transition-colors"
              >
                <Mail className="w-5 h-5" />
                {primaryEmail.address}
              </a>
            )}
          </div>
          {primaryAddress && (
            <div className="flex items-center justify-center gap-2 mt-6 text-white/60 text-sm">
              <MapPin className="w-4 h-4" />
              <span>{primaryAddress.address}</span>
            </div>
          )}
        </div>
      </section>


      {/* Footer */}
      <footer className="bg-[#0f1923] text-gray-500 py-6">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm">&copy; {new Date().getFullYear()} Voltz Industrial Supply. All rights reserved.</p>
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Back to Home
          </button>
        </div>
      </footer>
    </div>
  );
};

export default CompanyProfile;
