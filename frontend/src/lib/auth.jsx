import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);

  const syncLang = (u) => {
    if (u?.language) localStorage.setItem("quotify_lang", u.language);
  };

  const refresh = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data); syncLang(data);
      return data;
    } catch (e) {
      setUser(null);
      return null;
    }
  };

  useEffect(() => { refresh(); }, []);

  // Called after OTP verified — sets user from verify-otp response
  const login = async (email, otp) => {
    const res = await api.post("/auth/verify-otp", { email, otp });
    setUser(res.data.user);
    syncLang(res.data.user);
    return res.data;
  };

  // Register now returns requires_otp, not a user directly
  const register = async (name, email, password) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    // Returns { requires_otp: true, email } — caller handles OTP step
    return data;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (e) {}
    localStorage.removeItem("quotify_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
