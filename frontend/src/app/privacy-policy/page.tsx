import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function PrivacyPolicyPage() {
    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-4xl mx-auto px-6 py-12">
                {/* Header */}
                <div className="mb-8">
                    <Link 
                        href="/home" 
                        className="inline-flex items-center text-gray-600 hover:text-gray-900 transition-colors mb-6"
                    >
                        <ArrowLeft size={20} className="mr-2" />
                        Back to Home
                    </Link>
                    <h1 className="text-4xl font-medium text-gray-900 mb-2">Privacy Policy</h1>
                    <p className="text-gray-600">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>

                {/* Content */}
                <div className="bg-white rounded-2xl shadow-soft p-8 space-y-8">
                    <section>
                        <h2 className="text-2xl font-medium text-gray-900 mb-4">1. Introduction</h2>
                        <p className="text-gray-600 leading-relaxed">
                            Welcome to ParkFinder. We are committed to protecting your personal information and your right to privacy. 
                            This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use 
                            our parking finder application.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-medium text-gray-900 mb-4">2. Information We Collect</h2>
                        <div className="space-y-4 text-gray-600">
                            <div>
                                <h3 className="text-lg font-medium text-gray-800 mb-2">Personal Information</h3>
                                <p className="leading-relaxed">
                                    When you register for an account, we collect information such as your name, email address, 
                                    and password. This information is necessary to create and manage your account.
                                </p>
                            </div>
                            <div>
                                <h3 className="text-lg font-medium text-gray-800 mb-2">Location Data</h3>
                                <p className="leading-relaxed">
                                    To provide you with nearby parking spots, we may collect and process your location data 
                                    when you use our map features. This data is used solely to improve your parking search experience.
                                </p>
                            </div>
                            <div>
                                <h3 className="text-lg font-medium text-gray-800 mb-2">Usage Information</h3>
                                <p className="leading-relaxed">
                                    We automatically collect information about how you interact with our application, including 
                                    pages visited, features used, and time spent on the platform.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-2xl font-medium text-gray-900 mb-4">3. How We Use Your Information</h2>
                        <ul className="list-disc list-inside space-y-2 text-gray-600 leading-relaxed">
                            <li>To provide, maintain, and improve our services</li>
                            <li>To process your registration and manage your account</li>
                            <li>To send you service-related notifications</li>
                            <li>To personalize your experience and show you relevant parking spots</li>
                            <li>To analyze usage patterns and improve our application</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-medium text-gray-900 mb-4">4. Data Security</h2>
                        <p className="text-gray-600 leading-relaxed">
                            We implement appropriate technical and organizational security measures to protect your personal information 
                            against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission 
                            over the Internet is 100% secure, and we cannot guarantee absolute security.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-medium text-gray-900 mb-4">5. Data Sharing</h2>
                        <p className="text-gray-600 leading-relaxed mb-4">
                            We do not sell, trade, or rent your personal information to third parties. We may share your information 
                            only in the following circumstances:
                        </p>
                        <ul className="list-disc list-inside space-y-2 text-gray-600 leading-relaxed">
                            <li>With your explicit consent</li>
                            <li>To comply with legal obligations</li>
                            <li>To protect our rights and prevent fraud</li>
                            <li>With service providers who assist us in operating our application</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-medium text-gray-900 mb-4">6. Your Rights</h2>
                        <p className="text-gray-600 leading-relaxed mb-4">
                            You have the right to:
                        </p>
                        <ul className="list-disc list-inside space-y-2 text-gray-600 leading-relaxed">
                            <li>Access and review your personal information</li>
                            <li>Request correction of inaccurate data</li>
                            <li>Request deletion of your account and data</li>
                            <li>Opt-out of certain data collection practices</li>
                            <li>Withdraw consent at any time</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-medium text-gray-900 mb-4">7. Cookies and Tracking</h2>
                        <p className="text-gray-600 leading-relaxed">
                            We use cookies and similar tracking technologies to enhance your experience, analyze usage, and assist 
                            in our marketing efforts. You can control cookie preferences through your browser settings.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-medium text-gray-900 mb-4">8. Children's Privacy</h2>
                        <p className="text-gray-600 leading-relaxed">
                            Our services are not intended for individuals under the age of 18. We do not knowingly collect personal 
                            information from children. If you believe we have collected information from a child, please contact us 
                            immediately.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-medium text-gray-900 mb-4">9. Changes to This Policy</h2>
                        <p className="text-gray-600 leading-relaxed">
                            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new 
                            Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy 
                            Policy periodically for any changes.
                        </p>
                    </section>

                </div>
            </div>
        </div>
    )
}

