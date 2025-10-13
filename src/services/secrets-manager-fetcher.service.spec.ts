import { Test, TestingModule } from '@nestjs/testing';
import { SecretsManagerFetcherService } from './secrets-manager-fetcher.service';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-secrets-manager');

describe('SecretsManagerFetcherService', () => {
  let service: SecretsManagerFetcherService;
  let mockSend: jest.Mock;

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock send function
    mockSend = jest.fn();

    // Mock the SecretsManagerClient constructor
    (SecretsManagerClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [SecretsManagerFetcherService],
    }).compile();

    service = module.get<SecretsManagerFetcherService>(
      SecretsManagerFetcherService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('fetchSecrets', () => {
    describe('successful scenarios', () => {
      it('should fetch single string secret successfully', async () => {
        const mockSecret = {
          SecretString: 'my-secret-value',
        };
        mockSend.mockResolvedValue(mockSecret);

        const result = await service.fetchSecrets(
          'us-east-1',
          ['test-secret'],
          false,
        );

        expect(result).toEqual({ 'test-secret': 'my-secret-value' });
        expect(SecretsManagerClient).toHaveBeenCalledWith({
          region: 'us-east-1',
        });
        expect(mockSend).toHaveBeenCalledTimes(1);
      });

      it('should fetch multiple secrets concurrently', async () => {
        mockSend
          .mockResolvedValueOnce({ SecretString: 'secret1-value' })
          .mockResolvedValueOnce({ SecretString: 'secret2-value' })
          .mockResolvedValueOnce({ SecretString: 'secret3-value' });

        const result = await service.fetchSecrets(
          'us-east-1',
          ['secret1', 'secret2', 'secret3'],
          false,
        );

        expect(result).toEqual({
          secret1: 'secret1-value',
          secret2: 'secret2-value',
          secret3: 'secret3-value',
        });
        expect(mockSend).toHaveBeenCalledTimes(3);
      });

      it('should handle binary secrets by decoding to UTF-8 string', async () => {
        const binaryData = Buffer.from('binary-secret-value', 'utf-8');
        const mockSecret = {
          SecretBinary: binaryData,
        };
        mockSend.mockResolvedValue(mockSecret);

        const result = await service.fetchSecrets(
          'us-east-1',
          ['binary-secret'],
          false,
        );

        expect(result).toEqual({ 'binary-secret': 'binary-secret-value' });
      });

      it('should fetch secrets from different AWS region', async () => {
        const mockSecret = { SecretString: 'eu-secret' };
        mockSend.mockResolvedValue(mockSecret);

        const result = await service.fetchSecrets(
          'eu-west-1',
          ['eu-secret'],
          false,
        );

        expect(result).toEqual({ 'eu-secret': 'eu-secret' });
        expect(SecretsManagerClient).toHaveBeenCalledWith({
          region: 'eu-west-1',
        });
      });

      it('should return empty object when secret names array is empty', async () => {
        const result = await service.fetchSecrets('us-east-1', [], false);

        expect(result).toEqual({});
        expect(mockSend).not.toHaveBeenCalled();
      });
    });

    describe('input validation', () => {
      it('should throw error when AWS region is empty and continueOnError is false', async () => {
        await expect(
          service.fetchSecrets('', ['test-secret'], false),
        ).rejects.toThrow('AWS region cannot be empty');
      });

      it('should return empty object when AWS region is empty and continueOnError is true', async () => {
        const result = await service.fetchSecrets('', ['test-secret'], true);

        expect(result).toEqual({});
        expect(mockSend).not.toHaveBeenCalled();
      });

      it('should throw error when AWS region is whitespace only and continueOnError is false', async () => {
        await expect(
          service.fetchSecrets('   ', ['test-secret'], false),
        ).rejects.toThrow('AWS region cannot be empty');
      });

      it('should return empty object when secretNames is null', async () => {
        const result = await service.fetchSecrets(
          'us-east-1',
          null as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          false,
        );

        expect(result).toEqual({});
      });

      it('should return empty object when secretNames is undefined', async () => {
        const result = await service.fetchSecrets(
          'us-east-1',
          undefined as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          false,
        );

        expect(result).toEqual({});
      });

      it('should throw error when secret name is empty and continueOnError is false', async () => {
        await expect(
          service.fetchSecrets('us-east-1', [''], false),
        ).rejects.toThrow('Secret names cannot be empty');
      });

      it('should throw error when secret name is whitespace and continueOnError is false', async () => {
        await expect(
          service.fetchSecrets('us-east-1', ['   '], false),
        ).rejects.toThrow('Secret names cannot be empty');
      });

      it('should return empty object when secret names are invalid and continueOnError is true', async () => {
        const result = await service.fetchSecrets(
          'us-east-1',
          ['', '   '],
          true,
        );

        expect(result).toEqual({});
      });
    });

    describe('error handling - specific AWS errors', () => {
      it('should handle ResourceNotFoundException with detailed message', async () => {
        const error = new Error('Secret not found');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).name = 'ResourceNotFoundException';
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchSecrets('us-east-1', ['nonexistent-secret'], false),
        ).rejects.toThrow(
          `Failed to fetch secret 'nonexistent-secret' from AWS Secrets Manager in region 'us-east-1'`,
        );
      });

      it('should handle ResourceNotFoundException and continue when continueOnError is true', async () => {
        const error = new Error('Secret not found');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).name = 'ResourceNotFoundException';
        mockSend.mockRejectedValue(error);

        const result = await service.fetchSecrets(
          'us-east-1',
          ['nonexistent-secret'],
          true,
        );

        expect(result).toEqual({});
      });

      it('should handle AccessDeniedException with IAM permissions hint', async () => {
        const error = new Error('Access denied');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).name = 'AccessDeniedException';
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchSecrets('us-east-1', ['restricted-secret'], false),
        ).rejects.toThrow(
          `Failed to fetch secret 'restricted-secret' from AWS Secrets Manager in region 'us-east-1'`,
        );
      });

      it('should handle InvalidRequestException with format hint', async () => {
        const error = new Error('Invalid request format');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).name = 'InvalidRequestException';
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchSecrets('us-east-1', ['bad-format'], false),
        ).rejects.toThrow(
          `Failed to fetch secret 'bad-format' from AWS Secrets Manager in region 'us-east-1'`,
        );
      });

      it('should handle InvalidParameterException', async () => {
        const error = new Error('Invalid parameter');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).name = 'InvalidParameterException';
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchSecrets('us-east-1', ['bad-param'], false),
        ).rejects.toThrow(
          `Failed to fetch secret 'bad-param' from AWS Secrets Manager in region 'us-east-1'`,
        );
      });

      it('should handle DecryptionFailure with KMS hint', async () => {
        const error = new Error('Decryption failed');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (error as any).name = 'DecryptionFailure';
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchSecrets('us-east-1', ['encrypted-secret'], false),
        ).rejects.toThrow(`Decryption failed`);
      });

      it('should handle network resolution errors', async () => {
        const error = new Error('Could not resolve endpoint');
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchSecrets('us-east-1', ['test-secret'], false),
        ).rejects.toThrow('Could not resolve');
      });

      it('should handle ENOTFOUND network errors', async () => {
        const error = new Error('getaddrinfo ENOTFOUND');
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchSecrets('us-east-1', ['test-secret'], false),
        ).rejects.toThrow('ENOTFOUND');
      });

      it('should handle generic network errors', async () => {
        const error = new Error('Network timeout');
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchSecrets('us-east-1', ['test-secret'], false),
        ).rejects.toThrow('Network timeout');
      });

      it('should handle unknown error types', async () => {
        const error = 'String error';
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchSecrets('us-east-1', ['test-secret'], false),
        ).rejects.toThrow('Failed to fetch secrets from AWS Secrets Manager');
      });

      it('should handle errors without name property', async () => {
        const error = new Error('Generic AWS error');
        mockSend.mockRejectedValue(error);

        await expect(
          service.fetchSecrets('us-east-1', ['test-secret'], false),
        ).rejects.toThrow(
          `Failed to fetch secret 'test-secret' from AWS Secrets Manager in region 'us-east-1'`,
        );
      });
    });

    describe('error handling - continueOnError behavior', () => {
      it('should fetch successful secrets and skip failed ones when continueOnError is true', async () => {
        mockSend
          .mockResolvedValueOnce({ SecretString: 'success1' })
          .mockRejectedValueOnce(new Error('Failed'))
          .mockResolvedValueOnce({ SecretString: 'success2' });

        const result = await service.fetchSecrets(
          'us-east-1',
          ['secret1', 'secret2', 'secret3'],
          true,
        );

        expect(result).toEqual({
          secret1: 'success1',
          secret3: 'success2',
        });
      });

      it('should throw on first error when continueOnError is false', async () => {
        mockSend
          .mockResolvedValueOnce({ SecretString: 'success1' })
          .mockRejectedValueOnce(new Error('Failed secret'))
          .mockResolvedValueOnce({ SecretString: 'success2' });

        await expect(
          service.fetchSecrets(
            'us-east-1',
            ['secret1', 'secret2', 'secret3'],
            false,
          ),
        ).rejects.toThrow();
      });

      it('should handle all secrets failing when continueOnError is true', async () => {
        mockSend
          .mockRejectedValueOnce(new Error('Failed 1'))
          .mockRejectedValueOnce(new Error('Failed 2'))
          .mockRejectedValueOnce(new Error('Failed 3'));

        const result = await service.fetchSecrets(
          'us-east-1',
          ['secret1', 'secret2', 'secret3'],
          true,
        );

        expect(result).toEqual({});
      });

      it('should handle Promise rejection in outer try-catch with continueOnError true', async () => {
        // Simulate client initialization failure
        (SecretsManagerClient as jest.Mock).mockImplementation(() => {
          throw new Error('Client initialization failed');
        });

        const result = await service.fetchSecrets(
          'us-east-1',
          ['test-secret'],
          true,
        );

        expect(result).toEqual({});
      });

      it('should throw error from outer try-catch when continueOnError is false', async () => {
        // Simulate client initialization failure
        (SecretsManagerClient as jest.Mock).mockImplementation(() => {
          throw new Error('Client initialization failed');
        });

        await expect(
          service.fetchSecrets('us-east-1', ['test-secret'], false),
        ).rejects.toThrow('Failed to fetch secrets from AWS Secrets Manager');
      });
    });

    describe('edge cases', () => {
      it('should handle secret with no value (neither string nor binary)', async () => {
        const mockSecret = {}; // No SecretString or SecretBinary
        mockSend.mockResolvedValue(mockSecret);

        await expect(
          service.fetchSecrets('us-east-1', ['empty-secret'], false),
        ).rejects.toThrow(`Secret 'empty-secret' has no value`);
      });

      it('should handle secret with no value when continueOnError is true', async () => {
        const mockSecret = {};
        mockSend.mockResolvedValue(mockSecret);

        const result = await service.fetchSecrets(
          'us-east-1',
          ['empty-secret'],
          true,
        );

        expect(result).toEqual({});
      });

      it('should handle secrets with special characters in names', async () => {
        const specialNames = [
          'secret/with/slashes',
          'secret-with-dashes',
          'secret_with_underscores',
          'secret.with.dots',
        ];
        mockSend.mockResolvedValue({ SecretString: 'value' });

        const result = await service.fetchSecrets(
          'us-east-1',
          specialNames,
          false,
        );

        expect(Object.keys(result)).toEqual(specialNames);
      });

      it('should handle Promise.allSettled rejected status', async () => {
        // This tests the edge case where Promise.allSettled returns rejected status
        // We need to mock the send method to throw in a way that gets caught by Promise.allSettled
        mockSend.mockImplementation(async () => {
          throw new Error('Unexpected promise rejection');
        });

        await expect(
          service.fetchSecrets('us-east-1', ['test-secret'], false),
        ).rejects.toThrow();
      });

      it('should handle mixed success and different error types', async () => {
        const resourceNotFound = new Error('Not found');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (resourceNotFound as any).name = 'ResourceNotFoundException';

        const accessDenied = new Error('Access denied');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (accessDenied as any).name = 'AccessDeniedException';

        mockSend
          .mockResolvedValueOnce({ SecretString: 'success' })
          .mockRejectedValueOnce(resourceNotFound)
          .mockRejectedValueOnce(accessDenied)
          .mockResolvedValueOnce({ SecretString: 'success2' });

        const result = await service.fetchSecrets(
          'us-east-1',
          ['good1', 'notfound', 'denied', 'good2'],
          true,
        );

        expect(result).toEqual({
          good1: 'success',
          good2: 'success2',
        });
      });

      it('should handle very long secret names', async () => {
        const longName = 'a'.repeat(500);
        mockSend.mockResolvedValue({ SecretString: 'value' });

        const result = await service.fetchSecrets(
          'us-east-1',
          [longName],
          false,
        );

        expect(result[longName]).toBe('value');
      });

      it('should handle binary secret with special characters', async () => {
        const specialChars = '🔒 Secret with émojis and spëcial çhars';
        const binaryData = Buffer.from(specialChars, 'utf-8');
        mockSend.mockResolvedValue({ SecretBinary: binaryData });

        const result = await service.fetchSecrets(
          'us-east-1',
          ['special-secret'],
          false,
        );

        expect(result['special-secret']).toBe(specialChars);
      });
    });

    describe('logging', () => {
      it('should log initialization with correct region and secret count', async () => {
        const logSpy = jest.spyOn(service['logger'], 'log');
        mockSend.mockResolvedValue({ SecretString: 'value' });

        await service.fetchSecrets('us-east-1', ['secret1', 'secret2'], false);

        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('Region: us-east-1, Secrets: 2'),
        );
      });

      it('should log warning when no secrets provided', async () => {
        const warnSpy = jest.spyOn(service['logger'], 'warn');

        await service.fetchSecrets('us-east-1', [], false);

        expect(warnSpy).toHaveBeenCalledWith(
          'No secret names provided, skipping Secrets Manager fetch',
        );
      });

      it('should log completion summary with success and failure counts', async () => {
        const logSpy = jest.spyOn(service['logger'], 'log');
        mockSend
          .mockResolvedValueOnce({ SecretString: 'success' })
          .mockRejectedValueOnce(new Error('Failed'));

        await service.fetchSecrets('us-east-1', ['good', 'bad'], true);

        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('Success: 1, Failed: 1'),
        );
      });

      it('should log warning when no secrets were successfully fetched', async () => {
        const warnSpy = jest.spyOn(service['logger'], 'warn');
        mockSend.mockRejectedValue(new Error('Failed'));

        await service.fetchSecrets('us-east-1', ['secret1'], true);

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('No secrets were successfully fetched'),
        );
      });
    });
  });
});
