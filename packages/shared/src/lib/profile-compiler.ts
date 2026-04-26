import type { AuthConfig, ChimpProfile } from "../protocol";

export interface ProfileTemplateBase {
  image: string;
  imagePullPolicy?: string;
  extraEnv?: ChimpProfile["extraEnv"];
  volumeMounts?: ChimpProfile["volumeMounts"];
  volumes?: ChimpProfile["volumes"];
  initCommands?: ChimpProfile["initCommands"];
  auth?: AuthConfig;
}

export interface ProfileTemplateVariant {
  brain: ChimpProfile["brain"];
  provider: string;
  model: string;
  description?: string;
  image?: string;
  imagePullPolicy?: string;
  extraEnv?: ChimpProfile["extraEnv"];
  volumeMounts?: ChimpProfile["volumeMounts"];
  volumes?: ChimpProfile["volumes"];
  initCommands?: ChimpProfile["initCommands"];
  auth?: AuthConfig;
}

export interface ProfileTemplate {
  base: ProfileTemplateBase;
  profiles: Record<string, ProfileTemplateVariant>;
}

export function compileProfiles(
  template: ProfileTemplate,
): Record<string, ChimpProfile> {
  const result: Record<string, ChimpProfile> = {};

  for (const [name, variant] of Object.entries(template.profiles)) {
    const baseEnv = template.base.extraEnv ?? [];
    const variantEnv = variant.extraEnv ?? [];

    // Merge extraEnv: variant overrides base by env var name
    const envByName = new Map<string, (typeof baseEnv)[number]>();
    for (const env of baseEnv) envByName.set(env.name, env);
    for (const env of variantEnv) envByName.set(env.name, env);

    // Merge auth: variant overrides base by provider name
    const baseAuth = template.base.auth ?? {};
    const variantAuth = variant.auth ?? {};
    const auth = { ...baseAuth, ...variantAuth };

    result[name] = {
      brain: variant.brain,
      provider: variant.provider,
      model: variant.model,
      image: variant.image ?? template.base.image,
      description: variant.description,
      imagePullPolicy: variant.imagePullPolicy ?? template.base.imagePullPolicy,
      extraEnv: [...envByName.values()],
      volumeMounts: [
        ...(template.base.volumeMounts ?? []),
        ...(variant.volumeMounts ?? []),
      ],
      volumes: [...(template.base.volumes ?? []), ...(variant.volumes ?? [])],
      initCommands: [
        ...(template.base.initCommands ?? []),
        ...(variant.initCommands ?? []),
      ],
      auth,
    };
  }

  return result;
}
