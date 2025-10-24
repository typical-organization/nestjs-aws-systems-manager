# @nestjs-aws/systems-manager [![CI](https://github.com/typical-organization/nestjs-aws-systems-manager/actions/workflows/pull-request.yml/badge.svg)](https://github.com/typical-organization/nestjs-aws-systems-manager/actions/workflows/pull-request.yml) [![NPM Publish](https://github.com/typical-organization/nestjs-aws-systems-manager/actions/workflows/main.yml/badge.svg)](https://github.com/typical-organization/nestjs-aws-systems-manager/actions/workflows/main.yml) [![Security Scan](https://github.com/typical-organization/nestjs-aws-systems-manager/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/typical-organization/nestjs-aws-systems-manager/actions/workflows/codeql-analysis.yml) [![NPM](https://img.shields.io/npm/v/@nestjs-aws/systems-manager)](https://www.npmjs.com/package/@nestjs-aws/systems-manager) [![Node.js](https://img.shields.io/node/v/@nestjs-aws/systems-manager)](https://nodejs.org/) [![License](https://img.shields.io/github/license/typical-organization/nestjs-aws-systems-manager)](https://github.com/typical-organization/nestjs-aws-systems-manager/blob/main/LICENSE.md) [![Downloads](https://img.shields.io/npm/dm/@nestjs-aws/systems-manager)](https://www.npmjs.com/package/@nestjs-aws/systems-manager)

A powerful NestJS module for seamless integration with AWS Systems Manager Parameter Store and AWS Secrets Manager.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [IAM Permissions](#iam-permissions)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Features

- ✨ **Dual Integration** - Support for both AWS Parameter Store and Secrets Manager
- 🔄 **Auto Refresh** - Runtime parameter and secret refresh capability
- 🔐 **Secure by Default** - Automatic decryption of SecureString parameters
- 📦 **Pagination Support** - Handles large parameter sets automatically
- 🌲 **Hierarchical Keys** - Optional preservation of parameter path hierarchy
- ⚡ **Fast Access** - In-memory caching for lightning-fast runtime access
- 🛡️ **Type Safe** - Full TypeScript support with comprehensive type definitions

## Installation

```bash
npm install @nestjs-aws/systems-manager
```

### Peer Dependencies

```bash
npm install @aws-sdk/client-ssm @aws-sdk/client-secrets-manager @nestjs/common @nestjs/config
```

## Quick Start

### Basic Setup

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

  getConfig() {
    const host = this.systemsManager.get('database-host');
    const port = this.systemsManager.getAsNumber('database-port');
    const password = this.systemsManager.getSecret('db-password');
    
    return { host, port, password };
  }
}
```

## Configuration

### Static Registration

```typescript
SystemsManagerModule.register({
  awsRegion: 'us-east-1',
  awsParamStorePath: '/production/app',
  awsParamStoreContinueOnError: false,
  preserveHierarchy: true,
  pathSeparator: '.',
  useSecretsManager: true,
  secretsManagerSecretNames: ['prod/db/credentials', 'prod/api/keys'],
})
```

### Async Registration with ConfigService

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

**Environment variables:**

```env
param-store.awsRegion=us-east-1
param-store.awsParamStorePath=/app/config
param-store.awsParamStoreContinueOnError=false
param-store.preserveHierarchy=true
param-store.pathSeparator=.
param-store.useSecretsManager=true
param-store.secretsManagerSecretNames=prod/db/credentials,prod/api/keys
```

### Configuration Properties

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

#### Basic Methods

```typescript
get(key: string): string                           // Get from either store
getParameter(key: string): string                  // Get from Parameter Store
getSecret(key: string): string                     // Get from Secrets Manager
getOrDefault(key: string, default: string): string // Get with fallback
```

#### Type Conversion Methods

```typescript
getAsNumber(key: string): number      // Convert to number
getAsBoolean(key: string): boolean    // Convert to boolean
getAsJSON<T>(key: string): T          // Parse as JSON
```

#### Check Methods

```typescript
has(key: string): boolean          // Check either store
hasParameter(key: string): boolean // Check Parameter Store
hasSecret(key: string): boolean    // Check Secrets Manager
```

#### Bulk Methods

```typescript
getAll(): Record<string, string>              // Get all values
getAllParameters(): Record<string, string>    // Get all parameters
getAllSecrets(): Record<string, string>       // Get all secrets
getAllKeys(): string[]                        // Get all keys
```

#### Refresh Methods

```typescript
await refresh(): Promise<void>           // Refresh both stores
await refreshParameters(): Promise<void> // Refresh parameters only
await refreshSecrets(): Promise<void>    // Refresh secrets only
```

## Usage Examples

### Basic Access

```typescript
// Flat mode (default) - Parameter: /app/config/api-key
const apiKey = this.systemsManager.get('api-key');

// Hierarchical mode - Parameter: /app/config/database/host
const dbHost = this.systemsManager.get('database.host');
```

### Type Conversions

```typescript
const port = this.systemsManager.getAsNumber('port');
const debugMode = this.systemsManager.getAsBoolean('debug-enabled');

interface Config {
  timeout: number;
  retries: number;
}
const config = this.systemsManager.getAsJSON<Config>('app-config');
```

### Working with Secrets

```typescript
const dbPassword = this.systemsManager.getSecret('database-password');

if (this.systemsManager.hasSecret('api-key')) {
  const key = this.systemsManager.getSecret('api-key');
}
```

### Runtime Refresh

```typescript
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class ConfigRefreshService {
  constructor(private readonly systemsManager: SystemsManagerService) {}

  @Cron('0 */5 * * * *')
  async refreshConfig() {
    await this.systemsManager.refresh();
  }
}
```

### Hierarchical Parameters

```typescript
// AWS Parameter Store structure:
// /app/config/database/host
// /app/config/database/port

SystemsManagerModule.register({
  awsRegion: 'us-east-1',
  awsParamStorePath: '/app/config',
  preserveHierarchy: true,
  pathSeparator: '.',
})

// Access with dot notation
const dbHost = this.systemsManager.get('database.host');
const dbPort = this.systemsManager.get('database.port');
```

## IAM Permissions

### Parameter Store

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
      "Action": ["kms:Decrypt"],
      "Resource": "arn:aws:kms:REGION:ACCOUNT_ID:key/KEY_ID"
    }
  ]
}
```

### Secrets Manager

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": [
        "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:prod/db/credentials-*",
        "arn:aws:secretsmanager:REGION:ACCOUNT_ID:secret:prod/api/keys-*"
      ]
    }
  ]
}
```

## Best Practices

1. **Use Secrets Manager for Sensitive Data** - Store passwords, API keys in Secrets Manager
2. **Organize Parameters Hierarchically** - Use structured paths like `/production/app/database/host`
3. **Use Environment-Specific Paths** - Separate configs per environment: `/dev/app`, `/prod/app`
4. **Enable Logging in Development Only** - Set `enableParameterLogging: true` only in dev
5. **Fail Fast in Production** - Set `awsParamStoreContinueOnError: false` for production

## Troubleshooting

### Parameters Not Loading

- Check IAM permissions (`ssm:GetParametersByPath`)
- Verify AWS region matches where parameters are stored
- Ensure path starts with `/` and exists in Parameter Store
- Enable `enableParameterLogging: true` for debug logs

### Secrets Not Loading

- Check IAM permissions (`secretsmanager:GetSecretValue`)
- Verify secret names exactly match those in Secrets Manager
- Ensure `useSecretsManager: true` is set
- For ConfigService, use comma-separated values in .env

### DecryptionFailure Error

Add KMS decrypt permissions:

```json
{
  "Effect": "Allow",
  "Action": ["kms:Decrypt"],
  "Resource": "arn:aws:kms:REGION:ACCOUNT_ID:key/KEY_ID"
}
```

## Requirements

- Node.js >= 20.0.0
- NPM >= 9.0.0
- NestJS >= 11.0.0
- AWS SDK >= 3.0.0

## Contributing

Contributions are welcome! Please submit a Pull Request.

## License

MIT License - see [LICENSE.md](LICENSE.md) for details.

## Support

- 📖 [Documentation](https://github.com/typical-organization/nestjs-aws-systems-manager)
- 🐛 [Issue Tracker](https://github.com/typical-organization/nestjs-aws-systems-manager/issues)

**Author:** Parik Maan

---

Made with ❤️ for the NestJS community
