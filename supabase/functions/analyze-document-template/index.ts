import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"
import JSZip from "https://esm.sh/jszip@3.10.1"

/**
 * Fase 11B.1 — Analizador central de plantillas documentales DOCX (§79).
 *
 * Es el ÚNICO componente autorizado a leer el contenido de una plantilla:
 *   1. autentica al llamante y descarga el DOCX respetando las políticas del bucket,
 *   2. verifica que el paquete sea realmente un DOCX (firma ZIP + partes OOXML),
 *   3. extrae los marcadores `{{variable.key}}` incluso cuando Word los partió
 *      en varios «runs» XML (§8),
 *   4. detecta marcadores malformados.
 *
 * NO modifica el documento, NO sustituye variables y NO genera nada: eso es 11B.2.
 * La decisión sobre qué variable es válida u obligatoria vive en la base de datos.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const BUCKET = "document-templates"
const MAX_FILE_SIZE = 10485760
const PART_PATTERN = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/
const VALID_PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g
const SINGLE_BRACE = /(^|[^{])\{\s*([A-Za-z0-9_.]+)\s*\}(?!\})/
const MAX_MALFORMED = 20

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

const decodeXml = (value: string): string =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")

interface RunRange {
  start: number
  end: number
}

interface Occurrence {
  key: string
  count: number
  split_runs: number
}

interface Malformed {
  part: string
  snippet: string
}

/** Extrae el texto de un párrafo junto con los límites de cada «run» (<w:t>). */
const readParagraph = (paragraphXml: string): { text: string; runs: RunRange[] } => {
  const runs: RunRange[] = []
  let text = ""
  const runPattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
  let match: RegExpExecArray | null
  while ((match = runPattern.exec(paragraphXml)) !== null) {
    const value = decodeXml(match[1])
    const start = text.length
    text += value
    runs.push({ start, end: text.length })
  }
  return { text, runs }
}

const isSplitAcrossRuns = (runs: RunRange[], start: number, end: number): boolean =>
  runs.some((run) => run.start > start && run.start < end)

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return jsonResponse({ error: "No autorizado." }, 401)
    }

    const body = await req.json().catch(() => null)
    const filePath = typeof body?.file_path === "string" ? body.file_path.trim() : ""
    if (!filePath) {
      return jsonResponse({ error: "Falta la ruta del archivo a analizar." }, 400)
    }
    if (!filePath.startsWith("entity/")) {
      return jsonResponse({ error: "Ruta de archivo no permitida." }, 400)
    }

    const token = authHeader.replace("Bearer ", "")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })

    const { data: userData, error: userError } = await client.auth.getUser(token)
    if (userError || !userData?.user) {
      console.error("[analyze-document-template] token inválido", { userError })
      return jsonResponse({ error: "Sesión no válida." }, 401)
    }

    console.log("[analyze-document-template] analizando", { filePath, userId: userData.user.id })

    const { data: fileBlob, error: downloadError } = await client.storage.from(BUCKET).download(filePath)
    if (downloadError || !fileBlob) {
      console.error("[analyze-document-template] descarga fallida", { downloadError })
      return jsonResponse({ error: "No se pudo leer el archivo (¿permisos o ruta incorrecta?)." }, 403)
    }

    const bytes = new Uint8Array(await fileBlob.arrayBuffer())
    if (bytes.length === 0) {
      return jsonResponse({ error: "El archivo está vacío." }, 400)
    }
    if (bytes.length > MAX_FILE_SIZE) {
      return jsonResponse({ error: "El archivo supera el límite permitido de 10 MB." }, 400)
    }

    const digest = await crypto.subtle.digest("SHA-256", bytes)
    const fileSha256 = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")

    const zipSignatureOk = bytes[0] === 0x50 && bytes[1] === 0x4b
    const warnings: string[] = []
    const malformed: Malformed[] = []
    const occurrences = new Map<string, Occurrence>()
    const scannedParts: string[] = []
    let paragraphsScanned = 0
    let hasDocumentXml = false
    let order = 0

    if (!filePath.toLowerCase().endsWith(".docx")) {
      warnings.push("El archivo no tiene extensión .docx.")
    }

    if (!zipSignatureOk) {
      warnings.push("El archivo no es un paquete OOXML (firma ZIP ausente): ¿es un PDF, un .doc antiguo u otro formato renombrado?")
      return jsonResponse({
        file_path: filePath,
        file_sha256: fileSha256,
        file_size: bytes.length,
        valid_docx: false,
        zip_signature_ok: false,
        has_document_xml: false,
        scanned_parts: [],
        paragraphs_scanned: 0,
        occurrences: [],
        malformed_placeholders: [],
        split_run_placeholders: 0,
        warnings,
        analyzed_at: new Date().toISOString(),
      })
    }

    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(bytes)
    } catch (zipError) {
      console.error("[analyze-document-template] ZIP ilegible", { zipError })
      warnings.push("El archivo tiene firma ZIP pero no pudo descomprimirse.")
      return jsonResponse({
        file_path: filePath,
        file_sha256: fileSha256,
        file_size: bytes.length,
        valid_docx: false,
        zip_signature_ok: true,
        has_document_xml: false,
        scanned_parts: [],
        paragraphs_scanned: 0,
        occurrences: [],
        malformed_placeholders: [],
        split_run_placeholders: 0,
        warnings,
        analyzed_at: new Date().toISOString(),
      })
    }

    const hasContentTypes = Object.keys(zip.files).some((name) => name === "[Content_Types].xml")
    hasDocumentXml = Object.keys(zip.files).some((name) => name === "word/document.xml")

    if (!hasContentTypes || !hasDocumentXml) {
      warnings.push("El paquete no contiene las partes mínimas de un documento Word ([Content_Types].xml / word/document.xml).")
    }

    const partNames = Object.keys(zip.files).filter((name) => PART_PATTERN.test(name)).sort()
    const paragraphPattern = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g

    for (const partName of partNames) {
      const partText = await zip.file(partName)!.async("string")
      scannedParts.push(partName)
      const paragraphs = partText.match(paragraphPattern) ?? []

      for (const paragraph of paragraphs) {
        const { text, runs } = readParagraph(paragraph)
        if (!text) continue
        paragraphsScanned += 1
        if (!text.includes("{")) continue

        VALID_PLACEHOLDER.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = VALID_PLACEHOLDER.exec(text)) !== null) {
          const key = match[1].trim()
          if (!key) continue
          const splitRuns = isSplitAcrossRuns(runs, match.index, match.index + match[0].length) ? 1 : 0
          const current = occurrences.get(key)
          if (current) {
            current.count += 1
            current.split_runs += splitRuns
          } else {
            order += 1
            occurrences.set(key, { key, count: 1, split_runs: splitRuns })
          }
        }

        const remainder = text.replace(VALID_PLACEHOLDER, "")
        const singleBrace = remainder.match(SINGLE_BRACE)
        if ((remainder.includes("{{") || remainder.includes("}}")) && malformed.length < MAX_MALFORMED) {
          malformed.push({ part: partName, snippet: remainder.trim().slice(0, 120) })
        } else if (singleBrace && malformed.length < MAX_MALFORMED) {
          malformed.push({ part: partName, snippet: singleBrace[0].trim().slice(0, 120) })
        }
      }

      VALID_PLACEHOLDER.lastIndex = 0
    }

    if (!hasDocumentXml) {
      warnings.push("No se encontró word/document.xml: el texto del documento no pudo analizarse.")
    }
    if (scannedParts.length === 0) {
      warnings.push("No se encontró ninguna parte de texto analizable.")
    }
    if (occurrences.size === 0) {
      warnings.push("La plantilla no contiene ningún marcador {{variable}}.")
    }

    const orderedOccurrences = Array.from(occurrences.values()).map((occurrence, index) => ({
      key: occurrence.key,
      count: occurrence.count,
      split_runs: occurrence.split_runs,
      sort_order: index + 1,
    }))
    const splitRunPlaceholders = orderedOccurrences.reduce(
      (total, occurrence) => total + (occurrence.split_runs > 0 ? 1 : 0),
      0
    )
    const validDocx = zipSignatureOk && hasContentTypes && hasDocumentXml

    console.log("[analyze-document-template] análisis completado", {
      filePath,
      validDocx,
      placeholders: orderedOccurrences.length,
      malformed: malformed.length,
    })

    return jsonResponse({
      file_path: filePath,
      file_sha256: fileSha256,
      file_size: bytes.length,
      valid_docx: validDocx,
      zip_signature_ok: zipSignatureOk,
      has_document_xml: hasDocumentXml,
      scanned_parts: scannedParts,
      paragraphs_scanned: paragraphsScanned,
      occurrences: orderedOccurrences,
      malformed_placeholders: malformed,
      split_run_placeholders: splitRunPlaceholders,
      warnings,
      analyzed_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[analyze-document-template] error inesperado", { error })
    return jsonResponse({ error: "No se pudo analizar la plantilla documental." }, 500)
  }
})
