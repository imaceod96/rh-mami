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
  platform_role_id?: string
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
    // 1. Verify caller identity
    const { data: callerData, error: callerError } = await adminClient.auth.getUser(token)
    if (callerError || !callerData?.user) {
      console.error("[create-sitecorp-user] invalid caller token", callerError)
      return json({ error: "Unauthorized" }, 401)
    }

    const callerId = callerData.user.id

    // 2. Verify caller has an active platform profile
    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("profiles")
      .select("id, is_active")
      .eq("id", callerId)
      .single()

    if (callerProfileError || !callerProfile || callerProfile.is_active === false) {
      console.error("[create-sitecorp-user] inactive or missing caller profile", callerProfileError)
      return json({ error: "Forbidden: inactive platform administrator" }, 403)
    }

    // 3. Verify caller authorization: SuperAdmin OR has users.manage_all permission
    const { data: callerRoles, error: callerRolesError } = await adminClient
      .from("platform_user_roles")
      .select("platform_role_id, platform_roles(name, is_system_role, is_active)")
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
      .select("platform_role_id")
      .eq("user_id", callerId)

    let hasManageAllPermission = false
    if (!permissionError && permissionData) {
      const roleIds = permissionData.map((p: any) => p.platform_role_id)
      const { data: permData, error: permError } = await adminClient
        .from("platform_role_permissions")
        .select("platform_role_id, platform_permissions(code)")
        .in("platform_role_id", roleIds)

      if (!permError && permData) {
        hasManageAllPermission = permData.some(
          (p: any) => p.platform_permissions?.code === "users.manage_all"
        )
      }
    }

    if (!isSuperAdmin && !hasManageAllPermission) {
      console.error("[create-sitecorp-user] caller not authorized", { callerId })
      return json({ error: "Forbidden: insufficient permissions to create users" }, 403)
    }

    // 4. Parse and validate request body
    const body = (await req.json()) as CreateSitecorpUserRequest
    const fullName = (body.full_name ?? "").trim()
    const username = (body.username ?? "").trim()
    const email = (body.email ?? "").trim().toLowerCase()
    const password = (body.password ?? "temp1234!").trim()
    const platformRoleId = body.platform_role_id || null
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

    // Check if platform role exists and is active
    if (!platformRoleId) {
      return json({ error: "Rol de plataforma es requerido." }, 400)
    }

    const { data: roleData, error: roleError } = await adminClient
      .from("platform_roles")
      .select("id, name, is_active, is_system_role")
      .eq("id", platformRoleId)
      .single()

    if (roleError || !roleData) {
      console.error("[create-sitecorp-user] invalid platform role", { platformRoleId, error: roleError })
      return json({ error: "Rol de plataforma inválido." }, 400)
    }

    if (!roleData.is_active) {
      return json({ error: "El rol de plataforma seleccionado está inactivo." }, 400)
    }

    // Check if username already exists
    const { data: existingUsername, error: usernameError } = await adminClient
      .from("profiles")
      .select("id, username")
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
    // Duplicate email detection is handled by admin.createUser error response
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

    // Create profile record
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
      console.error("[create-sitecorp-user] profile creation failed", profileError)
      // Try to clean up the auth user
      try {
        await adminClient.auth.admin.deleteUser(userId)
      } catch (cleanupError) {
        console.error("[create-sitecorp-user] rollback delete failed", cleanupError)
      }
      return json({ error: "Error al crear el perfil: " + profileError.message }, 500)
    }

    // Assign platform role
    const { error: roleAssignError } = await adminClient.from("platform_user_roles").insert({
      user_id: userId,
      platform_role_id: platformRoleId,
      assigned_by: callerId,
    })

    if (roleAssignError) {
      console.error("[create-sitecorp-user] platform role assignment failed", roleAssignError)
      // Try to clean up the profile and auth user
      try {
        await adminClient.from("profiles").delete().eq("id", userId)
        await adminClient.auth.admin.deleteUser(userId)
      } catch (cleanupError) {
        console.error("[create-sitecorp-user] rollback failed", cleanupError)
      }
      return json({ error: "Error al asignar el rol de plataforma: " + roleAssignError.message }, 500)
    }

    console.log("[create-sitecorp-user] user created successfully", {
      userId,
      email,
      platformRole: roleData.name,
      isActive,
    })

    return json(
      {
        user_id: userId,
        email,
        username,
        full_name: fullName,
        platform_role_id: platformRoleId,
        platform_role_name: roleData.name,
        message: "Usuario creado correctamente.",
      },
      201
    )
  } catch (error) {
    console.error("[create-sitecorp-user] unexpected error", error)
    return json({ error: "Error inesperado al crear el usuario." }, 500)
  }
})

/* To invoke this function:
 * 
 * curl -X POST 'https://<your-project-ref>.functions.supabase.co/create-sitecorp-user' \
 * -H 'Authorization: Bearer <your-jwt>' \
 * -H 'Content-Type: application/json' \
 * -d '{"full_name":"Jane Doe","username":"jane_doe","email":"jane@example.com","password":"secret","platform_role_id":"<uuid>"}'
 */