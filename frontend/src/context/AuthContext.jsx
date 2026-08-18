import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('docmind_admin_token') || '');
  const [user, setUser] = useState(() => localStorage.getItem('docmind_admin_user') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem('docmind_admin_token')));

  const login = useCallback((accessToken, username) => {
    localStorage.setItem('docmind_admin_token', accessToken);
    localStorage.setItem('docmind_admin_user', username);
    setToken(accessToken);
    setUser(username);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch('/api/admin/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });
      }
    } catch (err) {
      console.warn('Logout network notice:', err);
    } finally {
      localStorage.removeItem('docmind_admin_token');
      localStorage.removeItem('docmind_admin_user');
      setToken('');
      setUser('');
      setIsAuthenticated(false);
    }
  }, [token]);

  const getAuthHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token.trim()}`;
    }
    return headers;
  }, [token]);

  const checkAuthResponse = useCallback((res) => {
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('docmind_admin_token');
      localStorage.removeItem('docmind_admin_user');
      setToken('');
      setUser('');
      setIsAuthenticated(false);
      return false;
    }
    return true;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated,
        login,
        logout,
        getAuthHeaders,
        checkAuthResponse,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
