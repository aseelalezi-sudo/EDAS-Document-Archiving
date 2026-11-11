import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { validateEnv } from "./common/config/env.validation";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AccessModule } from "./common/access/access.module";
import { JwtAuthGuard } from "./common/auth/jwt-auth.guard";
import { RolesGuard } from "./common/auth/roles.guard";
import { RequestLogInterceptor } from "./common/logging/request-log.interceptor";
import { PrismaModule } from "./common/prisma/prisma.module";
import { StorageModule } from "./common/storage/storage.module";
import { AuditModule } from "./modules/audit/audit.module";
import { ApprovalsModule } from "./modules/approvals/approvals.module";
import { AuthModule } from "./modules/auth/auth.module";
import { SessionModule } from "./modules/auth/session.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { FilesModule } from "./modules/files/files.module";
import { FoldersModule } from "./modules/folders/folders.module";
import { GroupsModule } from "./modules/groups/groups.module";
import { ReportTemplatesModule } from "./modules/report-templates/report-templates.module";
import { RolesModule } from "./modules/roles/roles.module";
import { NotificationTemplatesModule } from "./modules/notification-templates/notification-templates.module";
import { HealthModule } from "./modules/health/health.module";
import { LegalHoldsModule } from "./modules/legal-holds/legal-holds.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { OrgModule } from "./modules/org/org.module";
import { PreviewModule } from "./modules/preview/preview.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { RetentionModule } from "./modules/retention/retention.module";
import { SavedSearchesModule } from "./modules/saved-searches/saved-searches.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env.local", ".env"], validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: Number(config.get("THROTTLE_TTL_MS", 60000)),
            limit: Number(config.get("THROTTLE_LIMIT", 600)),
          },
        ],
      }),
    }),
    PrismaModule,
    StorageModule,
    AccessModule,
    AuditModule,
    AuthModule,
    SessionModule,
    GroupsModule,
    ReportTemplatesModule,
    RolesModule,
    NotificationTemplatesModule,
    HealthModule,
    UsersModule,
    OrgModule,
    FoldersModule,
    FilesModule,
    PreviewModule,
    DocumentsModule,
    ApprovalsModule,
    RetentionModule,
    LegalHoldsModule,
    NotificationsModule,
    TasksModule,
    ReportsModule,
    SavedSearchesModule,
    SettingsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestLogInterceptor },
  ],
})
export class AppModule {}
