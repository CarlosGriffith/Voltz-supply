import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Phone, Mail, Clock } from 'lucide-react';
import { useLiveCategories, useLiveContactDetails } from '@/hooks/useLiveCMSData';

const LOGO_URL = 'https://d64gsuwffb70l.cloudfront.net/6995573664728a165adc7a9f_1772110039178_7206a7df.png';

interface FooterProps {
  onNavigate: (section: string) => void;
}

const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const footerNavigate = useNavigate();
  const { categories } = useLiveCategories();
  const productLinks = categories.filter(c => c.visible);
  const { contactDetails } = useLiveContactDetails();

  
  const handleClick = (section: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (section === 'company-profile') {
      footerNavigate('/company-profile');
      return;
    }
    onNavigate(section);
  };

  const primaryPhone = contactDetails.phones[0];
  const primaryEmail = contactDetails.emails[0];
  const primaryAddress = contactDetails.addresses[0];

  return (
    <footer className="bg-[#0f1923] text-gray-400">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 lg:gap-6">
          {/* Company Info */}
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <img src={LOGO_URL} alt="Voltz Industrial Supply" className="h-12 w-auto mb-4" />
            <p className="text-gray-400 text-sm leading-relaxed mb-6 max-w-sm">
              Your trusted partner for industrial electrical components since 2001. 
              We deliver quality products, competitive pricing, and exceptional service to businesses worldwide.
            </p>
            <div className="space-y-3">
              {/* Addresses */}
              {contactDetails.addresses.map((addr, idx) => (
                <div key={`addr-${idx}`} className="flex items-start gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-[#e31e24] flex-shrink-0 mt-0.5" />
                  <div>
                    {contactDetails.addresses.length > 1 && (
                      <span className="text-gray-500 text-xs font-semibold block">{addr.label}</span>
                    )}
                    <span>{addr.address}</span>
                  </div>
                </div>
              ))}
              {/* Phones */}
              {contactDetails.phones.map((phone, idx) => (
                <div key={`phone-${idx}`} className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-[#e31e24] flex-shrink-0" />
                  <div>
                    {contactDetails.phones.length > 1 && (
                      <span className="text-gray-500 text-xs font-semibold mr-1">{phone.label}:</span>
                    )}
                    <a href={`tel:${phone.number.replace(/[^+\d]/g, '')}`} className="hover:text-white transition-colors">
                      {phone.number}
                    </a>
                  </div>
                </div>
              ))}
              {/* Emails */}
              {contactDetails.emails.map((email, idx) => (
                <div key={`email-${idx}`} className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-[#e31e24] flex-shrink-0" />
                  <div>
                    {contactDetails.emails.length > 1 && (
                      <span className="text-gray-500 text-xs font-semibold mr-1">{email.label}:</span>
                    )}
                    <a href={`mailto:${email.address}`} className="hover:text-white transition-colors">
                      {email.address}
                    </a>
                  </div>
                </div>
              ))}
              {/* Business Hours */}
              {contactDetails.businessHours.length > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <Clock className="w-4 h-4 text-[#e31e24] flex-shrink-0 mt-0.5" />
                  <div>
                    {contactDetails.businessHours.map((h, idx) => (
                      <div key={idx}>
                        <span className="text-gray-500 font-medium">{h.day}:</span>{' '}
                        <span>{h.hours}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Products Column 1 */}
          <div>
            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">Products</h4>
            <ul className="space-y-2.5">
              {productLinks.slice(0, 7).map(item => (
                <li key={item.slug}>
                  <Link to={`/products/${item.slug}`} className="text-sm hover:text-[#e31e24] transition-colors">
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Products Column 2 */}
          <div>
            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">More Products</h4>
            <ul className="space-y-2.5">
              {productLinks.slice(7).map(item => (
                <li key={item.slug}>
                  <Link to={`/products/${item.slug}`} className="text-sm hover:text-[#e31e24] transition-colors">
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">Quick Links</h4>
            <ul className="space-y-2.5">
              {[
                { label: 'Company Profile', section: 'company-profile' },
                { label: 'Best Sales', section: 'featured' },
                { label: 'Special Offers', section: 'special-offers' },
                { label: 'Contact', section: 'contact' },
                { label: 'FAQ', section: 'faq' },
                { label: 'Solutions', section: 'solutions' },
              ].map(item => (
                <li key={item.label}>
                  <a href={`#${item.section}`} onClick={handleClick(item.section)} className="text-sm hover:text-[#e31e24] transition-colors">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">Company</h4>
            <ul className="space-y-2.5">
              {[
                { label: 'About Us', section: 'company-profile' },
                { label: 'Testimonials', section: 'testimonials' },
                { label: 'Careers', section: 'hero' },
                { label: 'Privacy Policy', section: 'hero' },
                { label: 'Terms of Service', section: 'hero' },
                { label: 'Sitemap', section: 'hero' },
              ].map(item => (
                <li key={item.label}>
                  <a href={`#${item.section}`} onClick={handleClick(item.section)} className="text-sm hover:text-[#e31e24] transition-colors">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Voltz Industrial Supply. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            {['LinkedIn', 'Twitter', 'YouTube', 'Facebook'].map(social => (
              <a
                key={social}
                href="#"
                onClick={(e) => e.preventDefault()}
                className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center hover:bg-[#e31e24] transition-colors group"
                title={social}
              >
                <span className="text-xs font-bold text-gray-400 group-hover:text-white transition-colors">
                  {social[0]}
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
