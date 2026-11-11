import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { KeycloakAdminService } from "./keycloak-admin.service";
import { SessionModule } from "../auth/session.module";

@Module({
  imports: [SessionModule],
  controllers: [UsersController],
  providers: [UsersService, KeycloakAdminService],
})
export class UsersModule {}
