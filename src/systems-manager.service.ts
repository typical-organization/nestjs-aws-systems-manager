import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AWS_PARAM_STORE_PROVIDER,
  AWS_SECRETS_MANAGER_PROVIDER,
} from './constants';
import {
  SystemsManagerParameters,
  SystemsManagerSecrets,
  ModuleOptions,
} from './interface';
import { Parameter } from '@aws-sdk/client-ssm';
import {
  ParameterStoreFetcherService,
  SecretsManagerFetcherService,
} from './services';
import { ParamStoreUtil } from './utils/param-store.util';

/**
 * Service for accessing AWS Systems Manager Parameter Store parameters.
 *
 * This service provides a simple interface to retrieve configuration parameters
 * that are fetched from AWS SSM Parameter Store at application startup and cached
 * in memory for fast runtime access.
 *
 * @example
 * Basic usage:
 * ```typescript
 * constructor(private systemsManagerService: SystemsManagerService) {
 *   // Get string parameter
 *   const dbHost = this.systemsManagerService.get('database-host');
 *
 *   // Get numeric parameter
 *   const port = this.systemsManagerService.getAsNumber('port');
 *
 *   // Get with default value
 *   const timeout = this.systemsManagerService.getOrDefault('timeout', '30');
 *
 *   // Parse boolean
 *   const debugMode = this.systemsManagerService.getAsBoolean('debug-enabled');
 * }
 * ```
 *
 * @example
 * Hierarchical parameter access (when preserveHierarchy is enabled):
 * ```typescript
 * // For parameter /app/config/database/host
 * const dbHost = this.systemsManagerService.get('database.host');
 *
 * // For parameter /app/config/api/key
 * const apiKey = this.systemsManagerService.get('api.key');
 * ```
 */
@Injectable()
export class SystemsManagerService {
  private readonly logger = new Logger(SystemsManagerService.name);
  private _parameters: SystemsManagerParameters = {};
  private _secrets: SystemsManagerSecrets = {};

  constructor(
    @Inject(AWS_PARAM_STORE_PROVIDER) awsParameters: Parameter[],
    @Inject(AWS_SECRETS_MANAGER_PROVIDER) awsSecrets: Record<string, string>,
    @Inject('PARAM_STORE_CONFIG') private readonly config: ModuleOptions,
    private readonly parameterFetcher: ParameterStoreFetcherService,
    private readonly secretsFetcher: SecretsManagerFetcherService,
  ) {
    this.loadParameters(awsParameters);
    this.loadSecrets(awsSecrets);
  }

  /**
   * Load parameters from AWS Parameter array into internal storage
   * @param awsParameters - Array of AWS SSM parameters
   */
  private loadParameters(awsParameters: Parameter[]): void {
    this._parameters = {};
    awsParameters.forEach((parameter) => {
      if (parameter.Name && parameter.Value !== undefined) {
        const key = this.extractParameterKey(parameter.Name);
        this._parameters[key] = parameter.Value;

        // Debug log with masked values for sensitive parameters (only if logging is enabled)
        if (this.config.enableParameterLogging) {
          const maskedValue = ParamStoreUtil.maskValue(parameter.Value, key);
          this.logger.debug(`Loaded parameter: ${key} = ${maskedValue}`);
        }
      }
    });

    // Log summary of loaded parameters
    if (this.config.enableParameterLogging) {
      this.logger.log(
        `Loaded ${awsParameters.length} parameter(s) into service`,
      );
    }
  }

  /**
   * Load secrets from AWS Secrets Manager into internal storage
   * @param awsSecrets - Record of secret names to their values
   */
  private loadSecrets(awsSecrets: Record<string, string>): void {
    this._secrets = { ...awsSecrets };

    // Log summary of loaded secrets (never log actual values)
    const secretCount = Object.keys(awsSecrets).length;
    if (secretCount > 0) {
      this.logger.log(
        `Loaded ${secretCount} secret(s) from AWS Secrets Manager`,
      );
      if (this.config.enableParameterLogging) {
        this.logger.debug(
          `Secret names: ${Object.keys(awsSecrets).join(', ')}`,
        );
      }
    }
  }

  /**
   * Extract parameter key from full AWS parameter path
   * Supports both flat (last segment only) and hierarchical (relative path) modes
   * @param fullPath - Full AWS parameter path (e.g., /app/config/database/host)
   * @returns Extracted key based on preserveHierarchy setting
   */
  private extractParameterKey(fullPath: string): string {
    if (!this.config.preserveHierarchy) {
      // Default behavior: return only the last segment
      const tokens = fullPath.split('/');
      return tokens[tokens.length - 1];
    }

    // Hierarchical mode: preserve path structure relative to base path
    const basePath = this.config.awsParamStorePath;
    const separator = this.config.pathSeparator || '.';

    // Remove base path and leading/trailing slashes using string operations
    let relativePath = fullPath.replace(basePath, '');
    
    // Remove leading slashes
    let start = 0;
    while (start < relativePath.length && relativePath[start] === '/') {
      start++;
    }
    
    // Remove trailing slashes
    let end = relativePath.length;
    while (end > start && relativePath[end - 1] === '/') {
      end--;
    }
    
    relativePath = relativePath.slice(start, end);

    // Convert slashes to separator
    return relativePath.split('/').filter(Boolean).join(separator);
  }

  /**
   * Retrieve a parameter value as a string.
   *
   * @param key - The parameter key to retrieve. For flat mode, this is the last segment
   *              of the parameter path. For hierarchical mode, this is the relative path
   *              with custom separator (e.g., 'database.host').
   * @returns The parameter value as a string, or undefined if not found
   *
   * @example
   * ```typescript
   * // For parameter /app/config/api-key stored in flat mode
   * const apiKey = systemsManagerService.get('api-key');
   *
   * // For parameter /app/config/database/host in hierarchical mode
   * const dbHost = systemsManagerService.get('database.host');
   * ```
   */
  /**
   * Retrieve a parameter value from Parameter Store.
   *
   * @param key - The parameter key to retrieve
   * @returns The parameter value as a string, or undefined if not found
   *
   * @example
   * ```typescript
   * const apiKey = systemsManagerService.getParameter('api-key');
   * ```
   */
  getParameter(key: string): string {
    return this._parameters[key];
  }

  /**
   * Retrieve a secret value from Secrets Manager.
   *
   * @param key - The secret name to retrieve
   * @returns The secret value as a string, or undefined if not found
   *
   * @example
   * ```typescript
   * const dbPassword = systemsManagerService.getSecret('database-password');
   * ```
   */
  getSecret(key: string): string {
    return this._secrets[key];
  }

  /**
   * Retrieve a value from either Parameter Store or Secrets Manager.
   * Checks parameters first, then secrets.
   *
   * @param key - The key to retrieve
   * @returns The value as a string, or undefined if not found in either store
   *
   * @example
   * ```typescript
   * const value = systemsManagerService.get('api-key'); // Checks both parameters and secrets
   * ```
   */
  get(key: string): string {
    return this._parameters[key] ?? this._secrets[key];
  }

  /**
   * Retrieve a parameter value and convert it to a number.
   *
   * @param key - The parameter key to retrieve
   * @returns The parameter value converted to a number, or NaN if conversion fails or key not found
   *
   * @example
   * ```typescript
   * const port = systemsManagerService.getAsNumber('database-port'); // 5432
   * const timeout = systemsManagerService.getAsNumber('timeout'); // 30
   * ```
   */
  getAsNumber(key: string): number {
    const value = this.get(key);
    return value ? +value : NaN;
  }

  /**
   * Get parameter value with fallback default
   * @param key - The parameter key to retrieve
   * @param defaultValue - The default value to return if the key doesn't exist
   * @returns The parameter value or the default value
   */
  getOrDefault(key: string, defaultValue: string): string {
    return this.get(key) ?? defaultValue;
  }

  /**
   * Parse parameter as boolean
   * @param key - The parameter key to retrieve
   * @returns Boolean interpretation of the parameter value
   */
  getAsBoolean(key: string): boolean {
    const value = this.get(key)?.toLowerCase();
    return value === 'true' || value === '1' || value === 'yes';
  }

  /**
   * Parse parameter as JSON object
   * @param key - The parameter key to retrieve
   * @returns Parsed JSON object
   * @throws SyntaxError if the value is not valid JSON
   */
  getAsJSON<T>(key: string): T {
    const value = this.get(key);
    return JSON.parse(value) as T;
  }

  /**
   * Check if parameter exists
   * @param key - The parameter key to check
   * @returns True if the parameter exists, false otherwise
   */
  /**
   * Check if a parameter exists in Parameter Store
   * @param key - The parameter key to check
   * @returns True if the parameter exists, false otherwise
   */
  hasParameter(key: string): boolean {
    return key in this._parameters;
  }

  /**
   * Check if a secret exists in Secrets Manager
   * @param key - The secret name to check
   * @returns True if the secret exists, false otherwise
   */
  hasSecret(key: string): boolean {
    return key in this._secrets;
  }

  /**
   * Check if a key exists in either Parameter Store or Secrets Manager
   * @param key - The key to check
   * @returns True if the key exists in either store, false otherwise
   */
  has(key: string): boolean {
    return this.hasParameter(key) || this.hasSecret(key);
  }

  /**
   * Get all parameter keys
   * @returns Array of all parameter keys
   */
  /**
   * Get all parameter keys from Parameter Store
   * @returns Array of all parameter keys
   */
  getAllParameterKeys(): string[] {
    return Object.keys(this._parameters);
  }

  /**
   * Get all secret names from Secrets Manager
   * @returns Array of all secret names
   */
  getAllSecretKeys(): string[] {
    return Object.keys(this._secrets);
  }

  /**
   * Get all keys from both Parameter Store and Secrets Manager
   * @returns Array of all keys (parameters and secrets combined)
   */
  getAllKeys(): string[] {
    return [...this.getAllParameterKeys(), ...this.getAllSecretKeys()];
  }

  /**
   * Get all parameters as object
   * @returns Copy of all parameters
   */
  /**
   * Get all parameters from Parameter Store
   * @returns Copy of all parameters
   */
  getAllParameters(): SystemsManagerParameters {
    return { ...this._parameters };
  }

  /**
   * Get all secrets from Secrets Manager
   * @returns Copy of all secrets
   */
  getAllSecrets(): SystemsManagerSecrets {
    return { ...this._secrets };
  }

  /**
   * Get all parameters and secrets combined
   * @returns Copy of all parameters and secrets merged (secrets override parameters if keys conflict)
   */
  getAll(): SystemsManagerParameters & SystemsManagerSecrets {
    return { ...this._parameters, ...this._secrets };
  }

  /**
   * Refresh parameters from AWS SSM Parameter Store
   * This method re-fetches all parameters from AWS and updates the internal cache
   * @returns Promise that resolves when parameters are refreshed
   * @throws Error if fetching parameters fails (when continueOnError is false)
   */
  /**
   * Refresh both parameters and secrets from AWS
   * This method re-fetches all parameters from Parameter Store and secrets from Secrets Manager
   * and updates the internal caches
   * @returns Promise that resolves when refresh is complete
   * @throws Error if fetching fails (when continueOnError is false)
   */
  async refresh(): Promise<void> {
    // Refresh parameters
    const parameters = await this.parameterFetcher.fetchParameters(
      this.config.awsRegion,
      this.config.awsParamStorePath,
      this.config.awsParamStoreContinueOnError || false,
    );
    this.loadParameters(parameters);

    // Refresh secrets if enabled
    if (
      this.config.useSecretsManager &&
      this.config.secretsManagerSecretNames &&
      this.config.secretsManagerSecretNames.length > 0
    ) {
      const secrets = await this.secretsFetcher.fetchSecrets(
        this.config.awsRegion,
        this.config.secretsManagerSecretNames,
        this.config.awsParamStoreContinueOnError || false,
      );
      this.loadSecrets(secrets);
    }
  }

  /**
   * Refresh only parameters from AWS Parameter Store
   * @returns Promise that resolves when parameters are refreshed
   * @throws Error if fetching fails (when continueOnError is false)
   */
  async refreshParameters(): Promise<void> {
    const parameters = await this.parameterFetcher.fetchParameters(
      this.config.awsRegion,
      this.config.awsParamStorePath,
      this.config.awsParamStoreContinueOnError || false,
    );
    this.loadParameters(parameters);
  }

  /**
   * Refresh only secrets from AWS Secrets Manager
   * @returns Promise that resolves when secrets are refreshed
   * @throws Error if fetching fails or Secrets Manager is not enabled
   */
  async refreshSecrets(): Promise<void> {
    if (
      !this.config.useSecretsManager ||
      !this.config.secretsManagerSecretNames ||
      this.config.secretsManagerSecretNames.length === 0
    ) {
      throw new Error(
        'Secrets Manager is not enabled or no secret names configured',
      );
    }

    const secrets = await this.secretsFetcher.fetchSecrets(
      this.config.awsRegion,
      this.config.secretsManagerSecretNames,
      this.config.awsParamStoreContinueOnError || false,
    );
    this.loadSecrets(secrets);
  }
}
