# @nestjs-aws/systems-manager

A powerful NestJS module for seamless integration with AWS Systems Manager Parameter Store and AWS Secrets Manager. Fetch and manage your application configuration and secrets with ease.

[![NPM Publish](https://github.com/typical-organization/nestjs-aws-systems-manager/actions/workflows/main.yml/badge.svg)](https://github.com/typical-organization/nestjs-aws-systems-manager/actions/workflows/main.yml)
[![PR Build CI](https://github.com/typical-organization/nestjs-aws-systems-manager/actions/workflows/pull-request.yml/badge.svg)](https://github.com/typical-organization/nestjs-aws-systems-manager/actions/workflows/pull-request.yml)
[![CodeQL](https://github.com/typical-organization/nestjs-aws-systems-manager/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/typical-organization/nestjs-aws-systems-manager/actions/workflows/codeql-analysis.yml)
[![npm version](https://img.shields.io/npm/v/@nestjs-aws/systems-manager)](https://www.npmjs.com/package/@nestjs-aws/systems-manager)
[![Node.js](https://img.shields.io/node/v/@nestjs-aws/systems-manager)](https://nodejs.org/)
[![npm downloads](https://img.shields.io/npm/dm/@nestjs-aws/systems-manager)](https://www.npmjs.com/package/@nestjs-aws/systems-manager)
[![License](https://img.shields.io/github/license/typical-organization/nestjs-aws-systems-manager)](https://github.com/typical-organization/nestjs-aws-systems-manager/blob/main/LICENSE.md)

## Features

✨ **Dual Integration**: Support for both AWS Parameter Store and Secrets Manager  
🔄 **Auto Refresh**: Runtime parameter and secret refresh capability  
🔐 **Secure by Default**: Automatic decryption of SecureString parameters  
📦 **Pagination Support**: Handles large parameter sets automatically  
🌲 **Hierarchical Keys**: Optional preservation of parameter path hierarchy  
⚡ **Fast Access**: In-memory caching for lightning-fast runtime access  
🛡️ **Type Safe**: Full TypeScript support with comprehensive type definitions  
🎯 **Flexible Configuration**: Static and async (ConfigService) registration options  
📝 **Smart Logging**: Configurable logging with automatic masking of sensitive values  

## Installation

```bash
npm install @nestjs-aws/systems-manager
```

### Peer Dependencies

Install the required AWS SDK packages and NestJS dependencies:

```bash
npm install @aws-sdk/client-ssm @aws-sdk/client-secrets-manager @nestjs/common @nestjs/config
```

## Quick Start

### Basic Setup (Static Configuration)

```typescript
import { Module } from '@nestjs/common';
import { SystemsManagerModule } from '@nestjs-aws/systems-manager';

@Module({
  imports: [
    SystemsManagerModule.register({
      awsRegion: 'us-east-1',
      awsParamStorePath: '/app/config',
      awsParamStoreContinueOnError: false,
    }),
  ],
})
export class AppModule {}
```

### Using the Service

```typescript
import { Injectable } from '@nestjs/common';
import { SystemsManagerService } from '@nestjs-aws/systems-manager';

@Injectable()
export class AppService {
  constructor(private readonly systemsManager: SystemsManagerService) {}

  getDatabaseConfig() {
    const host = this.systemsManager.get('database-host');
    const port = this.systemsManager.getAsNumber('database-port');
    const password = this.systemsManager.getSecret('db-password');
    
    return { host, port, password };
  }
}
```

## Configuration Options

### Static Registration

Use `register()` for static configuration:

```typescript
SystemsManagerModule.register({
  awsRegion: 'us-east-1',
  awsParamStorePath: '/production/app',
  awsParamStoreContinueOnError: false,
  preserveHierarchy: true,
  pathSeparator: '.',
  enableParameterLogging: false,
  useSecretsManager: true,
  secretsManagerSecretNames: ['prod/db/credentials', 'prod/api/keys'],
})
```

### Async Registration with ConfigService

Use `registerAsync()` for environment-based configuration:

```typescript
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot(),
    SystemsManagerModule.registerAsync({
      import: ConfigModule,
      useClass: ConfigService,
    }),
  ],
})
export class AppModule {}
```

**Required environment variables:**

```env
# .env file
param-store.awsRegion=us-east-1
param-store.awsParamStorePath=/app/config
param-store.awsParamStoreContinueOnError=false
param-store.preserveHierarchy=true
param-store.pathSeparator=.
param-store.enableParameterLogging=false
param-store.useSecretsManager=true
param-store.secretsManagerSecretNames=prod/db/credentials,prod/api/keys
```

## Configuration Properties

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `awsRegion` | `string` | Yes | - | AWS region where parameters are stored |
| `awsParamStorePath` | `string` | Yes | - | Parameter Store path (must start with `/`) |
| `awsParamStoreContinueOnError` | `boolean` | Yes | - | Continue startup if fetch fails |
| `preserveHierarchy` | `boolean` | No | `false` | Preserve parameter path structure |
| `pathSeparator` | `string` | No | `.` | Separator for hierarchical keys |
| `enableParameterLogging` | `boolean` | No | `false` | Enable debug logging (masks sensitive values) |
| `useSecretsManager` | `boolean` | No | `false` | Enable Secrets Manager integration |
| `secretsManagerSecretNames` | `string[]` | No | `[]` | Array of secret names to fetch |

## API Reference

### SystemsManagerService

The main service for accessing parameters and secrets.

#### Parameter Store Methods

```typescript
// Get parameter value
get(key: string): string

// Get parameter only (not secrets)
getParameter(key: string): string

// Get with type conversion
getAsNumber(key: string): number
getAsBoolean(key: string): boolean
getAsJSON<T>(key: string): T

// Get with default fallback
getOrDefault(key: string, defaultValue: string): string

// Check if parameter exists
has(key: string): boolean
hasParameter(key: string): boolean

// Get all parameters
getAllParameters(): Record<string, string>
getAllParameterKeys(): string[]
```

#### Secrets Manager Methods

```typescript
// Get secret value
getSecret(key: string): string

// Check if secret exists
hasSecret(key: string): boolean

// Get all secrets
getAllSecrets(): Record<string, string>
getAllSecretKeys(): string[]
```

#### Combined Methods

```typescript
// Get from either store (parameters checked first)
get(key: string): string
has(key: string): boolean

// Get all values from both stores
getAll(): Record<string, string>
getAllKeys(): string[]
```

#### Refresh Methods

```typescript
// Refresh both parameters and secrets
await refresh(): Promise<void>

// Refresh only parameters
await refreshParameters(): Promise<void>

// Refresh only secrets
await refreshSecrets(): Promise<void>
```

## Usage Examples

### Basic Parameter Access

```typescript
// Flat mode (default)
// Parameter: /app/config/api-key
const apiKey = this.systemsManager.get('api-key');

// Hierarchical mode (preserveHierarchy: true)
// Parameter: /app/config/database/host
const dbHost = this.systemsManager.get('database.host');
```

### Type Conversions

```typescript
// Number
const port = this.systemsManager.getAsNumber('port'); // 3000

// Boolean
const debugMode = this.systemsManager.getAsBoolean('debug-enabled'); // true

// JSON
interface Config {
  timeout: number;
  retries: number;
}
const config = this.systemsManager.getAsJSON<Config>('app-config');
```

### Working with Secrets

```typescript
// Fetch secret from Secrets Manager
const dbPassword = this.systemsManager.getSecret('database-password');

// Check if secret exists
if (this.systemsManager.hasSecret('api-key')) {
  const key = this.systemsManager.getSecret('api-key');
}
```

### Runtime Refresh

```typescript
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SystemsManagerService } from '@nestjs-aws/systems-manager';

@Injectable()
export class ConfigRefreshService {
  constructor(private readonly systemsManager: SystemsManagerService) {}

  @Cron('0 */5 * * * *') // Every 5 minutes
  async refreshConfig() {
    await this.systemsManager.refresh();
    console.log('Configuration refreshed');
  }
}
```

### Hierarchical Parameters

When `preserveHierarchy` is enabled, parameters maintain their path structure:

```typescript
// AWS Parameter Store structure:
// /app/config/database/host
// /app/config/database/port
// /app/config/api/endpoint
// /app/config/api/timeout

SystemsManagerModule.register({
  awsRegion: 'us-east-1',
  awsParamStorePath: '/app/config',
  preserveHierarchy: true,
  pathSeparator: '.', // or '/', '_', etc.
})

// Access with dot notation
const dbHost = this.systemsManager.get('database.host');
const dbPort = this.systemsManager.get('database.port');
const apiEndpoint = this.systemsManager.get('api.endpoint');
```

### Error Handling

```typescript
SystemsManagerModule.register({
  awsRegion: 'us-east-1',
  awsParamStorePath: '/app/config',
  awsParamStoreContinueOnError: false, // Fail fast (recommended for production)
})

// Or continue on error (not recommended for production)
SystemsManagerModule.register({
  awsRegion: 'us-east-1',
  awsParamStorePath: '/app/config',
  awsParamStoreContinueOnError: true, // Log warning and continue
})
```

## AWS IAM Permissions

Your application needs appropriate IAM permissions to access Parameter Store and Secrets Manager.

### Minimum Required Permissions

#### For Parameter Store Only:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParametersByPath",
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "arn:aws:ssm:REGION:ACCOUNT_ID:parameter/app/config/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:REGION:ACCOUNT_ID:key/KEY_ID"
    }
  ]
}
```

#### For Secrets Manager:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:prod/db/credentials-*",
        "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:prod/api/keys-*"
      ]
    }
  ]
}
```

## Best Practices

### 1. **Use Secrets Manager for Sensitive Data**

```typescript
// Store database passwords, API keys in Secrets Manager
SystemsManagerModule.register({
  awsRegion: 'us-east-1',
  awsParamStorePath: '/app/config',
  useSecretsManager: true,
  secretsManagerSecretNames: ['prod/database/password', 'prod/api/key'],
})
```

### 2. **Organize Parameters Hierarchically**

```
/production/app/database/host
/production/app/database/port
/production/app/api/endpoint
/production/app/api/timeout
```

### 3. **Use Environment-Specific Paths**

```typescript
const environment = process.env.NODE_ENV || 'development';
const paramPath = `/${environment}/app/config`;

SystemsManagerModule.register({
  awsRegion: 'us-east-1',
  awsParamStorePath: paramPath,
  awsParamStoreContinueOnError: false,
})
```

### 4. **Enable Logging in Development Only**

```typescript
SystemsManagerModule.register({
  awsRegion: 'us-east-1',
  awsParamStorePath: '/app/config',
  enableParameterLogging: process.env.NODE_ENV === 'development',
})
```

### 5. **Implement Graceful Refresh**

```typescript
try {
  await this.systemsManager.refresh();
} catch (error) {
  console.error('Failed to refresh configuration:', error);
  // Continue with cached values
}
```

## Troubleshooting

### Parameters Not Loading

1. **Check IAM Permissions**: Ensure your IAM role has `ssm:GetParametersByPath` permission
2. **Verify Region**: Make sure the AWS region matches where your parameters are stored
3. **Check Path**: Parameter path must start with `/` and exist in Parameter Store
4. **Enable Logging**: Set `enableParameterLogging: true` to see detailed debug logs

### Secrets Not Loading

1. **Check IAM Permissions**: Ensure `secretsmanager:GetSecretValue` permission
2. **Verify Secret Names**: Secret names must exactly match those in Secrets Manager
3. **Enable Secrets Manager**: Set `useSecretsManager: true`
4. **Check Array Format**: For ConfigService, use comma-separated values in .env

### DecryptionFailure Error

This error occurs when your IAM role lacks KMS decrypt permissions for SecureString parameters:

```json
{
  "Effect": "Allow",
  "Action": ["kms:Decrypt"],
  "Resource": "arn:aws:kms:REGION:ACCOUNT_ID:key/KEY_ID"
}
```

## Requirements

- **Node.js**: >= 20.0.0
- **NPM**: >= 9.0.0
- **NestJS**: >= 11.0.0
- **AWS SDK**: >= 3.0.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Support

- 📖 [Documentation](https://github.com/typical-organization/nestjs-aws-systems-manager)
- 🐛 [Issue Tracker](https://github.com/typical-organization/nestjs-aws-systems-manager/issues)
- 💬 [Discussions](https://github.com/typical-organization/nestjs-aws-systems-manager/discussions)

## Author

**Parik Maan**

---

Made with ❤️ for the NestJS community