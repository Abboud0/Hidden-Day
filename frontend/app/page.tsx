import UserForm from "@/components/UserForm";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-50 to-white text-gray-900">
      <h1 className="text-4xl font-bold mb-4">🌤 Hidden Day</h1>
      <p className="text-gray-600 mb-6">
        Discover hidden gems and plan your perfect weekend.
      </p>

      <UserForm />
    </main>
  );
}
