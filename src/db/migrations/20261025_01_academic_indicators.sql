-- ============================================================================
-- FASE — INDICADORES ACADÉMICOS: MÁSTER Y DOCTOR
-- Migración incremental idempotente.
--
-- Añade dos indicadores booleanos INDEPENDIENTES (NO excluyentes) a Candidatos
-- y a Trabajadores:
--   has_masters_degree    → ¿tiene Máster?
--   has_doctorate_degree  → ¿tiene Doctor?
--
-- Representan exclusivamente Sí/No: NO documentos, NO certificados, NO validaciones.
-- Una persona puede tener Máster, Doctor, ambos o ninguno (primero una maestría y
-- después un doctorado), por lo que NO se añade ninguna restricción CHECK que
-- impida tener ambos marcados.
--
-- Valor por defecto: false. Los registros existentes quedan en false: NO se inventa
-- información académica. Podrán marcarse manualmente desde sus fichas.
--
-- Los campos quedan cubiertos por las políticas RLS ya existentes de candidates y
-- workers (forman parte de sus registros operativos): no se añaden permisos nuevos.
-- ============================================================================

-- 1. Candidatos.
ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS has_masters_degree boolean NOT NULL DEFAULT false;

ALTER TABLE public.candidates
ADD COLUMN IF NOT EXISTS has_doctorate_degree boolean NOT NULL DEFAULT false;

-- 2. Trabajadores.
ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS has_masters_degree boolean NOT NULL DEFAULT false;

ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS has_doctorate_degree boolean NOT NULL DEFAULT false;

-- 3. Documentación de columnas.
COMMENT ON COLUMN public.candidates.has_masters_degree IS '¿El candidato tiene estudios de Máster? Sí/No. Independiente de Doctor (puede tener ambos).';
COMMENT ON COLUMN public.candidates.has_doctorate_degree IS '¿El candidato tiene estudios de Doctor? Sí/No. Independiente de Máster (puede tener ambos).';
COMMENT ON COLUMN public.workers.has_masters_degree IS '¿El trabajador tiene estudios de Máster? Sí/No. Independiente de Doctor (puede tener ambos).';
COMMENT ON COLUMN public.workers.has_doctorate_degree IS '¿El trabajador tiene estudios de Doctor? Sí/No. Independiente de Máster (puede tener ambos).';
