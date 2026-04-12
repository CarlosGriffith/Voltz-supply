import React, { useState } from 'react';
import { FileText, Download, BookOpen, BarChart3, Video, ArrowRight } from 'lucide-react';

const resources = [
  {
    icon: FileText,
    title: 'Product Datasheets',
    description: 'Detailed technical specifications, wiring diagrams, and performance curves for all products.',
    count: '500+ Documents',
    color: '#e31e24',
  },
  {
    icon: BookOpen,
    title: 'Installation Guides',
    description: 'Step-by-step installation manuals with safety guidelines and best practices.',
    count: '200+ Guides',
    color: '#2563eb',
  },
  {
    icon: BarChart3,
    title: 'Product Comparisons',
    description: 'Side-by-side comparisons to help you choose the right product for your application.',
    count: '50+ Comparisons',
    color: '#16a34a',
  },
  {
    icon: Video,
    title: 'Training Videos',
    description: 'Video tutorials covering installation, configuration, and troubleshooting procedures.',
    count: '100+ Videos',
    color: '#9333ea',
  },
];

const TechResources: React.FC = () => {
  const [downloadClicked, setDownloadClicked] = useState<number | null>(null);

  const handleDownload = (idx: number) => {
    setDownloadClicked(idx);
    setTimeout(() => setDownloadClicked(null), 2000);
  };

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-[#e31e24]/5 rounded-full px-4 py-1.5 mb-4">
            <span className="text-[#e31e24] text-sm font-semibold">Technical Resources</span>
          </div>
          <h2 className="text-3xl lg:text-5xl font-extrabold text-[#1a2332] mb-4">
            Knowledge at Your Fingertips
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            Access our comprehensive library of technical documentation, guides, and training materials.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {resources.map((resource, idx) => (
            <div
              key={idx}
              className="bg-gray-50 rounded-2xl p-6 border border-gray-100 hover:shadow-lg hover:border-[#e31e24]/20 transition-all duration-300 group hover:-translate-y-1"
            >
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center mb-5 transition-colors"
                style={{ backgroundColor: `${resource.color}15` }}
              >
                <resource.icon className="w-7 h-7" style={{ color: resource.color }} />
              </div>
              <h3 className="text-lg font-bold text-[#1a2332] mb-2 group-hover:text-[#e31e24] transition-colors">
                {resource.title}
              </h3>
              <p className="text-sm text-gray-500 mb-4 leading-relaxed">{resource.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400">{resource.count}</span>
                <button
                  onClick={() => handleDownload(idx)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-[#e31e24] hover:underline"
                >
                  {downloadClicked === idx ? (
                    <>
                      <Download className="w-4 h-4 animate-bounce" />
                      Opening...
                    </>
                  ) : (
                    <>
                      Browse
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TechResources;
