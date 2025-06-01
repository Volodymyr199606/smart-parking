"use client"

import Link from "next/link"
import { MapPin, Navigation, Bell } from "lucide-react"

export default function HomePage() {
  const scrollToFeatures = () => {
    const featuresSection = document.getElementById("features")
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
      <div className="min-h-screen bg-white">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50 to-blue-50/30"></div>
          <div className="relative container mx-auto px-6 py-24 md:py-32">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-5xl md:text-7xl font-light mb-8 text-slate-900 tracking-tight">
                Find parking
                <span className="block font-medium bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                in seconds
              </span>
              </h1>
              <p className="text-xl md:text-2xl mb-12 text-slate-600 font-light max-w-2xl mx-auto leading-relaxed">
                Real-time availability and seamless navigation to your perfect parking spot
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                    href="/register"
                    className="group bg-slate-900 text-white hover:bg-slate-800 px-8 py-4 rounded-full font-medium text-lg transition-all duration-300 hover:scale-105 hover:shadow-lg"
                >
                  Get Started
                  <span className="ml-2 group-hover:translate-x-1 transition-transform duration-300 inline-block">→</span>
                </Link>
                <Link
                    href="/map"
                    className="text-slate-700 hover:text-slate-900 px-8 py-4 rounded-full font-medium text-lg transition-colors border border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                >
                  Explore Map
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 md:py-32">
          <div className="container mx-auto px-6">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-20">
                <h2 className="text-3xl md:text-4xl font-light mb-4 text-slate-900">Simple. Fast. Reliable.</h2>
                <p className="text-lg text-slate-600 font-light">
                  Everything you need to find parking, nothing you don't
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                {/* Find */}
                <div className="group text-center">
                  <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <MapPin size={28} className="text-blue-600" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-medium mb-4 text-slate-900">Find</h3>
                  <p className="text-slate-600 font-light leading-relaxed">
                    Discover available spots near your destination with live updates
                  </p>
                </div>

                {/* Navigate */}
                <div className="group text-center">
                  <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Navigation size={28} className="text-emerald-600" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-medium mb-4 text-slate-900">Navigate</h3>
                  <p className="text-slate-600 font-light leading-relaxed">
                    Get precise directions and arrive at your spot effortlessly
                  </p>
                </div>

                {/* Stay Updated */}
                <div className="group text-center">
                  <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Bell size={28} className="text-amber-600" strokeWidth={1.5} />
                  </div>
                  <h3 className="text-xl font-medium mb-4 text-slate-900">Stay Updated</h3>
                  <p className="text-slate-600 font-light leading-relaxed">
                    Receive instant notifications about availability changes
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 md:py-32 bg-gradient-to-br from-slate-50 to-blue-50/30">
          <div className="container mx-auto px-6 text-center">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-5xl font-light mb-8 text-slate-900 leading-tight">
                Ready to transform your
                <span className="block font-medium">parking experience?</span>
              </h2>
              <p className="text-lg text-slate-600 font-light mb-10 max-w-2xl mx-auto">
                Join thousands of drivers who save time and reduce stress every day
              </p>
              <button
                  onClick={scrollToFeatures}
                  className="group inline-flex items-center bg-slate-900 text-white hover:bg-slate-800 px-10 py-5 rounded-full font-medium text-lg transition-all duration-300 hover:scale-105 hover:shadow-xl"
              >
                Learn More
                <span className="ml-3 group-hover:translate-x-1 transition-transform duration-300">↑</span>
              </button>
            </div>
          </div>
        </section>
      </div>
  )
}