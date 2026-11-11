import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { Principal } from "../../common/auth/principal";
import { Roles } from "../../common/auth/roles.decorator";
import { UpdateSettingDto } from "./dto/update-setting.dto";
import { SettingsService } from "./settings.service";

@Controller("settings")
@Roles(UserRole.SYSTEM_ADMIN)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  list() {
    return this.settings.list();
  }

  @Get(":key")
  get(@Param("key") key: string) {
    return this.settings.get(key);
  }

  @Put(":key")
  put(@CurrentUser() principal: Principal, @Param("key") key: string, @Body() dto: UpdateSettingDto) {
    return this.settings.put(principal, key, dto);
  }
}
