-- ============================================================================
-- Validación estricta del Número de Identificación: exactamente 11 dígitos.
-- ----------------------------------------------------------------------------
-- Aplica a Candidates, Workers y a la carga inicial Excel (vía migration_validate_rows).
-- El CI se almacena como TEXTO (preserva ceros iniciales) y nunca se convierte a número.
--
-- Estrategia segura para datos históricos:
--   Se usa un trigger BEFORE INSERT OR UPDATE OF identification. Solo se dispara
--   cuando la propia columna identification forma parte del INSERT/UPDATE, de modo
--   que los registros históricos que no cumplen 11 dígitos (reportados abajo)
--   permanecen intactos y NO se bloquean operaciones que no tocan el CI
--   (reactivaciones, cambios de contrato, estados, etc.). No se borra ni se
--   modifica ningún registro existente ni se inventan ceros.
--
--   Registros históricos detectados que no cumplen la regla (solo reporte):
--     candidates: 00011200000000
--     workers:    00011200000000, 87654321B, 12345678A
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_identification_format()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.identification IS NULL OR NEW.identification !~ '^[0-9]{11}$' THEN
    RAISE EXCEPTION 'El número de identificación debe contener exactamente 11 dígitos.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workers_identification_format ON public.workers;
CREATE TRIGGER workers_identification_format
BEFORE INSERT OR UPDATE OF identification ON public.workers
FOR EACH ROW EXECUTE FUNCTION public.enforce_identification_format();

DROP TRIGGER IF EXISTS candidates_identification_format ON public.candidates;
CREATE TRIGGER candidates_identification_format
BEFORE INSERT OR UPDATE OF identification ON public.candidates
FOR EACH ROW EXECUTE FUNCTION public.enforce_identification_format();

-- La validación de la carga inicial Excel (migration_validate_rows) marca la fila
-- como ERROR cuando la identificación no tiene exactamente 11 dígitos:
--   IF v_ident !~ '^[0-9]{11}$' THEN
--       v_status := 'ERROR';
--       v_messages := v_messages || 'El número de identificación debe contener exactamente 11 dígitos';
--   END IF;
