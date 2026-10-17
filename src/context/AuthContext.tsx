import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { 
  User, 
  signInWithPopup, 
  signOut, 
  onIdTokenChanged 
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { getFreshToken, apiFetch } from '../lib/api.ts';

export interface AuthContextType {
  user: User | null;
  dbUser: {
    uid: string;
    email: string;
    name: string;
    role: 'Admin' | 'Accountant' | 'Viewer';
  } | null;
  token: string | null;
  loading: boolean;
  getToken: (forceRefresh?: boolean) => Promise<string | null>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  simulateRole: (role: 'Admin' | 'Accountant' | 'Viewer') => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<AuthContextType['dbUser']>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep track of loaded user ID to prevent duplicate profile syncs on token refresh
  const loadedUidRef = useRef<string | null>(null);

  const fetchProfile = useCallback(async (firebaseUser: User, idToken: string) => {
    try {
      const res = await apiFetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setDbUser(data.user);
        loadedUidRef.current = firebaseUser.uid;
      } else {
        console.error("Failed to sync profile");
      }
    } catch (err) {
      console.error("Error fetching db profile:", err);
    }
  }, []);

  const getToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    const freshToken = await getFreshToken(forceRefresh);
    if (freshToken) {
      setToken(freshToken);
    }
    return freshToken;
  }, []);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const idToken = await currentUser.getIdToken();
          setToken(idToken);
          // Sync profile if user changed or profile not loaded
          if (loadedUidRef.current !== currentUser.uid) {
            await fetchProfile(currentUser, idToken);
          }
        } catch (err) {
          console.error("Error getting auth token on auth state change:", err);
        }
      } else {
        setUser(null);
        setDbUser(null);
        setToken(null);
        loadedUidRef.current = null;
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchProfile]);

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      console.error("Failed to login with Google:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      loadedUidRef.current = null;
    } catch (err) {
      console.error("Failed to sign out:", err);
    } finally {
      setLoading(false);
    }
  };

  const simulateRole = async (role: 'Admin' | 'Accountant' | 'Viewer') => {
    const currentToken = await getToken();
    if (!currentToken) return;
    try {
      const res = await apiFetch('/api/auth/simulate-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && dbUser) {
          setDbUser({
            ...dbUser,
            role: role
          });
        }
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to switch role");
      }
    } catch (err) {
      console.error("Error simulating role:", err);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const freshToken = await getToken();
      if (freshToken) {
        await fetchProfile(user, freshToken);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      dbUser, 
      token, 
      loading, 
      getToken,
      loginWithGoogle, 
      logout, 
      simulateRole,
      refreshProfile 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
