import * as React from "react"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as Sonner } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { CurrentTenantProvider, useCurrentTenant } from "@/contexts/CurrentTenantContext"
import { CurrentEntityProvider, useCurrentEntity } from "@/contexts/CurrentEntityContext"
import { SalaryProvider } from "@/contexts/SalaryContext"
import { PlatformAdminLayout } from "@/components/platform-admin-layout"
import EntityRouteWrapper from "@/components/entity-route-wrapper"
import { TenantLayout } from "@/components/tenant-layout"
import Login from "./pages/Login"
import Index from "./pages/Index"
import Organization from "./pages/Organization"
import OrganizationDetail from "./pages/OrganizationDetail"
import Candidates from "./pages/Candidates"
import Hiring from "./pages/Hiring"
import Admin from "./pages/Admin"
import Account from "./pages/Account"
import Organizations from "./pages/Organizations"
import PlatformUsers from "./pages/PlatformUsers"
import RolesPermissions from "./pages/RolesPermissions"
import TenantUsers from "./pages/TenantUsers"
import TenantInvitations from "./pages/TenantInvitations"
import TenantRoles from "./pages/TenantRoles"
import AdminSettingsSalaryScale from "./pages/AdminSettingsSalaryScale"
import EntitySummary from "./pages/EntitySummary"
import EntityOrganization from "./pages/EntityOrganization"
import EntityCandidates from "./pages/EntityCandidates"
import EntityStaffing from "./pages/EntityStaffing"
import EntityHiring from "./pages/EntityHiring"
import EntitySettings from "./pages/EntitySettings"
import EntitySettingsUsers from "./pages/EntitySettingsUsers"
import EntitySettingsRoles from "./pages/EntitySettingsRoles"
import EntitySettingsSalary from "./pages/EntitySettingsSalary"
import EntitySettingsGoverningDocuments from "./pages/EntitySettingsGoverningDocuments"
import NotFound from "./pages/NotFound"

const queryClient = new QueryClient()

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error("SiteCorp render error:", error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-sitecorp-background p-6">
          <div className="w-full max-w-lg rounded-2xl border border-sitecorp-danger/30 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-sitecorp-danger">Error de la aplicación</p>
            <p className="mt-2 text-sm text-ink">
              SiteCorp no pudo renderizar la interfaz. Recarga la página para continuar.
            </p>
            <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-sitecorp-background p-3 text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              className="mt-4 rounded-lg bg-sitecorp-primary px-4 py-2 text-sm font-medium text-white"
              onClick={() => window.location.reload()}
            >
              Recargar
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

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

// /panel compatibility redirect: resolves to the sibling canonical route
// /entity/<REAL_ENTITY_ID>/summary (NOT /entity/<id>/panel/summary)
const EntityPanelRedirect = () => {
  const { entityId } = useParams<{ entityId: string }>()
  return <Navigate to={`/entity/${entityId}/summary`} replace />
}

// Main routing logic
const AppRoutes = () => {
  const { authLoading, authReady, user, isPlatformSuperAdmin, isProfileActive } = useAuth()
  const { currentTenant } = useCurrentTenant()
  const location = useLocation()

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

  // Entity routes are evaluated BEFORE platform/tenant branching.
  // currentTenant is intentionally NOT used here: Platform users may have a
  // null tenant, and a stale non-null tenant must not hide entity routes.
  // EntityRouteWrapper remains responsible for authorization.
  if (location.pathname.startsWith("/entity/")) {
    return (
      <Routes>
        <Route element={<EntityRouteWrapper />}>
          <Route path="/entity/:entityId/summary" element={<EntitySummary />} />
          <Route path="/entity/:entityId/panel" element={<EntityPanelRedirect />} />
          <Route path="/entity/:entityId/organization" element={<EntityOrganization />} />
          <Route path="/entity/:entityId/candidates" element={<EntityCandidates />} />
          <Route path="/entity/:entityId/staffing" element={<EntityStaffing />} />
          <Route path="/entity/:entityId/hiring" element={<EntityHiring />} />
          <Route path="/entity/:entityId/settings" element={<EntitySettings />} />
          <Route path="/entity/:entityId/settings/users" element={<EntitySettingsUsers />} />
          <Route path="/entity/:entityId/settings/roles" element={<EntitySettingsRoles />} />
          <Route path="/entity/:entityId/settings/salary" element={<EntitySettingsSalary />} />
          <Route path="/entity/:entityId/settings/governing-documents" element={<EntitySettingsGoverningDocuments />} />
        </Route>
      </Routes>
    )
  }

  // Platform SuperAdmin with no current tenant -> Platform Admin
  if (isPlatformSuperAdmin && !currentTenant) {
    return (
      <Routes>
        <Route element={<PlatformAdminLayout />}>
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/companies" element={<Organizations />} />
          <Route path="/admin/users" element={<PlatformUsers />} />
          <Route path="/admin/roles" element={<RolesPermissions />} />
          <Route path="/admin/account" element={<Account />} />
          <Route path="/admin/settings/salary-scale" element={<AdminSettingsSalaryScale />} />
          <Route path="/organization/:entityId" element={<OrganizationDetail />} />
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
        <Route path="/organization/:entityId" element={<OrganizationDetail />} />
        <Route path="/candidates" element={<Candidates />} />
        <Route path="/hiring" element={<Hiring />} />
        <Route path="/tenant/users" element={<TenantUsers />} />
        <Route path="/tenant/roles" element={<TenantRoles />} />
        <Route path="/tenant/invitations" element={<TenantInvitations />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
                      <CurrentTenantProvider>
                        <CurrentEntityProvider>
                          <SalaryProvider>
                            <AppRoutes />
                          </SalaryProvider>
                        </CurrentEntityProvider>
                      </CurrentTenantProvider>
                    </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
)

export default App
