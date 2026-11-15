/**
 * GENERATED — do not edit. `pnpm generate:operations` writes it from the
 * deployed management API document (https://api.kleora.io/api/v1/openapi.json).
 *
 * Every operation in that document: its method, path
 * template, which argument names are path or query parameters, and the fields a
 * command may expose as flags. Which of these are *commands* is
 * `src/commands/registry.ts`'s decision, not this file's.
 *
 * Credential-shaped body fields are **absent by construction** — the generator
 * drops them, so no flag anywhere in
 * this CLI can carry a password, a token, a client secret or an API key.
 */

/** The scalar a flag value is coerced to. `json` is parsed with `JSON.parse`. */
export type FieldType = 'string' | 'number' | 'boolean' | 'json'

export interface OperationField {
  readonly name: string
  readonly where: 'query' | 'body'
  readonly type: FieldType
  /** A repeatable flag: `--redirect-uris a --redirect-uris b`. */
  readonly repeated: boolean
  readonly required: boolean
  readonly description?: string
  readonly enum?: readonly string[]
}

export interface GeneratedOperation {
  readonly operationId: string
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  readonly path: string
  readonly tag: string
  readonly summary: string
  readonly pathParams: readonly string[]
  readonly queryParams: readonly string[]
  readonly hasBody: boolean
  readonly fields: readonly OperationField[]
}

export const OPERATIONS: Readonly<Record<string, GeneratedOperation>> = {
  "add_member_operation": {
    "operationId": "add_member_operation",
    "method": "post",
    "path": "/api/v1/tenants/{tenant_id}/members",
    "tag": "members",
    "summary": "Add a member",
    "pathParams": [
      "tenant_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "email",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "roles",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": false
      },
      {
        "name": "user_id",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "block_user_operation": {
    "operationId": "block_user_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/block",
    "tag": "users",
    "summary": "Block a user",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": []
  },
  "change_my_password": {
    "operationId": "change_my_password",
    "method": "post",
    "path": "/api/v1/me/password",
    "tag": "me",
    "summary": "Change the caller's own password",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true,
    "fields": []
  },
  "confirm_my_totp_enrollment": {
    "operationId": "confirm_my_totp_enrollment",
    "method": "post",
    "path": "/api/v1/me/mfa/totp/confirm",
    "tag": "me",
    "summary": "Confirm the caller's own TOTP enrolment",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "code",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "create_account_operation": {
    "operationId": "create_account_operation",
    "method": "post",
    "path": "/api/v1/accounts",
    "tag": "accounts",
    "summary": "Create an account",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "slug",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "create_api_key_operation": {
    "operationId": "create_api_key_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/api-keys",
    "tag": "api-keys",
    "summary": "Create an API key",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "expires_at",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "scopes",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": true
      }
    ]
  },
  "create_app_operation": {
    "operationId": "create_app_operation",
    "method": "post",
    "path": "/api/v1/apps",
    "tag": "apps",
    "summary": "Create an app",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "slug",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "create_client_operation": {
    "operationId": "create_client_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/clients",
    "tag": "clients",
    "summary": "Create a client",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "allowed_scopes",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": false
      },
      {
        "name": "device_grant_enabled",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "initiate_login_uri",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "kind",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true,
        "enum": [
          "spa",
          "web",
          "native"
        ]
      },
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "post_logout_redirect_uris",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": false
      },
      {
        "name": "redirect_uris",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": false
      }
    ]
  },
  "create_invitation_operation": {
    "operationId": "create_invitation_operation",
    "method": "post",
    "path": "/api/v1/tenants/{tenant_id}/invitations",
    "tag": "invitations",
    "summary": "Invite an address",
    "pathParams": [
      "tenant_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "email",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "roles",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": false
      }
    ]
  },
  "create_permission_operation": {
    "operationId": "create_permission_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/permissions",
    "tag": "permissions",
    "summary": "Create a permission",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "description",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      }
    ]
  },
  "create_role_operation": {
    "operationId": "create_role_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/roles",
    "tag": "roles",
    "summary": "Create an app-scoped role",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "description",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "permissions",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": false
      },
      {
        "name": "slug",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      }
    ]
  },
  "create_setting_definition": {
    "operationId": "create_setting_definition",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/settings/definitions",
    "tag": "settings",
    "summary": "Create a setting definition",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "access",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "user_editable",
          "user_visible",
          "hidden"
        ]
      },
      {
        "name": "constraints",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": false
      },
      {
        "name": "default",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "description",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "label",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "type",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true,
        "enum": [
          "boolean",
          "enum",
          "string",
          "number"
        ]
      }
    ]
  },
  "create_tenant_operation": {
    "operationId": "create_tenant_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/tenants",
    "tag": "tenants",
    "summary": "Create a tenant",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "metadata",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": false
      },
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "slug",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      }
    ]
  },
  "create_tenant_role_operation": {
    "operationId": "create_tenant_role_operation",
    "method": "post",
    "path": "/api/v1/tenants/{tenant_id}/roles",
    "tag": "roles",
    "summary": "Create a tenant-scoped role",
    "pathParams": [
      "tenant_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "description",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "permissions",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": false
      },
      {
        "name": "slug",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      }
    ]
  },
  "create_user_operation": {
    "operationId": "create_user_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/users",
    "tag": "users",
    "summary": "Create a user",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "email",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "email_verified",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "locale",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "en",
          "pl"
        ]
      },
      {
        "name": "metadata",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": false
      },
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "send_verification",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": false
      }
    ]
  },
  "create_webhook_endpoint_operation": {
    "operationId": "create_webhook_endpoint_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/webhook-endpoints",
    "tag": "webhook-endpoints",
    "summary": "Create a webhook endpoint",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "event_types",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": false
      },
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "url",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      }
    ]
  },
  "delete_api_key_operation": {
    "operationId": "delete_api_key_operation",
    "method": "delete",
    "path": "/api/v1/environments/{environment_id}/api-keys/{api_key_id}",
    "tag": "api-keys",
    "summary": "Delete an API key",
    "pathParams": [
      "environment_id",
      "api_key_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "delete_app_operation": {
    "operationId": "delete_app_operation",
    "method": "delete",
    "path": "/api/v1/apps/{app_id}",
    "tag": "apps",
    "summary": "Delete an app",
    "pathParams": [
      "app_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "delete_client_operation": {
    "operationId": "delete_client_operation",
    "method": "delete",
    "path": "/api/v1/environments/{environment_id}/clients/{client_id}",
    "tag": "clients",
    "summary": "Delete a client",
    "pathParams": [
      "environment_id",
      "client_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "delete_identity_provider": {
    "operationId": "delete_identity_provider",
    "method": "delete",
    "path": "/api/v1/environments/{environment_id}/identity-providers/{kind}",
    "tag": "identity-providers",
    "summary": "Delete an identity provider",
    "pathParams": [
      "environment_id",
      "kind"
    ],
    "queryParams": [
      "force"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "force",
        "where": "query",
        "type": "boolean",
        "repeated": false,
        "required": false
      }
    ]
  },
  "delete_my_device_authorization": {
    "operationId": "delete_my_device_authorization",
    "method": "delete",
    "path": "/api/v1/me/device-authorizations/{authorization_id}",
    "tag": "me",
    "summary": "Revoke one of the caller's own device authorizations",
    "pathParams": [
      "authorization_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "delete_my_mfa_factor": {
    "operationId": "delete_my_mfa_factor",
    "method": "delete",
    "path": "/api/v1/me/mfa/{factor_id}",
    "tag": "me",
    "summary": "Remove one of the caller's own factors",
    "pathParams": [
      "factor_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "delete_my_setting": {
    "operationId": "delete_my_setting",
    "method": "delete",
    "path": "/api/v1/me/settings/{key}",
    "tag": "settings",
    "summary": "Clear one of the calling console user's own settings",
    "pathParams": [
      "key"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "delete_permission_operation": {
    "operationId": "delete_permission_operation",
    "method": "delete",
    "path": "/api/v1/permissions/{permission_id}",
    "tag": "permissions",
    "summary": "Delete a permission",
    "pathParams": [
      "permission_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "delete_role_operation": {
    "operationId": "delete_role_operation",
    "method": "delete",
    "path": "/api/v1/roles/{role_id}",
    "tag": "roles",
    "summary": "Delete a role",
    "pathParams": [
      "role_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "delete_setting_definition": {
    "operationId": "delete_setting_definition",
    "method": "delete",
    "path": "/api/v1/environments/{environment_id}/settings/definitions/{key}",
    "tag": "settings",
    "summary": "Delete a setting definition",
    "pathParams": [
      "environment_id",
      "key"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "delete_tenant_operation": {
    "operationId": "delete_tenant_operation",
    "method": "delete",
    "path": "/api/v1/tenants/{tenant_id}",
    "tag": "tenants",
    "summary": "Delete a tenant",
    "pathParams": [
      "tenant_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "delete_user_device_authorization": {
    "operationId": "delete_user_device_authorization",
    "method": "delete",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/device-authorizations/{authorization_id}",
    "tag": "users",
    "summary": "Revoke a device authorization",
    "pathParams": [
      "environment_id",
      "user_id",
      "authorization_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "delete_user_mfa_factor": {
    "operationId": "delete_user_mfa_factor",
    "method": "delete",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/mfa/{factor_id}",
    "tag": "users",
    "summary": "Administrative MFA reset",
    "pathParams": [
      "environment_id",
      "user_id",
      "factor_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "delete_user_operation": {
    "operationId": "delete_user_operation",
    "method": "delete",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}",
    "tag": "users",
    "summary": "Erase a user",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [
      "erase"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "erase",
        "where": "query",
        "type": "boolean",
        "repeated": false,
        "required": false
      }
    ]
  },
  "delete_user_session": {
    "operationId": "delete_user_session",
    "method": "delete",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/sessions/{session_id}",
    "tag": "users",
    "summary": "Revoke a session",
    "pathParams": [
      "environment_id",
      "user_id",
      "session_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "delete_user_setting": {
    "operationId": "delete_user_setting",
    "method": "delete",
    "path": "/api/v1/environments/{environment_id}/settings/users/{user_id}/values/{key}",
    "tag": "settings",
    "summary": "Clear one user's setting",
    "pathParams": [
      "environment_id",
      "user_id",
      "key"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "delete_webhook_endpoint_operation": {
    "operationId": "delete_webhook_endpoint_operation",
    "method": "delete",
    "path": "/api/v1/environments/{environment_id}/webhook-endpoints/{webhook_endpoint_id}",
    "tag": "webhook-endpoints",
    "summary": "Delete a webhook endpoint",
    "pathParams": [
      "environment_id",
      "webhook_endpoint_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "export_user": {
    "operationId": "export_user",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/export",
    "tag": "users",
    "summary": "Export a user",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "finish_my_passkey_registration": {
    "operationId": "finish_my_passkey_registration",
    "method": "post",
    "path": "/api/v1/me/passkeys/register/finish",
    "tag": "me",
    "summary": "Confirm registering one of the caller's own passkeys",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "link_user_identity": {
    "operationId": "link_user_identity",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/identities",
    "tag": "users",
    "summary": "Link a provider account to a user",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "provider",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true,
        "enum": [
          "google",
          "microsoft",
          "github",
          "facebook"
        ]
      },
      {
        "name": "provider_subject",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      }
    ]
  },
  "list_account_audit_events": {
    "operationId": "list_account_audit_events",
    "method": "get",
    "path": "/api/v1/account/audit-events",
    "tag": "audit",
    "summary": "The account's audit events",
    "pathParams": [],
    "queryParams": [
      "limit",
      "cursor",
      "action",
      "actor_id",
      "target_id",
      "from",
      "to",
      "format",
      "tenant_id",
      "environment_id"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "action",
        "where": "query",
        "type": "string",
        "repeated": true,
        "required": false
      },
      {
        "name": "actor_id",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "environment_id",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "format",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "json",
          "ndjson"
        ]
      },
      {
        "name": "from",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "target_id",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "tenant_id",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "to",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_api_keys": {
    "operationId": "list_api_keys",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/api-keys",
    "tag": "api-keys",
    "summary": "List API keys",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [
      "limit",
      "cursor",
      "status",
      "q"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "q",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "status",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "active",
          "expired",
          "revoked"
        ]
      }
    ]
  },
  "list_app_environments": {
    "operationId": "list_app_environments",
    "method": "get",
    "path": "/api/v1/apps/{app_id}/environments",
    "tag": "apps",
    "summary": "An app's environments",
    "pathParams": [
      "app_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "list_apps": {
    "operationId": "list_apps",
    "method": "get",
    "path": "/api/v1/apps",
    "tag": "apps",
    "summary": "List apps",
    "pathParams": [],
    "queryParams": [
      "limit",
      "cursor",
      "slug",
      "q"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "q",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "slug",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_clients": {
    "operationId": "list_clients",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/clients",
    "tag": "clients",
    "summary": "List clients",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [
      "limit",
      "cursor",
      "is_default",
      "q"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "is_default",
        "where": "query",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "q",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_email_templates": {
    "operationId": "list_email_templates",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/email-templates",
    "tag": "email-templates",
    "summary": "List email templates",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [
      "limit",
      "cursor"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_environment_audit_events": {
    "operationId": "list_environment_audit_events",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/audit-events",
    "tag": "audit",
    "summary": "An environment's audit events",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [
      "limit",
      "cursor",
      "action",
      "actor_id",
      "target_id",
      "from",
      "to",
      "format",
      "tenant_id"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "action",
        "where": "query",
        "type": "string",
        "repeated": true,
        "required": false
      },
      {
        "name": "actor_id",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "format",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "json",
          "ndjson"
        ]
      },
      {
        "name": "from",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "target_id",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "tenant_id",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "to",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_identity_providers": {
    "operationId": "list_identity_providers",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/identity-providers",
    "tag": "identity-providers",
    "summary": "List identity providers",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "list_invitations": {
    "operationId": "list_invitations",
    "method": "get",
    "path": "/api/v1/tenants/{tenant_id}/invitations",
    "tag": "invitations",
    "summary": "List invitations",
    "pathParams": [
      "tenant_id"
    ],
    "queryParams": [
      "limit",
      "cursor",
      "status",
      "q"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "q",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "status",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "open",
          "accepted",
          "revoked",
          "expired"
        ]
      }
    ]
  },
  "list_members": {
    "operationId": "list_members",
    "method": "get",
    "path": "/api/v1/tenants/{tenant_id}/members",
    "tag": "members",
    "summary": "List members",
    "pathParams": [
      "tenant_id"
    ],
    "queryParams": [
      "limit",
      "cursor",
      "q",
      "role",
      "status"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "q",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "role",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "status",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "active",
          "suspended"
        ]
      }
    ]
  },
  "list_my_device_authorizations": {
    "operationId": "list_my_device_authorizations",
    "method": "get",
    "path": "/api/v1/me/device-authorizations",
    "tag": "me",
    "summary": "The caller's own device authorizations",
    "pathParams": [],
    "queryParams": [
      "limit",
      "cursor"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_my_mfa_factors": {
    "operationId": "list_my_mfa_factors",
    "method": "get",
    "path": "/api/v1/me/mfa",
    "tag": "me",
    "summary": "The caller's own MFA factors",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "list_my_settings": {
    "operationId": "list_my_settings",
    "method": "get",
    "path": "/api/v1/me/settings",
    "tag": "settings",
    "summary": "The calling console user's own settings",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "list_permissions": {
    "operationId": "list_permissions",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/permissions",
    "tag": "permissions",
    "summary": "List permissions",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [
      "limit",
      "cursor",
      "q",
      "system"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "q",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "system",
        "where": "query",
        "type": "boolean",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_roles": {
    "operationId": "list_roles",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/roles",
    "tag": "roles",
    "summary": "List app-scoped roles",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [
      "limit",
      "cursor",
      "q"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "q",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_setting_definitions": {
    "operationId": "list_setting_definitions",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/settings/definitions",
    "tag": "settings",
    "summary": "List setting definitions",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [
      "limit",
      "cursor"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_signing_keys": {
    "operationId": "list_signing_keys",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/signing-keys",
    "tag": "signing-keys",
    "summary": "List signing keys",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "list_tenant_audit_events": {
    "operationId": "list_tenant_audit_events",
    "method": "get",
    "path": "/api/v1/tenants/{tenant_id}/audit-events",
    "tag": "audit",
    "summary": "A tenant's audit events",
    "pathParams": [
      "tenant_id"
    ],
    "queryParams": [
      "limit",
      "cursor",
      "action",
      "actor_id",
      "target_id",
      "from",
      "to",
      "format"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "action",
        "where": "query",
        "type": "string",
        "repeated": true,
        "required": false
      },
      {
        "name": "actor_id",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "format",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "json",
          "ndjson"
        ]
      },
      {
        "name": "from",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "target_id",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "to",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_tenant_roles": {
    "operationId": "list_tenant_roles",
    "method": "get",
    "path": "/api/v1/tenants/{tenant_id}/roles",
    "tag": "roles",
    "summary": "Roles assignable in a tenant",
    "pathParams": [
      "tenant_id"
    ],
    "queryParams": [
      "limit",
      "cursor",
      "q",
      "scope"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "q",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "scope",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "app",
          "tenant"
        ]
      }
    ]
  },
  "list_tenants": {
    "operationId": "list_tenants",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/tenants",
    "tag": "tenants",
    "summary": "List tenants",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [
      "limit",
      "cursor",
      "q",
      "status"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "q",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "status",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "active",
          "suspended"
        ]
      }
    ]
  },
  "list_user_device_authorizations": {
    "operationId": "list_user_device_authorizations",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/device-authorizations",
    "tag": "users",
    "summary": "A user's device authorizations",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [
      "limit",
      "cursor"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_user_identities": {
    "operationId": "list_user_identities",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/identities",
    "tag": "users",
    "summary": "A user's linked accounts",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "list_user_memberships": {
    "operationId": "list_user_memberships",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/memberships",
    "tag": "users",
    "summary": "A user's memberships",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [
      "limit",
      "cursor"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_user_mfa_factors": {
    "operationId": "list_user_mfa_factors",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/mfa",
    "tag": "users",
    "summary": "A user's MFA factors",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "list_user_sessions": {
    "operationId": "list_user_sessions",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/sessions",
    "tag": "users",
    "summary": "A user's sessions",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [
      "limit",
      "cursor",
      "include_expired"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "include_expired",
        "where": "query",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_user_settings": {
    "operationId": "list_user_settings",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/settings/users/{user_id}/values",
    "tag": "settings",
    "summary": "One user's settings",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [
      "limit",
      "cursor"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_users": {
    "operationId": "list_users",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/users",
    "tag": "users",
    "summary": "List users",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [
      "limit",
      "cursor",
      "email",
      "q",
      "status",
      "tenant_id",
      "mfa",
      "session"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "email",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "mfa",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "enrolled",
          "none"
        ]
      },
      {
        "name": "q",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "session",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "status",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "active",
          "blocked",
          "erased"
        ]
      },
      {
        "name": "tenant_id",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_webhook_endpoints": {
    "operationId": "list_webhook_endpoints",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/webhook-endpoints",
    "tag": "webhook-endpoints",
    "summary": "List webhook endpoints",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [
      "limit",
      "cursor",
      "enabled",
      "event_type"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "enabled",
        "where": "query",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "event_type",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      }
    ]
  },
  "list_webhook_events": {
    "operationId": "list_webhook_events",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/webhook-events",
    "tag": "webhook-events",
    "summary": "List webhook events",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [
      "limit",
      "cursor",
      "event_type",
      "endpoint_id",
      "outcome"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "cursor",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "endpoint_id",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "event_type",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "limit",
        "where": "query",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "outcome",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "pending",
          "succeeded",
          "failed"
        ]
      }
    ]
  },
  "me": {
    "operationId": "me",
    "method": "get",
    "path": "/api/v1/me",
    "tag": "me",
    "summary": "The calling principal",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "merge_user_operation": {
    "operationId": "merge_user_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/merge",
    "tag": "users",
    "summary": "Merge another user into this one",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "source_id",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      }
    ]
  },
  "open_portal_operation": {
    "operationId": "open_portal_operation",
    "method": "post",
    "path": "/api/v1/account/billing/portal",
    "tag": "billing",
    "summary": "Open the Stripe Customer Portal",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "patch_account": {
    "operationId": "patch_account",
    "method": "patch",
    "path": "/api/v1/account",
    "tag": "accounts",
    "summary": "Rename the account",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "patch_app": {
    "operationId": "patch_app",
    "method": "patch",
    "path": "/api/v1/apps/{app_id}",
    "tag": "apps",
    "summary": "Rename an app",
    "pathParams": [
      "app_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "patch_client": {
    "operationId": "patch_client",
    "method": "patch",
    "path": "/api/v1/environments/{environment_id}/clients/{client_id}",
    "tag": "clients",
    "summary": "Change a client",
    "pathParams": [
      "environment_id",
      "client_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "allowed_scopes",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": false
      },
      {
        "name": "device_grant_enabled",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "initiate_login_uri",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "is_default",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "kind",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "spa",
          "web",
          "native"
        ]
      },
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "post_logout_redirect_uris",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": false
      },
      {
        "name": "redirect_uris",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": false
      }
    ]
  },
  "patch_environment": {
    "operationId": "patch_environment",
    "method": "patch",
    "path": "/api/v1/environments/{environment_id}",
    "tag": "environments",
    "summary": "Change an environment's settings",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "access_token_ttl",
        "where": "body",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "allow_browser_locale",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "api_audience",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "default_locale",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "en",
          "pl"
        ]
      },
      {
        "name": "mfa_policy",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "off",
          "optional",
          "required"
        ]
      },
      {
        "name": "no_tenant_behaviour",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "error",
          "create"
        ]
      },
      {
        "name": "password_breach_check",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "password_min_length",
        "where": "body",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "refresh_token_ttl",
        "where": "body",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "self_deletion",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "self_registration",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "session_idle_ttl",
        "where": "body",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "session_ttl",
        "where": "body",
        "type": "number",
        "repeated": false,
        "required": false
      },
      {
        "name": "tenant_creator_role",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "tenant_mode",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "single",
          "multi"
        ]
      }
    ]
  },
  "patch_member": {
    "operationId": "patch_member",
    "method": "patch",
    "path": "/api/v1/tenants/{tenant_id}/members/{member_id}",
    "tag": "members",
    "summary": "Change a member",
    "pathParams": [
      "tenant_id",
      "member_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "roles",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": false
      },
      {
        "name": "status",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "active",
          "suspended"
        ]
      }
    ]
  },
  "patch_permission": {
    "operationId": "patch_permission",
    "method": "patch",
    "path": "/api/v1/permissions/{permission_id}",
    "tag": "permissions",
    "summary": "Describe a permission",
    "pathParams": [
      "permission_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "description",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "patch_role": {
    "operationId": "patch_role",
    "method": "patch",
    "path": "/api/v1/roles/{role_id}",
    "tag": "roles",
    "summary": "Change a role",
    "pathParams": [
      "role_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "description",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "patch_setting_definition": {
    "operationId": "patch_setting_definition",
    "method": "patch",
    "path": "/api/v1/environments/{environment_id}/settings/definitions/{key}",
    "tag": "settings",
    "summary": "Change a setting definition",
    "pathParams": [
      "environment_id",
      "key"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "access",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "user_editable",
          "user_visible",
          "hidden"
        ]
      },
      {
        "name": "constraints",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": false
      },
      {
        "name": "default",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "description",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "label",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "patch_tenant": {
    "operationId": "patch_tenant",
    "method": "patch",
    "path": "/api/v1/tenants/{tenant_id}",
    "tag": "tenants",
    "summary": "Change a tenant",
    "pathParams": [
      "tenant_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "metadata",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": false
      },
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "slug",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "patch_user": {
    "operationId": "patch_user",
    "method": "patch",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}",
    "tag": "users",
    "summary": "Change a user",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "email",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "email_verified",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "locale",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "en",
          "pl"
        ]
      },
      {
        "name": "metadata",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": false
      },
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "picture_url",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "patch_webhook_endpoint": {
    "operationId": "patch_webhook_endpoint",
    "method": "patch",
    "path": "/api/v1/environments/{environment_id}/webhook-endpoints/{webhook_endpoint_id}",
    "tag": "webhook-endpoints",
    "summary": "Change a webhook endpoint",
    "pathParams": [
      "environment_id",
      "webhook_endpoint_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "enabled",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "event_types",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": false
      },
      {
        "name": "name",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "url",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      }
    ]
  },
  "preview_branding": {
    "operationId": "preview_branding",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/branding/preview",
    "tag": "branding",
    "summary": "Create a branding preview draft",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "background",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": true,
        "description": "The page background: one of three `kind`s."
      },
      {
        "name": "color_scheme",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "description": "`light`, `dark` or `auto`; left out, `light`."
      },
      {
        "name": "colors",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": true,
        "description": "The palette: seven required six-digit hex colours, and three optional ones."
      },
      {
        "name": "colors_dark",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": false,
        "description": "The palette rendered when the page is dark: the same keys and rules as `colors`."
      },
      {
        "name": "composition",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": false,
        "description": "`null` (the default) renders every page in its standard order."
      },
      {
        "name": "custom_css",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "favicon_url",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "font",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "icons",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": false,
        "description": "`enabled` (default true), `button` (an icon name or null) and `panel_features` (up to three names)."
      },
      {
        "name": "layout",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": true,
        "description": "The page layout: one of two `kind`s."
      },
      {
        "name": "links",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": true,
        "description": "The three footer links."
      },
      {
        "name": "logo_url",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "radius",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "sandbox_marker",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "description": "`none`, `rail` or `canvas`; left out, `none`."
      },
      {
        "name": "show_powered_by",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": true
      },
      {
        "name": "texts",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": true
      }
    ]
  },
  "promote_environment": {
    "operationId": "promote_environment",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/promote",
    "tag": "environments",
    "summary": "Promote sandbox configuration to production",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "dry_run",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": false
      }
    ]
  },
  "put_email_template": {
    "operationId": "put_email_template",
    "method": "put",
    "path": "/api/v1/environments/{environment_id}/email-templates/{kind}/{locale}",
    "tag": "email-templates",
    "summary": "Replace an email template",
    "pathParams": [
      "environment_id",
      "kind",
      "locale"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "body_html",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "body_text",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "subject",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      }
    ]
  },
  "put_identity_provider": {
    "operationId": "put_identity_provider",
    "method": "put",
    "path": "/api/v1/environments/{environment_id}/identity-providers/{kind}",
    "tag": "identity-providers",
    "summary": "Configure an identity provider",
    "pathParams": [
      "environment_id",
      "kind"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "allowed_email_domains",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": false
      },
      {
        "name": "button_label",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "client_id",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "enabled",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": false
      },
      {
        "name": "microsoft_tenant",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "scopes",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": false
      }
    ]
  },
  "put_my_setting": {
    "operationId": "put_my_setting",
    "method": "put",
    "path": "/api/v1/me/settings/{key}",
    "tag": "settings",
    "summary": "Write one of the calling console user's own settings",
    "pathParams": [
      "key"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "value",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": true
      }
    ]
  },
  "put_role_permissions": {
    "operationId": "put_role_permissions",
    "method": "put",
    "path": "/api/v1/roles/{role_id}/permissions",
    "tag": "roles",
    "summary": "Replace a role's permissions",
    "pathParams": [
      "role_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "permissions",
        "where": "body",
        "type": "string",
        "repeated": true,
        "required": true
      }
    ]
  },
  "put_user_setting": {
    "operationId": "put_user_setting",
    "method": "put",
    "path": "/api/v1/environments/{environment_id}/settings/users/{user_id}/values/{key}",
    "tag": "settings",
    "summary": "Write one user's setting",
    "pathParams": [
      "environment_id",
      "user_id",
      "key"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "value",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": true
      }
    ]
  },
  "read_account": {
    "operationId": "read_account",
    "method": "get",
    "path": "/api/v1/account",
    "tag": "accounts",
    "summary": "The calling principal's account",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_api_key": {
    "operationId": "read_api_key",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/api-keys/{api_key_id}",
    "tag": "api-keys",
    "summary": "An API key",
    "pathParams": [
      "environment_id",
      "api_key_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_app": {
    "operationId": "read_app",
    "method": "get",
    "path": "/api/v1/apps/{app_id}",
    "tag": "apps",
    "summary": "An app",
    "pathParams": [
      "app_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_billing": {
    "operationId": "read_billing",
    "method": "get",
    "path": "/api/v1/account/billing",
    "tag": "billing",
    "summary": "Plan, limits, usage and subscription",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_billing_usage": {
    "operationId": "read_billing_usage",
    "method": "get",
    "path": "/api/v1/account/billing/usage",
    "tag": "billing",
    "summary": "MAU, App and Tenant usage for the current period",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_branding": {
    "operationId": "read_branding",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/branding",
    "tag": "branding",
    "summary": "An environment's branding record",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_client": {
    "operationId": "read_client",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/clients/{client_id}",
    "tag": "clients",
    "summary": "A client",
    "pathParams": [
      "environment_id",
      "client_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_email_template": {
    "operationId": "read_email_template",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/email-templates/{kind}/{locale}",
    "tag": "email-templates",
    "summary": "An email template",
    "pathParams": [
      "environment_id",
      "kind",
      "locale"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_email_template_variables": {
    "operationId": "read_email_template_variables",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/email-templates/variables",
    "tag": "email-templates",
    "summary": "The variables an email template may use",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_environment": {
    "operationId": "read_environment",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}",
    "tag": "environments",
    "summary": "An environment's settings",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_environment_stats": {
    "operationId": "read_environment_stats",
    "method": "get",
    "path": "/api/v1/apps/{app_id}/environments/{environment_id}/stats",
    "tag": "environments",
    "summary": "Environment statistics",
    "pathParams": [
      "app_id",
      "environment_id"
    ],
    "queryParams": [
      "range"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "range",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "7d",
          "30d",
          "90d"
        ]
      }
    ]
  },
  "read_identity_provider": {
    "operationId": "read_identity_provider",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/identity-providers/{kind}",
    "tag": "identity-providers",
    "summary": "An identity provider",
    "pathParams": [
      "environment_id",
      "kind"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_member": {
    "operationId": "read_member",
    "method": "get",
    "path": "/api/v1/tenants/{tenant_id}/members/{member_id}",
    "tag": "members",
    "summary": "A member",
    "pathParams": [
      "tenant_id",
      "member_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_permission": {
    "operationId": "read_permission",
    "method": "get",
    "path": "/api/v1/permissions/{permission_id}",
    "tag": "permissions",
    "summary": "A permission",
    "pathParams": [
      "permission_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_role": {
    "operationId": "read_role",
    "method": "get",
    "path": "/api/v1/roles/{role_id}",
    "tag": "roles",
    "summary": "A role",
    "pathParams": [
      "role_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_setting_definition": {
    "operationId": "read_setting_definition",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/settings/definitions/{key}",
    "tag": "settings",
    "summary": "A setting definition",
    "pathParams": [
      "environment_id",
      "key"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_tenant": {
    "operationId": "read_tenant",
    "method": "get",
    "path": "/api/v1/tenants/{tenant_id}",
    "tag": "tenants",
    "summary": "A tenant",
    "pathParams": [
      "tenant_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_usage": {
    "operationId": "read_usage",
    "method": "get",
    "path": "/api/v1/account/usage",
    "tag": "accounts",
    "summary": "Account usage",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_user": {
    "operationId": "read_user",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}",
    "tag": "users",
    "summary": "A user",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_webhook_endpoint": {
    "operationId": "read_webhook_endpoint",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/webhook-endpoints/{webhook_endpoint_id}",
    "tag": "webhook-endpoints",
    "summary": "A webhook endpoint",
    "pathParams": [
      "environment_id",
      "webhook_endpoint_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "read_webhook_event": {
    "operationId": "read_webhook_event",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/webhook-events/{webhook_event_id}",
    "tag": "webhook-events",
    "summary": "A webhook event, with every delivery attempt",
    "pathParams": [
      "environment_id",
      "webhook_event_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "regenerate_my_recovery_codes": {
    "operationId": "regenerate_my_recovery_codes",
    "method": "post",
    "path": "/api/v1/me/mfa/recovery/regenerate",
    "tag": "me",
    "summary": "Replace the caller's own recovery-code set",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "remove_member_operation": {
    "operationId": "remove_member_operation",
    "method": "delete",
    "path": "/api/v1/tenants/{tenant_id}/members/{member_id}",
    "tag": "members",
    "summary": "Remove a member",
    "pathParams": [
      "tenant_id",
      "member_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "render_email_template": {
    "operationId": "render_email_template",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/email-templates/{kind}/{locale}/render",
    "tag": "email-templates",
    "summary": "Render an email template with sample values",
    "pathParams": [
      "environment_id",
      "kind",
      "locale"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": []
  },
  "replace_branding": {
    "operationId": "replace_branding",
    "method": "put",
    "path": "/api/v1/environments/{environment_id}/branding",
    "tag": "branding",
    "summary": "Replace an environment's branding record",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "background",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": true,
        "description": "The page background: one of three `kind`s."
      },
      {
        "name": "color_scheme",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "description": "`light`, `dark` or `auto`; left out, `light`."
      },
      {
        "name": "colors",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": true,
        "description": "The palette: seven required six-digit hex colours, and three optional ones."
      },
      {
        "name": "colors_dark",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": false,
        "description": "The palette rendered when the page is dark: the same keys and rules as `colors`."
      },
      {
        "name": "composition",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": false,
        "description": "`null` (the default) renders every page in its standard order."
      },
      {
        "name": "custom_css",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "favicon_url",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "font",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "icons",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": false,
        "description": "`enabled` (default true), `button` (an icon name or null) and `panel_features` (up to three names)."
      },
      {
        "name": "layout",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": true,
        "description": "The page layout: one of two `kind`s."
      },
      {
        "name": "links",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": true,
        "description": "The three footer links."
      },
      {
        "name": "logo_url",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "radius",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      },
      {
        "name": "sandbox_marker",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "description": "`none`, `rail` or `canvas`; left out, `none`."
      },
      {
        "name": "show_powered_by",
        "where": "body",
        "type": "boolean",
        "repeated": false,
        "required": true
      },
      {
        "name": "texts",
        "where": "body",
        "type": "json",
        "repeated": false,
        "required": true
      }
    ]
  },
  "replay_webhook_event_operation": {
    "operationId": "replay_webhook_event_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/webhook-events/{webhook_event_id}/replay",
    "tag": "webhook-events",
    "summary": "Replay a webhook event to one of its endpoints",
    "pathParams": [
      "environment_id",
      "webhook_event_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "endpoint_id",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      }
    ]
  },
  "resend_invitation_operation": {
    "operationId": "resend_invitation_operation",
    "method": "post",
    "path": "/api/v1/tenants/{tenant_id}/invitations/{invitation_id}/resend",
    "tag": "invitations",
    "summary": "Re-send an invitation",
    "pathParams": [
      "tenant_id",
      "invitation_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "reset_branding": {
    "operationId": "reset_branding",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/branding/reset",
    "tag": "branding",
    "summary": "Restore the default branding record",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "reset_email_template": {
    "operationId": "reset_email_template",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/email-templates/{kind}/{locale}/reset",
    "tag": "email-templates",
    "summary": "Reset an email template to the shipped default",
    "pathParams": [
      "environment_id",
      "kind",
      "locale"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "revoke_all_environment_sessions": {
    "operationId": "revoke_all_environment_sessions",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/sessions/revoke-all",
    "tag": "environments",
    "summary": "Revoke every session in the environment",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "revoke_all_user_sessions": {
    "operationId": "revoke_all_user_sessions",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/sessions/revoke-all",
    "tag": "users",
    "summary": "Revoke all of a user's sessions",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "revoke_api_key_operation": {
    "operationId": "revoke_api_key_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/api-keys/{api_key_id}/revoke",
    "tag": "api-keys",
    "summary": "Revoke an API key",
    "pathParams": [
      "environment_id",
      "api_key_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "revoke_invitation_operation": {
    "operationId": "revoke_invitation_operation",
    "method": "delete",
    "path": "/api/v1/tenants/{tenant_id}/invitations/{invitation_id}",
    "tag": "invitations",
    "summary": "Revoke an invitation",
    "pathParams": [
      "tenant_id",
      "invitation_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "rotate_api_key_operation": {
    "operationId": "rotate_api_key_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/api-keys/{api_key_id}/rotate",
    "tag": "api-keys",
    "summary": "Rotate an API key",
    "pathParams": [
      "environment_id",
      "api_key_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "rotate_client_secret": {
    "operationId": "rotate_client_secret",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/clients/{client_id}/rotate-secret",
    "tag": "clients",
    "summary": "Rotate a client secret",
    "pathParams": [
      "environment_id",
      "client_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "rotate_signing_keys_operation": {
    "operationId": "rotate_signing_keys_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/signing-keys/rotate",
    "tag": "signing-keys",
    "summary": "Rotate the signing keys",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": []
  },
  "rotate_webhook_endpoint_secret": {
    "operationId": "rotate_webhook_endpoint_secret",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/webhook-endpoints/{webhook_endpoint_id}/rotate-secret",
    "tag": "webhook-endpoints",
    "summary": "Rotate a webhook endpoint's secret",
    "pathParams": [
      "environment_id",
      "webhook_endpoint_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "send_password_reset_operation": {
    "operationId": "send_password_reset_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/send-password-reset",
    "tag": "users",
    "summary": "Send a password reset email",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "send_verification_operation": {
    "operationId": "send_verification_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/send-verification",
    "tag": "users",
    "summary": "Send a verification email",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "service_info": {
    "operationId": "service_info",
    "method": "get",
    "path": "/api/v1/",
    "tag": "meta",
    "summary": "Service metadata",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "set_user_password": {
    "operationId": "set_user_password",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/password",
    "tag": "users",
    "summary": "Set a user's password",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": []
  },
  "start_checkout_operation": {
    "operationId": "start_checkout_operation",
    "method": "post",
    "path": "/api/v1/account/billing/checkout",
    "tag": "billing",
    "summary": "Start Stripe Checkout",
    "pathParams": [],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "billing_country",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "description": "ISO 3166-1 alpha-2 billing country."
      },
      {
        "name": "interval",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": false,
        "enum": [
          "month",
          "year"
        ]
      },
      {
        "name": "plan",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true,
        "enum": [
          "pro",
          "scale"
        ]
      }
    ]
  },
  "start_my_passkey_registration": {
    "operationId": "start_my_passkey_registration",
    "method": "post",
    "path": "/api/v1/me/passkeys/register/start",
    "tag": "me",
    "summary": "Begin registering one of the caller's own passkeys",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "start_my_totp_enrollment": {
    "operationId": "start_my_totp_enrollment",
    "method": "post",
    "path": "/api/v1/me/mfa/totp/enroll",
    "tag": "me",
    "summary": "Begin the caller's own TOTP enrolment",
    "pathParams": [],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "stream_webhook_events": {
    "operationId": "stream_webhook_events",
    "method": "get",
    "path": "/api/v1/environments/{environment_id}/webhook-events/stream",
    "tag": "webhook-events",
    "summary": "Tail an environment's webhook events",
    "pathParams": [
      "environment_id"
    ],
    "queryParams": [
      "event_types",
      "after"
    ],
    "hasBody": false,
    "fields": [
      {
        "name": "after",
        "where": "query",
        "type": "string",
        "repeated": false,
        "required": false
      },
      {
        "name": "event_types",
        "where": "query",
        "type": "string",
        "repeated": true,
        "required": false
      }
    ]
  },
  "suspend_tenant_operation": {
    "operationId": "suspend_tenant_operation",
    "method": "post",
    "path": "/api/v1/tenants/{tenant_id}/suspend",
    "tag": "tenants",
    "summary": "Suspend a tenant",
    "pathParams": [
      "tenant_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "test_webhook_endpoint": {
    "operationId": "test_webhook_endpoint",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/webhook-endpoints/{webhook_endpoint_id}/test",
    "tag": "webhook-endpoints",
    "summary": "Send a test event to a webhook endpoint",
    "pathParams": [
      "environment_id",
      "webhook_endpoint_id"
    ],
    "queryParams": [],
    "hasBody": true,
    "fields": [
      {
        "name": "event_type",
        "where": "body",
        "type": "string",
        "repeated": false,
        "required": true
      }
    ]
  },
  "unblock_user_operation": {
    "operationId": "unblock_user_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/unblock",
    "tag": "users",
    "summary": "Unblock a user",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "unlink_user_identity": {
    "operationId": "unlink_user_identity",
    "method": "delete",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/identities/{identity_id}",
    "tag": "users",
    "summary": "Unlink a provider account",
    "pathParams": [
      "environment_id",
      "user_id",
      "identity_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "unlock_user_operation": {
    "operationId": "unlock_user_operation",
    "method": "post",
    "path": "/api/v1/environments/{environment_id}/users/{user_id}/unlock",
    "tag": "users",
    "summary": "Clear a user's lockout",
    "pathParams": [
      "environment_id",
      "user_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
  "unsuspend_tenant_operation": {
    "operationId": "unsuspend_tenant_operation",
    "method": "post",
    "path": "/api/v1/tenants/{tenant_id}/unsuspend",
    "tag": "tenants",
    "summary": "Unsuspend a tenant",
    "pathParams": [
      "tenant_id"
    ],
    "queryParams": [],
    "hasBody": false,
    "fields": []
  },
}

/** Every `operationId` this CLI was generated against, for `doctor`. */
export const OPERATION_IDS: readonly string[] = Object.keys(OPERATIONS)
