import Link from "next/link"
import { MapPin, Navigation, Bell } from "lucide-react"

export default function HomePage() {
  return (
      <div className="min-h-screen bg-gray-50 relative overflow-hidden">
        {/* Background Pattern - Subtle circles */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-16 left-16 w-24 h-24 rounded-full border border-gray-300"></div>
          <div className="absolute top-32 right-24 w-20 h-20 rounded-full border border-gray-300"></div>
          <div className="absolute top-64 left-1/3 w-16 h-16 rounded-full border border-gray-300"></div>
          <div className="absolute bottom-48 right-16 w-28 h-28 rounded-full border border-gray-300"></div>
          <div className="absolute bottom-32 left-24 w-22 h-22 rounded-full border border-gray-300"></div>
          <div className="absolute top-48 right-1/3 w-18 h-18 rounded-full border border-gray-300"></div>
          <div className="absolute bottom-64 left-1/2 w-20 h-20 rounded-full border border-gray-300"></div>
          <div className="absolute top-80 left-8 w-14 h-14 rounded-full border border-gray-300"></div>
          <div className="absolute bottom-16 right-1/4 w-24 h-24 rounded-full border border-gray-300"></div>
        </div>

        {/* Main Content */}
        <div className="relative z-10">
          {/* Hero Section */}
          <section className="pt-20 pb-16 px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-5xl md:text-6xl font-light text-gray-900 mb-4">Find parking</h1>
              <h2 className="text-5xl md:text-6xl font-medium text-blue-600 mb-6">in seconds</h2>

              <p className="text-base text-gray-600 mb-12 max-w-2xl mx-auto leading-relaxed">
                Real-time availability and seamless navigation to your perfect
                <br />
                parking spot
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Link href="/register">
                  <button className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-full text-base font-medium transition-colors">
                    Get Started →
                  </button>
                </Link>

                <Link href="/map">
                  <button className="border border-gray-300 text-gray-700 hover:bg-gray-100 px-8 py-3 rounded-full text-base font-medium transition-colors">
                    Explore Map
                  </button>
                </Link>
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section className="py-20 px-4">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-16">
                <h3 className="text-3xl font-light text-gray-900 mb-4">Simple. Fast. Reliable.</h3>
                <p className="text-gray-600 max-w-2xl mx-auto">Everything you need to find the perfect parking spot</p>
              </div>

              <div className="grid md:grid-cols-3 gap-16 max-w-4xl mx-auto">
                {/* Find Feature */}
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <MapPin className="w-8 h-8 text-blue-600" />
                  </div>
                  <h4 className="text-xl font-medium text-blue-600 mb-4">Find</h4>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Discover available parking spots near your destination with
                    <br />
                    real-time updates
                  </p>
                </div>

                {/* Navigate Feature */}
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Navigation className="w-8 h-8 text-green-600" />
                  </div>
                  <h4 className="text-xl font-medium text-green-600 mb-4">Navigate</h4>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Get turn-by-turn directions to your chosen parking spot with
                    <br />
                    optimal routing
                  </p>
                </div>

                {/* Stay Updated Feature */}
                <div className="text-center">
                  <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Bell className="w-8 h-8 text-orange-600" />
                  </div>
                  <h4 className="text-xl font-medium text-orange-600 mb-4">Stay Updated</h4>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    Receive notifications about parking availability and
                    <br />
                    reservation confirmations
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-20 px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h3 className="text-3xl font-light text-gray-900 mb-2">Ready to transform your</h3>
              <h4 className="text-3xl font-medium text-gray-900 mb-6">parking experience?</h4>

              <p className="text-gray-600 mb-12 max-w-2xl mx-auto">
                Join thousands of drivers who have made their parking effortless
              </p>

              <Link href="/register">
                <button className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-full text-base font-medium transition-colors">
                  Learn More →
                </button>
              </Link>
            </div>
          </section>
        </div>
      </div>
  )
}
