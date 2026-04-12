import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Star, Quote } from 'lucide-react';

const testimonials = [
  {
    name: 'Robert Chen',
    role: 'Plant Manager',
    company: 'Pacific Manufacturing Co.',
    text: 'Voltz has been our primary supplier for over 8 years. Their product quality is unmatched, and their technical support team has saved us countless hours of downtime. The same-day shipping is a game-changer for our operations.',
    rating: 5,
  },
  {
    name: 'Sarah Mitchell',
    role: 'Chief Engineer',
    company: 'Apex Automation Systems',
    text: 'The breadth of their product catalog is impressive. From PLCs to sensors, we source everything from Voltz. Their dedicated account manager understands our needs and consistently delivers beyond expectations.',
    rating: 5,
  },
  {
    name: 'David Kowalski',
    role: 'Procurement Director',
    company: 'Great Lakes Energy',
    text: 'Switching to Voltz reduced our procurement costs by 22% while improving delivery times. Their competitive pricing on bulk orders and reliable inventory levels make them an invaluable partner.',
    rating: 5,
  },
  {
    name: 'Maria Rodriguez',
    role: 'Operations Manager',
    company: 'Southwest Water Authority',
    text: 'We rely on Voltz for all our VFD and motor starter needs. Their technical expertise in water treatment applications has helped us optimize our pump stations significantly.',
    rating: 5,
  },
  {
    name: 'James Thompson',
    role: 'Maintenance Supervisor',
    company: 'Continental Foods Inc.',
    text: 'The 24/7 support is not just a promise — it\'s real. We had a critical drive failure at 2 AM and their team walked us through the replacement process. Outstanding service.',
    rating: 5,
  },
  {
    name: 'Linda Park',
    role: 'VP of Engineering',
    company: 'TechBuild Construction',
    text: 'For our building automation projects, Voltz provides everything from sensors to power supplies. Their product knowledge and fast turnaround times keep our projects on schedule.',
    rating: 5,
  },
];

const Testimonials: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const itemsPerPage = 3;
  const maxIndex = Math.ceil(testimonials.length / itemsPerPage) - 1;

  const goNext = () => setCurrentIndex(prev => Math.min(prev + 1, maxIndex));
  const goPrev = () => setCurrentIndex(prev => Math.max(prev - 1, 0));

  const visibleTestimonials = testimonials.slice(
    currentIndex * itemsPerPage,
    currentIndex * itemsPerPage + itemsPerPage
  );

  return (
    <section id="testimonials" className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-12 gap-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-[#e31e24]/5 rounded-full px-4 py-1.5 mb-4">
              <span className="text-[#e31e24] text-sm font-semibold">Client Testimonials</span>
            </div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-[#1a2332] mb-2">
              What Our Clients Say
            </h2>
            <p className="text-gray-500 text-lg max-w-xl">
              Hear from industry professionals who trust Voltz for their critical electrical components.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-all ${
                currentIndex === 0
                  ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                  : 'border-gray-300 text-[#1a2332] hover:border-[#e31e24] hover:text-[#e31e24]'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goNext}
              disabled={currentIndex === maxIndex}
              className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 transition-all ${
                currentIndex === maxIndex
                  ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                  : 'border-gray-300 text-[#1a2332] hover:border-[#e31e24] hover:text-[#e31e24]'
              }`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Testimonial Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleTestimonials.map((testimonial, idx) => (
            <div
              key={`${currentIndex}-${idx}`}
              className="bg-gray-50 rounded-2xl p-8 border border-gray-100 hover:shadow-lg hover:border-[#e31e24]/20 transition-all duration-300 animate-fade-in relative"
            >
              {/* Quote Icon */}
              <Quote className="w-10 h-10 text-[#e31e24]/10 absolute top-6 right-6" />

              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
                ))}
              </div>

              {/* Text */}
              <p className="text-gray-600 leading-relaxed mb-6 text-[15px]">
                "{testimonial.text}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#e31e24]/10 flex items-center justify-center">
                  <span className="text-[#e31e24] font-bold text-lg">
                    {testimonial.name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <div>
                  <div className="font-bold text-[#1a2332]">{testimonial.name}</div>
                  <div className="text-sm text-gray-500">{testimonial.role}, {testimonial.company}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination Dots */}
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: maxIndex + 1 }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-2 rounded-full transition-all ${
                idx === currentIndex ? 'w-8 bg-[#e31e24]' : 'w-2 bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
