import { ValidationPipe } from '@nestjs/common';

export const globalValidationPipe = new ValidationPipe({
  whitelist: true, // strip properties not in DTO
  forbidNonWhitelisted: true, // throw on unknown properties
  transform: true, // auto-transform payloads to DTO instances
  transformOptions: {
    enableImplicitConversion: true, // convert string query params to their types
  },
});
