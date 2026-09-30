import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import * as authApi from '@/api/auth'
import { apiClient, clearToken, getToken, setToken, unwrap, apiErrorMessage } from '@/api/client'
import { telemetryHeaders } from '@/features/bidmark/telemetry'
import type { User, UserRole } from '@/types'
interface AuthContextValue {
 user: User | null; loading: boolean; sessionError: string | null; restore: () => void
 login: (email: string, password: string, bidder?: boolean, signals?: {paste_count: number; keystrokes: number; fill_ms: number}) => Promise<void>
 register: (email: string, password: string, fullName: string, role: UserRole, companyName?: string) => Promise<void>
 logout: () => void
}
const AuthContext = createContext<AuthContextValue | undefined>(undefined)
export function AuthProvider({children}: {children: ReactNode}) {
 const [user,setUser] = useState<User|null>(null), [loading,setLoading] = useState(true), [sessionError,setError] = useState<string|null>(null), [revision,setRevision] = useState(0)
 useEffect(() => {
  let active = true
  if (!getToken()) {setLoading(false); return}
  setLoading(true); setError(null)
  authApi.me().then(u => {if(active) setUser(u)}).catch(e => {if(active) setError(apiErrorMessage(e))}).finally(() => {if(active) setLoading(false)})
  return () => {active = false}
 },[revision])
 useEffect(() => {
  const expired = () => {setUser(null); setError('Session expired. Please sign in again.')}
  window.addEventListener('bidmark:session-expired',expired)
  return () => window.removeEventListener('bidmark:session-expired',expired)
 },[])
 async function login(email: string,password: string,bidder = false,signals?: {paste_count: number; keystrokes: number; fill_ms: number}) {
  const res = await unwrap<authApi.LoginResponse>(apiClient.post('/api/v1/auth/login',{email,password},{headers: bidder ? await telemetryHeaders(signals) : undefined}))
  setToken(res.access_token); setError(null); setUser(res.user)
 }
 async function register(email: string,password: string,fullName: string,role: UserRole,companyName?: string) {
  const res = await authApi.register(email,password,fullName,role,companyName)
  setToken(res.access_token);setError(null);setUser(res.user)
 }
 function logout(){clearToken();setUser(null);setError(null)}
 return <AuthContext.Provider value={{user,loading,sessionError,restore:()=>setRevision(n=>n+1),login,register,logout}}>{children}</AuthContext.Provider>
}
export function useAuth(){const c=useContext(AuthContext);if(!c) throw new Error('AuthProvider required');return c}
