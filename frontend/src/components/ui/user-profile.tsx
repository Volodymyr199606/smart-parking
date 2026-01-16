"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import api from "@/lib/api"
import { User, Edit, Save, X } from 'lucide-react'
import { AxiosError } from "axios"

interface UpdateProfileRequest {
    fullName: string
}

export default function UserProfile() {
    const { user, setUser } = useAuth()
    const [isEditing, setIsEditing] = useState(false)
    const [formData, setFormData] = useState({
        fullName: user?.fullName || ""
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Update formData when user changes
    useEffect(() => {
        if (user?.fullName && !isEditing) {
            setFormData({ fullName: user.fullName })
        }
    }, [user, isEditing])

    const updateProfile = async (data: UpdateProfileRequest) => {
        setLoading(true)
        setError(null)

        try {
            // Validate the data before sending
            if (!data.fullName || data.fullName.trim().length < 2) {
                setError("Full name must be at least 2 characters long")
                setLoading(false)
                return
            }

            if (data.fullName.trim().length > 100) {
                setError("Full name must be less than 100 characters")
                setLoading(false)
                return
            }

            const response = await api.put('/api/auth/profile', data)
            setUser(response.data)
            setIsEditing(false)
        } catch (err) {
            const error = err as AxiosError<{ message?: string; error?: string; fullName?: string }>
            const status = error.response?.status
            const errorData = error.response?.data || {}
            const errorMessage = error?.message || "Unknown error"
            
            // Try to get error message from different possible fields
            const displayMessage = 
                errorData?.message || 
                errorData?.error || 
                errorData?.fullName || 
                (status === 403 ? "Forbidden: You don't have permission to update your profile" : null) ||
                (status === 401 ? "Authentication failed. Please log in again." : null) ||
                errorMessage || 
                "Failed to update profile"

            console.error('Profile update error:', {
                status: status || 'no status',
                statusText: error.response?.statusText || 'no status text',
                errorMessage: displayMessage,
                errorData: errorData,
                errorResponse: error.response,
                fullError: err
            })

            // Provide more specific error messages
            if (status === 401) {
                setError("Authentication failed. Please log in again.")
            } else if (status === 403) {
                setError("Forbidden: You don't have permission to update your profile. Please check your authentication.")
            } else if (status === 400) {
                setError(displayMessage)
            } else if (status === 500) {
                setError(displayMessage || "Server error. Please try again later.")
            } else {
                setError(displayMessage)
            }
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        updateProfile(formData)
    }

    const handleCancel = () => {
        setFormData({ fullName: user?.fullName || "" })
        setIsEditing(false)
        setError(null)
    }

    return (
        <div className="bg-white rounded-2xl shadow-soft p-8">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                    <div className="bg-slate-100 p-3 rounded-full">
                        <User size={24} className="text-slate-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-medium text-slate-900">Profile</h2>
                        <p className="text-slate-600">Manage your account information</p>
                    </div>
                </div>
                {!isEditing && (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center space-x-2 text-slate-600 hover:text-slate-900 transition-colors"
                    >
                        <Edit size={16} />
                        <span>Edit</span>
                    </button>
                )}
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-sm mb-6">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Full Name</label>
                    {isEditing ? (
                        <input
                            type="text"
                            value={formData.fullName}
                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                            className="w-full p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-colors bg-white text-slate-900"
                            required
                        />
                    ) : (
                        <div className="p-4 bg-slate-50 rounded-xl text-slate-900">
                            {user?.fullName}
                        </div>
                    )}
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Email</label>
                    <div className="p-4 bg-slate-50 rounded-xl text-slate-600">
                        {user?.email}
                        <span className="text-xs ml-2">(Cannot be changed)</span>
                    </div>
                </div>

                {isEditing && (
                    <div className="flex space-x-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 bg-slate-900 text-white hover:bg-slate-800 px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center"
                        >
                            {loading ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></div>
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <Save size={16} className="mr-2" />
                                    Save Changes
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="flex-1 border border-slate-300 text-slate-700 hover:bg-slate-50 px-6 py-3 rounded-xl font-medium transition-colors flex items-center justify-center"
                        >
                            <X size={16} className="mr-2" />
                            Cancel
                        </button>
                    </div>
                )}
            </form>
        </div>
    )
}
