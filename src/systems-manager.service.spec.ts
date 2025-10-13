import { Test, TestingModule } from '@nestjs/testing';
import { SystemsManagerService } from './systems-manager.service';
import {
  AWS_PARAM_STORE_PROVIDER,
  AWS_SECRETS_MANAGER_PROVIDER,
} from './constants';
import { Parameter } from '@aws-sdk/client-ssm';
import { ModuleOptions } from './interface';
import {
  ParameterStoreFetcherService,
  SecretsManagerFetcherService,
} from './services';

describe('SystemsManagerService', () => {
  let service: SystemsManagerService;

  const mockParameters: Parameter[] = [
    { Name: '/app/config/database-host', Value: 'localhost' },
    { Name: '/app/config/database-port', Value: '5432' },
    { Name: '/app/config/api-key', Value: 'secret-key-123' },
    { Name: '/app/config/timeout', Value: '30' },
    { Name: '/app/config/feature-flag', Value: 'true' },
  ];

  const mockConfig: ModuleOptions = {
    awsRegion: 'us-east-1',
    awsParamStorePath: '/app/config',
    awsParamStoreContinueOnError: false,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemsManagerService,
        {
          provide: AWS_PARAM_STORE_PROVIDER,
          useValue: mockParameters,
        },
        {
          provide: AWS_SECRETS_MANAGER_PROVIDER,
          useValue: {},
        },
        {
          provide: 'PARAM_STORE_CONFIG',
          useValue: mockConfig,
        },
        ParameterStoreFetcherService,
        SecretsManagerFetcherService,
      ],
    }).compile();

    service = module.get<SystemsManagerService>(SystemsManagerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructor', () => {
    it('should initialize with parameters from AWS', () => {
      expect(service).toBeInstanceOf(SystemsManagerService);
    });

    it('should extract parameter names from full paths', () => {
      // Parameter /app/config/database-host should be accessible as 'database-host'
      expect(service.get('database-host')).toBe('localhost');
      expect(service.get('database-port')).toBe('5432');
      expect(service.get('api-key')).toBe('secret-key-123');
    });

    it('should handle parameters with multiple path segments', async () => {
      const moduleWithDeepPath: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [
              {
                Name: '/app/production/us-east-1/database/primary-host',
                Value: 'prod-db.example.com',
              },
            ],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const serviceWithDeepPath = moduleWithDeepPath.get<SystemsManagerService>(
        SystemsManagerService,
      );
      // Should extract only the last segment
      expect(serviceWithDeepPath.get('primary-host')).toBe(
        'prod-db.example.com',
      );
    });

    it('should handle empty parameter array', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const emptyService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(emptyService).toBeDefined();
      expect(emptyService.get('any-key')).toBeUndefined();
    });
  });

  describe('get', () => {
    it('should return parameter value by key', () => {
      expect(service.get('database-host')).toBe('localhost');
      expect(service.get('api-key')).toBe('secret-key-123');
      expect(service.get('timeout')).toBe('30');
    });

    it('should return undefined for non-existent key', () => {
      expect(service.get('non-existent-key')).toBeUndefined();
      expect(service.get('')).toBeUndefined();
      expect(service.get('random')).toBeUndefined();
    });

    it('should handle keys with special characters', async () => {
      const moduleWithSpecialChars: TestingModule =
        await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [
                { Name: '/app/config/api-key-v2', Value: 'key-value' },
                {
                  Name: '/app/config/db_connection',
                  Value: 'connection-string',
                },
              ],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: mockConfig,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

      const specialService = moduleWithSpecialChars.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(specialService.get('api-key-v2')).toBe('key-value');
      expect(specialService.get('db_connection')).toBe('connection-string');
    });

    it('should be case-sensitive', () => {
      expect(service.get('database-host')).toBe('localhost');
      expect(service.get('Database-Host')).toBeUndefined();
      expect(service.get('DATABASE-HOST')).toBeUndefined();
    });
  });

  describe('getAsNumber', () => {
    it('should convert string to number', () => {
      expect(service.getAsNumber('database-port')).toBe(5432);
      expect(service.getAsNumber('timeout')).toBe(30);
    });

    it('should return NaN for non-numeric values', () => {
      expect(service.getAsNumber('database-host')).toBeNaN();
      expect(service.getAsNumber('api-key')).toBeNaN();
    });

    it('should return NaN for non-existent key', () => {
      expect(service.getAsNumber('non-existent')).toBeNaN();
    });

    it('should handle decimal numbers', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [
              { Name: '/app/config/rate-limit', Value: '99.5' },
              { Name: '/app/config/percentage', Value: '0.95' },
            ],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const decimalService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(decimalService.getAsNumber('rate-limit')).toBe(99.5);
      expect(decimalService.getAsNumber('percentage')).toBe(0.95);
    });

    it('should handle negative numbers', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [{ Name: '/app/config/offset', Value: '-10' }],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const negativeService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(negativeService.getAsNumber('offset')).toBe(-10);
    });

    it('should handle zero', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [{ Name: '/app/config/retries', Value: '0' }],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const zeroService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(zeroService.getAsNumber('retries')).toBe(0);
    });

    it('should handle scientific notation', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [{ Name: '/app/config/large-number', Value: '1e5' }],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const scientificService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(scientificService.getAsNumber('large-number')).toBe(100000);
    });
  });

  describe('edge cases', () => {
    it('should handle parameters with same final segment name', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [
              { Name: '/app/database/host', Value: 'db1.example.com' },
              { Name: '/app/cache/host', Value: 'cache1.example.com' },
            ],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const duplicateService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      // Last one should win due to how forEach works
      const hostValue = duplicateService.get('host');
      expect(hostValue).toBe('cache1.example.com');
    });

    it('should handle parameters with undefined values', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [{ Name: '/app/config/optional', Value: undefined }],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const undefinedService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(undefinedService.get('optional')).toBeUndefined();
    });

    it('should handle parameters with empty string values', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [{ Name: '/app/config/empty', Value: '' }],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const emptyService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(emptyService.get('empty')).toBe('');
    });

    it('should handle parameters ending with slash', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [{ Name: '/app/config/trailing/', Value: 'test-value' }],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const trailingService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      // Empty string after split on trailing slash
      expect(trailingService.get('')).toBe('test-value');
    });
  });

  describe('getOrDefault', () => {
    it('should return parameter value if key exists', () => {
      expect(service.getOrDefault('database-host', 'default-host')).toBe(
        'localhost',
      );
      expect(service.getOrDefault('api-key', 'default-key')).toBe(
        'secret-key-123',
      );
    });

    it('should return default value if key does not exist', () => {
      expect(service.getOrDefault('non-existent', 'default-value')).toBe(
        'default-value',
      );
      expect(service.getOrDefault('missing-key', 'fallback')).toBe('fallback');
    });

    it('should handle empty string as default', () => {
      expect(service.getOrDefault('non-existent', '')).toBe('');
    });

    it('should return empty string value if it exists', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [{ Name: '/app/config/empty', Value: '' }],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const emptyService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(emptyService.getOrDefault('empty', 'default')).toBe('');
    });
  });

  describe('getAsBoolean', () => {
    it('should return true for "true" value', () => {
      expect(service.getAsBoolean('feature-flag')).toBe(true);
    });

    it('should return true for "1" value', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [{ Name: '/app/config/enabled', Value: '1' }],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const boolService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(boolService.getAsBoolean('enabled')).toBe(true);
    });

    it('should return true for "yes" value', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [{ Name: '/app/config/active', Value: 'yes' }],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const boolService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(boolService.getAsBoolean('active')).toBe(true);
    });

    it('should return false for "false" value', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [{ Name: '/app/config/disabled', Value: 'false' }],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const boolService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(boolService.getAsBoolean('disabled')).toBe(false);
    });

    it('should return false for "0" value', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [{ Name: '/app/config/off', Value: '0' }],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const boolService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(boolService.getAsBoolean('off')).toBe(false);
    });

    it('should return false for non-existent key', () => {
      expect(service.getAsBoolean('non-existent')).toBe(false);
    });

    it('should be case-insensitive', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [
              { Name: '/app/config/upper', Value: 'TRUE' },
              { Name: '/app/config/mixed', Value: 'Yes' },
            ],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const boolService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(boolService.getAsBoolean('upper')).toBe(true);
      expect(boolService.getAsBoolean('mixed')).toBe(true);
    });
  });

  describe('getAsJSON', () => {
    it('should parse JSON object', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [
              {
                Name: '/app/config/json-obj',
                Value: '{"host":"localhost","port":5432}',
              },
            ],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const jsonService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      const result = jsonService.getAsJSON<{ host: string; port: number }>(
        'json-obj',
      );
      expect(result).toEqual({ host: 'localhost', port: 5432 });
      expect(result.host).toBe('localhost');
      expect(result.port).toBe(5432);
    });

    it('should parse JSON array', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [
              {
                Name: '/app/config/json-arr',
                Value: '["item1","item2","item3"]',
              },
            ],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const jsonService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      const result = jsonService.getAsJSON<string[]>('json-arr');
      expect(result).toEqual(['item1', 'item2', 'item3']);
      expect(result.length).toBe(3);
    });

    it('should throw error for invalid JSON', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [{ Name: '/app/config/invalid', Value: 'not-json' }],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const jsonService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(() => jsonService.getAsJSON('invalid')).toThrow(SyntaxError);
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      expect(service.has('database-host')).toBe(true);
      expect(service.has('database-port')).toBe(true);
      expect(service.has('api-key')).toBe(true);
    });

    it('should return false for non-existent keys', () => {
      expect(service.has('non-existent')).toBe(false);
      expect(service.has('missing-key')).toBe(false);
      expect(service.has('')).toBe(false);
    });

    it('should work with empty string values', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [{ Name: '/app/config/empty', Value: '' }],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const emptyService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      expect(emptyService.has('empty')).toBe(true);
    });
  });

  describe('getAllKeys', () => {
    it('should return all parameter keys', () => {
      const keys = service.getAllKeys();
      expect(keys).toContain('database-host');
      expect(keys).toContain('database-port');
      expect(keys).toContain('api-key');
      expect(keys).toContain('timeout');
      expect(keys).toContain('feature-flag');
      expect(keys.length).toBe(5);
    });

    it('should return empty array when no parameters exist', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const emptyService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      const keys = emptyService.getAllKeys();
      expect(keys).toEqual([]);
      expect(keys.length).toBe(0);
    });

    it('should return array that can be iterated', () => {
      const keys = service.getAllKeys();
      let count = 0;
      keys.forEach((key) => {
        expect(typeof key).toBe('string');
        count++;
      });
      expect(count).toBe(5);
    });
  });

  describe('getAll', () => {
    it('should return all parameters as object', () => {
      const all = service.getAll();
      expect(all).toEqual({
        'database-host': 'localhost',
        'database-port': '5432',
        'api-key': 'secret-key-123',
        timeout: '30',
        'feature-flag': 'true',
      });
    });

    it('should return a copy of parameters', () => {
      const all1 = service.getAll();
      const all2 = service.getAll();
      expect(all1).toEqual(all2);
      expect(all1).not.toBe(all2); // Different references
    });

    it('should return empty object when no parameters exist', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: [],
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: mockConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const emptyService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      const all = emptyService.getAll();
      expect(all).toEqual({});
      expect(Object.keys(all).length).toBe(0);
    });

    it('should not affect internal state when modified', () => {
      const all = service.getAll();
      all['new-key'] = 'new-value';

      expect(service.has('new-key')).toBe(false);
      expect(service.get('new-key')).toBeUndefined();
    });
  });

  describe('refresh', () => {
    it('should refresh parameters from AWS', async () => {
      const fetchParametersSpy = jest.spyOn(
        service['parameterFetcher'],
        'fetchParameters',
      );
      const newParameters: Parameter[] = [
        { Name: '/app/config/database-host', Value: 'updated-host' },
        { Name: '/app/config/database-port', Value: '3306' },
      ];

      fetchParametersSpy.mockResolvedValue(newParameters);

      expect(service.get('database-host')).toBe('localhost');
      expect(service.get('database-port')).toBe('5432');

      await service.refresh();

      expect(fetchParametersSpy).toHaveBeenCalledWith(
        'us-east-1',
        '/app/config',
        false,
      );
      expect(service.get('database-host')).toBe('updated-host');
      expect(service.get('database-port')).toBe('3306');

      fetchParametersSpy.mockRestore();
    });

    it('should update all parameter access methods after refresh', async () => {
      const fetchParametersSpy = jest.spyOn(
        service['parameterFetcher'],
        'fetchParameters',
      );
      const newParameters: Parameter[] = [
        { Name: '/app/config/new-key', Value: 'new-value' },
        { Name: '/app/config/count', Value: '42' },
      ];

      fetchParametersSpy.mockResolvedValue(newParameters);

      expect(service.has('new-key')).toBe(false);
      expect(service.getAllKeys()).not.toContain('new-key');

      await service.refresh();

      expect(service.has('new-key')).toBe(true);
      expect(service.get('new-key')).toBe('new-value');
      expect(service.getAsNumber('count')).toBe(42);
      expect(service.getAllKeys()).toContain('new-key');
      expect(service.getAllKeys()).toContain('count');

      fetchParametersSpy.mockRestore();
    });

    it('should remove old parameters after refresh', async () => {
      const fetchParametersSpy = jest.spyOn(
        service['parameterFetcher'],
        'fetchParameters',
      );
      const newParameters: Parameter[] = [
        { Name: '/app/config/only-this', Value: 'value' },
      ];

      fetchParametersSpy.mockResolvedValue(newParameters);

      expect(service.has('database-host')).toBe(true);
      expect(service.getAllKeys().length).toBe(5);

      await service.refresh();

      expect(service.has('database-host')).toBe(false);
      expect(service.has('only-this')).toBe(true);
      expect(service.getAllKeys()).toEqual(['only-this']);

      fetchParametersSpy.mockRestore();
    });

    it('should handle refresh with empty parameters', async () => {
      const fetchParametersSpy = jest.spyOn(
        service['parameterFetcher'],
        'fetchParameters',
      );
      fetchParametersSpy.mockResolvedValue([]);

      expect(service.getAllKeys().length).toBe(5);

      await service.refresh();

      expect(service.getAllKeys()).toEqual([]);
      expect(service.get('database-host')).toBeUndefined();

      fetchParametersSpy.mockRestore();
    });

    it('should propagate errors from getSSMParameters', async () => {
      const fetchParametersSpy = jest.spyOn(
        service['parameterFetcher'],
        'fetchParameters',
      );
      const testError = new Error('AWS API Error');
      fetchParametersSpy.mockRejectedValue(testError);

      await expect(service.refresh()).rejects.toThrow('AWS API Error');

      fetchParametersSpy.mockRestore();
    });

    it('should use config values from constructor', async () => {
      const customConfig: ModuleOptions = {
        awsRegion: 'eu-west-1',
        awsParamStorePath: '/custom/path',
        awsParamStoreContinueOnError: true,
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SystemsManagerService,
          {
            provide: AWS_PARAM_STORE_PROVIDER,
            useValue: mockParameters,
          },
          {
            provide: AWS_SECRETS_MANAGER_PROVIDER,
            useValue: {},
          },
          {
            provide: 'PARAM_STORE_CONFIG',
            useValue: customConfig,
          },
          ParameterStoreFetcherService,
          SecretsManagerFetcherService,
        ],
      }).compile();

      const customService = module.get<SystemsManagerService>(
        SystemsManagerService,
      );
      const fetchParametersSpy = jest.spyOn(
        customService['parameterFetcher'],
        'fetchParameters',
      );
      fetchParametersSpy.mockResolvedValue([]);

      await customService.refresh();

      expect(fetchParametersSpy).toHaveBeenCalledWith(
        'eu-west-1',
        '/custom/path',
        true,
      );

      fetchParametersSpy.mockRestore();
    });
  });

  describe('Parameter Hierarchy Support', () => {
    describe('with preserveHierarchy disabled (default behavior)', () => {
      it('should store parameters with only last segment', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [
                { Name: '/app/config/database/host', Value: 'localhost' },
                { Name: '/app/config/database/port', Value: '5432' },
                { Name: '/app/config/api/key', Value: 'secret' },
              ],
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: {
                awsRegion: 'us-east-1',
                awsParamStorePath: '/app/config',
                awsParamStoreContinueOnError: false,
                preserveHierarchy: false,
              },
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        // Should use only last segment
        expect(service.get('host')).toBe('localhost');
        expect(service.get('port')).toBe('5432');
        expect(service.get('key')).toBe('secret');

        // Hierarchical keys should not exist
        expect(service.get('database.host')).toBeUndefined();
        expect(service.get('api.key')).toBeUndefined();
      });
    });

    describe('with preserveHierarchy enabled', () => {
      it('should preserve path structure with default separator', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [
                { Name: '/app/config/database/host', Value: 'localhost' },
                { Name: '/app/config/database/port', Value: '5432' },
                { Name: '/app/config/api/key', Value: 'secret' },
              ],
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: {
                awsRegion: 'us-east-1',
                awsParamStorePath: '/app/config',
                awsParamStoreContinueOnError: false,
                preserveHierarchy: true,
                pathSeparator: '.',
              },
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        // Should use hierarchical keys with dot separator
        expect(service.get('database.host')).toBe('localhost');
        expect(service.get('database.port')).toBe('5432');
        expect(service.get('api.key')).toBe('secret');

        // Flat keys should not exist
        expect(service.get('host')).toBeUndefined();
        expect(service.get('port')).toBeUndefined();
        expect(service.get('key')).toBeUndefined();
      });

      it('should use custom path separator', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [
                { Name: '/app/config/database/host', Value: 'localhost' },
                { Name: '/app/config/api/auth/token', Value: 'secret-token' },
              ],
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: {
                awsRegion: 'us-east-1',
                awsParamStorePath: '/app/config',
                awsParamStoreContinueOnError: false,
                preserveHierarchy: true,
                pathSeparator: '/',
              },
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        // Should use custom separator
        expect(service.get('database/host')).toBe('localhost');
        expect(service.get('api/auth/token')).toBe('secret-token');
      });

      it('should handle deeply nested paths', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [
                {
                  Name: '/app/config/api/auth/jwt/secret',
                  Value: 'jwt-secret',
                },
                {
                  Name: '/app/config/api/auth/jwt/expiry',
                  Value: '3600',
                },
              ],
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: {
                awsRegion: 'us-east-1',
                awsParamStorePath: '/app/config',
                awsParamStoreContinueOnError: false,
                preserveHierarchy: true,
                pathSeparator: '.',
              },
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        expect(service.get('api.auth.jwt.secret')).toBe('jwt-secret');
        expect(service.get('api.auth.jwt.expiry')).toBe('3600');
        expect(service.getAsNumber('api.auth.jwt.expiry')).toBe(3600);
      });

      it('should handle single-level parameters', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [{ Name: '/app/config/version', Value: '1.0.0' }],
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: {
                awsRegion: 'us-east-1',
                awsParamStorePath: '/app/config',
                awsParamStoreContinueOnError: false,
                preserveHierarchy: true,
                pathSeparator: '.',
              },
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        // Single level should work without separator
        expect(service.get('version')).toBe('1.0.0');
      });

      it('should handle parameters with trailing slashes', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [{ Name: '/app/config/database/', Value: 'db-value' }],
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: {
                awsRegion: 'us-east-1',
                awsParamStorePath: '/app/config',
                awsParamStoreContinueOnError: false,
                preserveHierarchy: true,
                pathSeparator: '.',
              },
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        // Should handle trailing slashes correctly
        expect(service.get('database')).toBe('db-value');
      });

      it('should work with all service methods', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [
                { Name: '/app/config/database/host', Value: 'localhost' },
                { Name: '/app/config/database/port', Value: '5432' },
                { Name: '/app/config/features/enabled', Value: 'true' },
                {
                  Name: '/app/config/api/settings',
                  Value: '{"timeout":30,"retries":3}',
                },
              ],
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: {
                awsRegion: 'us-east-1',
                awsParamStorePath: '/app/config',
                awsParamStoreContinueOnError: false,
                preserveHierarchy: true,
                pathSeparator: '.',
              },
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        // Test get
        expect(service.get('database.host')).toBe('localhost');

        // Test getAsNumber
        expect(service.getAsNumber('database.port')).toBe(5432);

        // Test getAsBoolean
        expect(service.getAsBoolean('features.enabled')).toBe(true);

        // Test getAsJSON
        const settings = service.getAsJSON<{
          timeout: number;
          retries: number;
        }>('api.settings');
        expect(settings.timeout).toBe(30);
        expect(settings.retries).toBe(3);

        // Test has
        expect(service.has('database.host')).toBe(true);
        expect(service.has('nonexistent.key')).toBe(false);

        // Test getOrDefault
        expect(service.getOrDefault('database.host', 'default')).toBe(
          'localhost',
        );
        expect(service.getOrDefault('missing.key', 'default')).toBe('default');

        // Test getAllKeys
        const keys = service.getAllKeys();
        expect(keys).toContain('database.host');
        expect(keys).toContain('database.port');
        expect(keys).toContain('features.enabled');
        expect(keys).toContain('api.settings');

        // Test getAll
        const all = service.getAll();
        expect(all['database.host']).toBe('localhost');
        expect(all['database.port']).toBe('5432');
      });

      it('should work with refresh method', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [
                { Name: '/app/config/database/host', Value: 'localhost' },
              ],
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: {
                awsRegion: 'us-east-1',
                awsParamStorePath: '/app/config',
                awsParamStoreContinueOnError: false,
                preserveHierarchy: true,
                pathSeparator: '.',
              },
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        expect(service.get('database.host')).toBe('localhost');

        const fetchParametersSpy = jest.spyOn(
          service['parameterFetcher'],
          'fetchParameters',
        );
        const newParameters: Parameter[] = [
          { Name: '/app/config/database/host', Value: 'updated-host' },
          { Name: '/app/config/api/key', Value: 'new-key' },
        ];
        fetchParametersSpy.mockResolvedValue(newParameters);

        await service.refresh();

        // Should maintain hierarchical structure after refresh
        expect(service.get('database.host')).toBe('updated-host');
        expect(service.get('api.key')).toBe('new-key');
        expect(service.has('database.host')).toBe(true);

        fetchParametersSpy.mockRestore();
      });

      it('should handle underscore separator', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [
                { Name: '/app/config/database/host', Value: 'localhost' },
              ],
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: {
                awsRegion: 'us-east-1',
                awsParamStorePath: '/app/config',
                awsParamStoreContinueOnError: false,
                preserveHierarchy: true,
                pathSeparator: '_',
              },
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        expect(service.get('database_host')).toBe('localhost');
      });
    });

    describe('edge cases with hierarchy', () => {
      it('should handle different parameters with same suffix', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [
                { Name: '/app/config/database/host', Value: 'db-host' },
                { Name: '/app/config/cache/host', Value: 'cache-host' },
                { Name: '/app/config/queue/host', Value: 'queue-host' },
              ],
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: {
                awsRegion: 'us-east-1',
                awsParamStorePath: '/app/config',
                awsParamStoreContinueOnError: false,
                preserveHierarchy: true,
                pathSeparator: '.',
              },
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        // All should be accessible uniquely
        expect(service.get('database.host')).toBe('db-host');
        expect(service.get('cache.host')).toBe('cache-host');
        expect(service.get('queue.host')).toBe('queue-host');

        const keys = service.getAllKeys();
        expect(keys.length).toBe(3);
      });

      it('should handle empty path segments correctly', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [
                { Name: '/app/config//database/host', Value: 'host-value' },
              ],
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: {
                awsRegion: 'us-east-1',
                awsParamStorePath: '/app/config',
                awsParamStoreContinueOnError: false,
                preserveHierarchy: true,
                pathSeparator: '.',
              },
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        // Should filter out empty segments
        expect(service.get('database.host')).toBe('host-value');
      });
    });
  });
  describe('Secrets Manager Support', () => {
    describe('constructor with secrets', () => {
      it('should load secrets from Secrets Manager', async () => {
        const mockSecrets = {
          'database-password': 'super-secret-password',
          'api-token': 'secret-api-token-123',
          'encryption-key': 'encryption-key-value',
        };

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: mockSecrets,
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: mockConfig,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );
        expect(service.getSecret('database-password')).toBe(
          'super-secret-password',
        );
        expect(service.getSecret('api-token')).toBe('secret-api-token-123');
        expect(service.getSecret('encryption-key')).toBe(
          'encryption-key-value',
        );
      });

      it('should handle empty secrets object', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: mockConfig,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );
        expect(service.getSecret('any-secret')).toBeUndefined();
        expect(service.getAllSecretKeys()).toEqual([]);
      });
    });

    describe('getSecret', () => {
      it('should return secret value by key', async () => {
        const mockSecrets = {
          'db-password': 'password123',
          'api-key': 'secret-key',
        };

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: mockSecrets,
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: mockConfig,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );
        expect(service.getSecret('db-password')).toBe('password123');
        expect(service.getSecret('api-key')).toBe('secret-key');
      });

      it('should return undefined for non-existent secret', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: { 'existing-secret': 'value' },
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: mockConfig,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );
        expect(service.getSecret('non-existent')).toBeUndefined();
      });
    });

    describe('getParameter vs getSecret vs get', () => {
      it('should distinguish between parameters and secrets', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [
                { Name: '/app/config/param-key', Value: 'param-value' },
              ],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: { 'secret-key': 'secret-value' },
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: mockConfig,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        // getParameter should only return parameters
        expect(service.getParameter('param-key')).toBe('param-value');
        expect(service.getParameter('secret-key')).toBeUndefined();

        // getSecret should only return secrets
        expect(service.getSecret('secret-key')).toBe('secret-value');
        expect(service.getSecret('param-key')).toBeUndefined();

        // get should return from both (parameters first)
        expect(service.get('param-key')).toBe('param-value');
        expect(service.get('secret-key')).toBe('secret-value');
      });

      it('should prioritize parameters over secrets in get()', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [
                { Name: '/app/config/shared-key', Value: 'parameter-value' },
              ],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: { 'shared-key': 'secret-value' },
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: mockConfig,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        // Parameter should take precedence
        expect(service.get('shared-key')).toBe('parameter-value');
        expect(service.getParameter('shared-key')).toBe('parameter-value');
        expect(service.getSecret('shared-key')).toBe('secret-value');
      });
    });

    describe('hasParameter vs hasSecret vs has', () => {
      it('should check existence correctly', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [{ Name: '/app/config/param', Value: 'value' }],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: { secret: 'value' },
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: mockConfig,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        expect(service.hasParameter('param')).toBe(true);
        expect(service.hasParameter('secret')).toBe(false);

        expect(service.hasSecret('secret')).toBe(true);
        expect(service.hasSecret('param')).toBe(false);

        expect(service.has('param')).toBe(true);
        expect(service.has('secret')).toBe(true);
        expect(service.has('nonexistent')).toBe(false);
      });
    });

    describe('getAllParameterKeys vs getAllSecretKeys vs getAllKeys', () => {
      it('should return correct keys for each store', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [
                { Name: '/app/config/param1', Value: 'value1' },
                { Name: '/app/config/param2', Value: 'value2' },
              ],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {
                secret1: 'value1',
                secret2: 'value2',
                secret3: 'value3',
              },
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: mockConfig,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        const paramKeys = service.getAllParameterKeys();
        expect(paramKeys).toEqual(['param1', 'param2']);
        expect(paramKeys.length).toBe(2);

        const secretKeys = service.getAllSecretKeys();
        expect(secretKeys).toEqual(['secret1', 'secret2', 'secret3']);
        expect(secretKeys.length).toBe(3);

        const allKeys = service.getAllKeys();
        expect(allKeys.length).toBe(5);
        expect(allKeys).toContain('param1');
        expect(allKeys).toContain('param2');
        expect(allKeys).toContain('secret1');
        expect(allKeys).toContain('secret2');
        expect(allKeys).toContain('secret3');
      });
    });

    describe('getAllParameters vs getAllSecrets vs getAll', () => {
      it('should return correct data for each store', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [
                { Name: '/app/config/param1', Value: 'pvalue1' },
                { Name: '/app/config/param2', Value: 'pvalue2' },
              ],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {
                secret1: 'svalue1',
                secret2: 'svalue2',
              },
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: mockConfig,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        const allParams = service.getAllParameters();
        expect(allParams).toEqual({
          param1: 'pvalue1',
          param2: 'pvalue2',
        });

        const allSecrets = service.getAllSecrets();
        expect(allSecrets).toEqual({
          secret1: 'svalue1',
          secret2: 'svalue2',
        });

        const all = service.getAll();
        expect(all).toEqual({
          param1: 'pvalue1',
          param2: 'pvalue2',
          secret1: 'svalue1',
          secret2: 'svalue2',
        });
      });

      it('should return copies, not references', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [{ Name: '/app/config/p', Value: 'v' }],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: { s: 'v' },
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: mockConfig,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        const params1 = service.getAllParameters();
        const params2 = service.getAllParameters();
        expect(params1).not.toBe(params2);

        const secrets1 = service.getAllSecrets();
        const secrets2 = service.getAllSecrets();
        expect(secrets1).not.toBe(secrets2);

        const all1 = service.getAll();
        const all2 = service.getAll();
        expect(all1).not.toBe(all2);
      });

      it('should have secrets override parameters in getAll()', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [{ Name: '/app/config/shared', Value: 'param-value' }],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: { shared: 'secret-value' },
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: mockConfig,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        const all = service.getAll();
        // Secrets should override parameters in combined view
        expect(all['shared']).toBe('secret-value');
      });
    });

    describe('refresh with Secrets Manager', () => {
      it('should refresh both parameters and secrets', async () => {
        const configWithSecrets: ModuleOptions = {
          awsRegion: 'us-east-1',
          awsParamStorePath: '/app/config',
          awsParamStoreContinueOnError: false,
          useSecretsManager: true,
          secretsManagerSecretNames: ['secret1', 'secret2'],
        };

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [{ Name: '/app/config/param', Value: 'old-param' }],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: { secret1: 'old-secret' },
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: configWithSecrets,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        expect(service.getParameter('param')).toBe('old-param');
        expect(service.getSecret('secret1')).toBe('old-secret');

        // Mock refresh methods
        const fetchParametersSpy = jest.spyOn(
          service['parameterFetcher'],
          'fetchParameters',
        );
        const fetchSecretsSpy = jest.spyOn(
          service['secretsFetcher'],
          'fetchSecrets',
        );

        fetchParametersSpy.mockResolvedValue([
          { Name: '/app/config/param', Value: 'new-param' },
        ]);
        fetchSecretsSpy.mockResolvedValue({
          secret1: 'new-secret',
          secret2: 'another-secret',
        });

        await service.refresh();

        expect(fetchParametersSpy).toHaveBeenCalledWith(
          'us-east-1',
          '/app/config',
          false,
        );
        expect(fetchSecretsSpy).toHaveBeenCalledWith(
          'us-east-1',
          ['secret1', 'secret2'],
          false,
        );

        expect(service.getParameter('param')).toBe('new-param');
        expect(service.getSecret('secret1')).toBe('new-secret');
        expect(service.getSecret('secret2')).toBe('another-secret');

        fetchParametersSpy.mockRestore();
        fetchSecretsSpy.mockRestore();
      });

      it('should skip secrets refresh when not enabled', async () => {
        const configWithoutSecrets: ModuleOptions = {
          awsRegion: 'us-east-1',
          awsParamStorePath: '/app/config',
          awsParamStoreContinueOnError: false,
          useSecretsManager: false,
        };

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [{ Name: '/app/config/param', Value: 'value' }],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: configWithoutSecrets,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        const fetchParametersSpy = jest.spyOn(
          service['parameterFetcher'],
          'fetchParameters',
        );
        const fetchSecretsSpy = jest.spyOn(
          service['secretsFetcher'],
          'fetchSecrets',
        );

        fetchParametersSpy.mockResolvedValue([]);

        await service.refresh();

        expect(fetchParametersSpy).toHaveBeenCalled();
        expect(fetchSecretsSpy).not.toHaveBeenCalled();

        fetchParametersSpy.mockRestore();
        fetchSecretsSpy.mockRestore();
      });
    });

    describe('refreshParameters', () => {
      it('should refresh only parameters', async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [{ Name: '/app/config/param', Value: 'old' }],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: { secret: 'unchanged' },
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: mockConfig,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        const fetchParametersSpy = jest.spyOn(
          service['parameterFetcher'],
          'fetchParameters',
        );
        const fetchSecretsSpy = jest.spyOn(
          service['secretsFetcher'],
          'fetchSecrets',
        );

        fetchParametersSpy.mockResolvedValue([
          { Name: '/app/config/param', Value: 'new' },
        ]);

        await service.refreshParameters();

        expect(fetchParametersSpy).toHaveBeenCalled();
        expect(fetchSecretsSpy).not.toHaveBeenCalled();
        expect(service.getParameter('param')).toBe('new');
        expect(service.getSecret('secret')).toBe('unchanged');

        fetchParametersSpy.mockRestore();
        fetchSecretsSpy.mockRestore();
      });
    });

    describe('refreshSecrets', () => {
      it('should refresh only secrets when enabled', async () => {
        const configWithSecrets: ModuleOptions = {
          awsRegion: 'us-east-1',
          awsParamStorePath: '/app/config',
          awsParamStoreContinueOnError: false,
          useSecretsManager: true,
          secretsManagerSecretNames: ['secret1'],
        };

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [{ Name: '/app/config/param', Value: 'unchanged' }],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: { secret1: 'old' },
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: configWithSecrets,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        const fetchParametersSpy = jest.spyOn(
          service['parameterFetcher'],
          'fetchParameters',
        );
        const fetchSecretsSpy = jest.spyOn(
          service['secretsFetcher'],
          'fetchSecrets',
        );

        fetchSecretsSpy.mockResolvedValue({ secret1: 'new' });

        await service.refreshSecrets();

        expect(fetchParametersSpy).not.toHaveBeenCalled();
        expect(fetchSecretsSpy).toHaveBeenCalledWith(
          'us-east-1',
          ['secret1'],
          false,
        );
        expect(service.getParameter('param')).toBe('unchanged');
        expect(service.getSecret('secret1')).toBe('new');

        fetchParametersSpy.mockRestore();
        fetchSecretsSpy.mockRestore();
      });

      it('should throw error when Secrets Manager not enabled', async () => {
        const configWithoutSecrets: ModuleOptions = {
          awsRegion: 'us-east-1',
          awsParamStorePath: '/app/config',
          awsParamStoreContinueOnError: false,
          useSecretsManager: false,
        };

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: configWithoutSecrets,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        await expect(service.refreshSecrets()).rejects.toThrow(
          'Secrets Manager is not enabled or no secret names configured',
        );
      });

      it('should throw error when secret names not configured', async () => {
        const configWithoutSecretNames: ModuleOptions = {
          awsRegion: 'us-east-1',
          awsParamStorePath: '/app/config',
          awsParamStoreContinueOnError: false,
          useSecretsManager: true,
          secretsManagerSecretNames: [],
        };

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            SystemsManagerService,
            {
              provide: AWS_PARAM_STORE_PROVIDER,
              useValue: [],
            },
            {
              provide: AWS_SECRETS_MANAGER_PROVIDER,
              useValue: {},
            },
            {
              provide: 'PARAM_STORE_CONFIG',
              useValue: configWithoutSecretNames,
            },
            ParameterStoreFetcherService,
            SecretsManagerFetcherService,
          ],
        }).compile();

        const service = module.get<SystemsManagerService>(
          SystemsManagerService,
        );

        await expect(service.refreshSecrets()).rejects.toThrow(
          'Secrets Manager is not enabled or no secret names configured',
        );
      });
    });
  });
});
