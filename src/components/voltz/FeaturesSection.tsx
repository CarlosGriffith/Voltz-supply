import React, { useState, useEffect, useRef } from 'react';
import {
  Shield, Truck, Headphones, Award, Clock, Users,
  CheckCircle, ArrowRight
} from 'lucide-react';

const features = [
  {
    icon: Shield,
    title: 'Certified Quality',
    description: 'All products meet ISO 9001, UL, and CE certification standards. Every component undergoes rigorous quality testing before shipping.',
  },
  {
    icon: Truck,
    title: 'Same-Day Shipping',
    description: 'Orders placed before 2 PM EST ship the same day. We maintain a massive inventory to ensure immediate availability.',
  },
  {
    icon: Headphones,
    title: '24/7 Technical Support',
    description: 'Our team of certified engineers is available around the clock to help with product selection, installation, and troubleshooting.',
  },
  {
    icon: Award,
    title: 'Industry-Leading Warranty',
    description: 'Every product comes with a comprehensive warranty backed by our commitment to customer satisfaction and product reliability.',
  },
  {
    icon: Clock,
    title: 'Quick Turnaround',
    description: 'Custom configurations and bulk orders processed within 24-48 hours. Expedited options available for urgent requirements.',
  },
  {
    icon: Users,
    title: 'Dedicated Account Managers',
    description: 'Enterprise clients receive a dedicated account manager who understands your specific needs and provides personalized service.',
  },
];

const stats = [
  { label: 'Products in Stock', value: 50000, suffix: '+', prefix: '' },
  { label: 'Happy Customers', value: 5000, suffix: '+', prefix: '' },
  { label: 'Years Experience', value: 25, suffix: '+', prefix: '' },
  { label: 'Countries Served', value: 40, suffix: '+', prefix: '' },
];

function useCountUp(target: number, duration: number = 2000) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    let startTime: number;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [started, target, duration]);

  return { count, ref };
}

const StatItem: React.FC<{ stat: typeof stats[0] }> = ({ stat }) => {
  const { count, ref } = useCountUp(stat.value);
  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl lg:text-5xl font-extrabold text-white mb-2">
        {stat.prefix}{count.toLocaleString()}{stat.suffix}
      </div>
      <div className="text-gray-400 font-medium">{stat.label}</div>
    </div>
  );
};

interface FeaturesSectionProps {
  onRequestQuote: () => void;
}

const FeaturesSection: React.FC<FeaturesSectionProps> = ({ onRequestQuote }) => {
  return (
    <>
      {/* Features Grid */}
      <section id="company-profile" className="py-20 lg:py-28 bg-gray-50">

        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-[#e31e24]/5 rounded-full px-4 py-1.5 mb-4">
              <span className="text-[#e31e24] text-sm font-semibold">Why Choose Voltz</span>
            </div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-[#1a2332] mb-4">
              The Industrial Supply Partner You Can Trust
            </h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              For over 25 years, we've been the go-to source for industrial electrical components, 
              delivering quality, reliability, and exceptional service.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-8 hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-[#e31e24]/20 group hover:-translate-y-1"
              >
                <div className="w-14 h-14 rounded-xl bg-[#e31e24]/10 flex items-center justify-center mb-6 group-hover:bg-[#e31e24] transition-colors">
                  <feature.icon className="w-7 h-7 text-[#e31e24] group-hover:text-white transition-colors" />
                </div>
                <h3 className="text-xl font-bold text-[#1a2332] mb-3">{feature.title}</h3>
                <p className="text-gray-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="bg-[#0f1923] py-16 lg:py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#e31e24] rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#e31e24] rounded-full blur-[120px]" />
        </div>
        <div className="max-w-7xl mx-auto px-4 lg:px-6 relative">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {stats.map((stat, idx) => (
              <StatItem key={idx} stat={stat} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
};

export default FeaturesSection;
