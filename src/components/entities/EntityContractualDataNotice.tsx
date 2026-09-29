import * as React from "react"
import { Link } from "react-router-dom"
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert"
import {
  fetchEntityContractData,
  pendingEntityContractualData,
  type EntityContractData,
} from "@/lib/representatives"
import { Settings2 } from "lucide-react"

interface EntityContractualDataNoticeProps {
  entityId: string
  canManage?: boolean
  className?: string
}

/**
 * Aviso de información contractual pendiente de la entidad.
 *
 * Se muestra solo cuando falta algún dato contractual y enumera únicamente lo
 * realmente pendiente. No bloquea la operación: la entidad puede existir y
 * operar sin domicilio configurado.
 */
export const EntityContractualDataNotice = ({
  entityId,
  canManage = false,
  className,
}: EntityContractualDataNoticeProps) => {
  const [data, setData] = React.useState<EntityContractData | null>(null)
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!entityId) {
        setData(null)
        setLoaded(true)
        return
      }
      try {
        const result = await fetchEntityContractData(entityId)
        if (!cancelled) setData(result)
      } catch (err) {
        console.error("Error loading entity contractual data:", err)
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [entityId])

  const pending = React.useMemo(() => pendingEntityContractualData(data), [data])

  if (!loaded || pending.length === 0) return null

  return (
    <SiteCorpAlert type="warning" className={className}>
      <div className="space-y-2">
        <p className="font-medium">La entidad tiene información contractual pendiente:</p>
        <ul className="list-inside list-disc text-sm">
          {pending.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="text-sm">
          La contratación puede continuar; estos datos se incorporan al contrato cuando se
          formalice.
        </p>
        {canManage && (
          <Link
            to={`/entity/${entityId}/settings/contract-data`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-sitecorp-primary underline-offset-2 hover:underline"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Ir a Datos contractuales
          </Link>
        )}
      </div>
    </SiteCorpAlert>
  )
}

export default EntityContractualDataNotice
