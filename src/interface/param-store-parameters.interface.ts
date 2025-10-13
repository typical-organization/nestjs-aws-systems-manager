/**
 * Key-value map of parameter names to their values.
 *
 * This interface represents the internal storage structure for parameters
 * fetched from AWS Systems Manager Parameter Store.
 *
 * @example
 * Flat mode (default):
 * ```typescript
 * {
 *   "database-host": "localhost",
 *   "database-port": "5432",
 *   "api-key": "secret-key-123"
 * }
 * ```
 *
 * @example
 * Hierarchical mode (preserveHierarchy: true):
 * ```typescript
 * {
 *   "database.host": "localhost",
 *   "database.port": "5432",
 *   "api.key": "secret-key-123"
 * }
 * ```
 */
export interface SystemsManagerParameters {
  /**
   * Parameter key mapped to its string value.
   * The key format depends on the preserveHierarchy setting.
   */
  [key: string]: string;
}

/**
 * Key-value map of secret names to their values.
 *
 * This interface represents the internal storage structure for secrets
 * fetched from AWS Secrets Manager.
 *
 * @example
 * ```typescript
 * {
 *   "database-credentials": "{\"username\":\"admin\",\"password\":\"secret123\"}",
 *   "api-key": "sk-1234567890abcdef",
 *   "oauth-token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 * }
 * ```
 */
export interface SystemsManagerSecrets {
  /**
   * Secret name mapped to its string value.
   * Can be a JSON string or plain text depending on the secret format.
   */
  [key: string]: string;
}
