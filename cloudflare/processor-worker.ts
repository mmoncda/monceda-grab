import { Container, getRandom } from "@cloudflare/containers";

interface Env {
  MEDIA_PROCESSOR: DurableObjectNamespace<MediaProcessor>;
  INSTAGRAM_COOKIES: string;
  FACEBOOK_COOKIES: string;
}

export class MediaProcessor extends Container<Env> {
  defaultPort = 10000;
  sleepAfter = "10m";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.envVars = {
      INSTAGRAM_COOKIES: env.INSTAGRAM_COOKIES,
      FACEBOOK_COOKIES: env.FACEBOOK_COOKIES,
      PORT: "10000",
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const container = await getRandom(env.MEDIA_PROCESSOR, 2);
    return container.fetch(request);
  },
} satisfies ExportedHandler<Env>;
