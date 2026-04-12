import React from 'react';
import { ArrowRight, Shield, Truck, Headphones } from 'lucide-react';
interface HeroSectionProps {
  onBrowseProducts: () => void;
  onRequestQuote: () => void;
}
const HeroSection: React.FC<HeroSectionProps> = ({
  onBrowseProducts,
  onRequestQuote
}) => {
  return <section id="hero" className="relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0f1923] via-[#1a2332] to-[#0f1923]">
        {/* Geometric pattern overlay */}
        <div className="absolute inset-0 opacity-[0.07]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
      }} />
        {/* Red accent glow */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#e31e24]/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#e31e24]/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 lg:px-6 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 bg-[#e31e24]/10 border border-[#e31e24]/20 rounded-full px-4 py-1.5">
              <div className="w-2 h-2 rounded-full bg-[#e31e24] animate-pulse" />
              <span className="text-[#e31e24] text-sm font-semibold tracking-wide">Trusted by 5,000+ Businesses</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight" data-mixed-content="true">
              Powering{' '}
              <span className="from-[#e31e24] to-[#ff6b6b] text-white bg-transparent">
                Industrial
              </span>{' '}
              Excellence
            </h1>

            <p className="text-lg lg:text-2xl font-bold text-[#e31e24] italic tracking-wide">Plugg into Us</p>


            <p className="text-lg lg:text-xl text-gray-300 max-w-xl leading-relaxed">
              Your premier source for industrial electrical components. From inverters to PLCs, 
              we deliver high-performance solutions that keep your operations running at peak efficiency.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <button onClick={onBrowseProducts} className="group flex items-center justify-center gap-2 bg-[#e31e24] text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-[#c91a1f] transition-all shadow-lg shadow-red-900/30 hover:shadow-xl hover:shadow-red-900/40 hover:-translate-y-0.5">
                Browse Products
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button onClick={onRequestQuote} className="flex items-center justify-center gap-2 bg-white/10 backdrop-blur-sm text-white px-8 py-4 rounded-xl font-bold text-lg border border-white/20 hover:bg-white/20 transition-all hover:-translate-y-0.5">
                Request a Quote
              </button>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap gap-6 pt-4">
              <div className="flex items-center gap-2 text-gray-400">
                <Shield className="w-5 h-5 text-[#e31e24]" />
                <span className="text-sm">ISO 9001 Certified</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Truck className="w-5 h-5 text-[#e31e24]" />
                <span className="text-sm">Same-Day Shipping</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Headphones className="w-5 h-5 text-[#e31e24]" />
                <span className="text-sm">24/7 Tech Support</span>
              </div>
            </div>
          </div>

          {/* Right - Visual */}
          <div className="hidden lg:block relative">
            <div className="relative">
              {/* Main visual card */}
              <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-8 relative overflow-hidden">
                {/* Circuit board pattern */}
                <svg className="w-full h-80 text-[#e31e24]/20" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M50 150 L150 150 L150 50 L250 50" stroke="currentColor" strokeWidth="2" />
                  <path d="M50 200 L100 200 L100 250 L200 250" stroke="currentColor" strokeWidth="2" />
                  <path d="M200 50 L200 150 L300 150 L300 250" stroke="currentColor" strokeWidth="2" />
                  <path d="M250 100 L350 100" stroke="currentColor" strokeWidth="2" />
                  <path d="M100 100 L200 100 L200 200 L350 200" stroke="currentColor" strokeWidth="2" />
                  <circle cx="150" cy="150" r="6" fill="currentColor" />
                  <circle cx="250" cy="50" r="6" fill="currentColor" />
                  <circle cx="200" cy="250" r="6" fill="currentColor" />
                  <circle cx="300" cy="150" r="6" fill="currentColor" />
                  <circle cx="100" cy="200" r="6" fill="currentColor" />
                  <circle cx="350" cy="100" r="6" fill="currentColor" />
                  <circle cx="200" cy="100" r="6" fill="currentColor" />
                  <circle cx="350" cy="200" r="6" fill="currentColor" />
                  <circle cx="300" cy="250" r="6" fill="currentColor" />
                  <rect x="120" y="120" width="60" height="60" rx="8" stroke="currentColor" strokeWidth="2" className="text-[#e31e24]/40" />
                  <rect x="230" y="170" width="50" height="50" rx="8" stroke="currentColor" strokeWidth="2" className="text-[#e31e24]/40" />
                </svg>

                {/* Floating stats */}
                <div className="absolute top-6 right-6 bg-[#e31e24] text-white rounded-xl px-4 py-3 shadow-lg">
                  <div className="text-2xl font-bold">99.9%</div>
                  <div className="text-xs text-red-100">Uptime Guarantee</div>
                </div>

                <div className="absolute bottom-6 left-6 bg-white/10 backdrop-blur-md text-white rounded-xl px-4 py-3 border border-white/20">
                  <div className="text-2xl font-bold">50K+</div>
                  <div className="text-xs text-gray-300">Products in Stock</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom wave divider */}
      <div className="absolute bottom-0 left-0 right-0 leading-[0]">
        <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full block">
          <path d="M0 60L48 55C96 50 192 40 288 35C384 30 480 30 576 33.3C672 36.7 768 43.3 864 45C960 46.7 1056 43.3 1152 40C1248 36.7 1344 33.3 1392 31.7L1440 30V60H1392C1344 60 1248 60 1152 60C1056 60 960 60 864 60C768 60 672 60 576 60C480 60 384 60 288 60C192 60 96 60 48 60H0Z" fill="white" />
        </svg>
      </div>

    </section>;
};
export default HeroSection;