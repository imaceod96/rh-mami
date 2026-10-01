import { supabase } from "@/lib/supabase"

/**
 * Certificados Médicos — capa de datos (Fase 19).
 *
 * Cada certificado es un EVENTO registrado en el historial del trabajador.
 * NO hay saldo, devengo, acumulación mensual, máximo anual (§2/§82).
 * La cantidad de días se introduce explícitamente, NO se calcula de fechas (§7).
 * El total anual se deriva de SUM(days) WHERE year(start_date) = selectedYear (§46).
 * El documento es obligatorio y se almacena en storage privado (§11/§14).
 * RLS: SELECT gobernado por can_access_entity(...,'medical_certificates.view'|'manage').
 * La ESCRITURA se realiza SIEMPRE por RPC SECURITY DEFINER con validación backend.
 */

export interface MedicalCertificate {
  id: string
  worker_id: string
  start_date: string
  return_date: string
  days: number
  document_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface MedicalCertificateWithDocument extends MedicalCertificate {
  document: {
    id: string | null
    file_name: string | null
    mime_type: string | null
    file_size: number | null
    storage_path: string | null
  } | null
}

export interface MedicalCertificateYearSummary {
  year: number
  total_days: number
  count: number
}

const rpcError = (error: { message?: string } | null): never => {
  throw new Error(error?.message || "No se pudo completar la operación de certificado médico.")
}

/**
 * Registra un certificado médico (crea el registro + adjunta el documento).
 * El documento debe ser obligatorio y se almacena en worker_documents + storage privado.
 */
export async function createMedicalCertificate(params: {
  worker_id: string
  start_date: string
  return_date: string
  days: number
  document: File | null
}): Promise<{ certificate_id: string }> {
  // 1. Validaciones básicas
  if (!params.start_date || !params.return_date || !params.days) {
    throw new Error("La fecha de salida, la fecha de reincorporación y la cantidad de días son obligatorias.")
  }
  if (params.return_date <= params.start_date) {
    throw new Error("La fecha de reincorporación debe ser posterior a la fecha de salida.")
  }
  if (params.days < 1) {
    throw new Error("La cantidad de días debe ser un entero positivo (≥1).")
  }

  // 2. Subir el documento a worker_documents (storage privado)
  let documentId: string | null = null
  if (params.document) {
    // Validar formato y tamaño
    const allowedMimeTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
    ]
    if (!allowedMimeTypes.includes(params.document.type)) {
      throw new Error("Formato no permitido. Usa PDF, DOC, DOCX, JPG, JPEG o PNG.")
    }
    if (params.document.size > 10 * 1024 * 1024) {
      throw new Error("El archivo no puede superar los 10 MB.")
    }

    // Generar un nombre seguro para el storage (usar worker_id + timestamp + uuid)
    const fileExt = params.document.name.split(".").pop()?.toLowerCase() || "file"
    const storagePath = `workers/${params.worker_id}/medical-certificates/${crypto.randomUUID()}.${fileExt}`

    // Subir a Supabase Storage (bucket privado)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("worker_documents")
      .upload(storagePath, params.document, {
        cacheControl: "3600",
        upsert: false,
        contentType: params.document.type,
      })

    if (uploadError) {
      throw new Error(`Error al subir el documento: ${uploadError.message}`)
    }

    // Insertar en worker_documents
    const { data: docData, error: docError } = await supabase
      .from("worker_documents")
      .insert({
        worker_id: params.worker_id,
        document_type_id: "CERTIFICATE",
        file_name: params.document.name,
        mime_type: params.document.type,
        file_size: params.document.size,
        storage_path: storagePath,
        source: "MANUAL",
        uploaded_by: (await supabase.auth.getUser()).data.user?.id || null,
      })
      .select("id")
      .single()

    if (docError) {
      // Si falla la inserción, intentar limpiar el archivo subido
      await supabase.storage.from("worker_documents").remove([storagePath])
      throw new Error(`Error al registrar el documento: ${docError.message}`)
    }

    documentId = docData.id
  } else {
    throw new Error("Debes adjuntar el certificado médico.")
  }

  // 3. Llamar al RPC para crear el certificado médico
  const { data, error } = await supabase.rpc("create_worker_medical_certificate", {
    p_worker_id: params.worker_id,
    p_start_date: params.start_date,
    p_return_date: params.return_date,
    p_days: params.days,
    p_document_id: documentId,
  })

  if (error) rpcError(error)
  return data as { certificate_id: string }
}

/** Obtiene un certificado médico por su ID. */
export async function getMedicalCertificate(certificateId: string): Promise<MedicalCertificateWithDocument> {
  const { data, error } = await supabase.rpc("get_worker_medical_certificate", {
    p_certificate_id: certificateId,
  })

  if (error) rpcError(error)
  return data as MedicalCertificateWithDocument
}

/** Lista certificados médicos de un trabajador (opcionalmente filtrados por año). */
export async function listMedicalCertificatesForWorker(
  workerId: string,
  year?: number
): Promise<MedicalCertificateYearSummary> {
  const { data, error } = await supabase.rpc("list_worker_medical_certificates", {
    p_worker_id: workerId,
    p_year: year || null,
  })

  if (error) rpcError(error)
  return data as MedicalCertificateYearSummary
}

/** Actualiza un certificado médico existente. */
export async function updateMedicalCertificate(params: {
  certificate_id: string
  start_date?: string
  return_date?: string
  days?: number
  document?: File | null
}): Promise<void> {
  // Si se proporciona un nuevo documento, subirlo primero
  let documentId: string | null = null
  if (params.document) {
    // Validar formato y tamaño
    const allowedMimeTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
    ]
    if (!allowedMimeTypes.includes(params.document.type)) {
      throw new Error("Formato no permitido. Usa PDF, DOC, DOCX, JPG, JPEG o PNG.")
    }
    if (params.document.size > 10 * 1024 * 1024) {
      throw new Error("El archivo no puede superar los 10 MB.")
    }

    // Obtener el worker_id del certificado para el storage path
    const { data: certData } = await supabase
      .from("worker_medical_certificates")
      .select("worker_id")
      .eq("id", params.certificate_id)
      .single()

    const workerId = certData?.worker_id
    if (!workerId) {
      throw new Error("No se pudo determinar el trabajador del certificado.")
    }

    // Generar un nombre seguro para el storage
    const fileExt = params.document.name.split(".").pop()?.toLowerCase() || "file"
    const storagePath = `workers/${workerId}/medical-certificates/${crypto.randomUUID()}.${fileExt}`

    // Subir a Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("worker_documents")
      .upload(storagePath, params.document, {
        cacheControl: "3600",
        upsert: false,
        contentType: params.document.type,
      })

    if (uploadError) {
      throw new Error(`Error al subir el documento: ${uploadError.message}`)
    }

    // Insertar en worker_documents
    const { data: docData, error: docError } = await supabase
      .from("worker_documents")
      .insert({
        worker_id: workerId,
        document_type_id: "CERTIFICATE",
        file_name: params.document.name,
        mime_type: params.document.type,
        file_size: params.document.size,
        storage_path: storagePath,
        source: "MANUAL",
        uploaded_by: (await supabase.auth.getUser()).data.user?.id || null,
      })
      .select("id")
      .single()

    if (docError) {
      await supabase.storage.from("worker_documents").remove([storagePath])
      throw new Error(`Error al registrar el documento: ${docError.message}`)
    }

    documentId = docData.id
  }

  // Llamar al RPC para actualizar el certificado médico
  const { error } = await supabase.rpc("update_worker_medical_certificate", {
    p_certificate_id: params.certificate_id,
    p_start_date: params.start_date || null,
    p_return_date: params.return_date || null,
    p_days: params.days || null,
    p_document_id: documentId,
  })

  if (error) rpcError(error)
}