import * as React from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "@/lib/supabase"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import { SiteCorpCard } from "@/components/ui/sitecorp-card"
import { SiteCorpPageHeader } from "@/components/ui/sitecorp-page-header"

const Login = () => {
  const navigate = useNavigate()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(signInError.message)
        return
      }

      navigate("/")
    } catch (err) {
      setError("Error inesperado. Inténtalo de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-sitecorp-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-xl bg-sitecorp-primary mb-4">
            <span className="text-2xl font-bold text-white">SC</span>
          </div>
          <h1 className="text-2xl font-bold text-ink">SiteCorp</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestión de RRHH
          </p>
        </div>

        <SiteCorpCard>
          <SiteCorpPageHeader title="Iniciar sesión" />

          {error && (
            <div className="mb-4">
              <SiteCorpAlert type="danger" title="Error">
                {error}
              </SiteCorpAlert>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Email</label>
              <SiteCorpInput
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">Contraseña</label>
              <SiteCorpInput
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <SiteCorpButton type="submit" className="w-full" disabled={loading}>
              {loading ? "Iniciando sesión..." : "Iniciar sesión"}
            </SiteCorpButton>
          </form>
        </SiteCorpCard>
      </div>
    </div>
  )
}

export default Login