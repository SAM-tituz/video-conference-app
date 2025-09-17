"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/provider/authprovider"; // Adjust path
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = () => {
    if (login(email, password)) {
      router.push("/"); // Redirect to home page on successful login
    } else {
      alert("Invalid credentials!");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
           
            <h1 className="text-2xl font-semibold text-gray-900">Video Meet</h1>
          </div>
        </div>

        <Card className="google-shadow">
          <CardHeader>
            <CardTitle className="text-center">Login page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <Input
                type="email"
                placeholder="Email (e.g., sam@example.com)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>

              <Input
                type="password"
                placeholder="Password (e.g., password123)"
                className="w-full"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Button onClick={handleLogin}>Login</Button>
            </div>

            <div className="text-center">
              <p className="text-xs text-gray-500 mt-4">
                By proceeding, you agree to our terms of service and privacy
                policy
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
