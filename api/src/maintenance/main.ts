import "reflect-metadata";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../modules/audit/audit.service";
import { reconcileDocumentDepartments } from "./reconcile-document-departments";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env.local", ".env"] })],
  providers: [PrismaService, AuditService],
})
class MaintenanceModule {}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const app = await NestFactory.createApplicationContext(MaintenanceModule, { logger: ["error", "warn"] });

  try {
    const report = await reconcileDocumentDepartments(app.get(PrismaService), app.get(AuditService), { apply });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!apply && report.drift > 0) {
      process.stdout.write("Dry run: re-run with --apply to persist the changes.\n");
    }
  } finally {
    await app.close();
  }
}

void main();
