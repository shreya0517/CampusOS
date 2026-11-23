import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { StudentsModule } from './students/students.module';
import { DepartmentsModule } from './departments/departments.module';
import { FacultyModule } from './faculty/faculty.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { FilesModule } from './files/files.module';
import { ExamsModule } from './exams/exams.module';
import { TimetableModule } from './timetable/timetable.module';
import { FeesModule } from './fees/fees.module';
import { TasksModule } from './tasks/tasks.module';
import { VisitorsModule } from './visitors/visitors.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { EventsModule } from './events/events.module';
import { OverviewModule } from './overview/overview.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    AuthModule,
    AuthorizationModule,
    EventsModule,
    NotificationsModule,
    MailModule,
    StudentsModule,
    DepartmentsModule,
    FacultyModule,
    AttendanceModule,
    AssignmentsModule,
    FilesModule,
    ExamsModule,
    TimetableModule,
    FeesModule,
    TasksModule,
    VisitorsModule,
    AnnouncementsModule,
    OverviewModule,
    SettingsModule,
  ],
})
export class AppModule {}
