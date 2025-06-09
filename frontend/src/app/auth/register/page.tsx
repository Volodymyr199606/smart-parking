import RegisterForm from "@/components/auth/register-form";

export default function RegisterPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="w-full max-w-md">
                <RegisterForm />
            </div>
        </div>
    );
}
