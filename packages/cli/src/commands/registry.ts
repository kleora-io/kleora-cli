/**
 * The noun/verb grid — the one hand-written decision this CLI makes per
 * command, and deliberately the only one.
 *
 * Everything mechanical about a command (its flags, their types, whether one
 * repeats, what is required) comes from `src/generated/operations.ts`, which is
 * regenerated from the management API's OpenAPI document by
 * `pnpm generate:operations`. What is *here* is what a document cannot know: which
 * operations are commands at all, what the positional argument is, which
 * confirmation the console asks for, and which columns a person wants to see.
 *
 * Three rules this table has to keep, and `test/registry.test.ts` checks all
 * three:
 *
 * * **A verb means the same thing on every noun.** `list` is one page and a
 *   cursor; `get` takes one identifier; `delete` removes one row and asks
 *   first when the console asks first.
 * * **A resource's action verb is the API's action segment**, unchanged.
 * * **Nothing is aliased.** No `ls`, no `rm`, no `kleora app` beside
 *   `kleora apps`.
 *
 * `users erase` is the one place a `DELETE` is not spelled `delete`, and it is
 * not an exception this file invented: the operation's own summary is "Erase a
 * user", and `erase` is the API's own action name for it.
 *
 * **What is deliberately absent.** `webhooks` and `kleora listen`: webhook
 * forwarding is not built yet, and nothing we ship may advertise a capability
 * that is not there, so there is no row, no stub and no mention in `--help`.
 * `set_user_password` and every other operation whose body is a credential: a
 * secret on a command line ends up in shell history and `ps` output. And
 * `branding`, `settings`, `usage`, `billing` and the tenant-scoped role
 * operations, which are management-API reads and writes not yet exposed; each
 * is a row in this table when somebody wants one.
 */
import type { ConfirmSpec } from '../confirm.js'
import type { Column } from '../output.js'
import { OPERATIONS, type GeneratedOperation } from '../generated/operations.js'

/** How a command's single positional argument fills path parameters. */
export interface PositionalSpec {
  /** As it appears in `--help`: `<client-id>`, `<kind>/<locale>`. */
  readonly name: string
  readonly describe: string
  /**
   * The path parameters it fills, in order. More than one means the positional
   * is `/`-separated — which is exactly how email templates are addressed, and
   * exactly the string their reset confirmation asks for.
   */
  readonly pathParams: readonly string[]
  /**
   * Resolve the value to the id the path wants before calling.
   *
   * `app` turns a slug into an App id, so `apps get acme` works. `client` turns
   * an OAuth `client_id` — the value `clients list` prints and an SDK's
   * configuration carries — into the Client row's UUID, which is what
   * `/clients/{client_id}` actually wants.
   */
  readonly resolve?: 'app' | 'client'
}

/** A path parameter filled from a flag rather than the positional. */
export interface FlagParam {
  readonly pathParam: string
  readonly flag: string
  readonly describe: string
  readonly resolve?: 'app'
}

/** How the typed string a confirmation wants is found on the row being changed. */
export type ConfirmExpected =
  /** `UserOut.name`, falling back to `email` when a user has no name. */
  | { readonly from: 'user-name' }
  /** The **production** environment's issuer host, whichever environment was targeted. */
  | { readonly from: 'production-issuer-host' }
  /** The targeted environment's own issuer host. */
  | { readonly from: 'issuer-host' }
  /** The positional, verbatim — `{kind}/{locale}`. */
  | { readonly from: 'positional' }

export interface CommandSpec {
  readonly noun: string
  readonly verb: string
  readonly operationId: string
  /** One line for `--help`. The API's summary where there is nothing to add. */
  readonly summary: string
  /** True when the operation's path carries `{environment_id}`. */
  readonly environmentScoped: boolean
  readonly positional?: PositionalSpec
  readonly flagParams?: readonly FlagParam[]
  readonly confirm?: ConfirmSpec
  readonly confirmExpected?: ConfirmExpected
  /**
   * A confirmation that applies only when a flag is set — `environments
   * update` asks for the issuer host when, and only when, it is switching
   * `tenant_mode` to `single`, which is the one edit on that resource the
   * console makes somebody type for.
   */
  readonly confirmWhen?: { readonly flag: string; readonly equals: string }
  readonly columns?: readonly Column[]
  /** Which keys the human single-object rendering shows. Absent means all of them. */
  readonly detailKeys?: readonly string[]
  /**
   * A response field carrying a secret shown exactly once. The human rendering
   * calls it out and says so; `--json` passes the body through untouched,
   * because a `--json` that dropped a field would be a lie about the API and
   * the person asked for the machine form on purpose.
   */
  readonly shownOnceSecret?: string
}

const ID: Column[] = [{ header: 'ID', path: 'id' }]

/** `list`'s columns for a paginated resource, plus the two every row has. */
function columns(...rest: Column[]): Column[] {
  return [...ID, ...rest]
}

export const COMMANDS: readonly CommandSpec[] = [
  // ---- apps ---------------------------------------------------------------
  {
    noun: 'apps',
    verb: 'list',
    operationId: 'list_apps',
    summary: 'Every App in this Account.',
    environmentScoped: false,
    columns: columns(
      { header: 'SLUG', path: 'slug' },
      { header: 'NAME', path: 'name' },
      { header: 'PLATFORM', path: 'is_platform' },
    ),
  },
  {
    noun: 'apps',
    verb: 'get',
    operationId: 'read_app',
    summary: 'One App, by slug or id.',
    environmentScoped: false,
    positional: { name: '<app>', describe: 'the App slug or id', pathParams: ['app_id'], resolve: 'app' },
  },
  {
    noun: 'apps',
    verb: 'create',
    operationId: 'create_app_operation',
    summary: 'Create an App. Its slug becomes its issuer hostname.',
    environmentScoped: false,
  },
  {
    noun: 'apps',
    verb: 'update',
    operationId: 'patch_app',
    summary: 'Change an App.',
    environmentScoped: false,
    positional: { name: '<app>', describe: 'the App slug or id', pathParams: ['app_id'], resolve: 'app' },
  },
  {
    noun: 'apps',
    verb: 'delete',
    operationId: 'delete_app_operation',
    summary: 'Delete an App and everything under it.',
    environmentScoped: false,
    positional: { name: '<app>', describe: 'the App slug or id', pathParams: ['app_id'], resolve: 'app' },
    confirm: { kind: 'prompt' },
  },

  // ---- environments -------------------------------------------------------
  {
    noun: 'environments',
    verb: 'list',
    operationId: 'list_app_environments',
    summary: "An App's two environments.",
    environmentScoped: false,
    flagParams: [{ pathParam: 'app_id', flag: 'app', describe: 'the App slug or id', resolve: 'app' }],
    columns: columns(
      { header: 'KIND', path: 'kind' },
      { header: 'ISSUER', path: 'issuer' },
      { header: 'TENANT MODE', path: 'tenant_mode' },
    ),
  },
  {
    noun: 'environments',
    verb: 'get',
    operationId: 'read_environment',
    summary: 'One environment, with its session and password policy.',
    environmentScoped: true,
  },
  {
    noun: 'environments',
    verb: 'update',
    operationId: 'patch_environment',
    summary: "Change an environment's settings.",
    environmentScoped: true,
    // As in the console: switching tenant mode from `multi` to `single` asks for the
    // environment's issuer host — "the switch is what makes every future login
    // single-tenant on that host". Every other edit here is an ordinary one.
    confirm: { kind: 'typed', describe: "the environment's issuer host" },
    confirmExpected: { from: 'issuer-host' },
    confirmWhen: { flag: 'tenant-mode', equals: 'single' },
  },
  {
    noun: 'environments',
    verb: 'promote',
    operationId: 'promote_environment',
    summary: 'Copy sandbox configuration into production. Pass --dry-run first.',
    environmentScoped: true,
    // The **production** environment's issuer host, although the route is
    // addressed at sandbox: promotion is source-addressed and its target is
    // the other environment.
    confirm: { kind: 'typed', describe: "the production environment's issuer host" },
    confirmExpected: { from: 'production-issuer-host' },
  },

  // ---- clients ------------------------------------------------------------
  {
    noun: 'clients',
    verb: 'list',
    operationId: 'list_clients',
    summary: "An environment's OAuth clients.",
    environmentScoped: true,
    columns: columns(
      { header: 'CLIENT ID', path: 'client_id' },
      { header: 'NAME', path: 'name' },
      { header: 'KIND', path: 'kind' },
      { header: 'DEFAULT', path: 'is_default' },
    ),
  },
  {
    noun: 'clients',
    verb: 'get',
    operationId: 'read_client',
    summary: 'One client.',
    environmentScoped: true,
    positional: {
      name: '<client>',
      describe: 'the client id, the row id, or the name',
      pathParams: ['client_id'],
      resolve: 'client',
    },
  },
  {
    noun: 'clients',
    verb: 'create',
    operationId: 'create_client_operation',
    summary: 'Register a client. A `web` client is issued a secret, shown once.',
    environmentScoped: true,
    shownOnceSecret: 'client_secret',
  },
  {
    noun: 'clients',
    verb: 'update',
    operationId: 'patch_client',
    summary: 'Change a client.',
    environmentScoped: true,
    positional: {
      name: '<client>',
      describe: 'the client id, the row id, or the name',
      pathParams: ['client_id'],
      resolve: 'client',
    },
  },
  {
    noun: 'clients',
    verb: 'delete',
    operationId: 'delete_client_operation',
    summary: 'Delete a client.',
    environmentScoped: true,
    positional: {
      name: '<client>',
      describe: 'the client id, the row id, or the name',
      pathParams: ['client_id'],
      resolve: 'client',
    },
    confirm: { kind: 'prompt' },
  },
  {
    noun: 'clients',
    verb: 'rotate-secret',
    operationId: 'rotate_client_secret',
    summary: "Mint a new secret for a confidential client. The old one stops working.",
    environmentScoped: true,
    positional: {
      name: '<client>',
      describe: 'the client id, the row id, or the name',
      pathParams: ['client_id'],
      resolve: 'client',
    },
    confirm: { kind: 'prompt' },
    shownOnceSecret: 'client_secret',
  },

  // ---- api-keys -----------------------------------------------------------
  {
    noun: 'api-keys',
    verb: 'list',
    operationId: 'list_api_keys',
    summary: "An environment's API keys, by prefix — never the key itself.",
    environmentScoped: true,
    columns: columns(
      { header: 'NAME', path: 'name' },
      { header: 'PREFIX', path: 'prefix' },
      { header: 'STATUS', path: 'status' },
      { header: 'LAST USED', path: 'last_used_at' },
    ),
  },
  {
    noun: 'api-keys',
    verb: 'get',
    operationId: 'read_api_key',
    summary: 'One API key.',
    environmentScoped: true,
    positional: { name: '<api-key-id>', describe: 'the API key id', pathParams: ['api_key_id'] },
  },
  {
    noun: 'api-keys',
    verb: 'create',
    operationId: 'create_api_key_operation',
    summary: 'Create an API key. The key is shown once and never again.',
    environmentScoped: true,
    shownOnceSecret: 'key',
  },
  {
    noun: 'api-keys',
    verb: 'delete',
    operationId: 'delete_api_key_operation',
    summary: 'Delete an API key.',
    environmentScoped: true,
    positional: { name: '<api-key-id>', describe: 'the API key id', pathParams: ['api_key_id'] },
    confirm: { kind: 'prompt' },
  },
  {
    noun: 'api-keys',
    verb: 'revoke',
    operationId: 'revoke_api_key_operation',
    summary: 'Revoke an API key, keeping the row for the audit trail.',
    environmentScoped: true,
    positional: { name: '<api-key-id>', describe: 'the API key id', pathParams: ['api_key_id'] },
    confirm: { kind: 'prompt' },
  },
  {
    noun: 'api-keys',
    verb: 'rotate',
    operationId: 'rotate_api_key_operation',
    summary: 'Replace an API key. The new key is shown once.',
    environmentScoped: true,
    positional: { name: '<api-key-id>', describe: 'the API key id', pathParams: ['api_key_id'] },
    confirm: { kind: 'prompt' },
    shownOnceSecret: 'key',
  },

  // ---- users --------------------------------------------------------------
  {
    noun: 'users',
    verb: 'list',
    operationId: 'list_users',
    summary: "An environment's users.",
    environmentScoped: true,
    columns: columns(
      { header: 'EMAIL', path: 'email' },
      { header: 'NAME', path: 'name' },
      { header: 'STATUS', path: 'status' },
      { header: 'MFA', path: 'mfa_enrolled' },
    ),
  },
  {
    noun: 'users',
    verb: 'get',
    operationId: 'read_user',
    summary: 'One user.',
    environmentScoped: true,
    positional: { name: '<user-id>', describe: 'the user id', pathParams: ['user_id'] },
  },
  {
    noun: 'users',
    verb: 'create',
    operationId: 'create_user_operation',
    // Deliberately worded without the flag spelling: `completion`'s fish output
    // carries these summaries as descriptions, and a test refuses any
    // credential-shaped flag token anywhere in a generated script — including
    // one that appears only to say it does not exist.
    summary: 'Create a user. There is no flag for a password; the person sets one through a reset.',
    environmentScoped: true,
  },
  {
    noun: 'users',
    verb: 'update',
    operationId: 'patch_user',
    summary: 'Change a user.',
    environmentScoped: true,
    positional: { name: '<user-id>', describe: 'the user id', pathParams: ['user_id'] },
  },
  {
    noun: 'users',
    verb: 'erase',
    operationId: 'delete_user_operation',
    summary: 'Erase a user irreversibly. Requires typing their name back.',
    environmentScoped: true,
    positional: { name: '<user-id>', describe: 'the user id', pathParams: ['user_id'] },
    confirm: { kind: 'typed', describe: "the user's name" },
    confirmExpected: { from: 'user-name' },
  },
  {
    noun: 'users',
    verb: 'block',
    operationId: 'block_user_operation',
    summary: 'Block a user from signing in.',
    environmentScoped: true,
    positional: { name: '<user-id>', describe: 'the user id', pathParams: ['user_id'] },
    confirm: { kind: 'prompt' },
  },
  {
    noun: 'users',
    verb: 'unblock',
    operationId: 'unblock_user_operation',
    summary: 'Let a blocked user sign in again.',
    environmentScoped: true,
    positional: { name: '<user-id>', describe: 'the user id', pathParams: ['user_id'] },
  },
  {
    noun: 'users',
    verb: 'unlock',
    operationId: 'unlock_user_operation',
    summary: 'Clear a lockout from failed sign-ins.',
    environmentScoped: true,
    positional: { name: '<user-id>', describe: 'the user id', pathParams: ['user_id'] },
  },
  {
    noun: 'users',
    verb: 'send-verification',
    operationId: 'send_verification_operation',
    summary: 'Send the address-verification mail again.',
    environmentScoped: true,
    positional: { name: '<user-id>', describe: 'the user id', pathParams: ['user_id'] },
  },
  {
    noun: 'users',
    verb: 'send-password-reset',
    operationId: 'send_password_reset_operation',
    summary: 'Send a password-reset mail. This is how a password gets set.',
    environmentScoped: true,
    positional: { name: '<user-id>', describe: 'the user id', pathParams: ['user_id'] },
  },
  {
    noun: 'users',
    verb: 'export',
    operationId: 'export_user',
    summary: "Everything held about one user, for a subject-access request.",
    environmentScoped: true,
    positional: { name: '<user-id>', describe: 'the user id', pathParams: ['user_id'] },
  },

  // ---- tenants ------------------------------------------------------------
  {
    noun: 'tenants',
    verb: 'list',
    operationId: 'list_tenants',
    summary: "An environment's tenants.",
    environmentScoped: true,
    columns: columns(
      { header: 'SLUG', path: 'slug' },
      { header: 'NAME', path: 'name' },
      { header: 'STATUS', path: 'status' },
      { header: 'MEMBERS', path: 'member_count' },
    ),
  },
  {
    noun: 'tenants',
    verb: 'get',
    operationId: 'read_tenant',
    summary: 'One tenant.',
    environmentScoped: false,
    positional: { name: '<tenant-id>', describe: 'the tenant id', pathParams: ['tenant_id'] },
  },
  {
    noun: 'tenants',
    verb: 'create',
    operationId: 'create_tenant_operation',
    summary: 'Create a tenant.',
    environmentScoped: true,
  },
  {
    noun: 'tenants',
    verb: 'update',
    operationId: 'patch_tenant',
    summary: 'Change a tenant.',
    environmentScoped: false,
    positional: { name: '<tenant-id>', describe: 'the tenant id', pathParams: ['tenant_id'] },
  },
  {
    noun: 'tenants',
    verb: 'delete',
    operationId: 'delete_tenant_operation',
    summary: 'Delete a tenant and its memberships.',
    environmentScoped: false,
    positional: { name: '<tenant-id>', describe: 'the tenant id', pathParams: ['tenant_id'] },
    confirm: { kind: 'prompt' },
  },
  {
    noun: 'tenants',
    verb: 'suspend',
    operationId: 'suspend_tenant_operation',
    summary: 'Suspend a tenant. Its members cannot sign in.',
    environmentScoped: false,
    positional: { name: '<tenant-id>', describe: 'the tenant id', pathParams: ['tenant_id'] },
    confirm: { kind: 'prompt' },
  },
  {
    noun: 'tenants',
    verb: 'unsuspend',
    operationId: 'unsuspend_tenant_operation',
    summary: 'Lift a tenant suspension.',
    environmentScoped: false,
    positional: { name: '<tenant-id>', describe: 'the tenant id', pathParams: ['tenant_id'] },
    confirm: { kind: 'prompt' },
  },

  // ---- members ------------------------------------------------------------
  {
    noun: 'members',
    verb: 'list',
    operationId: 'list_members',
    summary: "A tenant's members.",
    environmentScoped: false,
    flagParams: [{ pathParam: 'tenant_id', flag: 'tenant', describe: 'the tenant id' }],
    columns: columns(
      { header: 'EMAIL', path: 'user.email' },
      { header: 'NAME', path: 'user.name' },
      { header: 'STATUS', path: 'status' },
    ),
  },
  {
    noun: 'members',
    verb: 'get',
    operationId: 'read_member',
    summary: 'One membership.',
    environmentScoped: false,
    flagParams: [{ pathParam: 'tenant_id', flag: 'tenant', describe: 'the tenant id' }],
    positional: { name: '<member-id>', describe: 'the member id', pathParams: ['member_id'] },
  },
  {
    noun: 'members',
    verb: 'create',
    operationId: 'add_member_operation',
    summary: 'Add an existing user to a tenant, with roles.',
    environmentScoped: false,
    flagParams: [{ pathParam: 'tenant_id', flag: 'tenant', describe: 'the tenant id' }],
  },
  {
    noun: 'members',
    verb: 'update',
    operationId: 'patch_member',
    summary: "Change a member's roles or status.",
    environmentScoped: false,
    flagParams: [{ pathParam: 'tenant_id', flag: 'tenant', describe: 'the tenant id' }],
    positional: { name: '<member-id>', describe: 'the member id', pathParams: ['member_id'] },
  },
  {
    noun: 'members',
    verb: 'delete',
    operationId: 'remove_member_operation',
    summary: 'Remove somebody from a tenant.',
    environmentScoped: false,
    flagParams: [{ pathParam: 'tenant_id', flag: 'tenant', describe: 'the tenant id' }],
    positional: { name: '<member-id>', describe: 'the member id', pathParams: ['member_id'] },
    confirm: { kind: 'prompt' },
  },

  // ---- roles --------------------------------------------------------------
  {
    noun: 'roles',
    verb: 'list',
    operationId: 'list_roles',
    summary: "An environment's roles.",
    environmentScoped: true,
    columns: columns(
      { header: 'SLUG', path: 'slug' },
      { header: 'NAME', path: 'name' },
      { header: 'SCOPE', path: 'scope' },
      { header: 'SYSTEM', path: 'is_system' },
    ),
  },
  {
    noun: 'roles',
    verb: 'get',
    operationId: 'read_role',
    summary: 'One role, with its permissions.',
    environmentScoped: false,
    positional: { name: '<role-id>', describe: 'the role id', pathParams: ['role_id'] },
  },
  {
    noun: 'roles',
    verb: 'create',
    operationId: 'create_role_operation',
    summary: 'Create an environment-scoped role.',
    environmentScoped: true,
  },
  {
    noun: 'roles',
    verb: 'update',
    operationId: 'patch_role',
    summary: 'Rename or re-describe a role.',
    environmentScoped: false,
    positional: { name: '<role-id>', describe: 'the role id', pathParams: ['role_id'] },
  },
  {
    noun: 'roles',
    verb: 'delete',
    operationId: 'delete_role_operation',
    summary: 'Delete a role.',
    environmentScoped: false,
    positional: { name: '<role-id>', describe: 'the role id', pathParams: ['role_id'] },
    confirm: { kind: 'prompt' },
  },
  {
    noun: 'roles',
    verb: 'permissions',
    operationId: 'put_role_permissions',
    summary: "Replace a role's whole permission set.",
    environmentScoped: false,
    positional: { name: '<role-id>', describe: 'the role id', pathParams: ['role_id'] },
    confirm: { kind: 'prompt' },
  },

  // ---- permissions --------------------------------------------------------
  {
    noun: 'permissions',
    verb: 'list',
    operationId: 'list_permissions',
    summary: "An environment's permissions, yours and the reserved ones.",
    environmentScoped: true,
    columns: columns(
      { header: 'NAME', path: 'name' },
      { header: 'SYSTEM', path: 'is_system' },
      { header: 'DESCRIPTION', path: 'description' },
    ),
  },
  {
    noun: 'permissions',
    verb: 'get',
    operationId: 'read_permission',
    summary: 'One permission.',
    environmentScoped: false,
    positional: { name: '<permission-id>', describe: 'the permission id', pathParams: ['permission_id'] },
  },
  {
    noun: 'permissions',
    verb: 'create',
    operationId: 'create_permission_operation',
    summary: 'Create a permission of your own, outside the reserved namespace.',
    environmentScoped: true,
  },
  {
    noun: 'permissions',
    verb: 'update',
    operationId: 'patch_permission',
    summary: 'Re-describe a permission.',
    environmentScoped: false,
    positional: { name: '<permission-id>', describe: 'the permission id', pathParams: ['permission_id'] },
  },
  {
    noun: 'permissions',
    verb: 'delete',
    operationId: 'delete_permission_operation',
    summary: 'Delete a permission you created.',
    environmentScoped: false,
    positional: { name: '<permission-id>', describe: 'the permission id', pathParams: ['permission_id'] },
    confirm: { kind: 'prompt' },
  },

  // ---- invitations --------------------------------------------------------
  {
    noun: 'invitations',
    verb: 'list',
    operationId: 'list_invitations',
    summary: "A tenant's invitations.",
    environmentScoped: false,
    flagParams: [{ pathParam: 'tenant_id', flag: 'tenant', describe: 'the tenant id' }],
    columns: columns(
      { header: 'EMAIL', path: 'email' },
      { header: 'STATUS', path: 'status' },
      { header: 'EXPIRES', path: 'expires_at' },
    ),
  },
  {
    noun: 'invitations',
    verb: 'create',
    operationId: 'create_invitation_operation',
    summary: 'Invite somebody to a tenant by email.',
    environmentScoped: false,
    flagParams: [{ pathParam: 'tenant_id', flag: 'tenant', describe: 'the tenant id' }],
  },
  {
    noun: 'invitations',
    verb: 'delete',
    operationId: 'revoke_invitation_operation',
    summary: 'Revoke an open invitation.',
    environmentScoped: false,
    flagParams: [{ pathParam: 'tenant_id', flag: 'tenant', describe: 'the tenant id' }],
    positional: { name: '<invitation-id>', describe: 'the invitation id', pathParams: ['invitation_id'] },
    confirm: { kind: 'prompt' },
  },
  {
    noun: 'invitations',
    verb: 'resend',
    operationId: 'resend_invitation_operation',
    summary: 'Send an invitation mail again.',
    environmentScoped: false,
    flagParams: [{ pathParam: 'tenant_id', flag: 'tenant', describe: 'the tenant id' }],
    positional: { name: '<invitation-id>', describe: 'the invitation id', pathParams: ['invitation_id'] },
  },

  // ---- signing-keys -------------------------------------------------------
  {
    noun: 'signing-keys',
    verb: 'list',
    operationId: 'list_signing_keys',
    summary: "An environment's signing keys and their status.",
    environmentScoped: true,
    columns: columns(
      { header: 'KID', path: 'kid' },
      { header: 'STATUS', path: 'status' },
      { header: 'ALGORITHM', path: 'algorithm' },
      { header: 'ACTIVATED', path: 'activated_at' },
    ),
  },
  {
    noun: 'signing-keys',
    verb: 'rotate',
    operationId: 'rotate_signing_keys_operation',
    summary: 'Rotate the signing keys. Needs both acknowledgement flags.',
    environmentScoped: true,
    // As in the console: two checkboxes, each stating a
    // distinct real consequence, rather than retyping a `kid` — "a checkbox a
    // person had to read is worth more than a string they pattern-matched".
    confirm: {
      kind: 'acknowledge',
      acknowledgements: [
        {
          flag: 'ack-jwks-window',
          consequence:
            'Tokens signed with the current key keep verifying only while it remains in the JWKS.',
        },
        {
          flag: 'ack-no-pinning',
          consequence: 'No consumer pins this key — anything that does will stop verifying.',
        },
      ],
    },
  },

  // ---- email-templates ----------------------------------------------------
  {
    noun: 'email-templates',
    verb: 'list',
    operationId: 'list_email_templates',
    summary: "An environment's email templates.",
    environmentScoped: true,
    columns: [
      { header: 'KIND', path: 'kind' },
      { header: 'LOCALE', path: 'locale' },
      { header: 'SUBJECT', path: 'subject' },
      { header: 'DEFAULT', path: 'is_default' },
    ],
  },
  {
    noun: 'email-templates',
    verb: 'get',
    operationId: 'read_email_template',
    summary: 'One template, by `{kind}/{locale}`.',
    environmentScoped: true,
    positional: {
      name: '<kind>/<locale>',
      describe: "the template's kind and locale",
      pathParams: ['kind', 'locale'],
    },
  },
  {
    noun: 'email-templates',
    verb: 'update',
    operationId: 'put_email_template',
    summary: 'Replace a template.',
    environmentScoped: true,
    positional: {
      name: '<kind>/<locale>',
      describe: "the template's kind and locale",
      pathParams: ['kind', 'locale'],
    },
  },
  {
    noun: 'email-templates',
    verb: 'reset',
    operationId: 'reset_email_template',
    summary: 'Discard a customised template and go back to the default.',
    environmentScoped: true,
    positional: {
      name: '<kind>/<locale>',
      describe: "the template's kind and locale",
      pathParams: ['kind', 'locale'],
    },
    // As in the console: "resetting a template asks for its `{kind}/{locale}`, the
    // row's natural key rather than a display name — a reset discards a
    // customised template irreversibly, and there is no undo".
    confirm: { kind: 'typed', describe: "the template's {kind}/{locale}" },
    confirmExpected: { from: 'positional' },
  },
]

/** `apps list` → its row, or `undefined`. */
export function findCommand(noun: string, verb: string): CommandSpec | undefined {
  return COMMANDS.find((command) => command.noun === noun && command.verb === verb)
}

/** Every noun, in the order the table lists them — what `--help` prints. */
export function nouns(): readonly string[] {
  const seen: string[] = []
  for (const command of COMMANDS) if (!seen.includes(command.noun)) seen.push(command.noun)
  return seen
}

export function verbsFor(noun: string): readonly CommandSpec[] {
  return COMMANDS.filter((command) => command.noun === noun)
}

/** The generated operation a row names. Throws at import time if it is gone. */
export function operationFor(command: CommandSpec): GeneratedOperation {
  const operation = OPERATIONS[command.operationId]
  if (!operation) {
    throw new Error(
      `registry names operationId '${command.operationId}', which is not in the generated ` +
        'operations — run `pnpm generate:operations`',
    )
  }
  return operation
}
