import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

interface CreateSitecorpUserRequest {
  full_name: string
  username: string
  email: string
  password: string
  tenant_id?: string
  entity_id?: string
  tenant_role_id?: string
  access_scope?: "SELF" | "SELF_AND_DESCENDANTS"
  is_active?: boolean
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401)
  }

  const token = authHeader.replace("Bearer ", "")

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  )

  try {
    // Verify caller identity
    const { data: callerData, error: callerError } = await adminClient.auth.getUser(token)
    if (callerError || !callerData.user) {
      console.error("[create-sitecorp-user] invalid caller token", callerError)
      return json({ error: "Unauthorized" }, 401)
    }

    const callerId = callerData.user.id

    // Verify caller profile is active
    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("id,is_active")
      .eq("id", callerId)
      .single()

    if (callerProfileError || !callerProfile || callerProfile.is_active === false) {
      console.error("[create-sitecorp-user] inactive or missing caller profile", callerProfileError)
      return json({ error: "Forbidden: inactive platform administrator" }, 403)
    }

    // Verify caller authorization: SuperAdmin OR has users.manage_all permission
    const { data: callerRoles, error: callerRolesError } = await adminClient
      .from("platform_user_roles")
      .select("platform_role_id, platform_roles(name,is_system_role,is_active)")
      .eq("user_id", callerId)

    if (callerRolesError) {
      console.error("[create-sitecorp-user] caller role lookup failed", callerRolesError)
      return json({ error: "Forbidden: unable to verify platform role" }, 403)
    }

    const isSuperAdmin = (callerRoles || []).some(
      (assignment: any) =>
        assignment.platform_roles?.name === "SuperAdmin" &&
        assignment.platform_roles?.is_system_role === true &&
        assignment.platform_roles?.is_active === true
    )

    // Check for users.manage_all permission
    const { data: permissionData, error: permissionError } = await adminClient
      .from("platform_user_roles")
      .select("platform_role_id, platform_roles!inner(platform_role_permissions!inner(platform_permissions!inner(code)))")
      .eq("user_id", callerId)
      .eq("platform_roles.is_active", true)

    const hasManageAllPermission = (permissionData || []).some(
      (assignment: any) => {
        const permissions = assignment.platform_roles?.platform_role_permissions || []
        return permissions.some((p: any) => p.platform_permissions?.code === "users.manage_all")
      }
    )

    if (!isSuperAdmin && !hasManageAllPermission) {
      console.error("[create-sitecorp-user] caller not authorized", { callerId })
      return json({ error: "Forbidden: insufficient permissions to create users" }, 403)
    }

    // Parse request body
    const body = (await req.json()) as CreateSitecorpUserRequest
    const fullName = (body.full_name ?? "").trim()
    const username = (body.username ?? "").trim()
    const email = (body.email ?? "").trim().toLowerCase()
    const password = (body.password ?? "temp1234!").trim()
    const tenantId = (body.tenant_id ?? "").trim() || null
    const entityId = (body.entity_id ?? "").trim() || null
    const tenantRoleId = (body.tenant_role_id ?? "").trim() || null
    const accessScope = body.access_scope ?? "SELF"
    const isActive = body.is_active !== false

    // Validate required fields
    if (!fullName) {
      return json({ error: "El nombre completo es obligatorio." }, 400)
    }
    if (!username) {
      return json({ error: "El usuario es obligatorio." }, 400)
    }
    if (!isValidEmail(email)) {
      return json({ error: "Introduce un email válido." }, 400)
    }

    // Validate username uniqueness
    const { data: existingUsername, error: usernameError } = await adminClient
      .from("profiles")
      .select("id,username")
      .eq("username", username)
      .maybeSingle()

    if (usernameError) {
      console.error("[create-sitecorp-user] username validation failed", usernameError)
      return json({ error: "No se pudo validar el usuario." }, 500)
    }
    if (existingUsername) {
      return json({ error: "Ya existe un usuario con ese nombre." }, 409)
    }

    // Create auth user via Admin API with email_confirm: true for development
    const { data: newUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        username,
      },
    })

    if (createUserError || !newUser?.user) {
      console.error("[create-sitecorp-user] auth user creation failed", createUserError)
      const message = createUserError?.message ?? "No se pudo crear el usuario."
      const normalized = message.toLowerCase()
      if (normalized.includes("already") || normalized.includes("registered") || normalized.includes("exists")) {
        return json({ error: "Ya existe un usuario con este correo." }, 409)
      }
      return json({ error: message }, 500)
    }

    const userId = newUser.user.id

    try {
      // Create/update profile
      const { error: profileError } = await adminClient.from("profiles").upsert(
        {
          id: userId,
          full_name: fullName,
          username,
          is_active: isActive,
        },
        { onConflict: "id" }
      )

      if (profileError) {
        throw { step: "profile", error: profileError }
      }

      // Create tenant membership if tenant_id provided
      let membershipId: string | null = null
      if (tenantId) {
        const { data: existingMembership, error: membershipCheckError } = await adminClient
          .from("tenant_memberships")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .maybeSingle()

        if (membershipCheckError) {
          throw { step: "membership_check", error: membershipCheckError }
        }

        if (existingMembership) {
          membershipId = existingMembership.id
          const { error: updateError } = await adminClient
            .from("tenant_memberships")
            .update({ is_active: isActive })
            .eq("id", membershipId)
          if (updateError) {
            throw { step: "membership_update", error: updateError }
          }
        } else {
          const { data: newMembership, error: membershipError } = await adminClient
            .from("tenant_memberships")
            .insert({
              tenant_id: tenantId,
              user_id: userId,
              is_active: isActive,
            })
            .select("id")
            .single()

          if (membershipError) {
            throw { step: "membership_create", error: membershipError }
          }
          membershipId = newMembership.id
        }
      }

      // Create entity user access if entity_id, tenant_role_id, and membership_id provided
      if (entityId && tenantRoleId && membershipId) {
        const { data: existingAccess, error: accessCheckError } = await adminClient
          .from("entity_user_access")
          .select("id")
          .eq("tenant_membership_id", membershipId)
          .eq("organization_entity_id", entityId)
          .eq("tenant_role_id", tenantRoleId)
          .maybeSingle()

        if (accessCheckError) {
          throw { step: "access_check", error: accessCheckError }
        }

        if (!existingAccess) {
          const { error: accessError } = await adminClient.from("entity_user_access").insert({
            tenant_membership_id: membershipId,
            organization_entity_id: entityId,
            tenant_role_id: tenantRoleId,
            access_scope: accessScope,
            is_active: isActive,
            assigned_by: callerId,
          })

          if (accessError) {
            throw { step: "access_create", error: accessError }
          }
        }
      }

      // Create tenant_user_roles record if tenant_role_id and membership_id provided
      if (tenantRoleId && membershipId) {
        const { data: existingRole, error: roleCheckError } = await adminClient
          .from("tenant_user_roles")
          .select("id")
          .eq("tenant_membership_id", membershipId)
          .eq("tenant_role_id", tenantRoleId)
          .maybeSingle()

        if (roleCheckError) {
          throw { step: "role_check", error: roleCheckError }
        }

        if (!existingRole) {
          const { error: roleError } = await adminClient
            .from("tenant_user_roles")
            .insert({
              tenant_membership_id: membershipId,
              tenant_role_id: tenantRoleId,
              assigned_by: callerId,
            })

          if (roleError) {
            throw { step: "role_create", error: roleError }
          }
        }
      }

      console.log("[create-sitecorp-user] user created successfully", {
        userId,
        email,
        username,
        membershipId,
      })

      return json(
        {
          user_id: userId,
          email,
          username,
          full_name: fullName,
          tenant_membership_id: membershipId,
          message: "Usuario creado correctamente.",
        },
        201
      )
    } catch (pipelineError: any) {
      console.error("[create-sitecorp-user] rolling back created auth user", pipelineError)

      // Rollback: delete the created auth user
      try {
        await adminClient.auth.admin.deleteUser(userId)
      } catch (rollbackError) {
        console.error("[create-sitecorp-user] rollback delete failed", rollbackError)
      }

      const step = pipelineError?.step || "unknown"
      const errorMsg = pipelineError?.error?.message || "Error desconocido"

      return json(
        {
          error: `No se pudo completar la creación del usuario (paso: ${step}): ${errorMsg}`,
        },
        500
      )
    }
  } catch (error) {
    console.error("[create-sitecorp-user] unexpected error", error)
    return json({ error: "Error inesperado al crear el usuario." }, 500)
  }
})
