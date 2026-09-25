import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SiteCorpInput } from "@/components/ui/sitecorp-input"
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button"
import { X } from "lucide-react"

interface SalaryGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (description: string) => Promise<void>
  isLoading?: boolean
}

export const SalaryGroupDialog = ({ open, onOpenChange, onSubmit, isLoading }: SalaryGroupDialogProps) => {
  const [description, setDescription] = React.useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim() || isLoading) return
    await onSubmit(description.trim())
    setDescription("")
    onOpenChange(false)
  }

  const handleClose = () => {
    setDescription("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            Añadir grupo salarial
            <X className="ml-auto h-4 w-4 text-muted-foreground cursor-pointer hover:text-ink" onClick={handleClose} />
          </DialogTitle>
          <DialogDescription>
            Ingrese una descripción para el nuevo grupo salarial
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <SiteCorpInput
            placeholder="Descripción del grupo (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isLoading}
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-2">
            <SiteCorpButton variant="outline" type="button" onClick={handleClose} disabled={isLoading}>
              Cancelar
            </SiteCorpButton>
            <SiteCorpButton type="submit" disabled={isLoading || !description.trim()}>
              {isLoading ? "Guardando..." : "Guardar"}
            </SiteCorpButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}