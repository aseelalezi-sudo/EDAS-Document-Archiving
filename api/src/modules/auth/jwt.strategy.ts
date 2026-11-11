import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { passportJwtSecret } from "jwks-rsa";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { Principal } from "../../common/auth/principal";
import { principalFromPayload, type KeycloakPayload } from "../../common/auth/keycloak-payload";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly clientId: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const issuer = config.getOrThrow<string>("KEYCLOAK_ISSUER").replace(/\/$/, "");
    const audience = config.getOrThrow<string>("KEYCLOAK_AUDIENCE");
    const jwksUri = config.get<string>("KEYCLOAK_JWKS_URI") ?? `${issuer}/protocol/openid-connect/certs`;
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      issuer,
      audience,
      algorithms: ["RS256"],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 12,
        jwksUri,
      }),
    });
    this.clientId = config.get<string>("KEYCLOAK_CLIENT_ID", "edas-web");
  }

  async validate(payload: KeycloakPayload): Promise<Principal> {
    const account = await this.prisma.user.findUnique({
      where: { keycloakSub: payload.sub },
      select: { status: true, role: true },
    });
    return principalFromPayload(payload, account, this.clientId);
  }
}
