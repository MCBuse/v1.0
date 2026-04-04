import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validate } from './config/config.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? undefined : '.env',
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      validate: process.env.NODE_ENV === 'test' ? (config) => config : validate,
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
