import { Global, Module } from '@nestjs/common';
import { DatabaseProvider, DRIZZLE } from './database.provider';

@Global()
@Module({
  providers: [
    DatabaseProvider,
    {
      provide: DRIZZLE,
      useFactory: (dbProvider: DatabaseProvider) => dbProvider.getDb(),
      inject: [DatabaseProvider],
    },
  ],
  exports: [DatabaseProvider, DRIZZLE],
})
export class DatabaseModule {}
