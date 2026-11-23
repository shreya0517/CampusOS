import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** Global so any module can send email without importing this one. */
@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
