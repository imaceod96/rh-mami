import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Identidad visual oficial de SiteCorp.
 *
 * Los recursos viven en `public/brand` y esta es la ÚNICA implementación de la
 * marca: cualquier layout/pantalla debe reutilizarla en lugar de repetir el logo.
 *
 * Nota: el logotipo completo a color (`/brand/logo-sitecorp-full.png`) es el
 * recurso oficial; colócalo en esa ruta para activar la variante `full` a color.
 * Mientras tanto, la variante `full` usa el lockup SVG oficial disponible.
 */
export const SITECORP_BRAND = {
  /** Isotipo oficial a color (símbolo sin texto). Recurso principal en UI. */
  isotype: "/brand/isotipo-sitecorp.png",
  /** Logo completo (lockup) oficial disponible como SVG. */
  full: "/brand/logo-sitecorp-full.svg",
  /** Logo completo alternativo (SVG oficial). */
  logoSvg: "/brand/logo-sitecorp.svg",
} as const

export type SiteCorpBrandVariant = "full" | "isotype"

// Alturas que conservan la proporción original (object-contain + width auto).
const VARIANT_HEIGHT: Record<SiteCorpBrandVariant, { sm: string; md: string; lg: string }> = {
  full: { sm: "h-12", md: "h-16", lg: "h-20 sm:h-24" },
  isotype: { sm: "h-9", md: "h-10", lg: "h-16 sm:h-20" },
}

export interface SiteCorpBrandProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  variant?: SiteCorpBrandVariant
  size?: "sm" | "md" | "lg"
}

export function SiteCorpBrand({
  variant = "isotype",
  size = "sm",
  alt = "SiteCorp",
  className,
  ...props
}: SiteCorpBrandProps) {
  return (
    <img
      src={SITECORP_BRAND[variant]}
      alt={alt}
      draggable={false}
      className={cn("w-auto max-w-full object-contain select-none", VARIANT_HEIGHT[variant][size], className)}
      {...props}
    />
  )
}

export default SiteCorpBrand
