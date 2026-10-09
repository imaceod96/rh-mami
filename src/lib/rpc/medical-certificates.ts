/**
 * Certificados Médicos — Módulo de COMPATIBILIDAD.
 *
 * El código del dominio se ha trasladado a la estructura DDD:
 *   src/domains/vacations-licenses/medical-certificates/
 *     · domain/entities.ts                             → tipos y contratos
 *     · domain/rules.ts                                → reglas puras
 *     · infrastructure/medical-certificates.repository.ts → RPC y Storage
 *
 * Este archivo conserva EXACTAMENTE la misma superficie pública (funciones y
 * tipos, con los mismos nombres y firmas) para que los consumidores que todavía
 * importan desde "@/lib/rpc/medical-certificates" sigan funcionando sin cambios.
 *
 * Es únicamente una reexportación: no debe contener lógica. Cualquier ajuste de
 * comportamiento pertenece al dominio, no a este módulo.
 */

/* Tipos y contratos de datos */
export type {
  MedicalCertificateDocument,
  WorkerMedicalCertificateRow,
  WorkerMedicalCertificatesResult,
  EntityMedicalCertificateRow,
  EntityMedicalCertificatesResult,
} from "@/domains/vacations-licenses/medical-certificates"

/* Operaciones de datos (RPC y Storage) */
export {
  fetchWorkerMedicalCertificates,
  fetchEntityMedicalCertificates,
  createMedicalCertificate,
  updateMedicalCertificate,
  getCertificateSignedUrl,
} from "@/domains/vacations-licenses/medical-certificates"
