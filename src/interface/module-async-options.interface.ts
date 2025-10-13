import { Type } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * Async configuration options for ParamStoreModule.
 *
 * Allows configuration of the module using NestJS ConfigService,
 * which is useful for environment-based or dynamic configuration.
 *
 * The ConfigService should provide values for the following keys:
 * - `param-store.awsRegion`: AWS region (string)
 * - `param-store.awsParamStorePath`: Parameter Store path (string)
 * - `param-store.awsParamStoreContinueOnError`: Continue on error flag (boolean)
 * - `param-store.preserveHierarchy`: Preserve hierarchy flag (boolean, optional)
 * - `param-store.pathSeparator`: Path separator (string, optional)
 *
 * @example
 * ```typescript
 * // In your module:
 * @Module({
 *   imports: [
 *     ParamStoreModule.registerAsync({
 *       import: ConfigModule,
 *       useClass: ConfigService,
 *     }),
 *   ],
 * })
 * export class AppModule {}
 *
 * // In your .env or configuration:
 * // param-store.awsRegion=us-east-1
 * // param-store.awsParamStorePath=/app/config
 * // param-store.awsParamStoreContinueOnError=false
 * // param-store.preserveHierarchy=true
 * // param-store.pathSeparator=.
 * ```
 */
export interface ModuleAsyncOptions {
  /**
   * The ConfigModule to import for dependency injection.
   * Typically the NestJS ConfigModule.
   */
  import: Type<ConfigModule>;

  /**
   * The ConfigService class to use for retrieving configuration values.
   * Must provide the required parameter store configuration keys.
   */
  useClass: Type<ConfigService>;
}
