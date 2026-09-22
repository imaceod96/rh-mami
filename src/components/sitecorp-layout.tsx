import * as React from "react"
import { Outlet } from "react-router-dom"
import { SiteCorpSidebar } from "./sitecorp-sidebar"
import { cn } from "@/lib/utils"

const SiteCorpLayout = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex h-screen w-full overflow-hidden", className)}
      {...props}
    >
      <SiteCorpSidebar />
      <main className="flex-1 overflow-y-auto bg-sitecorp-background">
        <Outlet />
      </main>
    </div>
  )
})
SiteCorpLayout.displayName = "SiteCorpLayout"

export { SiteCorpLayout }