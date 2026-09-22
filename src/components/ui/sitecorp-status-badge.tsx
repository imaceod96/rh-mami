import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type StatusType = "success" | "warning" | "danger" | "info" | "neutral"

interface SiteCorpStatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status?: StatusType
}

const statusStyles: Record<StatusType, string> = {
  success: "bg-sitecorp-success/10 text-sitecorp-success border-sitecorp-success/20",
  warning: "bg-sitecorp-warning/10 text-sitecorp-warning border-sitecorp-warning/20",
  danger: "bg-sitecorp-danger/10 text-sitecorp-danger border-sitecorp-danger/20",
  info: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  neutral: "bg-muted text-muted-foreground",
}

const SiteCorpStatusBadge = ({ status = "neutral", className, children, ...props }: SiteCorpStatusBadgeProps) => {
  return (
    <Badge
      variant="outline"
      className={cn(statusStyles[status], className)}
      {...props}
    >
      {children}
    </Badge>
  )
}
SiteCorpStatusBadge.displayName = "SiteCorpStatusBadge"

export { SiteCorpStatusBadge }