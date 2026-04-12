import React, { useState } from 'react';
import { Factory, Cog, Lightbulb, Building2, Droplets, Wind, ArrowRight, CheckCircle } from 'lucide-react';

const solutions = [
  {
    id: 'manufacturing',
    icon: Factory,
    title: 'Manufacturing & Assembly',
    description: 'Complete automation solutions for production lines, assembly systems, and quality control processes.',
    image: 'https://images.unsplash.com/photo-1565043666747-69f6646db940?w=600&h=400&fit=crop',
    benefits: ['Increased throughput by 40%', 'Reduced downtime by 60%', 'Real-time production monitoring', 'Predictive maintenance alerts'],
  },
  {
    id: 'automation',
    icon: Cog,
    title: 'Process Automation',
    description: 'Advanced PLC and sensor systems for precise process control in chemical, pharmaceutical, and food industries.',
    image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop',
    benefits: ['99.9% process accuracy', 'Automated quality checks', 'Batch processing control', 'SCADA integration ready'],
  },
  {
    id: 'energy',
    icon: Lightbulb,
    title: 'Energy Management',
    description: 'Smart power distribution and monitoring solutions for optimal energy efficiency and cost reduction.',
    image: 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=600&h=400&fit=crop',
    benefits: ['30% energy cost reduction', 'Power factor correction', 'Load balancing systems', 'Green energy integration'],
  },
  {
    id: 'building',
    icon: Building2,
    title: 'Building Automation',
    description: 'Intelligent building management systems for HVAC, lighting, and security automation.',
    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&h=400&fit=crop',
    benefits: ['Smart HVAC control', 'Occupancy-based lighting', 'Access control systems', 'Fire safety integration'],
  },
  {
    id: 'water',
    icon: Droplets,
    title: 'Water & Wastewater',
    description: 'Pump control, flow measurement, and treatment process automation for water utilities.',
    image: 'https://images.unsplash.com/photo-1504297050568-910d24c426d3?w=600&h=400&fit=crop',
    benefits: ['Automated pump stations', 'Flow rate monitoring', 'Chemical dosing control', 'Remote SCADA access'],
  },
  {
    id: 'renewable',
    icon: Wind,
    title: 'Renewable Energy',
    description: 'Power conversion and grid integration solutions for solar, wind, and energy storage systems.',
    image: 'https://images.unsplash.com/photo-1532601224476-15c79f2f7a51?w=600&h=400&fit=crop',
    benefits: ['Grid-tie inverter systems', 'Battery management', 'MPPT controllers', 'Microgrid solutions'],
  },
];

const IndustrySolutions: React.FC = () => {
  const [activeSolution, setActiveSolution] = useState(solutions[0]);

  return (
    <section id="solutions" className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-[#e31e24]/5 rounded-full px-4 py-1.5 mb-4">
            <span className="text-[#e31e24] text-sm font-semibold">Industry Solutions</span>
          </div>
          <h2 className="text-3xl lg:text-5xl font-extrabold text-[#1a2332] mb-4">
            Tailored for Your Industry
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            We understand the unique challenges of each industry and provide specialized solutions 
            to maximize efficiency and minimize downtime.
          </p>
        </div>

        {/* Solutions Tabs + Content */}
        <div className="grid lg:grid-cols-12 gap-8">
          {/* Tab List */}
          <div className="lg:col-span-4 space-y-2">
            {solutions.map((solution) => (
              <button
                key={solution.id}
                onClick={() => setActiveSolution(solution)}
                className={`w-full text-left p-4 rounded-xl transition-all flex items-center gap-4 group ${
                  activeSolution.id === solution.id
                    ? 'bg-[#e31e24] text-white shadow-lg shadow-red-200'
                    : 'bg-gray-50 text-[#1a2332] hover:bg-red-50'
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                    activeSolution.id === solution.id
                      ? 'bg-white/20'
                      : 'bg-white'
                  }`}
                >
                  <solution.icon
                    className={`w-6 h-6 transition-colors ${
                      activeSolution.id === solution.id ? 'text-white' : 'text-[#e31e24]'
                    }`}
                  />
                </div>
                <div>
                  <div className="font-bold text-sm">{solution.title}</div>
                  <div
                    className={`text-xs mt-0.5 ${
                      activeSolution.id === solution.id ? 'text-red-100' : 'text-gray-400'
                    }`}
                  >
                    {solution.description.slice(0, 50)}...
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="lg:col-span-8">
            <div className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
              {/* Image */}
              <div className="h-64 lg:h-80 relative overflow-hidden">
                <img
                  src={activeSolution.image}
                  alt={activeSolution.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0f1923]/80 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-lg bg-[#e31e24] flex items-center justify-center">
                      <activeSolution.icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">{activeSolution.title}</h3>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="p-6 lg:p-8">
                <p className="text-gray-600 text-lg mb-6 leading-relaxed">{activeSolution.description}</p>
                <div className="grid sm:grid-cols-2 gap-3 mb-6">
                  {activeSolution.benefits.map((benefit, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-[#e31e24] flex-shrink-0" />
                      <span className="text-sm font-medium text-[#1a2332]">{benefit}</span>
                    </div>
                  ))}
                </div>
                <button className="inline-flex items-center gap-2 bg-[#e31e24] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#c91a1f] transition-colors group">
                  Learn More
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default IndustrySolutions;
