import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('MCBuse API')
    .setDescription(
      'Dual-wallet P2P payment platform built on Solana. ' +
      'Enables seamless movement between fiat and stablecoins (USDC/EURC) ' +
      'via QR and NFC-based transfers.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT access token',
      },
      'access-token',
    )
    .addTag('health', 'Service health and status')
    .addTag('auth', 'Authentication — signup, login, token refresh')
    .addTag('wallets', 'Wallet management and balances')
    .addTag('onramp', 'Fiat → stablecoin on-ramp (fund savings wallet)')
    .addTag('transfers', 'Internal transfers between savings and routine wallets')
    .addTag('payment-requests', 'QR payment request creation and management')
    .addTag('payments', 'P2P payment execution')
    .addTag('swap', 'Stablecoin swap — USDC ↔ EURC')
    .addTag('transactions', 'Transaction history and activity')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
