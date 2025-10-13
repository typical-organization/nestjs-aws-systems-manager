import { Injectable, Logger } from '@nestjs/common';
import {
  GetParametersByPathCommand,
  Parameter,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { ParamStoreUtil } from '../utils/param-store.util';

/**
 * Injectable service for fetching parameters from AWS Systems Manager Parameter Store.
 *
 * This service handles the communication with AWS SSM, including:
 * - Automatic pagination for large parameter sets
 * - Decryption of SecureString parameters
 * - Error handling and detailed logging
 * - Input validation
 *
 * @example
 * ```typescript
 * constructor(private readonly fetcher: ParameterStoreFetcherService) {}
 *
 * async fetchConfig() {
 *   const parameters = await this.fetcher.fetchParameters(
 *     'us-east-1',
 *     '/app/config',
 *     false
 *   );
 * }
 * ```
 */
@Injectable()
export class ParameterStoreFetcherService {
  private readonly logger = new Logger(ParameterStoreFetcherService.name);

  /**
   * Fetch parameters from AWS Systems Manager Parameter Store.
   *
   * This method handles pagination automatically, retrieves all parameters
   * recursively from the specified path, and decrypts SecureString parameters.
   *
   * @param awsRegion - AWS region where parameters are stored (e.g., 'us-east-1')
   * @param awsParamStorePath - Parameter Store path to fetch from (must start with '/')
   * @param continueOnError - If true, returns empty array on error; if false, throws error
   * @returns Promise resolving to array of AWS Parameter objects
   * @throws Error if fetching fails and continueOnError is false
   *
   * @example
   * ```typescript
   * const parameters = await this.fetcher.fetchParameters(
   *   'us-east-1',
   *   '/app/config',
   *   false
   * );
   * ```
   *
   * @remarks
   * - Validates inputs before making AWS API calls
   * - Handles AWS pagination automatically (up to 10 parameters per page)
   * - Provides detailed error messages for common failure scenarios
   * - Logs progress and completion status
   */
  async fetchParameters(
    awsRegion: string,
    awsParamStorePath: string,
    continueOnError: boolean,
  ): Promise<Parameter[]> {
    const parameters: Parameter[] = [];

    this.logger.log(
      `Initializing AWS SSM Parameter Store fetch - Region: ${awsRegion}, Path: ${awsParamStorePath}`,
    );

    try {
      // Validate inputs before proceeding
      ParamStoreUtil.validateParameters(awsRegion, awsParamStorePath);
      this.logger.debug('Parameter validation successful');

      let nextToken: string | undefined = undefined;
      let result = null;
      let areMoreParametersToFetch = true;
      let pageCount = 0;
      const clientConfiguration = { region: awsRegion };
      const ssmClient = new SSMClient(clientConfiguration);

      while (areMoreParametersToFetch) {
        pageCount++;
        const commandInput: {
          Path: string;
          Recursive: boolean;
          WithDecryption: boolean;
          NextToken?: string;
        } = {
          Path: awsParamStorePath,
          Recursive: true,
          WithDecryption: true,
        };
        if (nextToken) {
          commandInput.NextToken = nextToken;
          this.logger.debug(`Fetching page ${pageCount} with NextToken`);
        }
        const getParametersByPathCommand = new GetParametersByPathCommand(
          commandInput,
        );
        result = await ssmClient.send(getParametersByPathCommand);

        const fetchedParameters = result?.Parameters || [];
        parameters.push(...fetchedParameters);

        this.logger.debug(
          `Page ${pageCount}: Retrieved ${fetchedParameters.length} parameters`,
        );

        nextToken = result.NextToken;
        areMoreParametersToFetch = !!nextToken;
      }

      this.logger.log(
        `Successfully fetched ${parameters.length} parameter(s) from AWS SSM in ${pageCount} page(s)`,
      );

      // Warn if no parameters were found
      if (parameters.length === 0) {
        this.logger.warn(
          `No parameters found at path '${awsParamStorePath}' in region '${awsRegion}'. ` +
            `Verify the path exists and has parameters configured.`,
        );
      }
    } catch (error) {
      const errorMessage = ParamStoreUtil.buildErrorMessage(
        error,
        awsRegion,
        awsParamStorePath,
      );

      if (continueOnError) {
        this.logger.warn(
          `${errorMessage} - Application will continue with empty parameters`,
        );
        if (error instanceof Error) {
          this.logger.debug(`Error details: ${error.stack}`);
        }
        return [];
      } else {
        this.logger.error(errorMessage);
        if (error instanceof Error) {
          this.logger.debug(`Error details: ${error.stack}`);
        }

        // Re-throw with enhanced error message
        const enhancedError = new Error(errorMessage);
        if (error instanceof Error) {
          enhancedError.stack = error.stack;
        }
        throw enhancedError;
      }
    }

    return parameters;
  }
}
