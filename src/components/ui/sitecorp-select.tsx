import * as React from "react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { cn } from "@/lib/utils"

interface SiteCorpSelectProps extends React.ComponentPropsWithoutRef<typeof Select> {
  label?: string
  error?: string
  className?: string
}

const SiteCorpSelect = React.forwardRef<
  React.ElementRef<typeof SelectTrigger>,
  SiteCorpSelectProps
>(({ label, error, children, className, ...props }, ref) => {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-ink">{label}</label>
      )}
      <Select {...props}>
        <SelectTrigger
          ref={ref}
          className={cn(
            "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sitecorp-primary",
            error && "border-sitecorp-danger",
            className
          )}
        >
          <SelectValue placeholder="Seleccionar..." />
        </SelectTrigger>
        <SelectContent>
          {children}
        </SelectContent>
      </Select>
      {error && (
        <p className="text-xs text-sitecorp-danger">{error}</p>
      )}
    </div>
  )
})
SiteCorpSelect.displayName = "SiteCorpSelect"

export { SiteCorpSelect }