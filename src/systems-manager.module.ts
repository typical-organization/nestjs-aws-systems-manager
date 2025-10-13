import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AWS_PARAM_STORE_CONTINUE_ON_ERROR,
  AWS_PARAM_STORE_PATH,
  AWS_PARAM_STORE_PRESERVE_HIERARCHY,
  AWS_PARAM_STORE_PATH_SEPARATOR,
  AWS_PARAM_STORE_PROVIDER,
  AWS_PARAM_STORE_ENABLE_LOGGING,
  AWS_REGION,
  AWS_SECRETS_MANAGER_PROVIDER,
  AWS_SECRETS_MANAGER_ENABLED,
  AWS_SECRETS_MANAGER_SECRET_NAMES,
} from './constants';
import { ModuleAsyncOptions, ModuleOptions } from './interface';
import { SystemsManagerService } from './systems-manager.service';
import { Parameter } from '@aws-sdk/client-ssm';
import {
  ParameterStoreFetcherService,
  SecretsManagerFetcherService,
} from './services';
import { ParamStoreUtil } from './utils/param-store.util';

/**
 * Global NestJS module for AWS Systems Manager (Parameter Store and Secrets Manager) integration.
 *
 * This module fetches configuration parameters from AWS SSM Parameter Store at
 * application startup and makes them available through the SystemsManagerService.
 *
 * Features:
 * - Automatic pagination handling for large parameter sets
 * - Support for encrypted parameters (SecureString)
 * - Optional error handling (continue on error or fail fast)
 * - Parameter hierarchy support (flat or nested structure)
 * - Runtime parameter refresh capability
 *
 * @example
 * Static registration:
 * ```typescript
 * @Module({
 *   imports: [
 *     SystemsManagerModule.register({
 *       awsRegion: 'us-east-1',
 *       awsParamStorePath: '/app/config',
 *       awsParamStoreContinueOnError: false,
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @example
 * Async registration with ConfigService:
 * ```typescript
 * @Module({
 *   imports: [
 *     SystemsManagerModule.registerAsync({
 *       import: ConfigModule,
 *       useClass: ConfigService,
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @example
 * With parameter hierarchy enabled:
 * ```typescript
 * SystemsManagerModule.register({
 *   awsRegion: 'us-east-1',
 *   awsParamStorePath: '/app/config',
 *   awsParamStoreContinueOnError: false,
 *   preserveHierarchy: true,
 *   pathSeparator: '.', // Optional, defaults to '.'
 * })
 * ```
 */
@Global()
@Module({})
export class SystemsManagerModule {
  /**
   * Register the module with static configuration.
   *
   * @param moduleOptions - Configuration options for the Parameter Store module
   * @returns DynamicModule configuration
   *
   * @example
   * ```typescript
   * SystemsManagerModule.register({
   *   awsRegion: 'us-east-1',
   *   awsParamStorePath: '/production/app',
   *   awsParamStoreContinueOnError: false,
   * })
   * ```
   */
  public static register(moduleOptions: ModuleOptions): DynamicModule {
    return {
      module: SystemsManagerModule,
      providers: [
        SystemsManagerService,
        ParameterStoreFetcherService,
        SecretsManagerFetcherService,
        ...this.createProviders(moduleOptions),
      ],
      exports: [SystemsManagerService],
    };
  }

  /**
   * Register the module with async configuration using ConfigService.
   *
   * This method allows you to configure the module using values from
   * NestJS ConfigService, which is useful for environment-based configuration.
   *
   * @param moduleAsyncOptions - Async configuration options
   * @returns DynamicModule configuration
   *
   * @example
   * ```typescript
   * // In your .env or config:
   * // param-store.awsRegion=us-east-1
   * // param-store.awsParamStorePath=/app/config
   * // param-store.awsParamStoreContinueOnError=false
   *
   * SystemsManagerModule.registerAsync({
   *   import: ConfigModule,
   *   useClass: ConfigService,
   * })
   * ```
   */
  public static registerAsync(
    moduleAsyncOptions: ModuleAsyncOptions,
  ): DynamicModule {
    return {
      module: SystemsManagerModule,
      providers: [
        SystemsManagerService,
        ParameterStoreFetcherService,
        SecretsManagerFetcherService,
        ...this.createAsyncProviders(moduleAsyncOptions),
      ],
      exports: [SystemsManagerService],
    };
  }

  private static createProviders(moduleOptions: ModuleOptions): Provider[] {
    return [
      {
        provide: AWS_PARAM_STORE_PROVIDER,
        useFactory: async (
          fetcher: ParameterStoreFetcherService,
        ): Promise<Parameter[]> => {
          return await fetcher.fetchParameters(
            moduleOptions.awsRegion,
            moduleOptions.awsParamStorePath,
            moduleOptions.awsParamStoreContinueOnError || false,
          );
        },
        inject: [ParameterStoreFetcherService],
      },
      {
        provide: AWS_SECRETS_MANAGER_PROVIDER,
        useFactory: async (
          fetcher: SecretsManagerFetcherService,
        ): Promise<Record<string, string>> => {
          if (
            !moduleOptions.useSecretsManager ||
            !moduleOptions.secretsManagerSecretNames ||
            moduleOptions.secretsManagerSecretNames.length === 0
          ) {
            return {};
          }
          return await fetcher.fetchSecrets(
            moduleOptions.awsRegion,
            moduleOptions.secretsManagerSecretNames,
            moduleOptions.awsParamStoreContinueOnError || false,
          );
        },
        inject: [SecretsManagerFetcherService],
      },
      {
        provide: 'PARAM_STORE_CONFIG',
        useValue: moduleOptions,
      },
    ];
  }

  private static createAsyncProviders(
    moduleAsyncOptions: ModuleAsyncOptions,
  ): Provider[] {
    return [
      {
        provide: AWS_PARAM_STORE_PROVIDER,
        useFactory: async (
          configService: ConfigService,
          fetcher: ParameterStoreFetcherService,
        ): Promise<Parameter[]> => {
          return await fetcher.fetchParameters(
            configService.get(AWS_REGION) as string,
            configService.get(AWS_PARAM_STORE_PATH) as string,
            (configService.get(AWS_PARAM_STORE_CONTINUE_ON_ERROR) as boolean) ||
              false,
          );
        },
        inject: [moduleAsyncOptions.useClass, ParameterStoreFetcherService],
      },
      {
        provide: AWS_SECRETS_MANAGER_PROVIDER,
        useFactory: async (
          configService: ConfigService,
          fetcher: SecretsManagerFetcherService,
        ): Promise<Record<string, string>> => {
          const useSecretsManager = configService.get(
            AWS_SECRETS_MANAGER_ENABLED,
          ) as boolean;
          const secretNames = configService.get(
            AWS_SECRETS_MANAGER_SECRET_NAMES,
          ) as string[];

          if (!useSecretsManager || !secretNames || secretNames.length === 0) {
            return {};
          }

          return await fetcher.fetchSecrets(
            configService.get(AWS_REGION) as string,
            secretNames,
            (configService.get(AWS_PARAM_STORE_CONTINUE_ON_ERROR) as boolean) ||
              false,
          );
        },
        inject: [moduleAsyncOptions.useClass, SecretsManagerFetcherService],
      },
      {
        provide: 'PARAM_STORE_CONFIG',
        useFactory: (configService: ConfigService): ModuleOptions => {
          return {
            awsRegion: configService.get(AWS_REGION) as string,
            awsParamStorePath: configService.get(
              AWS_PARAM_STORE_PATH,
            ) as string,
            awsParamStoreContinueOnError: ParamStoreUtil.parseBoolean(
              configService.get(AWS_PARAM_STORE_CONTINUE_ON_ERROR),
            ),
            preserveHierarchy: ParamStoreUtil.parseBoolean(
              configService.get(AWS_PARAM_STORE_PRESERVE_HIERARCHY),
            ),
            pathSeparator:
              (configService.get(AWS_PARAM_STORE_PATH_SEPARATOR) as string) ||
              '.',
            enableParameterLogging: ParamStoreUtil.parseBoolean(
              configService.get(AWS_PARAM_STORE_ENABLE_LOGGING),
            ),
            useSecretsManager: ParamStoreUtil.parseBoolean(
              configService.get(AWS_SECRETS_MANAGER_ENABLED),
            ),
            secretsManagerSecretNames: configService.get(
              AWS_SECRETS_MANAGER_SECRET_NAMES,
            ) as string[],
          };
        },
        inject: [moduleAsyncOptions.useClass],
      },
    ];
  }
}
