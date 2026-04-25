# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

This is a financial services platform with cryptocurrency payment capabilities, built as a monorepo using Turborepo. The platform enables on/off-ramp transactions, payment processing, wallet management, and mobile payments.

## Architecture

The project consists of three main applications:

- **API (NestJS)** (`apps/api/`) - Backend service with authentication, payment processing, Solana integration, and database management
- **Web App (Next.js)** (`apps/web/`) - Frontend web application
- **Mobile App (Expo/React Native)** (`apps/mobile/`) - Mobile application with NFC payment capabilities

## Key Technologies

- **Backend**: NestJS, Drizzle ORM, PostgreSQL, Solana Web3.js, JWT authentication
- **Frontend**: Next.js, React, TypeScript
- **Mobile**: Expo, React Native
- **Database**: PostgreSQL with Drizzle ORM migrations
- **Package Manager**: pnpm with workspaces

## Development Commands

### Root Level Commands
- `pnpm dev` - Start all applications in development mode
- `pnpm build` - Build all applications
- `pnpm lint` - Lint all applications
- `pnpm format` - Format code with Prettier
- `pnpm check-types` - Type check all applications

### API-Specific Commands (from `apps/api/`)
- `pnpm start:dev` - Start API in watch mode
- `pnpm test` - Run unit tests
- `pnpm test:e2e` - Run end-to-end tests
- `pnpm test:cov` - Run tests with coverage

### Mobile-Specific Commands (from `apps/mobile/`)
- `pnpm start` - Start Expo development server
- `pnpm android` - Run on Android
- `pnpm ios` - Run on iOS

## Database

The API uses Drizzle ORM with PostgreSQL. Database schema is defined in `apps/api/src/database/schema/` with entities for:
- Users and authentication
- Wallets and balances
- Payment requests and transactions
- Ledger entries and audit logs

Database configuration is in `apps/api/drizzle.config.ts`.

## API Architecture

The NestJS API is organized into feature modules:
- `auth/` - JWT authentication and guards
- `users/` - User management
- `wallets/` - Wallet operations
- `payments/` - Payment processing
- `onramp/`, `offramp/` - Fiat conversion
- `swap/` - Cryptocurrency swaps
- `solana/` - Solana blockchain integration
- `nfc/` - NFC payment functionality

Global configuration includes rate limiting, validation pipes, logging (Pino), and Swagger documentation.

## Shared Packages

- `@repo/ui` - Shared React components
- `@repo/shared` - Common utilities and types
- `@repo/eslint-config` - ESLint configuration
- `@repo/typescript-config` - TypeScript configuration

## Testing

Use the API's built-in Jest configuration for backend testing. The mobile app uses Expo's testing setup.