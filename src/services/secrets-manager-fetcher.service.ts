import { Injectable, Logger } from '@nestjs/common';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { ParamStoreUtil } from '../utils/param-store.util';

/**
 * Injectable service for fetching secrets from AWS Secrets Manager.
 *
 * This service handles the communication with AWS Secrets Manager, including:
 * - Concurrent fetching of multiple secrets
 * - Automatic JSON parsing for string secrets
 * - Error handling with detailed logging
 * - Support for both binary and string secrets
 *
 * @example
 * ```typescript
 * constructor(private readonly fetcher: SecretsManagerFetcherService) {}
 *
 * async fetchSecrets() {
 *   const secrets = await this.fetcher.fetchSecrets(
 *     'us-east-1',
 *     ['db-password', 'api-key'],
 *     false
 *   );
 *   console.log(secrets['db-password']);
 * }
 * ```
 */
@Injectable()
export class SecretsManagerFetcherService {
  private readonly logger = new Logger(SecretsManagerFetcherService.name);

  /**
   * Fetch multiple secrets from AWS Secrets Manager concurrently.
   *
   * This method retrieves secrets in parallel for better performance,
   * automatically handles both string and binary secrets, and provides
   * detailed error messages for troubleshooting.
   *
   * @param awsRegion - AWS region where secrets are stored (e.g., 'us-east-1')
   * @param secretNames - Array of secret names to fetch
   * @param continueOnError - If true, logs errors but continues; if false, throws on first error
   * @returns Promise resolving to a record of secret names to their values
   * @throws Error if fetching fails and continueOnError is false
   *
   * @example
   * ```typescript
   * const secrets = await this.fetcher.fetchSecrets(
   *   'us-east-1',
   *   ['prod/db/password', 'prod/api/key'],
   *   false
   * );
   * // Returns: { 'prod/db/password': 'secret123', 'prod/api/key': 'key456' }
   * ```
   *
   * @remarks
   * - Fetches all secrets concurrently using Promise.allSettled
   * - Automatically decodes binary secrets to strings
   * - Provides detailed error messages for common failure scenarios
   * - Logs individual secret fetch failures when continueOnError is true
   */
  async fetchSecrets(
    awsRegion: string,
    secretNames: string[],
    continueOnError: boolean,
  ): Promise<Record<string, string>> {
    const secrets: Record<string, string> = {};

    // Validate inputs
    if (!awsRegion || awsRegion.trim() === '') {
      const errorMessage = 'AWS region cannot be empty';
      this.logger.error(errorMessage);
      if (!continueOnError) {
        throw new Error(errorMessage);
      }
      return secrets;
    }

    if (!secretNames || secretNames.length === 0) {
      this.logger.warn(
        'No secret names provided, skipping Secrets Manager fetch',
      );
      return secrets;
    }

    this.logger.log(
      `Initializing AWS Secrets Manager fetch - Region: ${awsRegion}, Secrets: ${secretNames.length}`,
    );

    // Validate each secret name
    const invalidNames = secretNames.filter(
      (name) => !name || name.trim() === '',
    );
    if (invalidNames.length > 0) {
      const errorMessage = 'Secret names cannot be empty';
      this.logger.error(errorMessage);
      if (!continueOnError) {
        throw new Error(errorMessage);
      }
      return secrets;
    }

    try {
      const clientConfiguration = { region: awsRegion };
      const secretsManagerClient = new SecretsManagerClient(
        clientConfiguration,
      );

      // Fetch all secrets concurrently for better performance
      const secretPromises = secretNames.map(async (secretName) => {
        try {
          this.logger.debug(`Fetching secret: ${secretName}`);
          const command = new GetSecretValueCommand({ SecretId: secretName });
          const response = await secretsManagerClient.send(command);

          // Handle both string and binary secrets
          let secretValue: string;
          if (response.SecretString) {
            secretValue = response.SecretString;
          } else if (response.SecretBinary) {
            // Decode binary secret to string
            const buffer = Buffer.from(response.SecretBinary);
            secretValue = buffer.toString('utf-8');
          } else {
            throw new Error(`Secret '${secretName}' has no value`);
          }

          this.logger.debug(`Successfully fetched secret: ${secretName}`);
          return { secretName, secretValue, error: null };
        } catch (error) {
          const errorMessage = ParamStoreUtil.buildSecretsManagerErrorMessage(
            error,
            awsRegion,
            secretName,
          );
          this.logger.error(errorMessage);
          if (error instanceof Error) {
            this.logger.debug(
              `Error details for ${secretName}: ${error.stack}`,
            );
          }
          return { secretName, secretValue: null, error: errorMessage };
        }
      });

      // Wait for all secrets to be fetched
      const results = await Promise.allSettled(secretPromises);

      let successCount = 0;
      let failureCount = 0;

      // Process results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { secretName, secretValue, error } = result.value;
          if (error === null && secretValue !== null) {
            secrets[secretName] = secretValue;
            successCount++;
          } else {
            failureCount++;
            if (!continueOnError) {
              throw new Error(error || `Failed to fetch secret: ${secretName}`);
            }
          }
        } else {
          failureCount++;
          this.logger.error(
            `Unexpected error fetching secret: ${result.reason}`,
          );
          if (!continueOnError) {
            throw new Error(result.reason);
          }
        }
      }

      this.logger.log(
        `Secrets Manager fetch completed - Success: ${successCount}, Failed: ${failureCount}`,
      );

      if (successCount === 0 && secretNames.length > 0) {
        this.logger.warn(
          `No secrets were successfully fetched from AWS Secrets Manager. ` +
            `Verify secret names exist in region '${awsRegion}' and IAM permissions are correct.`,
        );
      }
    } catch (error) {
      const errorMessage = `Failed to fetch secrets from AWS Secrets Manager: ${
        error instanceof Error ? error.message : String(error)
      }`;
      this.logger.error(errorMessage);

      if (continueOnError) {
        this.logger.warn('Application will continue with empty secrets');
        return secrets;
      } else {
        throw new Error(errorMessage);
      }
    }

    return secrets;
  }
}
