import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onIdTokenChanged,
  getIdTokenResult,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { AuthContext } from "./useAuth";

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [storeIds, setStoreIds] = useState<string[]>([]);

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, (authenticatedUser) => {
      setUser(authenticatedUser);
      if (!authenticatedUser) { setRoles([]); setStoreIds([]); setLoading(false); return; }
      void getIdTokenResult(authenticatedUser).then((result) => {
        if (auth.currentUser?.uid !== authenticatedUser.uid) return;
        const claimRoles = Array.isArray(result.claims.roles) ? result.claims.roles : [];
        setRoles(result.claims.admin === true ? ["admin"] : claimRoles.filter((role): role is string => typeof role === "string"));
        setStoreIds(Array.isArray(result.claims.storeIds) ? result.claims.storeIds.filter((storeId): storeId is string => typeof storeId === "string") : []);
        setLoading(false);
      }).catch(() => {
        if (auth.currentUser?.uid !== authenticatedUser.uid) return;
        setRoles([]); setStoreIds([]); setLoading(false);
      });
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
