import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  getIdTokenResult,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  roles: string[];
  storeIds: string[];
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [storeIds, setStoreIds] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authenticatedUser) => {
      setUser(authenticatedUser);
      if (!authenticatedUser) { setRoles([]); setStoreIds([]); setLoading(false); return; }
      void getIdTokenResult(authenticatedUser).then((result) => {
        const claimRoles = Array.isArray(result.claims.roles) ? result.claims.roles : [];
        setRoles(result.claims.admin === true ? ["admin"] : claimRoles.filter((role): role is string => typeof role === "string"));
        setStoreIds(Array.isArray(result.claims.storeIds) ? result.claims.storeIds.filter((storeId): storeId is string => typeof storeId === "string") : []);
        setLoading(false);
      }).catch(() => { setRoles([]); setStoreIds([]); setLoading(false); });
    });

    return unsubscribe;
  }, []);

  async function login(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function logout() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, roles, storeIds }}>
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
