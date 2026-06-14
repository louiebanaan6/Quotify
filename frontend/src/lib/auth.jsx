import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

function saveToken(token) {
  if (token) localStorage.setItem("quotify_token", token);
}
function clearToken() {
  localStorage.removeItem("quotify_token");
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);

  const syncLang = (u) => {
    if (u?.language) localStorage.setItem("quotify_lang", u.language);
  };

  const refresh = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      syncLang(data);
      return data;
    } catch (e) {
      setUser(null);
      return null;
    }
  };

  useEffect(() => { refresh(); }, []);

  const login = async (email, otp) => {
    const res = await api.post("/auth/verify-otp", { email, otp });
    // Save token to localStorage so Bearer header works cross-origin
    saveToken(res.data.token);
    setUser(res.data.user);
    syncLang(res.data.user);
    return res.data;
  };

  const register = async (name, email, password) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    return data;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (e) {}
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
