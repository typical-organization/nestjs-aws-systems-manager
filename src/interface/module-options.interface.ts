/**
 * Configuration options for the ParamStoreModule.
 *
 * These options control how the module fetches and processes parameters
 * from AWS Systems Manager Parameter Store and AWS Secrets Manager.
 *
 * @example
 * Basic configuration:
 * ```typescript
 * {
 *   awsRegion: 'us-east-1',
 *   awsParamStorePath: '/app/config',
 *   awsParamStoreContinueOnError: false
 * }
 * ```
 *
 * @example
 * With parameter hierarchy enabled:
 * ```typescript
 * {
 *   awsRegion: 'us-east-1',
 *   awsParamStorePath: '/app/config',
 *   awsParamStoreContinueOnError: false,
 *   preserveHierarchy: true,
 *   pathSeparator: '.'
 * }
 * ```
 *
 * @example
 * With Secrets Manager support:
 * ```typescript
 * {
 *   awsRegion: 'us-east-1',
 *   awsParamStorePath: '/app/config',
 *   awsParamStoreContinueOnError: false,
 *   useSecretsManager: true,
 *   secretsManagerSecretNames: ['prod/db/credentials', 'prod/api/keys']
 * }
 * ```
 */
export interface ModuleOptions {
  /**
   * AWS region where the Parameter Store parameters are located.
   *
   * @example 'us-east-1', 'eu-west-1', 'ap-south-1'
   */
  awsRegion: string;

  /**
   * Parameter Store path to fetch parameters from.
   * Must start with a forward slash '/'.
   * All parameters under this path (recursively) will be fetched.
   *
   * @example '/app/config', '/production/database', '/staging/api'
   */
  awsParamStorePath: string;

  /**
   * Whether to continue application startup if parameter fetching fails.
   *
   * - `true`: Log warning and continue with empty parameters
   * - `false`: Throw error and prevent application startup (recommended for production)
   *
   * @default false
   */
  awsParamStoreContinueOnError: boolean;

  /**
   * Whether to preserve the hierarchical structure of parameter paths.
   *
   * - `false` (default): Only store the last segment of the path
   *   Example: `/app/config/database/host` → key: `host`
   *
   * - `true`: Preserve relative path structure with custom separator
   *   Example: `/app/config/database/host` → key: `database.host` (with separator='.')
   *
   * @default false
   */
  preserveHierarchy?: boolean;

  /**
   * Separator character to use when joining path segments in hierarchical mode.
   * Only used when `preserveHierarchy` is true.
   *
   * @default '.'
   * @example '.', '/', '_', ':'
   */
  pathSeparator?: string;

  /**
   * Whether to enable debug logging of parameter loading.
   * When enabled, parameter keys and masked values will be logged.
   * Sensitive parameter values (passwords, secrets, keys, tokens) are automatically masked.
   *
   * - `true`: Log parameter keys with masked values for debugging
   * - `false`: Do not log any parameter information (recommended for production)
   *
   * @default false
   */
  enableParameterLogging?: boolean;

  /**
   * Whether to fetch secrets from AWS Secrets Manager in addition to Parameter Store.
   * When enabled, secrets from the specified secret names will be fetched and merged with parameters.
   *
   * - `true`: Fetch secrets from Secrets Manager
   * - `false`: Only use Parameter Store (default)
   *
   * @default false
   */
  useSecretsManager?: boolean;

  /**
   * Array of secret names to fetch from AWS Secrets Manager.
   * Only used when `useSecretsManager` is true.
   * Each secret's key-value pairs will be merged with Parameter Store parameters.
   *
   * @example ['prod/database/credentials', 'prod/api/keys', 'shared/config']
   */
  secretsManagerSecretNames?: string[];
}
