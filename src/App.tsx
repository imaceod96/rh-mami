import * as React from "react"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as Sonner } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { CurrentTenantProvider, useCurrentTenant } from "@/contexts/CurrentTenantContext"
import { PlatformAdminLayout } from "@/components/platform-admin-layout"
import { TenantLayout } from "@/components/tenant-layout"
import Login from "./pages/Login"
import Index from "./pages/Index"
import Organization from "./pages/Organization"
import Candidates from "./pages/Candidates"
import Hiring from "./pages/Hiring"
import Admin from "./pages/Admin"
import Account from "./pages/Account"
import Companies from "./pages/Companies"
import PlatformUsers from "./pages/PlatformUsers"
import RolesPermissions from "./pages/RolesPermissions"
import TenantUsers from "./pages/TenantUsers"
import TenantInvitations from "./pages/TenantInvitations"
import NotFound from "./pages/NotFound"

const queryClient = new QueryClient()

// Loading screen component
const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-sitecorp-background">
    <div className="text-center">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-xl bg-sitecorp-primary mb-4 animate-pulse">
        <span className="text-2xl font-bold text-white">SC</span>
      </div>
      <p className="text-sm text-muted-foreground">Cargando SiteCorp...</p>
    </div>
  </div>
)

// Main routing logic
const AppRoutes = () => {
  const { authLoading, authReady, user, isPlatformSuperAdmin, isProfileActive } = useAuth()
  const { currentTenant } = useCurrentTenant()

  if (authLoading) {
    return <LoadingScreen />
  }

  if (!authReady) {
    return <LoadingScreen />
  }

  if (!user || !isProfileActive) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  // Platform SuperAdmin with no current tenant -> Platform Admin
    if (isPlatformSuperAdmin && !currentTenant) {
      return (
        <Routes>
          <Route element={<PlatformAdminLayout />}>
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/companies" element={<Companies />} />
            <Route path="/admin/users" element={<PlatformUsers />} />
            <Route path="/admin/roles" element={<RolesPermissions />} />
            <Route path="/admin/account" element={<Account />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Routes>
      )
    }

  // Tenant user -> Tenant Application
  return (
    <Routes>
      <Route element={<TenantLayout />}>
        <Route path="/" element={<Index />} />
        <Route path="/organization" element={<Organization />} />
        <Route path="/candidates" element={<Candidates />} />
        <Route path="/hiring" element={<Hiring />} />
        <Route path="/tenant/users" element={<TenantUsers />} />
        <Route path="/tenant/invitations" element={<TenantInvitations />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CurrentTenantProvider>
            <AppRoutes />
          </CurrentTenantProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
)

export default App