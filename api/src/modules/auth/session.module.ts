import { Module } from "@nestjs/common";
import { KeycloakOidcService } from "./keycloak-oidc.service";
import { SessionCryptoService } from "./session-crypto.service";
import { SessionService } from "./session.service";

@Module({
  providers: [SessionCryptoService, KeycloakOidcService, SessionService],
  exports: [SessionService, SessionCryptoService, KeycloakOidcService],
})
export class SessionModule {}