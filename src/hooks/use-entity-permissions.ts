import * as React from "react"
import { supabase } from "@/lib/supabase"

/**
 * Permisos internos efectivos del usuario en UNA entidad.
 *
 * Resolución central en base de datos (`list_entity_permissions`), que aplica
 * exactamente la misma regla que las políticas RLS: acceso a la entidad,
 * pertenencia del rol a esa entidad, jerarquía y scope (SELF / SELF_AND_DESCENDANTS).
 * El frontend nunca decide el acceso por sí solo.
 */
export function useEntityPermissions(entityId: string | undefined | null) {
  const [codes, setCodes] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!entityId) {
        setCodes([])
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const { data, error } = await supabase.rpc("list_entity_permissions", {
          target_entity_id: entityId,
        })
        if (error) throw error
        if (!cancelled) {
          setCodes(
            ((data as { permission_code: string }[]) || [])
              .map((row) => row.permission_code)
              .filter(Boolean)
          )
        }
      } catch {
        // Sin permisos o error de red: no se concede ninguna capacidad.
        if (!cancelled) setCodes([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [entityId])

  const has = React.useCallback(
    (permission: string | string[]) => {
      const list = Array.isArray(permission) ? permission : [permission]
      return list.some((code) => codes.includes(code))
    },
    [codes]
  )

  return { permissions: codes, loading, has }
}
