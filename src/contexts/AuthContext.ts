import * as React from "react"
import type { User } from "@supabase/supabase-js"

export interface AuthProfile {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string | null
  updated_at: string | null
}

export interface AuthTenantSummary {
  id: string
  name: string
}

export interface AuthMembership {
  id: string
  tenant_id: string
  user_id: string
  is_active: boolean
  tenant: AuthTenantSummary | null
}

interface AuthContextType {
  user: User | null
  profile: AuthProfile | null
  isPlatformSuperAdmin: boolean
  isPlatformUser: boolean
  isProfileActive: boolean
  memberships: AuthMembership[]
  authLoading: boolean
  authReady: boolean
  logout: () => Promise<void>
  hasPlatformPermission: (code: string) => Promise<boolean>
  hasTenantPermission: (code: string) => Promise<boolean>
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined)

export const useAuth = (): AuthContextType => {
  const context = React.useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export { AuthContext }
