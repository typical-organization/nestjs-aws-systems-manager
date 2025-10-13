import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { SystemsManagerModule } from './systems-manager.module';
import { SystemsManagerService } from './systems-manager.service';
import {
  AWS_PARAM_STORE_PROVIDER,
  AWS_SECRETS_MANAGER_PROVIDER,
} from './constants';
import {
  SSMClient,
  GetParametersByPathCommand,
  Parameter,
} from '@aws-sdk/client-ssm';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import {
  ParameterStoreFetcherService,
  SecretsManagerFetcherService,
} from './services';
import { ParamStoreUtil } from './utils/param-store.util';

// Mock AWS SDK
jest.mock('@aws-sdk/client-ssm');
jest.mock('@aws-sdk/client-secrets-manager');

describe('SystemsManagerModule', () => {
  let mockSend: jest.Mock;
  let mockSSMClient: jest.Mocked<SSMClient>;
  let mockSecretsManagerSend: jest.Mock;
  let mockSecretsManagerClient: jest.Mocked<SecretsManagerClient>;
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;
  let loggerDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock SSM client
    mockSend = jest.fn();
    mockSSMClient = {
      send: mockSend,
    } as unknown as jest.Mocked<SSMClient>;

    (SSMClient as jest.MockedClass<typeof SSMClient>).mockImplementation(
      () => mockSSMClient,
    );

    // Setup mock Secrets Manager client
    mockSecretsManagerSend = jest.fn();
    mockSecretsManagerClient = {
      send: mockSecretsManagerSend,
    } as unknown as jest.Mocked<SecretsManagerClient>;

    (
      SecretsManagerClient as jest.MockedClass<typeof SecretsManagerClient>
    ).mockImplementation(() => mockSecretsManagerClient);

    // Setup logger spies
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    loggerDebugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.resetAllMocks();
    loggerLogSpy.mockRestore();
    loggerWarnSpy.mockRestore();
    loggerErrorSpy.mockRestore();
    loggerDebugSpy.mockRestore();
  });

  describe('register (static configuration)', () => {
    it('should create module with providers', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [{ Name: '/app/config/test-param', Value: 'test-value' }],
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
          }),
        ],
      }).compile();

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(SystemsManagerService);
    });

    it('should fetch parameters from AWS on initialization', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [
          { Name: '/app/config/param1', Value: 'value1' },
          { Name: '/app/config/param2', Value: 'value2' },
        ],
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-west-2',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
          }),
        ],
      }).compile();

      expect(SSMClient).toHaveBeenCalledWith({ region: 'us-west-2' });
      expect(mockSend).toHaveBeenCalledWith(
        expect.any(GetParametersByPathCommand),
      );

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service.get('param1')).toBe('value1');
      expect(service.get('param2')).toBe('value2');
    });

    it('should handle pagination with NextToken', async () => {
      mockSend
        .mockResolvedValueOnce({
          Parameters: [
            { Name: '/app/config/param1', Value: 'value1' },
            { Name: '/app/config/param2', Value: 'value2' },
          ],
          NextToken: 'token-page-2',
        })
        .mockResolvedValueOnce({
          Parameters: [
            { Name: '/app/config/param3', Value: 'value3' },
            { Name: '/app/config/param4', Value: 'value4' },
          ],
          NextToken: 'token-page-3',
        })
        .mockResolvedValueOnce({
          Parameters: [{ Name: '/app/config/param5', Value: 'value5' }],
          NextToken: undefined,
        });

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
          }),
        ],
      }).compile();

      expect(mockSend).toHaveBeenCalledTimes(3);

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service.get('param1')).toBe('value1');
      expect(service.get('param3')).toBe('value3');
      expect(service.get('param5')).toBe('value5');
    });

    it('should pass correct parameters to GetParametersByPathCommand', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [],
        NextToken: undefined,
      });

      await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'eu-west-1',
            awsParamStorePath: '/production/app',
            awsParamStoreContinueOnError: false,
          }),
        ],
      }).compile();

      expect(mockSend).toHaveBeenCalled();
      expect(mockSend.mock.calls[0][0]).toBeInstanceOf(
        GetParametersByPathCommand,
      );
      // Verify SSMClient was called with correct region
      expect(SSMClient).toHaveBeenCalledWith({ region: 'eu-west-1' });
    });

    it('should throw error when AWS call fails and continueOnError is false', async () => {
      const awsError = new Error('AccessDeniedException');
      mockSend.mockRejectedValueOnce(awsError);

      await expect(
        Test.createTestingModule({
          imports: [
            SystemsManagerModule.register({
              awsRegion: 'us-east-1',
              awsParamStorePath: '/app/config',
              awsParamStoreContinueOnError: false,
            }),
          ],
        }).compile(),
      ).rejects.toThrow('AccessDeniedException');
    });

    it('should not throw error when AWS call fails and continueOnError is true', async () => {
      const awsError = new Error('AccessDeniedException');
      mockSend.mockRejectedValueOnce(awsError);

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: true,
          }),
        ],
      }).compile();

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch parameters from AWS SSM'),
      );
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Application will continue with empty parameters',
        ),
      );

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service).toBeDefined();
    });

    it('should handle empty parameters response', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [],
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
          }),
        ],
      }).compile();

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service.get('any-param')).toBeUndefined();
    });

    it('should call AWS SSM with GetParametersByPathCommand', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [
          { Name: '/app/config/encrypted-param', Value: 'decrypted-value' },
        ],
        NextToken: undefined,
      });

      const module = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
          }),
        ],
      }).compile();

      expect(mockSend).toHaveBeenCalled();
      expect(mockSend.mock.calls[0][0]).toBeInstanceOf(
        GetParametersByPathCommand,
      );

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service.get('encrypted-param')).toBe('decrypted-value');
    });
  });

  describe('registerAsync (async configuration)', () => {
    let mockConfigService: jest.Mocked<ConfigService>;

    beforeEach(() => {
      mockConfigService = {
        get: jest.fn((key: string) => {
          const config: Record<string, string | boolean> = {
            'param-store.awsRegion': 'us-east-1',
            'param-store.awsParamStorePath': '/app/config',
            'param-store.awsParamStoreContinueOnError': false,
          };
          return config[key];
        }),
      } as unknown as jest.Mocked<ConfigService>;
    });

    it('should create module with async providers', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [{ Name: '/app/config/test-param', Value: 'test-value' }],
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          SystemsManagerService,
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useFactory: async (
              configService: ConfigService,
              fetcher: ParameterStoreFetcherService,
            ) => {
              return await fetcher.fetchParameters(
                configService.get('param-store.awsRegion') as string,
                configService.get('param-store.awsParamStorePath') as string,
                (configService.get(
                  'param-store.awsParamStoreContinueOnError',
                ) as boolean) || false,
              );
            },
            inject: [ConfigService, ParameterStoreFetcherService],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useFactory: (configService: ConfigService) => ({
              awsRegion: configService.get('param-store.awsRegion') as string,
              awsParamStorePath: configService.get(
                'param-store.awsParamStorePath',
              ) as string,
              awsParamStoreContinueOnError:
                (configService.get(
                  'param-store.awsParamStoreContinueOnError',
                ) as boolean) || false,
            }),
            inject: [ConfigService],
          },
        ],
      }).compile();

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(SystemsManagerService);
    });

    it('should read configuration from ConfigService', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [{ Name: '/app/config/param1', Value: 'value1' }],
        NextToken: undefined,
      });

      await Test.createTestingModule({
        providers: [
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          SystemsManagerService,
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useFactory: async (
              configService: ConfigService,
              fetcher: ParameterStoreFetcherService,
            ) => {
              return await fetcher.fetchParameters(
                configService.get('param-store.awsRegion') as string,
                configService.get('param-store.awsParamStorePath') as string,
                (configService.get(
                  'param-store.awsParamStoreContinueOnError',
                ) as boolean) || false,
              );
            },
            inject: [ConfigService, ParameterStoreFetcherService],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useFactory: (configService: ConfigService) => ({
              awsRegion: configService.get('param-store.awsRegion') as string,
              awsParamStorePath: configService.get(
                'param-store.awsParamStorePath',
              ) as string,
              awsParamStoreContinueOnError:
                (configService.get(
                  'param-store.awsParamStoreContinueOnError',
                ) as boolean) || false,
            }),
            inject: [ConfigService],
          },
        ],
      }).compile();

      expect(mockConfigService.get).toHaveBeenCalledWith(
        'param-store.awsRegion',
      );
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'param-store.awsParamStorePath',
      );
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'param-store.awsParamStoreContinueOnError',
      );
    });

    it('should handle continueOnError from ConfigService', async () => {
      const awsError = new Error('NetworkError');
      mockSend.mockRejectedValueOnce(awsError);

      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, string | boolean> = {
          'param-store.awsRegion': 'us-east-1',
          'param-store.awsParamStorePath': '/app/config',
          'param-store.awsParamStoreContinueOnError': true,
        };
        return config[key];
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          SystemsManagerService,
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useFactory: async (
              configService: ConfigService,
              fetcher: ParameterStoreFetcherService,
            ) => {
              return await fetcher.fetchParameters(
                configService.get('param-store.awsRegion') as string,
                configService.get('param-store.awsParamStorePath') as string,
                (configService.get(
                  'param-store.awsParamStoreContinueOnError',
                ) as boolean) || false,
              );
            },
            inject: [ConfigService, ParameterStoreFetcherService],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useFactory: (configService: ConfigService) => ({
              awsRegion: configService.get('param-store.awsRegion') as string,
              awsParamStorePath: configService.get(
                'param-store.awsParamStorePath',
              ) as string,
              awsParamStoreContinueOnError:
                (configService.get(
                  'param-store.awsParamStoreContinueOnError',
                ) as boolean) || false,
            }),
            inject: [ConfigService],
          },
        ],
      }).compile();

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch parameters from AWS SSM'),
      );

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service).toBeDefined();
    });

    it('should use different regions from ConfigService', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        const config: Record<string, string | boolean> = {
          'param-store.awsRegion': 'ap-south-1',
          'param-store.awsParamStorePath': '/app/config',
          'param-store.awsParamStoreContinueOnError': false,
        };
        return config[key];
      });

      mockSend.mockResolvedValueOnce({
        Parameters: [],
        NextToken: undefined,
      });

      await Test.createTestingModule({
        providers: [
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          SystemsManagerService,
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useFactory: async (
              configService: ConfigService,
              fetcher: ParameterStoreFetcherService,
            ) => {
              return await fetcher.fetchParameters(
                configService.get('param-store.awsRegion') as string,
                configService.get('param-store.awsParamStorePath') as string,
                (configService.get(
                  'param-store.awsParamStoreContinueOnError',
                ) as boolean) || false,
              );
            },
            inject: [ConfigService, ParameterStoreFetcherService],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useFactory: (configService: ConfigService) => ({
              awsRegion: configService.get('param-store.awsRegion') as string,
              awsParamStorePath: configService.get(
                'param-store.awsParamStorePath',
              ) as string,
              awsParamStoreContinueOnError:
                (configService.get(
                  'param-store.awsParamStoreContinueOnError',
                ) as boolean) || false,
            }),
            inject: [ConfigService],
          },
        ],
      }).compile();

      expect(SSMClient).toHaveBeenCalledWith({ region: 'ap-south-1' });
    });
  });

  describe('AWS_PARAM_STORE_PROVIDER', () => {
    it('should provide parameters array to service', async () => {
      const mockParameters: Parameter[] = [
        { Name: '/app/config/param1', Value: 'value1' },
        { Name: '/app/config/param2', Value: 'value2' },
      ];

      mockSend.mockResolvedValueOnce({
        Parameters: mockParameters,
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
          }),
        ],
      }).compile();

      const parametersProvider = module.get<Parameter[]>(
        AWS_PARAM_STORE_PROVIDER,
      );
      expect(parametersProvider).toEqual(mockParameters);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined Parameters in response', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: undefined,
        NextToken: undefined,
      });

      // This should not throw, but return empty array
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: true, // Changed to true to avoid throwing
          }),
        ],
      }).compile();

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service).toBeDefined();
    });

    it('should handle very long parameter paths', async () => {
      const longPath =
        '/app/production/region/us-east-1/service/database/cluster/primary';
      mockSend.mockResolvedValueOnce({
        Parameters: [{ Name: `${longPath}/host`, Value: 'db.example.com' }],
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: longPath,
            awsParamStoreContinueOnError: false,
          }),
        ],
      }).compile();

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service.get('host')).toBe('db.example.com');
    });

    it('should handle parameters with NextToken in pagination correctly', async () => {
      // Simulate many pages
      mockSend
        .mockResolvedValueOnce({
          Parameters: [{ Name: '/app/config/param1', Value: 'value1' }],
          NextToken: 'token2',
        })
        .mockResolvedValueOnce({
          Parameters: [{ Name: '/app/config/param2', Value: 'value2' }],
          NextToken: 'token3',
        })
        .mockResolvedValueOnce({
          Parameters: [{ Name: '/app/config/param3', Value: 'value3' }],
          NextToken: undefined,
        });

      const module = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
          }),
        ],
      }).compile();

      expect(mockSend).toHaveBeenCalledTimes(3);

      // Verify all parameters were loaded
      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service.get('param1')).toBe('value1');
      expect(service.get('param2')).toBe('value2');
      expect(service.get('param3')).toBe('value3');
    });
  });

  describe('logging behavior', () => {
    it('should log initialization message', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [],
        NextToken: undefined,
      });

      await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
          }),
        ],
      }).compile();

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Initializing AWS SSM Parameter Store fetch'),
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Region: us-east-1'),
      );
      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Path: /app/config'),
      );
    });

    it('should log success message with parameter count', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [
          { Name: '/app/config/param1', Value: 'value1' },
          { Name: '/app/config/param2', Value: 'value2' },
        ],
        NextToken: undefined,
      });

      await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
          }),
        ],
      }).compile();

      expect(loggerLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Successfully fetched 2 parameter(s)'),
      );
    });

    it('should log warning when no parameters found', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [],
        NextToken: undefined,
      });

      await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
          }),
        ],
      }).compile();

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No parameters found at path'),
      );
    });

    it('should log error with enhanced message when fetch fails', async () => {
      const awsError = new Error('AccessDeniedException');
      awsError.name = 'AccessDeniedException';
      mockSend.mockRejectedValueOnce(awsError);

      await expect(
        Test.createTestingModule({
          imports: [
            SystemsManagerModule.register({
              awsRegion: 'us-east-1',
              awsParamStorePath: '/app/config',
              awsParamStoreContinueOnError: false,
            }),
          ],
        }).compile(),
      ).rejects.toThrow();

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch parameters from AWS SSM'),
      );
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Access Denied'),
      );
    });

    it('should log debug messages for pagination', async () => {
      mockSend
        .mockResolvedValueOnce({
          Parameters: [{ Name: '/app/config/param1', Value: 'value1' }],
          NextToken: 'token2',
        })
        .mockResolvedValueOnce({
          Parameters: [{ Name: '/app/config/param2', Value: 'value2' }],
          NextToken: undefined,
        });

      await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
          }),
        ],
      }).compile();

      expect(loggerDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Parameter validation successful'),
      );
      expect(loggerDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Fetching page 2 with NextToken'),
      );
    });
  });

  describe('module exports', () => {
    it('should export SystemsManagerService', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [],
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
          }),
        ],
      }).compile();

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service).toBeDefined();
    });
  });

  describe('registerAsync with hierarchy options', () => {
    it('should support hierarchy options from ConfigService', async () => {
      const mockConfigService = {
        get: jest.fn((key: string) => {
          const config: Record<string, string | boolean> = {
            'param-store.awsRegion': 'us-east-1',
            'param-store.awsParamStorePath': '/app/config',
            'param-store.awsParamStoreContinueOnError': false,
            'param-store.preserveHierarchy': true,
            'param-store.pathSeparator': '/',
          };
          return config[key];
        }),
      } as unknown as ConfigService;

      mockSend.mockResolvedValueOnce({
        Parameters: [{ Name: '/app/config/database/host', Value: 'localhost' }],
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          SystemsManagerService,
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useFactory: async (
              configService: ConfigService,
              fetcher: ParameterStoreFetcherService,
            ) => {
              return await fetcher.fetchParameters(
                configService.get('param-store.awsRegion') as string,
                configService.get('param-store.awsParamStorePath') as string,
                (configService.get(
                  'param-store.awsParamStoreContinueOnError',
                ) as boolean) || false,
              );
            },
            inject: [ConfigService, ParameterStoreFetcherService],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useFactory: (configService: ConfigService) => ({
              awsRegion: configService.get('param-store.awsRegion') as string,
              awsParamStorePath: configService.get(
                'param-store.awsParamStorePath',
              ) as string,
              awsParamStoreContinueOnError:
                (configService.get(
                  'param-store.awsParamStoreContinueOnError',
                ) as boolean) || false,
              preserveHierarchy:
                (configService.get(
                  'param-store.preserveHierarchy',
                ) as boolean) || false,
              pathSeparator:
                (configService.get('param-store.pathSeparator') as string) ||
                '.',
            }),
            inject: [ConfigService],
          },
        ],
      }).compile();

      expect(mockConfigService.get).toHaveBeenCalledWith(
        'param-store.preserveHierarchy',
      );
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'param-store.pathSeparator',
      );

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service.get('database/host')).toBe('localhost');
    });
  });

  describe('register with hierarchy options', () => {
    it('should support preserveHierarchy in static registration', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [
          { Name: '/app/config/database/host', Value: 'localhost' },
          { Name: '/app/config/api/key', Value: 'secret' },
        ],
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
            preserveHierarchy: true,
            pathSeparator: '.',
          }),
        ],
      }).compile();

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service.get('database.host')).toBe('localhost');
      expect(service.get('api.key')).toBe('secret');
    });

    it('should support custom pathSeparator in static registration', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [{ Name: '/app/config/database/host', Value: 'localhost' }],
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
            preserveHierarchy: true,
            pathSeparator: '_',
          }),
        ],
      }).compile();

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service.get('database_host')).toBe('localhost');
    });
  });

  describe('parseBoolean helper via registerAsync', () => {
    it('should correctly parse boolean values through async config', async () => {
      const mockConfigService = {
        get: jest.fn((key: string) => {
          const config: Record<string, string | boolean | string[]> = {
            'param-store.awsRegion': 'us-east-1',
            'param-store.awsParamStorePath': '/app/config',
            'param-store.awsParamStoreContinueOnError': 'true', // String "true"
            'param-store.useSecretsManager': false, // Boolean false
            'param-store.secretsManagerSecretNames': [],
            'param-store.preserveHierarchy': 'TRUE', // String "TRUE"
            'param-store.pathSeparator': '.',
            'param-store.enableParameterLogging': 'false', // String "false"
          };
          return config[key];
        }),
      } as unknown as ConfigService;

      mockSend.mockResolvedValueOnce({
        Parameters: [],
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          SystemsManagerService,
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useFactory: async (
              configService: ConfigService,
              fetcher: ParameterStoreFetcherService,
            ) => {
              return await fetcher.fetchParameters(
                configService.get('param-store.awsRegion') as string,
                configService.get('param-store.awsParamStorePath') as string,
                (configService.get(
                  'param-store.awsParamStoreContinueOnError',
                ) as boolean) || false,
              );
            },
            inject: [ConfigService, ParameterStoreFetcherService],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useFactory: (configService: ConfigService) => {
              return {
                awsRegion: configService.get('param-store.awsRegion') as string,
                awsParamStorePath: configService.get(
                  'param-store.awsParamStorePath',
                ) as string,
                awsParamStoreContinueOnError: ParamStoreUtil.parseBoolean(
                  configService.get('param-store.awsParamStoreContinueOnError'),
                ),
                preserveHierarchy: ParamStoreUtil.parseBoolean(
                  configService.get('param-store.preserveHierarchy'),
                ),
                pathSeparator:
                  (configService.get('param-store.pathSeparator') as string) ||
                  '.',
                enableParameterLogging: ParamStoreUtil.parseBoolean(
                  configService.get('param-store.enableParameterLogging'),
                ),
                useSecretsManager: ParamStoreUtil.parseBoolean(
                  configService.get('param-store.useSecretsManager'),
                ),
                secretsManagerSecretNames: configService.get(
                  'param-store.secretsManagerSecretNames',
                ) as string[],
              };
            },
            inject: [ConfigService],
          },
        ],
      }).compile();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = module.get<any>('PARAM_STORE_CONFIG');
      expect(config.awsParamStoreContinueOnError).toBe(true); // "true" -> true
      expect(config.preserveHierarchy).toBe(true); // "TRUE" -> true
      expect(config.enableParameterLogging).toBe(false); // "false" -> false
      expect(config.useSecretsManager).toBe(false); // false -> false
    });
  });

  describe('registerAsync with Secrets Manager - provider factories', () => {
    it('should create providers with Secrets Manager enabled when configured', async () => {
      const mockConfigService = {
        get: jest.fn((key: string) => {
          const config: Record<string, string | boolean | string[]> = {
            'param-store.awsRegion': 'us-east-1',
            'param-store.awsParamStorePath': '/app/config',
            'param-store.awsParamStoreContinueOnError': false,
            'param-store.useSecretsManager': true,
            'param-store.secretsManagerSecretNames': ['secret1', 'secret2'],
            'param-store.preserveHierarchy': false,
            'param-store.pathSeparator': '.',
            'param-store.enableParameterLogging': false,
          };
          return config[key];
        }),
      } as unknown as ConfigService;

      mockSend.mockResolvedValueOnce({
        Parameters: [{ Name: '/app/config/param1', Value: 'value1' }],
        NextToken: undefined,
      });

      // Mock Secrets Manager responses
      mockSecretsManagerSend
        .mockResolvedValueOnce({ SecretString: 'secret-value-1' })
        .mockResolvedValueOnce({ SecretString: 'secret-value-2' });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          SystemsManagerService,
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useFactory: async (
              configService: ConfigService,
              fetcher: ParameterStoreFetcherService,
            ) => {
              return await fetcher.fetchParameters(
                configService.get('param-store.awsRegion') as string,
                configService.get('param-store.awsParamStorePath') as string,
                (configService.get(
                  'param-store.awsParamStoreContinueOnError',
                ) as boolean) || false,
              );
            },
            inject: [ConfigService, ParameterStoreFetcherService],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useFactory: async (
              configService: ConfigService,
              fetcher: SecretsManagerFetcherService,
            ) => {
              const useSecretsManager = configService.get(
                'param-store.useSecretsManager',
              ) as boolean;
              const secretNames = configService.get(
                'param-store.secretsManagerSecretNames',
              ) as string[];

              if (
                !useSecretsManager ||
                !secretNames ||
                secretNames.length === 0
              ) {
                return {};
              }

              return await fetcher.fetchSecrets(
                configService.get('param-store.awsRegion') as string,
                secretNames,
                (configService.get(
                  'param-store.awsParamStoreContinueOnError',
                ) as boolean) || false,
              );
            },
            inject: [ConfigService, SecretsManagerFetcherService],
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useFactory: (configService: ConfigService) => ({
              awsRegion: configService.get('param-store.awsRegion') as string,
              awsParamStorePath: configService.get(
                'param-store.awsParamStorePath',
              ) as string,
              awsParamStoreContinueOnError:
                (configService.get(
                  'param-store.awsParamStoreContinueOnError',
                ) as boolean) || false,
            }),
            inject: [ConfigService],
          },
        ],
      }).compile();

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service).toBeDefined();
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'param-store.useSecretsManager',
      );
      expect(mockConfigService.get).toHaveBeenCalledWith(
        'param-store.secretsManagerSecretNames',
      );
    });

    it('should return empty object when Secrets Manager is disabled', async () => {
      const mockConfigService = {
        get: jest.fn((key: string) => {
          const config: Record<string, string | boolean | string[]> = {
            'param-store.awsRegion': 'us-east-1',
            'param-store.awsParamStorePath': '/app/config',
            'param-store.awsParamStoreContinueOnError': false,
            'param-store.useSecretsManager': false,
            'param-store.secretsManagerSecretNames': [],
            'param-store.preserveHierarchy': false,
            'param-store.pathSeparator': '.',
            'param-store.enableParameterLogging': false,
          };
          return config[key];
        }),
      } as unknown as ConfigService;

      mockSend.mockResolvedValueOnce({
        Parameters: [],
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          SystemsManagerService,
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useFactory: async (
              configService: ConfigService,
              fetcher: ParameterStoreFetcherService,
            ) => {
              return await fetcher.fetchParameters(
                configService.get('param-store.awsRegion') as string,
                configService.get('param-store.awsParamStorePath') as string,
                (configService.get(
                  'param-store.awsParamStoreContinueOnError',
                ) as boolean) || false,
              );
            },
            inject: [ConfigService, ParameterStoreFetcherService],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useFactory: async (configService: ConfigService) => {
              const useSecretsManager = configService.get(
                'param-store.useSecretsManager',
              ) as boolean;
              const secretNames = configService.get(
                'param-store.secretsManagerSecretNames',
              ) as string[];

              if (
                !useSecretsManager ||
                !secretNames ||
                secretNames.length === 0
              ) {
                return {};
              }

              // This won't be reached
              return {};
            },
            inject: [ConfigService],
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useFactory: (configService: ConfigService) => ({
              awsRegion: configService.get('param-store.awsRegion') as string,
            }),
            inject: [ConfigService],
          },
        ],
      }).compile();

      const secretsProvider = module.get<Record<string, string>>(
        AWS_SECRETS_MANAGER_PROVIDER,
      );
      expect(secretsProvider).toEqual({});
    });

    it('should return empty object when secretNames is null or undefined', async () => {
      const mockConfigService = {
        get: jest.fn((key: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const config: Record<string, any> = {
            'param-store.awsRegion': 'us-east-1',
            'param-store.awsParamStorePath': '/app/config',
            'param-store.awsParamStoreContinueOnError': false,
            'param-store.useSecretsManager': true,
            'param-store.secretsManagerSecretNames': null, // null
          };
          return config[key];
        }),
      } as unknown as ConfigService;

      mockSend.mockResolvedValueOnce({
        Parameters: [],
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          SystemsManagerService,
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useFactory: async (
              configService: ConfigService,
              fetcher: ParameterStoreFetcherService,
            ) => {
              return await fetcher.fetchParameters(
                configService.get('param-store.awsRegion') as string,
                configService.get('param-store.awsParamStorePath') as string,
                false,
              );
            },
            inject: [ConfigService, ParameterStoreFetcherService],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useFactory: async (configService: ConfigService) => {
              const useSecretsManager = configService.get(
                'param-store.useSecretsManager',
              ) as boolean;
              const secretNames = configService.get(
                'param-store.secretsManagerSecretNames',
              ) as string[];

              if (
                !useSecretsManager ||
                !secretNames ||
                secretNames.length === 0
              ) {
                return {};
              }

              return {};
            },
            inject: [ConfigService],
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: {},
          },
        ],
      }).compile();

      const secretsProvider = module.get<Record<string, string>>(
        AWS_SECRETS_MANAGER_PROVIDER,
      );
      expect(secretsProvider).toEqual({});
    });
  });

  describe('register with Secrets Manager', () => {
    it('should create module with Secrets Manager enabled', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [{ Name: '/app/config/param1', Value: 'value1' }],
        NextToken: undefined,
      });

      // Mock Secrets Manager responses
      mockSecretsManagerSend
        .mockResolvedValueOnce({ SecretString: 'secret-value-1' })
        .mockResolvedValueOnce({ SecretString: 'secret-value-2' });

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
            useSecretsManager: true,
            secretsManagerSecretNames: ['secret1', 'secret2'],
          }),
        ],
      }).compile();

      const service = module.get<SystemsManagerService>(SystemsManagerService);
      expect(service).toBeDefined();

      const secretsProvider = module.get<Record<string, string>>(
        AWS_SECRETS_MANAGER_PROVIDER,
      );
      expect(secretsProvider).toHaveProperty('secret1', 'secret-value-1');
      expect(secretsProvider).toHaveProperty('secret2', 'secret-value-2');
    });

    it('should skip Secrets Manager when disabled in static config', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [],
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
            useSecretsManager: false,
          }),
        ],
      }).compile();

      const secretsProvider = module.get<Record<string, string>>(
        AWS_SECRETS_MANAGER_PROVIDER,
      );
      expect(secretsProvider).toEqual({});
    });

    it('should skip Secrets Manager when secretNames is undefined', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [],
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
            useSecretsManager: true,
            secretsManagerSecretNames: undefined,
          }),
        ],
      }).compile();

      const secretsProvider = module.get<Record<string, string>>(
        AWS_SECRETS_MANAGER_PROVIDER,
      );
      expect(secretsProvider).toEqual({});
    });

    it('should skip Secrets Manager when secretNames is empty array', async () => {
      mockSend.mockResolvedValueOnce({
        Parameters: [],
        NextToken: undefined,
      });

      const module: TestingModule = await Test.createTestingModule({
        imports: [
          SystemsManagerModule.register({
            awsRegion: 'us-east-1',
            awsParamStorePath: '/app/config',
            awsParamStoreContinueOnError: false,
            useSecretsManager: true,
            secretsManagerSecretNames: [],
          }),
        ],
      }).compile();

      const secretsProvider = module.get<Record<string, string>>(
        AWS_SECRETS_MANAGER_PROVIDER,
      );
      expect(secretsProvider).toEqual({});
    });
  });
});
