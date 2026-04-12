import React, { useState } from 'react';
import { ArrowRight, CheckCircle } from 'lucide-react';
import { useLiveContactDetails } from '@/hooks/useLiveCMSData';

interface CTABannerProps {
  onRequestQuote: () => void;
}

const CTABanner: React.FC<CTABannerProps> = ({ onRequestQuote }) => {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const { contactDetails } = useLiveContactDetails();

  const primaryPhone = contactDetails.phones[0];

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && /\S+@\S+\.\S+/.test(email)) {
      setSubscribed(true);
      setEmail('');
    }
  };

  return (
    <>
      {/* Main CTA */}
      <section className="py-20 lg:py-28 bg-[#0f1923] relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#e31e24]/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#e31e24]/5 rounded-full blur-[100px]" />
          <div className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
            }}
          />
        </div>

        <div className="max-w-4xl mx-auto px-4 lg:px-6 text-center relative">
          <h2 className="text-3xl lg:text-5xl font-extrabold text-white mb-6 leading-tight">
            Ready to Power Up Your{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#e31e24] to-[#ff6b6b]">
              Operations?
            </span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
            Join thousands of businesses that trust Voltz Industrial Supply for their critical 
            electrical components. Get competitive pricing, fast shipping, and expert support.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onRequestQuote}
              className="group flex items-center gap-2 bg-[#e31e24] text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-[#c91a1f] transition-all shadow-lg shadow-red-900/30 hover:shadow-xl"
            >
              Get Your Free Quote
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            {primaryPhone && (
              <a
                href={`tel:${primaryPhone.number.replace(/[^+\d]/g, '')}`}
                className="flex items-center gap-2 text-white/80 hover:text-white px-8 py-4 rounded-xl font-semibold text-lg border border-white/20 hover:border-white/40 transition-all"
              >
                Call {primaryPhone.number}
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="bg-[#e31e24] py-12">
        <div className="max-w-4xl mx-auto px-4 lg:px-6">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="text-center lg:text-left">
              <h3 className="text-xl font-bold text-white mb-1">Stay Updated with Industry News</h3>
              <p className="text-red-100 text-sm">Get product updates, technical guides, and exclusive offers delivered to your inbox.</p>
            </div>
            {subscribed ? (
              <div className="flex items-center gap-2 text-white font-semibold">
                <CheckCircle className="w-5 h-5" />
                Thanks for subscribing!
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex w-full lg:w-auto">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="flex-1 lg:w-72 px-5 py-3 rounded-l-xl outline-none text-[#1a2332] placeholder-gray-400"
                  required
                />
                <button
                  type="submit"
                  className="bg-[#0f1923] text-white px-6 py-3 rounded-r-xl font-semibold hover:bg-[#1a2332] transition-colors whitespace-nowrap"
                >
                  Subscribe
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
};

export default CTABanner;
