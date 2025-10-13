/**
 * Dependency injection token for the AWS Parameter Store provider.
 * Used internally to inject the fetched parameters into the service.
 */
export const AWS_PARAM_STORE_PROVIDER = 'AWS_PARAM_STORE_PROVIDER';

/**
 * Dependency injection token for the AWS Secrets Manager provider.
 * Used internally to inject the fetched secrets into the service.
 */
export const AWS_SECRETS_MANAGER_PROVIDER = 'AWS_SECRETS_MANAGER_PROVIDER';

/**
 * Configuration key for AWS region in ConfigService.
 * Expected value: AWS region string (e.g., 'us-east-1', 'eu-west-1')
 */
export const AWS_REGION = 'param-store.awsRegion';

/**
 * Configuration key for Parameter Store path in ConfigService.
 * Expected value: Path string starting with '/' (e.g., '/app/config', '/production/db')
 */
export const AWS_PARAM_STORE_PATH = 'param-store.awsParamStorePath';

/**
 * Configuration key for continue-on-error flag in ConfigService.
 * Expected value: Boolean indicating whether to continue app startup on parameter fetch failure
 */
export const AWS_PARAM_STORE_CONTINUE_ON_ERROR =
  'param-store.awsParamStoreContinueOnError';

/**
 * Configuration key for hierarchy preservation flag in ConfigService.
 * Expected value: Boolean indicating whether to preserve parameter path hierarchy
 */
export const AWS_PARAM_STORE_PRESERVE_HIERARCHY =
  'param-store.preserveHierarchy';

/**
 * Configuration key for path separator in ConfigService.
 * Expected value: String separator to use when joining hierarchical paths (e.g., '.', '/', '_')
 * Only used when preserveHierarchy is true.
 */
export const AWS_PARAM_STORE_PATH_SEPARATOR = 'param-store.pathSeparator';

/**
 * Configuration key for parameter logging flag in ConfigService.
 * Expected value: Boolean indicating whether to enable debug logging of parameter loading
 * When enabled, parameter keys and masked values are logged for debugging purposes.
 */
export const AWS_PARAM_STORE_ENABLE_LOGGING =
  'param-store.enableParameterLogging';

/**
 * Configuration key for Secrets Manager usage flag in ConfigService.
 * Expected value: Boolean indicating whether to fetch secrets from AWS Secrets Manager
 */
export const AWS_SECRETS_MANAGER_ENABLED = 'param-store.useSecretsManager';

/**
 * Configuration key for Secrets Manager secret names in ConfigService.
 * Expected value: Array of secret name strings to fetch from Secrets Manager
 * Example: ['prod/database/credentials', 'prod/api/keys']
 */
export const AWS_SECRETS_MANAGER_SECRET_NAMES =
  'param-store.secretsManagerSecretNames';
