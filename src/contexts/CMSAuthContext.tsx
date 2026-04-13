import React, { createContext, useContext, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';

interface CMSAuthContextType {
  isAuthenticated: boolean;
  username: string | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const CMSAuthContext = createContext<CMSAuthContextType>({
  isAuthenticated: false,
  username: null,
  login: () => false,
  logout: () => {},
});

export const useCMSAuth = () => useContext(CMSAuthContext);

const CMS_AUTH_KEY = 'voltz-cms-auth';

// Simple credentials - in production this would be server-side
const VALID_CREDENTIALS = [
  { username: 'admin', password: 'admin123' },
  { username: 'voltz', password: 'voltz2026' },
];

export const CMSAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<{ isAuthenticated: boolean; username: string | null }>(() => {
    try {
      const stored = localStorage.getItem(CMS_AUTH_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { isAuthenticated: true, username: parsed.username };
      }
    } catch { /* ignore invalid stored auth */ }
    return { isAuthenticated: false, username: null };
  });

  const login = useCallback((username: string, password: string): boolean => {
    const valid = VALID_CREDENTIALS.find(
      (c) => c.username === username && c.password === password
    );
    if (valid) {
      // Commit before any navigate() so /cms sees isAuthenticated (avoids blank screen from stale context).
      flushSync(() => {
        setAuthState({ isAuthenticated: true, username });
      });
      localStorage.setItem(CMS_AUTH_KEY, JSON.stringify({ username, loginTime: Date.now() }));
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setAuthState({ isAuthenticated: false, username: null });
    localStorage.removeItem(CMS_AUTH_KEY);
  }, []);

  return (
    <CMSAuthContext.Provider value={{ ...authState, login, logout }}>
      {children}
    </CMSAuthContext.Provider>
  );
};
