import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  listMedicalCertificatesForWorker,
  type MedicalCertificateWithDocument,
} from "@/lib/rpc/medical-certificates";

/** Medical Certificates — React Query keys (Fase 19).
 *  Toda query está SCOPEADA por entidad o por trabajador, de modo que cambiar de
 *  entidad nunca reutiliza cache de otra (§60/§88). Abrir la ficha ejecuta el
 *  fetch idempotente del backend.
 */

/** Query key para el historial y totales de un trabajador. */
export const workerMedicalCertificatesQueryKey = (
  workerId: string | null | undefined,
  year: number | null | undefined
) => ["medical-certificates", "worker", workerId ?? "none", year ?? "all"] as const;

/** Query key para un certificado específico. */
export const medicalCertificateQueryKey = (
  certificateId: string | null | undefined
) => ["medical-certificates", "certificate", certificateId ?? "none"] as const;

/** Datos de un certificado médico. */
export interface MedicalCertificate {
  id: string;
  worker_id: string;
  start_date: string;
  return_date: string;
  days: number;
  document: {
    id: string | null;
    file_name: string | null;
    mime_type: string | null;
    file_size: number | null;
    storage_path: string | null;
  } | null;
  created_at: string;
  updated_at: string;
}

/** Datos para el resumen anual. */
export interface MedicalCertificateYearSummary {
  year: number;
  total_days: number;
  count: number;
}

/** Datos del hook useMedicalCertificates. */
export interface UseMedicalCertificatesResult {
  certificates: MedicalCertificate[];
  totalDays: number;
  count: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/** Hook para obtener certificados médicos de un trabajador. */
export function useMedicalCertificates(
  workerId: string | null | undefined,
  year: number | null | undefined = new Date().getFullYear(),
  enabled = true
) {
  return useQuery({
    queryKey: workerMedicalCertificatesQueryKey(workerId, year),
    queryFn: async () => {
      if (!workerId) {
        return {
          certificates: [] as MedicalCertificate[],
          totalDays: 0,
          count: 0,
        };
      }

      // Get the summary (total days and count) from RPC
      const summary = await listMedicalCertificatesForWorker(workerId, year);

      // Get the detailed certificates with document info
      const { data, error } = await supabase
        .from("worker_medical_certificates")
        .select(`
          id, worker_id, start_date, return_date, days,
          document_id, document:worker_documents(id, file_name, mime_type, file_size, storage_path),
          created_at, updated_at
        `)
        .eq("worker_id", workerId)
        .order("start_date", { ascending: false });

      if (error) throw error;

      const certificates = (data || []).map((c: any) => ({
        id: c.id,
        worker_id: c.worker_id,
        start_date: c.start_date,
        return_date: c.return_date,
        days: c.days,
        document: c.document
          ? {
              id: c.document.id,
              file_name: c.document.file_name,
              mime_type: c.document.mime_type,
              file_size: c.document.file_size,
              storage_path: c.document.storage_path,
            }
          : null,
        created_at: c.created_at,
        updated_at: c.updated_at,
      }));

      return {
        certificates,
        totalDays: summary.total_days ?? 0,
        count: summary.count ?? 0,
      };
    },
    enabled: enabled && !!workerId,
  });
}

/** Invalida los datos de certificados médicos tras registrar/editar un certificado. */
export function invalidateMedicalCertificateData(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    queryKey: ["medical-certificates"],
  });
}