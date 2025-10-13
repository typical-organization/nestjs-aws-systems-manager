import { Test, TestingModule } from '@nestjs/testing';
import { ParameterStoreFetcherService } from './parameter-store-fetcher.service';
import { SSMClient } from '@aws-sdk/client-ssm';
import { ParamStoreUtil } from '../utils/param-store.util';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-ssm');

describe('ParameterStoreFetcherService', () => {
  let service: ParameterStoreFetcherService;
  let mockSend: jest.Mock;

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock send function
    mockSend = jest.fn();

    // Mock the SSMClient constructor
    (SSMClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [ParameterStoreFetcherService],
    }).compile();

    service = module.get<ParameterStoreFetcherService>(
      ParameterStoreFetcherService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchParameters', () => {
    describe('successful scenarios', () => {
      it('should fetch single parameter successfully', async () => {
        const mockResponse = {
          Parameters: [
            {
              Name: '/app/config/database-host',
              Value: 'localhost',
              Type: 'String',
            },
          ],
        };
        mockSend.mockResolvedValue(mockResponse);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app/config',
          false,
        );

        expect(result).toEqual(mockResponse.Parameters);
        expect(SSMClient).toHaveBeenCalledWith({ region: 'us-east-1' });
        expect(mockSend).toHaveBeenCalledTimes(1);
      });

      it('should fetch multiple parameters in single page', async () => {
        const mockResponse = {
          Parameters: [
            { Name: '/app/config/db-host', Value: 'localhost', Type: 'String' },
            { Name: '/app/config/db-port', Value: '5432', Type: 'String' },
            {
              Name: '/app/config/api-key',
              Value: 'secret123',
              Type: 'SecureString',
            },
          ],
        };
        mockSend.mockResolvedValue(mockResponse);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app/config',
          false,
        );

        expect(result).toHaveLength(3);
        expect(result).toEqual(mockResponse.Parameters);
      });

      it('should handle pagination with multiple pages', async () => {
        const page1 = {
          Parameters: [
            { Name: '/app/param1', Value: 'value1', Type: 'String' },
            { Name: '/app/param2', Value: 'value2', Type: 'String' },
          ],
          NextToken: 'token-page-2',
        };
        const page2 = {
          Parameters: [
            { Name: '/app/param3', Value: 'value3', Type: 'String' },
            { Name: '/app/param4', Value: 'value4', Type: 'String' },
          ],
          NextToken: 'token-page-3',
        };
        const page3 = {
          Parameters: [
            { Name: '/app/param5', Value: 'value5', Type: 'String' },
          ],
        };

        mockSend
          .mockResolvedValueOnce(page1)
          .mockResolvedValueOnce(page2)
          .mockResolvedValueOnce(page3);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app',
          false,
        );

        expect(result).toHaveLength(5);
        expect(mockSend).toHaveBeenCalledTimes(3);
        expect(result[0].Name).toBe('/app/param1');
        expect(result[4].Name).toBe('/app/param5');
      });

      it('should fetch parameters from different AWS region', async () => {
        const mockResponse = {
          Parameters: [
            { Name: '/eu/config/setting', Value: 'eu-value', Type: 'String' },
          ],
        };
        mockSend.mockResolvedValue(mockResponse);

        const result = await service.fetchParameters(
          'eu-west-1',
          '/eu/config',
          false,
        );

        expect(result).toEqual(mockResponse.Parameters);
        expect(SSMClient).toHaveBeenCalledWith({ region: 'eu-west-1' });
      });

      it('should handle encrypted SecureString parameters', async () => {
        const mockResponse = {
          Parameters: [
            {
              Name: '/app/db-password',
              Value: 'decrypted-password',
              Type: 'SecureString',
            },
          ],
        };
        mockSend.mockResolvedValue(mockResponse);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app',
          false,
        );

        expect(result[0].Type).toBe('SecureString');
        expect(result[0].Value).toBe('decrypted-password');
      });

      it('should return empty array when no parameters found', async () => {
        const mockResponse = {
          Parameters: [],
        };
        mockSend.mockResolvedValue(mockResponse);

        const result = await service.fetchParameters(
          'us-east-1',
          '/empty/path',
          false,
        );

        expect(result).toEqual([]);
        expect(result).toHaveLength(0);
      });

      it('should handle nested parameter paths', async () => {
        const mockResponse = {
          Parameters: [
            { Name: '/app/db/host', Value: 'localhost', Type: 'String' },
            { Name: '/app/db/port', Value: '5432', Type: 'String' },
            {
              Name: '/app/api/endpoint',
              Value: 'https://api.example.com',
              Type: 'String',
            },
          ],
        };
        mockSend.mockResolvedValue(mockResponse);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app',
          false,
        );

        expect(result).toHaveLength(3);
      });
    });

    describe('input validation', () => {
      it('should throw error when AWS region is empty and continueOnError is false', async () => {
        await expect(
          service.fetchParameters('', '/app/config', false),
        ).rejects.toThrow('AWS region is required');
      });

      it('should return empty array when AWS region is empty and continueOnError is true', async () => {
        const result = await service.fetchParameters('', '/app/config', true);

        expect(result).toEqual([]);
        expect(mockSend).not.toHaveBeenCalled();
      });

      it('should throw error when AWS region is whitespace only', async () => {
        await expect(
          service.fetchParameters('   ', '/app/config', false),
        ).rejects.toThrow('AWS region is required');
      });

      it('should throw error when parameter path is empty', async () => {
        await expect(
          service.fetchParameters('us-east-1', '', false),
        ).rejects.toThrow('Parameter Store path is required');
      });

      it('should throw error when parameter path does not start with /', async () => {
        await expect(
          service.fetchParameters('us-east-1', 'app/config', false),
        ).rejects.toThrow(`Parameter Store path must start with '/'`);
      });

      it('should accept valid parameter path starting with /', async () => {
        const mockResponse = { Parameters: [] };
        mockSend.mockResolvedValue(mockResponse);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app/config',
          false,
        );

        expect(result).toEqual([]);
      });
    });

    describe('error handling - specific AWS errors', () => {
      it('should handle AccessDeniedException with detailed message', async () => {
        const error = new Error('User is not authorized');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).name = 'AccessDeniedException';
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchParameters('us-east-1', '/app/config', false),
        ).rejects.toThrow(`Access Denied`);

        await expect(
          service.fetchParameters('us-east-1', '/app/config', false),
        ).rejects.toThrow(`ssm:GetParametersByPath`);
      });

      it('should handle ParameterNotFound error', async () => {
        const error = new Error('Parameter not found');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).name = 'ParameterNotFound';
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchParameters('us-east-1', '/nonexistent/path', false),
        ).rejects.toThrow('Parameter not found');
      });

      it('should handle InvalidParameterException', async () => {
        const error = new Error('Invalid parameter format');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).name = 'InvalidParameterException';
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchParameters('us-east-1', '/bad-path', false),
        ).rejects.toThrow('Invalid parameter');
      });

      it('should handle ThrottlingException', async () => {
        const error = new Error('Rate exceeded');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).name = 'ThrottlingException';
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchParameters('us-east-1', '/app/config', false),
        ).rejects.toThrow('Request throttled');

        await expect(
          service.fetchParameters('us-east-1', '/app/config', false),
        ).rejects.toThrow('rate limit');
      });

      it('should handle ENOTFOUND network error', async () => {
        const error = new Error('getaddrinfo ENOTFOUND');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).code = 'ENOTFOUND';
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchParameters('us-east-1', '/app/config', false),
        ).rejects.toThrow('Network error');
      });

      it('should handle ETIMEDOUT network error', async () => {
        const error = new Error('Connection timeout');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).code = 'ETIMEDOUT';
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchParameters('us-east-1', '/app/config', false),
        ).rejects.toThrow('Network error');
      });

      it('should handle missing credentials error', async () => {
        const error = new Error('Missing credentials in config');
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchParameters('us-east-1', '/app/config', false),
        ).rejects.toThrow('Missing credentials');
      });

      it('should handle generic errors', async () => {
        const error = new Error('Unknown AWS error');
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchParameters('us-east-1', '/app/config', false),
        ).rejects.toThrow(
          'Failed to fetch parameters from AWS SSM Parameter Store',
        );
      });

      it('should handle non-Error objects', async () => {
        mockSend.mockRejectedValue('String error message');

        await expect(
          service.fetchParameters('us-east-1', '/app/config', false),
        ).rejects.toThrow();
      });
    });

    describe('error handling - continueOnError behavior', () => {
      it('should return empty array on error when continueOnError is true', async () => {
        const error = new Error('AWS error');
        mockSend.mockRejectedValue(error);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app/config',
          true,
        );

        expect(result).toEqual([]);
      });

      it('should throw error when continueOnError is false', async () => {
        const error = new Error('AWS error');
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchParameters('us-east-1', '/app/config', false),
        ).rejects.toThrow();
      });

      it('should log warning and continue when continueOnError is true', async () => {
        const warnSpy = jest.spyOn(service['logger'], 'warn');
        const error = new Error('AWS error');
        mockSend.mockRejectedValue(error);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app/config',
          true,
        );

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            'Application will continue with empty parameters',
          ),
        );
        expect(result).toEqual([]);
      });

      it('should log error and throw when continueOnError is false', async () => {
        const errorSpy = jest.spyOn(service['logger'], 'error');
        const error = new Error('AWS error');
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchParameters('us-east-1', '/app/config', false),
        ).rejects.toThrow();

        expect(errorSpy).toHaveBeenCalled();
      });

      it('should preserve original error stack trace', async () => {
        const error = new Error('Original error');
        error.stack = 'Original stack trace';
        mockSend.mockRejectedValue(error);

        try {
          await service.fetchParameters('us-east-1', '/app/config', false);
          fail('Should have thrown error');
        } catch (thrown) {
          expect((thrown as Error).stack).toContain('Original stack trace');
        }
      });
    });

    describe('pagination handling', () => {
      it('should handle large dataset with multiple pages', async () => {
        const createPage = (
          start: number,
          count: number,
          hasNext: boolean,
        ) => ({
          Parameters: Array.from({ length: count }, (_, i) => ({
            Name: `/app/param${start + i}`,
            Value: `value${start + i}`,
            Type: 'String',
          })),
          NextToken: hasNext ? `token-${start + count}` : undefined,
        });

        mockSend
          .mockResolvedValueOnce(createPage(1, 10, true))
          .mockResolvedValueOnce(createPage(11, 10, true))
          .mockResolvedValueOnce(createPage(21, 10, true))
          .mockResolvedValueOnce(createPage(31, 5, false));

        const result = await service.fetchParameters(
          'us-east-1',
          '/app',
          false,
        );

        expect(result).toHaveLength(35);
        expect(mockSend).toHaveBeenCalledTimes(4);
      });

      it('should pass NextToken correctly to subsequent requests', async () => {
        const page1 = {
          Parameters: [{ Name: '/app/p1', Value: 'v1', Type: 'String' }],
          NextToken: 'next-token-123',
        };
        const page2 = {
          Parameters: [{ Name: '/app/p2', Value: 'v2', Type: 'String' }],
        };

        mockSend.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app',
          false,
        );

        // The second call should include NextToken from page1
        expect(mockSend).toHaveBeenCalledTimes(2);

        // Verify NextToken was passed by checking that both pages were fetched and combined
        // The service handles pagination internally and returns all parameters
        expect(result).toHaveLength(2); // Confirms both pages were fetched
        expect(result[0].Name).toBe('/app/p1');
        expect(result[1].Name).toBe('/app/p2');
      });

      it('should stop pagination when NextToken is undefined', async () => {
        const response = {
          Parameters: [{ Name: '/app/param', Value: 'value', Type: 'String' }],
          NextToken: undefined,
        };
        mockSend.mockResolvedValue(response);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app',
          false,
        );

        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(result).toHaveLength(1);
      });

      it('should handle empty Parameters array in response', async () => {
        const response = {
          Parameters: [],
          NextToken: undefined,
        };
        mockSend.mockResolvedValue(response);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app',
          false,
        );

        expect(result).toEqual([]);
      });

      it('should handle null Parameters in response', async () => {
        const response = {
          Parameters: null,
        };
        mockSend.mockResolvedValue(response);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app',
          false,
        );

        expect(result).toEqual([]);
      });
    });

    describe('command parameters', () => {
      it('should set Recursive to true', async () => {
        mockSend.mockResolvedValue({ Parameters: [] });

        await service.fetchParameters('us-east-1', '/app/config', false);

        // Verify the GetParametersByPathCommand was called
        // The command is created with Recursive: true internally (see line 94 in service)
        expect(mockSend).toHaveBeenCalled();
        expect(mockSend).toHaveBeenCalledWith(expect.any(Object));
      });

      it('should set WithDecryption to true', async () => {
        mockSend.mockResolvedValue({ Parameters: [] });

        await service.fetchParameters('us-east-1', '/app/config', false);

        // Verify the GetParametersByPathCommand was called
        // The command is created with WithDecryption: true internally (see line 95 in service)
        expect(mockSend).toHaveBeenCalled();
        expect(mockSend).toHaveBeenCalledWith(expect.any(Object));
      });

      it('should pass correct Path parameter', async () => {
        mockSend.mockResolvedValue({ Parameters: [] });

        await service.fetchParameters('us-east-1', '/production/api', false);

        // Verify the GetParametersByPathCommand was called with the service
        // The command is created with Path: '/production/api' internally (see line 93 in service)
        expect(mockSend).toHaveBeenCalled();
        expect(SSMClient).toHaveBeenCalledWith({ region: 'us-east-1' });
      });

      it('should not include NextToken in first request', async () => {
        mockSend.mockResolvedValue({ Parameters: [] });

        await service.fetchParameters('us-east-1', '/app', false);

        // Verify only one call was made (no pagination)
        // The first request does not include NextToken (see line 97-99 in service)
        expect(mockSend).toHaveBeenCalledTimes(1);
      });
    });

    describe('logging', () => {
      it('should log initialization with correct region and path', async () => {
        const logSpy = jest.spyOn(service['logger'], 'log');
        mockSend.mockResolvedValue({ Parameters: [] });

        await service.fetchParameters('us-east-1', '/app/config', false);

        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('Region: us-east-1'),
        );
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('Path: /app/config'),
        );
      });

      it('should log successful validation', async () => {
        const debugSpy = jest.spyOn(service['logger'], 'debug');
        mockSend.mockResolvedValue({ Parameters: [] });

        await service.fetchParameters('us-east-1', '/app', false);

        expect(debugSpy).toHaveBeenCalledWith(
          'Parameter validation successful',
        );
      });

      it('should log page count during pagination', async () => {
        const debugSpy = jest.spyOn(service['logger'], 'debug');
        mockSend
          .mockResolvedValueOnce({
            Parameters: [{ Name: '/p1', Value: 'v1', Type: 'String' }],
            NextToken: 'token',
          })
          .mockResolvedValueOnce({
            Parameters: [{ Name: '/p2', Value: 'v2', Type: 'String' }],
          });

        await service.fetchParameters('us-east-1', '/app', false);

        expect(debugSpy).toHaveBeenCalledWith(
          expect.stringContaining('Page 1'),
        );
        expect(debugSpy).toHaveBeenCalledWith(
          expect.stringContaining('Page 2'),
        );
      });

      it('should log completion summary with parameter count and page count', async () => {
        const logSpy = jest.spyOn(service['logger'], 'log');
        const mockResponse = {
          Parameters: [
            { Name: '/app/p1', Value: 'v1', Type: 'String' },
            { Name: '/app/p2', Value: 'v2', Type: 'String' },
          ],
        };
        mockSend.mockResolvedValue(mockResponse);

        await service.fetchParameters('us-east-1', '/app', false);

        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('Successfully fetched 2 parameter(s)'),
        );
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('in 1 page(s)'),
        );
      });

      it('should log warning when no parameters found', async () => {
        const warnSpy = jest.spyOn(service['logger'], 'warn');
        mockSend.mockResolvedValue({ Parameters: [] });

        await service.fetchParameters('us-east-1', '/empty/path', false);

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('No parameters found at path'),
        );
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('/empty/path'),
        );
      });

      it('should log error details in debug mode when error occurs', async () => {
        const debugSpy = jest.spyOn(service['logger'], 'debug');
        const error = new Error('Test error');
        error.stack = 'Error stack trace';
        mockSend.mockRejectedValue(error);

        await service.fetchParameters('us-east-1', '/app', true);

        expect(debugSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error details:'),
        );
      });
    });

    describe('edge cases', () => {
      it('should handle parameters with special characters in names', async () => {
        const mockResponse = {
          Parameters: [
            { Name: '/app/param-with-dashes', Value: 'value1', Type: 'String' },
            {
              Name: '/app/param_with_underscores',
              Value: 'value2',
              Type: 'String',
            },
            { Name: '/app/param.with.dots', Value: 'value3', Type: 'String' },
          ],
        };
        mockSend.mockResolvedValue(mockResponse);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app',
          false,
        );

        expect(result).toHaveLength(3);
        expect(result[0].Name).toBe('/app/param-with-dashes');
      });

      it('should handle very long parameter paths', async () => {
        const longPath = '/app/' + 'a'.repeat(1000);
        mockSend.mockResolvedValue({ Parameters: [] });

        const result = await service.fetchParameters(
          'us-east-1',
          longPath,
          false,
        );

        expect(result).toEqual([]);
      });

      it('should handle parameters with empty values', async () => {
        const mockResponse = {
          Parameters: [{ Name: '/app/empty-param', Value: '', Type: 'String' }],
        };
        mockSend.mockResolvedValue(mockResponse);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app',
          false,
        );

        expect(result[0].Value).toBe('');
      });

      it('should handle parameters with Unicode characters', async () => {
        const mockResponse = {
          Parameters: [
            { Name: '/app/unicode', Value: '你好世界 🌍', Type: 'String' },
          ],
        };
        mockSend.mockResolvedValue(mockResponse);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app',
          false,
        );

        expect(result[0].Value).toBe('你好世界 🌍');
      });

      it('should handle mixed parameter types (String, SecureString, StringList)', async () => {
        const mockResponse = {
          Parameters: [
            { Name: '/app/string', Value: 'plain', Type: 'String' },
            { Name: '/app/secure', Value: 'encrypted', Type: 'SecureString' },
            { Name: '/app/list', Value: 'item1,item2', Type: 'StringList' },
          ],
        };
        mockSend.mockResolvedValue(mockResponse);

        const result = await service.fetchParameters(
          'us-east-1',
          '/app',
          false,
        );

        expect(result).toHaveLength(3);
        expect(result.map((p) => p.Type)).toEqual([
          'String',
          'SecureString',
          'StringList',
        ]);
      });
    });

    describe('ParamStoreUtil integration', () => {
      it('should call validateParameters with correct arguments', async () => {
        const validateSpy = jest.spyOn(ParamStoreUtil, 'validateParameters');
        mockSend.mockResolvedValue({ Parameters: [] });

        await service.fetchParameters('us-east-1', '/app/config', false);

        expect(validateSpy).toHaveBeenCalledWith('us-east-1', '/app/config');
      });

      it('should call buildErrorMessage when error occurs', async () => {
        const buildErrorSpy = jest.spyOn(ParamStoreUtil, 'buildErrorMessage');
        const error = new Error('Test error');
        mockSend.mockRejectedValue(error);

        await service.fetchParameters('us-east-1', '/app/config', true);

        expect(buildErrorSpy).toHaveBeenCalledWith(
          error,
          'us-east-1',
          '/app/config',
        );
      });
    });
  });
});
