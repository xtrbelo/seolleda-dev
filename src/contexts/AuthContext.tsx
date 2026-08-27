import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";

type AuthContextValue = {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
      try {
        const token = authenticatedUser
          ? await authenticatedUser.getIdTokenResult()
          : null;
        const hasAdminAccess =
          authenticatedUser?.emailVerified === true &&
          token?.claims.admin === true;
        setUser(hasAdminAccess ? authenticatedUser : null);
        setIsAdmin(hasAdminAccess);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  async function login(email: string, password: string) {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const token = await credential.user.getIdTokenResult(true);
    if (!credential.user.emailVerified || token.claims.admin !== true) {
      await signOut(auth);
      throw new Error("ADMIN_ACCESS_REQUIRED");
    }
  }

  async function logout() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }

  return context;
}
