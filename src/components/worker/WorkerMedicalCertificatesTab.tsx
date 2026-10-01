/**
 * FASE 19 — LICENCIAS / CERTIFICADOS MÉDICOS
 * Pestaña del expediente del trabajador para certificados médicos.
 *
 * Principios (§2/§82):
 *   · Cada certificado es un EVENTO registrado en el historial del trabajador.
 *   · NO hay saldo, devengo, acumulación mensual, máximo anual.
 *   · La cantidad de días se introduce explícitamente, NO se calcula de fechas (§7).
 *   · El total anual se deriva de SUM(days) WHERE year(start_date) = selectedYear (§46).
 *   · El documento es obligatorio y se almacena en storage privado (§11/§14).
 *   · RLS: SELECT gobernado por can_access_entity(...,'medical_certificates.view'|'manage').
 *   · La ESCRITURA se realiza SIEMPRE por RPC SECURITY DEFINER con validación backend.
 */

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SiteCorpCard } from "@/components/ui/sitecorp-card";
import { Button as SiteCorpButton } from "@/components/ui/sitecorp-button";
import { SiteCorpInput } from "@/components/ui/sitecorp-input";
import { SiteCorpSelect } from "@/components/ui/sitecorp-select";
import { SiteCorpAlert } from "@/components/ui/sitecorp-alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { createMedicalCertificate, updateMedicalCertificate } from "@/lib/rpc/medical-certificates";
import { useEntityPermissions } from "@/hooks/use-entity-permissions";
import { Upload, FileText, Calendar, Clock, Download, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useMedicalCertificates } from "@/hooks/use-medical-certificates";
import { supabase } from "@/lib/supabase";

interface WorkerMedicalCertificatesTabProps {
  workerId: string;
  entityId: string;
  canManage: boolean;
}

interface CertificateFormData {
  start_date: string;
  return_date: string;
  days: string;
  document: File | null;
}

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
];

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB, aligned with worker documents

export default function WorkerMedicalCertificatesTab({ workerId, entityId, canManage }: WorkerMedicalCertificatesTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { has: hasEntityPermission } = useEntityPermissions(entityId);
  const canView = hasEntityPermission(["medical_certificates.view", "medical_certificates.manage"]);
  const canManageCert = hasEntityPermission(["medical_certificates.manage"]);

  const [selectedYear, setSelectedYear] = React.useState<number>(new Date().getFullYear());
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const [formData, setFormData] = React.useState<CertificateFormData>({
    start_date: "",
    return_date: "",
    days: "",
    document: null,
  });

  const { data, isLoading, error, refetch } = useMedicalCertificates(
      canView ? workerId : null,
      selectedYear,
      true
    );

  const certificates = data?.certificates ?? [];
  const totalDays = data?.totalDays ?? 0;
  const count = data?.count ?? 0;

  // Reset year when worker changes
  React.useEffect(() => {
    setSelectedYear(new Date().getFullYear());
  }, [workerId]);

  const validateForm = (): string | null => {
    if (!formData.start_date) return "La fecha de salida es obligatoria.";
    if (!formData.return_date) return "La fecha de reincorporación es obligatoria.";
    if (!formData.days) return "La cantidad de días es obligatoria.";
    if (!formData.document) return "Debes adjuntar el certificado médico.";

    const days = parseInt(formData.days, 10);
    if (isNaN(days) || days < 1) return "La cantidad de días debe ser un entero positivo (≥1).";

    if (formData.return_date <= formData.start_date) {
      return "La fecha de reincorporación debe ser posterior a la fecha de salida.";
    }

    const file = formData.document;
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return "Formato no permitido. Usa PDF, DOC, DOCX, JPG, JPEG o PNG.";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "El archivo no puede superar los 10 MB.";
    }

    return null;
  };

  const handleSubmit = async () => {
    setFormError(null);

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    if (!canManageCert) {
      setFormError("No tienes permiso para registrar certificados médicos.");
      return;
    }

    setSubmitting(true);
    try {
      await createMedicalCertificate({
        worker_id: workerId,
        start_date: formData.start_date,
        return_date: formData.return_date,
        days: parseInt(formData.days, 10),
        document: formData.document,
      });

      await refetch();
      setDialogOpen(false);
      setFormData({ start_date: "", return_date: "", days: "", document: null });
      toast({
        title: "Certificado registrado",
        description: "El certificado médico se registró correctamente.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al registrar el certificado.";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setFormData((prev) => ({ ...prev, document: file }));
  };

  const clearFile = () => {
    setFormData((prev) => ({ ...prev, document: null }));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileExtension = (mimeType: string | null): string => {
    switch (mimeType) {
      case "application/pdf": return "PDF";
      case "application/msword": return "DOC";
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": return "DOCX";
      case "image/jpeg": return "JPG";
      case "image/png": return "PNG";
      default: return "ARCH";
    }
  };

  /** Generate a signed URL for a private storage object. */
  const getSignedUrl = async (storagePath: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from("worker_documents")
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

      if (error) {
        console.error("Error generating signed URL:", error);
        return null;
      }

      return data?.signedUrl ?? null;
    } catch (err) {
      console.error("Error generating signed URL:", err);
      return null;
    }
  };

  /** Handle document download/view. */
  const handleViewDocument = async (storagePath: string, fileName: string, mimeType: string | null) => {
    const signedUrl = await getSignedUrl(storagePath);
    if (!signedUrl) {
      toast({
        title: "Error",
        description: "No se pudo generar el enlace de acceso al documento.",
      });
      return;
    }

    // For images, open in new tab; for others, download
    if (mimeType?.startsWith("image/")) {
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } else {
      // For PDF/DOC/DOCX, trigger download
      const link = document.createElement("a");
      link.href = signedUrl;
      link.download = fileName || "certificado";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (!canView) {
    return (
      <SiteCorpCard>
        <SiteCorpAlert type="info">
          No tienes permiso para ver los certificados médicos de este trabajador.
        </SiteCorpAlert>
      </SiteCorpCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumen anual */}
      <div className="grid gap-4 sm:grid-cols-2">
        <SiteCorpCard>
          <div className="p-4">
            <p className="text-xs text-muted-foreground">Días por certificado en {selectedYear}</p>
            <p className="text-2xl font-bold text-ink">{totalDays} días</p>
          </div>
        </SiteCorpCard>
        <SiteCorpCard>
          <div className="p-4">
            <p className="text-xs text-muted-foreground">Certificados en {selectedYear}</p>
            <p className="text-2xl font-bold text-ink">{count}</p>
          </div>
        </SiteCorpCard>
      </div>

      {/* Botón registrar */}
      {canManageCert && (
        <SiteCorpButton variant="outline" onClick={() => setDialogOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Registrar certificado
        </SiteCorpButton>
      )}

      {/* Histórico */}
      <SiteCorpCard>
        <div className="p-4">
          <h3 className="mb-4 text-lg font-semibold text-ink">Historial de certificados médicos</h3>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <SiteCorpAlert type="danger">Error al cargar los certificados.</SiteCorpAlert>
          ) : certificates.length === 0 ? (
            <SiteCorpAlert type="info">
              No hay certificados médicos registrados en {selectedYear}.
            </SiteCorpAlert>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-3 font-medium">Fecha de salida</th>
                    <th className="pb-3 font-medium">Reincorporación</th>
                    <th className="pb-3 font-medium">Días</th>
                    <th className="pb-3 font-medium">Documento</th>
                  </tr>
                </thead>
                <tbody>
                  {certificates.map((cert) => (
                    <tr key={cert.id} className="border-b border-border/50">
                      <td className="py-3 text-ink">{cert.start_date}</td>
                      <td className="py-3 text-ink">{cert.return_date}</td>
                      <td className="py-3 text-ink">{cert.days}</td>
                      <td className="py-3">
                        {cert.document?.storage_path ? (
                          <SiteCorpButton
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDocument(
                              cert.document!.storage_path!,
                              cert.document!.file_name || `certificado`,
                              cert.document!.mime_type
                            )}
                          >
                            <FileText className="h-3 w-3" />
                            {cert.document.file_name || `Ver certificado (${getFileExtension(cert.document.mime_type)})`}
                          </SiteCorpButton>
                        ) : (
                          <span className="text-muted-foreground">Sin documento</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SiteCorpCard>

      {/* Diálogo de registro */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Registrar certificado médico</DialogTitle>
            <DialogDescription>
              Completa los datos del certificado y adjunta el documento justificativo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {formError && (
              <SiteCorpAlert type="danger">{formError}</SiteCorpAlert>
            )}

            <div className="space-y-2">
              <Label htmlFor="mc-start-date">Fecha de salida *</Label>
              <SiteCorpInput
                id="mc-start-date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, start_date: e.target.value }))}
                max={formData.return_date || undefined}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mc-return-date">Fecha de reincorporación *</Label>
              <SiteCorpInput
                id="mc-return-date"
                type="date"
                value={formData.return_date}
                onChange={(e) => setFormData((prev) => ({ ...prev, return_date: e.target.value }))}
                min={formData.start_date || undefined}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mc-days">Cantidad de días *</Label>
              <SiteCorpInput
                id="mc-days"
                type="number"
                min="1"
                value={formData.days}
                onChange={(e) => setFormData((prev) => ({ ...prev, days: e.target.value }))}
                placeholder="Ej.: 5"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mc-document">Certificado *</Label>
              <div className="flex items-center gap-2">
                <SiteCorpInput
                  id="mc-document"
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  className="flex-1"
                />
                {formData.document && (
                  <button
                    type="button"
                    onClick={clearFile}
                    className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-ink"
                    aria-label="Eliminar archivo seleccionado"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {formData.document && (
                <p className="text-xs text-muted-foreground">
                  {formData.document.name} ({formatFileSize(formData.document.size)})
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Formatos: PDF, DOC, DOCX, JPG, JPEG, PNG. Máx. 10 MB.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <SiteCorpButton variant="outline" onClick={() => { setDialogOpen(false); setFormError(null) }}>
              Cancelar
            </SiteCorpButton>
            <SiteCorpButton onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar certificado
            </SiteCorpButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}