/**
 * Utility class for AWS SSM Parameter Store operations.
 * Provides validation, error handling, and security helpers.
 */
export class ParamStoreUtil {
  /**
   * List of sensitive keywords that should be masked in logs.
   * Parameters containing these keywords will have their values hidden.
   */
  private static readonly sensitiveKeywords = [
    'password',
    'passwd',
    'pwd',
    'secret',
    'key',
    'token',
    'auth',
    'credential',
    'api_key',
    'apikey',
    'access_key',
    'private',
    'salt',
  ];

  /**
   * Parse a configuration value as boolean.
   * Handles both boolean and string values from ConfigService.
   *
   * @param value - The value to parse (boolean, string, or any)
   * @returns true if value is boolean true or string "true", false otherwise
   *
   * @example
   * ```typescript
   * ParamStoreUtil.parseBoolean(true); // true
   * ParamStoreUtil.parseBoolean('true'); // true
   * ParamStoreUtil.parseBoolean('false'); // false
   * ParamStoreUtil.parseBoolean('anything'); // false
   * ```
   */
  static parseBoolean(
    value: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  ): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return false;
  }

  /**
   * Determines if a parameter key should have its value masked in logs.
   *
   * @param key - The parameter key to check
   * @returns True if the value should be masked, false otherwise
   *
   * @example
   * ```typescript
   * ParamStoreUtil.shouldMaskValue('database-password'); // true
   * ParamStoreUtil.shouldMaskValue('api-secret'); // true
   * ParamStoreUtil.shouldMaskValue('database-host'); // false
   * ```
   */
  static shouldMaskValue(key: string): boolean {
    const lowerKey = key.toLowerCase();
    return this.sensitiveKeywords.some((keyword) => lowerKey.includes(keyword));
  }

  /**
   * Masks a sensitive value for safe logging.
   *
   * @param value - The value to potentially mask
   * @param key - The parameter key (used to determine if masking is needed)
   * @returns Masked value if key is sensitive, original value otherwise
   *
   * @example
   * ```typescript
   * ParamStoreUtil.maskValue('my-secret-123', 'api-secret'); // '***MASKED***'
   * ParamStoreUtil.maskValue('localhost', 'database-host'); // 'localhost'
   * ```
   */
  static maskValue(value: string, key: string): string {
    return this.shouldMaskValue(key) ? '***MASKED***' : value;
  }

  /**
   * Validates the input parameters for AWS SSM operations.
   *
   * @param awsRegion - AWS region to validate
   * @param awsParamStorePath - Parameter Store path to validate
   * @throws Error if validation fails
   */
  static validateParameters(
    awsRegion: string,
    awsParamStorePath: string,
  ): void {
    if (!awsRegion || awsRegion.trim() === '') {
      throw new Error(
        'AWS region is required. Please provide a valid AWS region (e.g., us-east-1)',
      );
    }

    if (!awsParamStorePath || awsParamStorePath.trim() === '') {
      throw new Error(
        'Parameter Store path is required. Please provide a valid path (e.g., /app/config)',
      );
    }

    if (!awsParamStorePath.startsWith('/')) {
      throw new Error(
        `Parameter Store path must start with '/'. Received: '${awsParamStorePath}'`,
      );
    }
  }

  /**
   * Builds a detailed error message based on the error type.
   * Provides context-specific guidance for common AWS SSM errors.
   *
   * @param error - The caught error object
   * @param awsRegion - AWS region being accessed
   * @param awsParamStorePath - Parameter Store path being accessed
   * @returns Formatted error message with context and remediation guidance
   */
  static buildErrorMessage(
    error: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    awsRegion: string,
    awsParamStorePath: string,
  ): string {
    const baseMessage = `Failed to fetch parameters from AWS SSM Parameter Store. Region: '${awsRegion}', Path: '${awsParamStorePath}'`;

    // Check for specific AWS SDK error types
    if (error.name === 'AccessDeniedException') {
      return (
        `${baseMessage} - Access Denied. ` +
        `Ensure the IAM role/user has 'ssm:GetParametersByPath' permission for the specified path. ` +
        `Error: ${error.message}`
      );
    }

    if (error.name === 'ParameterNotFound') {
      return (
        `${baseMessage} - Parameter not found. ` +
        `Verify the path exists in AWS Systems Manager Parameter Store. ` +
        `Error: ${error.message}`
      );
    }

    if (error.name === 'InvalidParameterException') {
      return (
        `${baseMessage} - Invalid parameter. ` +
        `Check that the path format is correct (must start with '/'). ` +
        `Error: ${error.message}`
      );
    }

    if (error.name === 'ThrottlingException') {
      return (
        `${baseMessage} - Request throttled. ` +
        `AWS SSM API rate limit exceeded. Consider implementing retry logic or reducing request frequency. ` +
        `Error: ${error.message}`
      );
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      return (
        `${baseMessage} - Network error. ` +
        `Unable to reach AWS SSM service. Check network connectivity and AWS service status. ` +
        `Error: ${error.message}`
      );
    }

    if (error.message?.includes('Missing credentials')) {
      return (
        `${baseMessage} - Missing AWS credentials. ` +
        `Configure credentials via environment variables, AWS credentials file, or IAM role. ` +
        `Error: ${error.message}`
      );
    }

    // Generic error message for unknown error types
    return `${baseMessage} - ${error.message || 'Unknown error occurred'}`;
  }

  /**
   * Builds a detailed error message for AWS Secrets Manager errors.
   * Provides context-specific guidance for common Secrets Manager errors.
   *
   * @param error - The caught error object
   * @param awsRegion - AWS region being accessed
   * @param secretName - Secret name being accessed
   * @returns Formatted error message with context and remediation guidance
   */
  static buildSecretsManagerErrorMessage(
    error: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    awsRegion: string,
    secretName: string,
  ): string {
    const baseMessage = `Failed to fetch secret '${secretName}' from AWS Secrets Manager in region '${awsRegion}'`;

    // Handle specific AWS Secrets Manager errors
    if (error.name === 'ResourceNotFoundException') {
      return (
        `${baseMessage}: Secret not found. ` +
        `Verify that the secret '${secretName}' exists in region '${awsRegion}'. ` +
        `You can create it in the AWS Secrets Manager console.`
      );
    }

    if (error.name === 'AccessDeniedException') {
      return (
        `${baseMessage}: Access Denied. ` +
        `Ensure your AWS credentials have the required IAM permissions:\n` +
        `  - secretsmanager:GetSecretValue\n` +
        `Resource ARN: arn:aws:secretsmanager:${awsRegion}:*:secret:${secretName}*`
      );
    }

    if (error.name === 'InvalidParameterException') {
      return (
        `${baseMessage}: Invalid parameter. ` +
        `Verify the secret name format is correct. Secret names can contain ` +
        `alphanumeric characters and the characters /_+=.@-`
      );
    }

    if (error.name === 'InvalidRequestException') {
      return (
        `${baseMessage}: Invalid request. ` +
        `The secret may be scheduled for deletion or the request parameters are invalid.`
      );
    }

    if (error.name === 'DecryptionFailure') {
      return (
        `${baseMessage}: Decryption failed. ` +
        `Ensure your KMS key permissions are correct and the key is enabled.`
      );
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      return (
        `${baseMessage}: Network error (${error.code}). ` +
        `Check your network connectivity and AWS service status.`
      );
    }

    if (error.message?.includes('Missing credentials')) {
      return (
        `${baseMessage}: Missing AWS credentials. ` +
        `Configure credentials via environment variables, AWS credentials file, or IAM role.`
      );
    }

    // Generic error message
    const errorMessage = error.message || 'Unknown error occurred';
    return `${baseMessage}: ${errorMessage}`;
  }

  /**
   * Parse secret string from Secrets Manager.
   * Supports both JSON format and plain string format.
   *
   * @param secretString - The secret string from Secrets Manager
   * @param secretName - Name of the secret (for logging)
   * @param logger - Logger instance for debug messages
   * @returns Parsed key-value map
   *
   * @example
   * JSON format:
   * ```typescript
   * parseSecretString('{"username":"admin","password":"secret"}', 'db-creds', logger)
   * // Returns: { username: 'admin', password: 'secret' }
   * ```
   *
   * Plain string format (uses secret name as key):
   * ```typescript
   * parseSecretString('my-api-key-value', 'api-key', logger)
   * // Returns: { 'api-key': 'my-api-key-value' }
   * ```
   */
  static parseSecretString(
    secretString: string,
    secretName: string,
    logger?: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  ): Record<string, string> {
    try {
      // Try parsing as JSON first (most common format)
      const parsed = JSON.parse(secretString);

      // If it's an object, return it
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, string>;
      }

      // If it's a primitive value, use secret name as key
      if (logger) {
        logger.debug(
          `Secret '${secretName}' is not a JSON object. Using secret name as key.`,
        );
      }
      return { [secretName]: String(parsed) };
    } catch {
      // If JSON parsing fails, treat as plain string and use secret name as key
      if (logger) {
        logger.debug(
          `Secret '${secretName}' is not valid JSON. Treating as plain string.`,
        );
      }
      return { [secretName]: secretString };
    }
  }
}
