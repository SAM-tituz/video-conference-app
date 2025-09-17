// providers/AuthProvider.tsx

"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { MOCK_USERS } from "../../../server/users";  // Adjust the import path

// Define the shape of a user
type User = (typeof MOCK_USERS)[0];

// Define the shape of the context value
interface AuthContextType {
  user: User | null;
login: (email: string, password: string) => boolean;
  logout: () => void;
}

// Create the context
const AuthContext = createContext<AuthContextType | null>(null);

// Create the Provider component
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // Check sessionStorage for a logged-in user when the app loads
  useEffect(() => {
    const storedUserId = sessionStorage.getItem('userId');
    if (storedUserId) {
      const loggedInUser = MOCK_USERS.find(u => u.id === storedUserId);
      if (loggedInUser) {
        setUser(loggedInUser);
      }
    }
  }, []);

  // Login function
interface LoginFn {
    (email: string, password: string): boolean;
}

const login: LoginFn = (email, password) => {
    const foundUser = MOCK_USERS.find(
        (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    );

    if (foundUser) {
        setUser(foundUser);
        sessionStorage.setItem('userId', foundUser.id); // Persist login across refreshes
        return true;
    }
    return false;
};

  // Logout function
  const logout = () => {
    setUser(null);
    sessionStorage.removeItem('userId');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Create a custom hook for easy access to the context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};