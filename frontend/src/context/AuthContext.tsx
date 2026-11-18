"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { getMe, type UserMe } from "@/lib/api";
import { clearBeconCaches, syncUserCache } from "@/lib/cache";

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAnonymous: boolean;
  me: UserMe | null;
  isMeLoading: boolean;
  meError: Error | null;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signInAsGuest: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  upgradeGuestWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  refreshMe: () => Promise<UserMe | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [me, setMe] = useState<UserMe | null>(null);
  const [isMeLoading, setIsMeLoading] = useState<boolean>(false);
  const [meError, setMeError] = useState<Error | null>(null);

  const isAnonymous = useMemo(() => {
    return Boolean(user?.is_anonymous || me?.is_anonymous);
  }, [user, me]);

  const loadMe = useCallback(async (): Promise<UserMe | null> => {
    setIsMeLoading(true);
    setMeError(null);
    try {
      const data = await getMe();
      setMe(data);
      return data;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setMeError(errorObj);
      return null;
    } finally {
      setIsMeLoading(false);
    }
  }, []);

  // Initialize session and subscribe to auth state changes
  useEffect(() => {
    let mounted = true;

    // 1. Initial session check
    supabase.auth
      .getSession()
      .then(async ({ data: { session: initialSession } }) => {
        if (!mounted) return;
        setSession(initialSession);
        setUser(initialSession?.user || null);
        syncUserCache(initialSession?.user?.id || null);

        if (initialSession?.user) {
          await loadMe();
        } else {
          setMe(null);
        }
      })
      .catch((err) => {
        console.error("Failed to retrieve Supabase session:", err);
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    // 2. Auth state subscription
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;

      const newUser = newSession?.user || null;
      setSession(newSession);
      setUser(newUser);
      syncUserCache(newUser?.id || null);

      if (event === "SIGNED_OUT") {
        setMe(null);
        clearBeconCaches();
        setIsLoading(false);
        return;
      }

      if (newUser) {
        await loadMe();
      } else {
        setMe(null);
      }
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadMe]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { error };
        await loadMe();
        return { error: null };
      } catch (err) {
        return { error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
    [loadMe]
  );

  const signUpWithPassword = useCallback(async (email: string, password: string) => {
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });
      if (error) return { error };
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback`,
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (error) return { error };
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, []);

  const signInAsGuest = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) return { error };
      await loadMe();
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, [loadMe]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      clearBeconCaches();
      setSession(null);
      setUser(null);
      setMe(null);
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/reset-password`,
      });
      if (error) return { error };
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { error };
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, []);

  const upgradeGuestWithEmail = useCallback(async (email: string, password: string) => {
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await supabase.auth.updateUser(
        { email, password },
        { emailRedirectTo: `${origin}/auth/callback` }
      );
      if (error) return { error };
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, []);

  const value = useMemo(
    () => ({
      session,
      user,
      isLoading,
      isAnonymous,
      me,
      isMeLoading,
      meError,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signInAsGuest,
      signOut,
      sendPasswordReset,
      updatePassword,
      upgradeGuestWithEmail,
      refreshMe: loadMe,
    }),
    [
      session,
      user,
      isLoading,
      isAnonymous,
      me,
      isMeLoading,
      meError,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signInAsGuest,
      signOut,
      sendPasswordReset,
      updatePassword,
      upgradeGuestWithEmail,
      loadMe,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
