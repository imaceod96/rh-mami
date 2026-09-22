import * as React from "react"
import { supabase } from "@/lib/supabase"
import type { User } from "@supabase/supabase-js"

interface AuthContextType {
  user: User | null
  profile: Record<string, any> | null
  isPlatformSuperAdmin: boolean
  isProfileActive: boolean
  memberships: Record<string, any>[]
  authLoading: boolean
  authReady: boolean
  logout: () => Promise<void>
  hasPlatformPermission: (code: string) => Promise<boolean>
  hasTenantPermission: (code: string) => Promise<boolean>
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = React.useState<User | null>(null)
    const [profile, setProfile] = React.useState<Record<string, any> | null>(null)
    const [isPlatformSuperAdmin, setIsPlatformSuperAdmin] = React.useState(false)
    const [isProfileActive, setIsProfileActive] = React.useState(true)
    const [memberships, setMemberships] = React.useState<Record<string, any>[]>([])
    const [authLoading, setAuthLoading] = React.useState(true)
    const [authReady, setAuthReady] = React.useState(false)

  React.useEffect(() => {
    let mounted = true

    const loadAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted) return

        if (session?.user) {
          setUser(session.user)

          // Load profile
                    const { data: profileData } = await supabase
                      .from("profiles")
                      .select("*")
                      .eq("id", session.user.id)
                      .single()
          
                    if (mounted) {
                      setProfile(profileData || null)
                      const active = profileData?.is_active !== false
                      setIsProfileActive(active)
                      if (!active) {
                        await supabase.auth.signOut()
                        return
                      }
                    }

          // Load SuperAdmin status
          const { data: superAdminData } = await supabase.rpc("is_platform_superadmin")
          if (mounted) {
            setIsPlatformSuperAdmin(!!superAdminData)
          }

          // Load memberships
          const { data: membershipsData } = await supabase
            .from("tenant_memberships")
            .select("*, tenant:tenants(*)")
            .eq("user_id", session.user.id)
            .eq("is_active", true)

          if (mounted) {
            setMemberships(membershipsData || [])
          }
        }
      } catch (error) {
        console.error("Auth loading error:", error)
      } finally {
        if (mounted) {
          setAuthLoading(false)
          setAuthReady(true)
        }
      }
    }

    loadAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
                    if (session?.user) {
                      setUser(session.user)
                      const { data: profileData } = await supabase
                        .from("profiles")
                        .select("*")
                        .eq("id", session.user.id)
                        .single()
                      setProfile(profileData || null)
                      const active = profileData?.is_active !== false
                      setIsProfileActive(active)
                      if (!active) {
                        await supabase.auth.signOut()
                        return
                      }
        
                      const { data: superAdminData } = await supabase.rpc("is_platform_superadmin")
            setIsPlatformSuperAdmin(!!superAdminData)

            const { data: membershipsData } = await supabase
              .from("tenant_memberships")
              .select("*, tenant:tenants(*)")
              .eq("user_id", session.user.id)
              .eq("is_active", true)
            setMemberships(membershipsData || [])
          }
        } else if (event === "SIGNED_OUT") {
                  setUser(null)
                  setProfile(null)
                  setIsPlatformSuperAdmin(false)
                  setIsProfileActive(true)
                  setMemberships([])
                  setAuthLoading(false)
                  setAuthReady(true)
                }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
  }

  const hasPlatformPermission = async (code: string): Promise<boolean> => {
    try {
      if (isPlatformSuperAdmin) return true
      const { data, error } = await supabase.rpc("has_platform_permission", { p_code: code })
      if (error) return false
      return !!data
    } catch {
      return false
    }
  }

  const hasTenantPermission = async (code: string): Promise<boolean> => {
      try {
        if (isPlatformSuperAdmin) return true
        if (!currentTenant) return false
        const { data, error } = await supabase.rpc("has_tenant_permission", {
          p_tenant_id: currentTenant.id,
          p_code: code,
        })
        if (error) return false
        return !!data
      } catch {
        return false
      }
    }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isPlatformSuperAdmin,
        isProfileActive,
        memberships,
        authLoading,
        authReady,
        logout,
        hasPlatformPermission,
        hasTenantPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const context = React.useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export { AuthContext }