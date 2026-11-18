import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { EventsModule } from '../events/events.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/** Global so any module can raise notifications without importing this one. */
@Global()
@Module({ imports: [AuthModule, AuthorizationModule, EventsModule], controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
