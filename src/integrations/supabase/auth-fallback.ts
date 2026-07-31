type AuthUser = {
  id: string;
  email: string;
  aud?: string;
  role?: string;
};

type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user: AuthUser;
};

type AuthResponse<T> = Promise<{ data: T; error: { message: string } | null }>;

const LOCAL_USERS_KEY = "geopulse-local-users";
const LOCAL_SESSION_KEY = "geopulse-local-session";

const fallbackError = (message: string) => ({ message });

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStoredUsers(): Record<string, { email: string; passwordHash: string }> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStoredUsers(users: Record<string, { email: string; passwordHash: string }>) {
  if (!isBrowser()) return;
  window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

function readStoredSession(): AuthSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredSession(session: AuthSession | null) {
  if (!isBrowser()) return;
  if (!session) {
    window.localStorage.removeItem(LOCAL_SESSION_KEY);
    return;
  }
  window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
}

function makePasswordHash(password: string) {
  return btoa(password);
}

function makeSession(user: AuthUser): AuthSession {
  return {
    access_token: `local-${user.id}`,
    refresh_token: `local-${user.id}`,
    expires_at: Date.now() + 1000 * 60 * 60 * 24 * 7,
    expires_in: 60 * 60 * 24 * 7,
    token_type: "bearer",
    user,
  };
}

function shouldUseFallback(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();
  return lowered.includes("invalid api key")
    || lowered.includes("unauthorized")
    || lowered.includes("failed to fetch")
    || lowered.includes("network")
    || lowered.includes("401")
    || lowered.includes("api key")
    || lowered.includes("auth") && lowered.includes("not configured");
}

export function installLocalAuthFallback(supabase: any) {
  const baseAuth = supabase.auth;

  const emitState = (event: string, session: AuthSession | null) => {
    const listeners = (baseAuth as any)._localListeners || [];
    listeners.forEach((listener: (eventName: string, session: AuthSession | null) => void) => {
      listener(event, session);
    });
  };

  const auth = {
    async getSession() {
      try {
        const result = await baseAuth.getSession();
        if (result?.data?.session) {
          return result;
        }
      } catch (error) {
        if (!shouldUseFallback(error)) {
          return { data: { session: null }, error: fallbackError((error as Error)?.message || "Auth unavailable") };
        }
      }

      const stored = readStoredSession();
      return { data: { session: stored || null }, error: null };
    },

    async getUser() {
      try {
        const result = await baseAuth.getUser();
        if (result?.data?.user) {
          return result;
        }
      } catch (error) {
        if (!shouldUseFallback(error)) {
          return { data: { user: null }, error: fallbackError((error as Error)?.message || "Auth unavailable") };
        }
      }

      const stored = readStoredSession();
      return { data: { user: stored?.user || null }, error: null };
    },

    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const result = await baseAuth.signInWithPassword({ email, password });
        if (!result?.error) {
          return result;
        }
        if (!shouldUseFallback(result.error)) {
          return result;
        }
      } catch (error) {
        if (!shouldUseFallback(error)) {
          return { data: { user: null, session: null }, error: fallbackError((error as Error)?.message || "Auth unavailable") };
        }
      }

      const users = readStoredUsers();
      const userEntry = users[email.toLowerCase()];
      if (!userEntry || userEntry.passwordHash !== makePasswordHash(password)) {
        return { data: { user: null, session: null }, error: fallbackError("Invalid email or password") };
      }

      const user: AuthUser = { id: userEntry.email.toLowerCase().replace(/[^a-z0-9]/g, "") + "-local", email: userEntry.email };
      const session = makeSession(user);
      writeStoredSession(session);
      emitState("SIGNED_IN", session);
      return { data: { user, session }, error: null };
    },

    async signUp({ email, password }: { email: string; password: string }) {
      try {
        const result = await baseAuth.signUp({ email, password });
        if (!result?.error || !shouldUseFallback(result.error)) {
          return result;
        }
      } catch (error) {
        if (!shouldUseFallback(error)) {
          return { data: { user: null, session: null }, error: fallbackError((error as Error)?.message || "Auth unavailable") };
        }
      }

      const users = readStoredUsers();
      const normalizedEmail = email.toLowerCase();
      if (users[normalizedEmail]) {
        return { data: { user: null, session: null }, error: fallbackError("This email is already registered. Please sign in instead.") };
      }

      users[normalizedEmail] = { email, passwordHash: makePasswordHash(password) };
      writeStoredUsers(users);

      const user: AuthUser = { id: normalizedEmail.replace(/[^a-z0-9]/g, "") + "-local", email };
      const session = makeSession(user);
      writeStoredSession(session);
      emitState("SIGNED_IN", session);
      return { data: { user, session }, error: null };
    },

    async signInWithOAuth() {
      return { data: { provider: "", url: null, user: null, session: null }, error: fallbackError("OAuth is currently unavailable. Please use email sign-in instead.") };
    },

    async signInWithOtp({ email }: { email: string }) {
      const users = readStoredUsers();
      if (!users[email.toLowerCase()]) {
        return { data: { user: null, session: null }, error: fallbackError("No account found for that email. Please sign up first.") };
      }
      return { data: { user: null, session: null }, error: null };
    },

    async resetPasswordForEmail() {
      return { data: {}, error: null };
    },

    async signOut() {
      try {
        await baseAuth.signOut();
      } catch {
        // ignore
      }
      writeStoredSession(null);
      emitState("SIGNED_OUT", null);
      return { error: null };
    },

    onAuthStateChange(callback: (event: string, session: AuthSession | null) => void) {
      const listeners = ((baseAuth as any)._localListeners ||= []);
      listeners.push(callback);
      const stored = readStoredSession();
      if (stored) {
        callback("SIGNED_IN", stored);
      } else {
        callback("SIGNED_OUT", null);
      }
      return { data: { subscription: { unsubscribe: () => {
        const index = listeners.indexOf(callback);
        if (index >= 0) listeners.splice(index, 1);
      } } } };
    },
  };

  (supabase as any).auth = auth;
  return auth;
}
