import { ParamStoreUtil } from './param-store.util';

describe('ParamStoreUtil', () => {
  describe('validateParameters', () => {
    it('should pass validation for valid inputs', () => {
      expect(() => {
        ParamStoreUtil.validateParameters('us-east-1', '/app/config');
      }).not.toThrow();
    });

    it('should throw error when region is empty', () => {
      expect(() => {
        ParamStoreUtil.validateParameters('', '/app/config');
      }).toThrow('AWS region is required');
    });

    it('should throw error when region is whitespace', () => {
      expect(() => {
        ParamStoreUtil.validateParameters('   ', '/app/config');
      }).toThrow('AWS region is required');
    });

    it('should throw error when path is empty', () => {
      expect(() => {
        ParamStoreUtil.validateParameters('us-east-1', '');
      }).toThrow('Parameter Store path is required');
    });

    it('should throw error when path is whitespace', () => {
      expect(() => {
        ParamStoreUtil.validateParameters('us-east-1', '   ');
      }).toThrow('Parameter Store path is required');
    });

    it('should throw error when path does not start with /', () => {
      expect(() => {
        ParamStoreUtil.validateParameters('us-east-1', 'app/config');
      }).toThrow("Parameter Store path must start with '/'");
    });

    it('should pass for valid path starting with /', () => {
      expect(() => {
        ParamStoreUtil.validateParameters('us-west-2', '/production/app');
      }).not.toThrow();
    });
  });

  describe('buildErrorMessage', () => {
    const awsRegion = 'us-east-1';
    const awsParamStorePath = '/app/config';

    it('should build message for AccessDeniedException', () => {
      const error = {
        name: 'AccessDeniedException',
        message: 'User is not authorized',
      };

      const message = ParamStoreUtil.buildErrorMessage(
        error,
        awsRegion,
        awsParamStorePath,
      );

      expect(message).toContain('Access Denied');
      expect(message).toContain('ssm:GetParametersByPath');
      expect(message).toContain('us-east-1');
      expect(message).toContain('/app/config');
    });

    it('should build message for ParameterNotFound', () => {
      const error = {
        name: 'ParameterNotFound',
        message: 'Parameter not found',
      };

      const message = ParamStoreUtil.buildErrorMessage(
        error,
        awsRegion,
        awsParamStorePath,
      );

      expect(message).toContain('Parameter not found');
      expect(message).toContain('Verify the path exists');
    });

    it('should build message for InvalidParameterException', () => {
      const error = {
        name: 'InvalidParameterException',
        message: 'Invalid parameter',
      };

      const message = ParamStoreUtil.buildErrorMessage(
        error,
        awsRegion,
        awsParamStorePath,
      );

      expect(message).toContain('Invalid parameter');
      expect(message).toContain('path format is correct');
    });

    it('should build message for ThrottlingException', () => {
      const error = {
        name: 'ThrottlingException',
        message: 'Rate exceeded',
      };

      const message = ParamStoreUtil.buildErrorMessage(
        error,
        awsRegion,
        awsParamStorePath,
      );

      expect(message).toContain('Request throttled');
      expect(message).toContain('rate limit exceeded');
    });

    it('should build message for network errors (ENOTFOUND)', () => {
      const error = {
        code: 'ENOTFOUND',
        message: 'getaddrinfo ENOTFOUND',
      };

      const message = ParamStoreUtil.buildErrorMessage(
        error,
        awsRegion,
        awsParamStorePath,
      );

      expect(message).toContain('Network error');
      expect(message).toContain('network connectivity');
    });

    it('should build message for network errors (ETIMEDOUT)', () => {
      const error = {
        code: 'ETIMEDOUT',
        message: 'Connection timed out',
      };

      const message = ParamStoreUtil.buildErrorMessage(
        error,
        awsRegion,
        awsParamStorePath,
      );

      expect(message).toContain('Network error');
      expect(message).toContain('AWS service status');
    });

    it('should build message for missing credentials', () => {
      const error = {
        message: 'Missing credentials in config',
      };

      const message = ParamStoreUtil.buildErrorMessage(
        error,
        awsRegion,
        awsParamStorePath,
      );

      expect(message).toContain('Missing AWS credentials');
      expect(message).toContain('environment variables');
      expect(message).toContain('IAM role');
    });

    it('should build generic message for unknown errors', () => {
      const error = {
        name: 'UnknownError',
        message: 'Something went wrong',
      };

      const message = ParamStoreUtil.buildErrorMessage(
        error,
        awsRegion,
        awsParamStorePath,
      );

      expect(message).toContain('Failed to fetch parameters from AWS SSM');
      expect(message).toContain('us-east-1');
      expect(message).toContain('/app/config');
      expect(message).toContain('Something went wrong');
    });

    it('should handle errors without message property', () => {
      const error = {
        name: 'TestError',
      };

      const message = ParamStoreUtil.buildErrorMessage(
        error,
        awsRegion,
        awsParamStorePath,
      );

      expect(message).toContain('Failed to fetch parameters from AWS SSM');
      expect(message).toContain('Unknown error occurred');
    });

    it('should include region and path in all error messages', () => {
      const error = new Error('Test error');

      const message = ParamStoreUtil.buildErrorMessage(
        error,
        'eu-west-1',
        '/production/app',
      );

      expect(message).toContain('eu-west-1');
      expect(message).toContain('/production/app');
    });
  });

  describe('shouldMaskValue', () => {
    it('should return true for parameter keys containing "password"', () => {
      expect(ParamStoreUtil.shouldMaskValue('database-password')).toBe(true);
      expect(ParamStoreUtil.shouldMaskValue('admin_password')).toBe(true);
      expect(ParamStoreUtil.shouldMaskValue('PASSWORD')).toBe(true);
    });

    it('should return true for parameter keys containing "secret"', () => {
      expect(ParamStoreUtil.shouldMaskValue('api-secret')).toBe(true);
      expect(ParamStoreUtil.shouldMaskValue('SECRET_KEY')).toBe(true);
      expect(ParamStoreUtil.shouldMaskValue('oauth-secret')).toBe(true);
    });

    it('should return true for parameter keys containing "key"', () => {
      expect(ParamStoreUtil.shouldMaskValue('api-key')).toBe(true);
      expect(ParamStoreUtil.shouldMaskValue('access_key')).toBe(true);
      expect(ParamStoreUtil.shouldMaskValue('private-key')).toBe(true);
    });

    it('should return true for parameter keys containing "token"', () => {
      expect(ParamStoreUtil.shouldMaskValue('auth-token')).toBe(true);
      expect(ParamStoreUtil.shouldMaskValue('refresh_token')).toBe(true);
      expect(ParamStoreUtil.shouldMaskValue('TOKEN')).toBe(true);
    });

    it('should return true for parameter keys containing "credential"', () => {
      expect(ParamStoreUtil.shouldMaskValue('aws-credential')).toBe(true);
      expect(ParamStoreUtil.shouldMaskValue('db-credentials')).toBe(true);
    });

    it('should return true for parameter keys containing "auth"', () => {
      expect(ParamStoreUtil.shouldMaskValue('basic-auth')).toBe(true);
      expect(ParamStoreUtil.shouldMaskValue('auth-header')).toBe(true);
    });

    it('should return false for non-sensitive parameter keys', () => {
      expect(ParamStoreUtil.shouldMaskValue('database-host')).toBe(false);
      expect(ParamStoreUtil.shouldMaskValue('database-port')).toBe(false);
      expect(ParamStoreUtil.shouldMaskValue('app-name')).toBe(false);
      expect(ParamStoreUtil.shouldMaskValue('region')).toBe(false);
      expect(ParamStoreUtil.shouldMaskValue('environment')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(ParamStoreUtil.shouldMaskValue('DATABASE_PASSWORD')).toBe(true);
      expect(ParamStoreUtil.shouldMaskValue('Api_Secret')).toBe(true);
      expect(ParamStoreUtil.shouldMaskValue('DATABASE_HOST')).toBe(false);
    });
  });

  describe('maskValue', () => {
    it('should mask sensitive values', () => {
      expect(ParamStoreUtil.maskValue('super-secret-123', 'api-secret')).toBe(
        '***MASKED***',
      );
      expect(
        ParamStoreUtil.maskValue('mypassword123', 'database-password'),
      ).toBe('***MASKED***');
      expect(ParamStoreUtil.maskValue('abc123token', 'auth-token')).toBe(
        '***MASKED***',
      );
    });

    it('should not mask non-sensitive values', () => {
      expect(ParamStoreUtil.maskValue('localhost', 'database-host')).toBe(
        'localhost',
      );
      expect(ParamStoreUtil.maskValue('5432', 'database-port')).toBe('5432');
      expect(ParamStoreUtil.maskValue('my-app', 'app-name')).toBe('my-app');
    });

    it('should handle empty values', () => {
      expect(ParamStoreUtil.maskValue('', 'api-key')).toBe('***MASKED***');
      expect(ParamStoreUtil.maskValue('', 'database-host')).toBe('');
    });
  });

  describe('buildSecretsManagerErrorMessage', () => {
    const awsRegion = 'us-east-1';
    const secretName = 'my-secret';

    it('should build message for ResourceNotFoundException', () => {
      const error = {
        name: 'ResourceNotFoundException',
        message: 'Secret not found',
      };

      const message = ParamStoreUtil.buildSecretsManagerErrorMessage(
        error,
        awsRegion,
        secretName,
      );

      expect(message).toContain('Secret not found');
      expect(message).toContain(
        `'${secretName}' exists in region '${awsRegion}'`,
      );
      expect(message).toContain('AWS Secrets Manager console');
    });

    it('should build message for AccessDeniedException', () => {
      const error = {
        name: 'AccessDeniedException',
        message: 'Access denied',
      };

      const message = ParamStoreUtil.buildSecretsManagerErrorMessage(
        error,
        awsRegion,
        secretName,
      );

      expect(message).toContain('Access Denied');
      expect(message).toContain('secretsmanager:GetSecretValue');
      expect(message).toContain(`arn:aws:secretsmanager:${awsRegion}`);
    });

    it('should build message for InvalidParameterException', () => {
      const error = {
        name: 'InvalidParameterException',
        message: 'Invalid parameter',
      };

      const message = ParamStoreUtil.buildSecretsManagerErrorMessage(
        error,
        awsRegion,
        secretName,
      );

      expect(message).toContain('Invalid parameter');
      expect(message).toContain('secret name format is correct');
      expect(message).toContain('/_+=.@-');
    });

    it('should build message for InvalidRequestException', () => {
      const error = {
        name: 'InvalidRequestException',
        message: 'Invalid request',
      };

      const message = ParamStoreUtil.buildSecretsManagerErrorMessage(
        error,
        awsRegion,
        secretName,
      );

      expect(message).toContain('Invalid request');
      expect(message).toContain('scheduled for deletion');
    });

    it('should build message for DecryptionFailure', () => {
      const error = {
        name: 'DecryptionFailure',
        message: 'Decryption failed',
      };

      const message = ParamStoreUtil.buildSecretsManagerErrorMessage(
        error,
        awsRegion,
        secretName,
      );

      expect(message).toContain('Decryption failed');
      expect(message).toContain('KMS key permissions');
    });

    it('should build message for network errors (ENOTFOUND)', () => {
      const error = {
        code: 'ENOTFOUND',
        message: 'getaddrinfo ENOTFOUND',
      };

      const message = ParamStoreUtil.buildSecretsManagerErrorMessage(
        error,
        awsRegion,
        secretName,
      );

      expect(message).toContain('Network error');
      expect(message).toContain('ENOTFOUND');
      expect(message).toContain('network connectivity');
    });

    it('should build message for network errors (ETIMEDOUT)', () => {
      const error = {
        code: 'ETIMEDOUT',
        message: 'Connection timeout',
      };

      const message = ParamStoreUtil.buildSecretsManagerErrorMessage(
        error,
        awsRegion,
        secretName,
      );

      expect(message).toContain('Network error');
      expect(message).toContain('ETIMEDOUT');
      expect(message).toContain('AWS service status');
    });

    it('should build message for missing credentials', () => {
      const error = {
        message: 'Missing credentials in config',
      };

      const message = ParamStoreUtil.buildSecretsManagerErrorMessage(
        error,
        awsRegion,
        secretName,
      );

      expect(message).toContain('Missing AWS credentials');
      expect(message).toContain('environment variables');
      expect(message).toContain('IAM role');
    });

    it('should build generic message for unknown errors', () => {
      const error = {
        name: 'UnknownError',
        message: 'Something went wrong',
      };

      const message = ParamStoreUtil.buildSecretsManagerErrorMessage(
        error,
        awsRegion,
        secretName,
      );

      expect(message).toContain(`Failed to fetch secret '${secretName}'`);
      expect(message).toContain(awsRegion);
      expect(message).toContain('Something went wrong');
    });

    it('should handle errors without message property', () => {
      const error = {
        name: 'TestError',
      };

      const message = ParamStoreUtil.buildSecretsManagerErrorMessage(
        error,
        awsRegion,
        secretName,
      );

      expect(message).toContain(`Failed to fetch secret '${secretName}'`);
      expect(message).toContain('Unknown error occurred');
    });
  });

  describe('parseSecretString', () => {
    it('should parse JSON object format', () => {
      const secretString = '{"username": "admin", "password": "secret123"}';
      const result = ParamStoreUtil.parseSecretString(
        secretString,
        'db-credentials',
      );

      expect(result).toEqual({
        username: 'admin',
        password: 'secret123',
      });
    });

    it('should parse JSON primitive value using secret name as key', () => {
      const secretString = '"my-api-key-value"';
      const mockLogger = { debug: jest.fn() };

      const result = ParamStoreUtil.parseSecretString(
        secretString,
        'api-key',
        mockLogger,
      );

      expect(result).toEqual({ 'api-key': 'my-api-key-value' });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('not a JSON object'),
      );
    });

    it('should parse JSON number using secret name as key', () => {
      const secretString = '42';
      const mockLogger = { debug: jest.fn() };

      const result = ParamStoreUtil.parseSecretString(
        secretString,
        'max-connections',
        mockLogger,
      );

      expect(result).toEqual({ 'max-connections': '42' });
    });

    it('should parse JSON boolean using secret name as key', () => {
      const secretString = 'true';
      const mockLogger = { debug: jest.fn() };

      const result = ParamStoreUtil.parseSecretString(
        secretString,
        'feature-flag',
        mockLogger,
      );

      expect(result).toEqual({ 'feature-flag': 'true' });
    });

    it('should treat plain string as value with secret name as key', () => {
      const secretString = 'plain-text-secret-value';
      const mockLogger = { debug: jest.fn() };

      const result = ParamStoreUtil.parseSecretString(
        secretString,
        'simple-secret',
        mockLogger,
      );

      expect(result).toEqual({ 'simple-secret': 'plain-text-secret-value' });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('not valid JSON'),
      );
    });

    it('should handle empty string', () => {
      const secretString = '';
      const result = ParamStoreUtil.parseSecretString(
        secretString,
        'empty-secret',
      );

      expect(result).toEqual({ 'empty-secret': '' });
    });

    it('should handle complex JSON with nested objects', () => {
      const secretString = JSON.stringify({
        database: {
          host: 'localhost',
          port: 5432,
        },
        credentials: {
          username: 'admin',
          password: 'secret',
        },
      });

      const result = ParamStoreUtil.parseSecretString(
        secretString,
        'app-config',
      );

      expect(result).toEqual({
        database: {
          host: 'localhost',
          port: 5432,
        },
        credentials: {
          username: 'admin',
          password: 'secret',
        },
      });
    });

    it('should work without logger parameter', () => {
      const secretString = 'plain-text-value';

      const result = ParamStoreUtil.parseSecretString(
        secretString,
        'test-secret',
      );

      expect(result).toEqual({ 'test-secret': 'plain-text-value' });
    });

    it('should handle JSON array as primitive value', () => {
      const secretString = '["value1", "value2", "value3"]';
      const mockLogger = { debug: jest.fn() };

      const result = ParamStoreUtil.parseSecretString(
        secretString,
        'list-secret',
        mockLogger,
      );

      // Arrays are converted to string representation when treated as primitives
      expect(result).toEqual({ 'list-secret': 'value1,value2,value3' });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('not a JSON object'),
      );
    });

    it('should handle special characters in plain string', () => {
      const secretString = 'my-secret!@#$%^&*()_+-={}[]|:;"<>?,./';

      const result = ParamStoreUtil.parseSecretString(
        secretString,
        'special-chars',
      );

      expect(result).toEqual({ 'special-chars': secretString });
    });

    it('should handle multiline strings', () => {
      const secretString = 'line1\nline2\nline3';

      const result = ParamStoreUtil.parseSecretString(
        secretString,
        'multiline',
      );

      expect(result).toEqual({ multiline: 'line1\nline2\nline3' });
    });
  });

  describe('parseBoolean', () => {
    it('should return true for boolean true', () => {
      expect(ParamStoreUtil.parseBoolean(true)).toBe(true);
    });

    it('should return false for boolean false', () => {
      expect(ParamStoreUtil.parseBoolean(false)).toBe(false);
    });

    it('should return true for string "true" (lowercase)', () => {
      expect(ParamStoreUtil.parseBoolean('true')).toBe(true);
    });

    it('should return true for string "TRUE" (uppercase)', () => {
      expect(ParamStoreUtil.parseBoolean('TRUE')).toBe(true);
    });

    it('should return true for string "True" (mixed case)', () => {
      expect(ParamStoreUtil.parseBoolean('True')).toBe(true);
    });

    it('should return false for string "false"', () => {
      expect(ParamStoreUtil.parseBoolean('false')).toBe(false);
    });

    it('should return false for string "FALSE"', () => {
      expect(ParamStoreUtil.parseBoolean('FALSE')).toBe(false);
    });

    it('should return false for any other string', () => {
      expect(ParamStoreUtil.parseBoolean('yes')).toBe(false);
      expect(ParamStoreUtil.parseBoolean('no')).toBe(false);
      expect(ParamStoreUtil.parseBoolean('1')).toBe(false);
      expect(ParamStoreUtil.parseBoolean('0')).toBe(false);
      expect(ParamStoreUtil.parseBoolean('random')).toBe(false);
    });

    it('should return false for number values', () => {
      expect(ParamStoreUtil.parseBoolean(1)).toBe(false);
      expect(ParamStoreUtil.parseBoolean(0)).toBe(false);
      expect(ParamStoreUtil.parseBoolean(42)).toBe(false);
    });

    it('should return false for null', () => {
      expect(ParamStoreUtil.parseBoolean(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(ParamStoreUtil.parseBoolean(undefined)).toBe(false);
    });

    it('should return false for objects', () => {
      expect(ParamStoreUtil.parseBoolean({})).toBe(false);
      expect(ParamStoreUtil.parseBoolean({ value: true })).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(ParamStoreUtil.parseBoolean([])).toBe(false);
      expect(ParamStoreUtil.parseBoolean([true])).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(ParamStoreUtil.parseBoolean('')).toBe(false);
    });

    it('should return false for whitespace strings', () => {
      expect(ParamStoreUtil.parseBoolean('   ')).toBe(false);
      expect(ParamStoreUtil.parseBoolean('\t')).toBe(false);
      expect(ParamStoreUtil.parseBoolean('\n')).toBe(false);
    });
  });
});
