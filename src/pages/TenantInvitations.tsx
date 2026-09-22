import * as React from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useCurrentTenant } from "@/contexts/CurrentTenantContext"
import { supabase } from "@/lib/supabase"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpTable } from "@/components/ui/sitecorp-table"
import { SiteCorpStatusBadge } from "@/components/ui/sitecorp-status-badge"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpLoading } from "@/components/ui/sitecorp-loading"
import { SiteCorpError } from "@/components/ui/sitecorp-error"
import { Mail, RefreshCw, X } from "lucide-react"

interface TenantInvitation {
  id: string
  email: string
  role_name: string
  status: string
  expires_at: string
  created_at: string
}

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  expired: "Expirada",
  cancelled: "Cancelada",
}

const statusType: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  pending: "warning",
  accepted: "success",
  expired: "danger",
  cancelled: "neutral",
}

const TenantInvitations = () => {
  const { isPlatformSuperAdmin } = useAuth()
  const { currentTenant } = useCurrentTenant()
  const [invitations, setInvitations] = React.useState<TenantInvitation[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [email, setEmail] = React.useState("")
  const [selectedRole, setSelectedRole] = React.useState("")
  const [sending, setSending] = React.useState(false)

  const loadInvitations = React.useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      if (!currentTenant) return

      const { data, error: fetchError } = await supabase
        .from("tenant_invitations")
        .select("*, tenant_role:tenant_roles(name)")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false })

      if (fetchError) throw fetchError

      setInvitations(
        (data || []).map((inv: any) => ({
          id: inv.id,
          email: inv.email,
          role_name: inv.tenant_role?.name || "Sin rol",
          status: inv.status,
          expires_at: inv.expires_at,
          created_at: inv.created_at,
        }))
      )
    } catch (err) {
      console.error("Error loading invitations:", err)
      setError("No se pudo cargar la lista de invitaciones.")
    } finally {
      setLoading(false)
    }
  }, [currentTenant])

  React.useEffect(() => {
    loadInvitations()
  }, [loadInvitations])

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !currentTenant) return

    setSending(true)
    try {
      const { error } = await supabase.from("tenant_invitations").insert({
        tenant_id: currentTenant.id,
        email,
        tenant_role_id: selectedRole || null,
        invited_by: (await supabase.auth.getUser()).data.user?.id,
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })

      if (error) throw error

      setEmail("")
      setSelectedRole("")
      await loadInvitations()
    } catch (err) {
      console.error("Error sending invitation:", err)
      setError("No se pudo enviar la invitación.")
    } finally {
      setSending(false)
    }
  }

  const cancelInvitation = async (id: string) => {
    try {
      const { error } = await supabase
        .from("tenant_invitations")
        .update({ status: "cancelled" })
        .eq("id", id)
      if (error) throw error
      await loadInvitations()
    } catch (err) {
      console.error("Error cancelling invitation:", err)
      setError("No se pudo cancelar la invitación.")
    }
  }

  const resendInvitation = async (id: string) => {
    try {
      const { error } = await supabase
        .from("tenant_invitations")
        .update({ status: "pending" })
        .eq("id", id)
      if (error) throw error
      await loadInvitations()
    } catch (err) {
      console.error("Error resending invitation:", err)
      setError("No se pudo reenviar la invitación.")
    }
  }

  const columns = [
    { header: "Email", accessor: "email" },
    { header: "Rol", accessor: "role_name" },
    { header: "Estado", accessor: "status" },
    { header: "Expira", accessor: "expires_at" },
    { header: "Fecha de creación", accessor: "created_at" },
    { header: "Acciones", accessor: "actions" },
  ]

  const rows = invitations.map((inv) => ({
    email: inv.email,
    role_name: inv.role_name,
    status: (
          <SiteCorpStatusBadge
            status={statusType[inv.status] || "neutral"}
          >
            {statusLabels[inv.status] || inv.status}
          </SiteCorpStatusBadge>
        ),
    expires_at: new Date(inv.expires_at).toLocaleDateString("es-ES"),
    created_at: new Date(inv.created_at).toLocaleDateString("es-ES"),
    actions: (
      <div className="flex items-center gap-2">
        {inv.status === "pending" && (
          <>
            <SiteCorpButton size="sm" variant="outline" onClick={() => resendInvitation(inv.id)}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reenviar
            </SiteCorpButton>
            <SiteCorpButton size="sm" variant="outline" onClick={() => cancelInvitation(inv.id)}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
            </SiteCorpButton>
          </>
        )}
      </div>
    ),
  }))

  return (
    <div className="space-y-6 p-6">
      <SiteCorpPageHeader
        title="Invitaciones"
        description={`Gestión de invitaciones para ${currentTenant?.name || "este tenant"}`}
      />

      {error && (
        <SiteCorpAlert type="danger" title="Error">
          {error}
        </SiteCorpAlert>
      )}

      <SiteCorpCard title="Nueva invitación">
        <form onSubmit={handleSendInvitation} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@email.com"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Rol</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Sin rol asignado</option>
              </select>
            </div>
            <div className="flex items-end">
              <SiteCorpButton type="submit" className="w-full justify-center" disabled={sending}>
                <Mail className="h-4 w-4 mr-2" /> Enviar invitación
              </SiteCorpButton>
            </div>
          </div>
        </form>
      </SiteCorpCard>

      <SiteCorpCard title="Invitaciones">
        {loading ? (
          <SiteCorpLoading rows={5} />
        ) : invitations.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No hay invitaciones pendientes.
          </div>
        ) : (
          <SiteCorpTable columns={columns} data={rows} />
        )}
      </SiteCorpCard>
    </div>
  )
}

export default TenantInvitations
