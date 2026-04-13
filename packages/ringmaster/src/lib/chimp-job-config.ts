import { z } from "zod";

const EnvVarSourceSchema = z.object({
  secretKeyRef: z
    .object({
      name: z.string(),
      key: z.string(),
      optional: z.boolean().optional(),
    })
    .optional(),
  configMapKeyRef: z
    .object({
      name: z.string(),
      key: z.string(),
      optional: z.boolean().optional(),
    })
    .optional(),
  fieldRef: z
    .object({
      fieldPath: z.string(),
    })
    .optional(),
});

const EnvVarSchema = z.object({
  name: z.string(),
  value: z.string().optional(),
  valueFrom: EnvVarSourceSchema.optional(),
});

const VolumeMountSchema = z.object({
  name: z.string(),
  mountPath: z.string(),
  subPath: z.string().optional(),
  readOnly: z.boolean().optional(),
});

const VolumeSchema = z.object({
  name: z.string(),
  secret: z
    .object({
      secretName: z.string(),
      optional: z.boolean().optional(),
    })
    .optional(),
  configMap: z
    .object({
      name: z.string(),
      optional: z.boolean().optional(),
    })
    .optional(),
  emptyDir: z
    .object({
      medium: z.string().optional(),
      sizeLimit: z.string().optional(),
    })
    .optional(),
  persistentVolumeClaim: z
    .object({
      claimName: z.string(),
      readOnly: z.boolean().optional(),
    })
    .optional(),
});

export const ChimpJobConfigSchema = z.object({
  extraEnv: z.array(EnvVarSchema).default([]),
  volumeMounts: z.array(VolumeMountSchema).default([]),
  volumes: z.array(VolumeSchema).default([]),
  imagePullPolicy: z.string().optional(),
});

export type ChimpJobConfig = z.infer<typeof ChimpJobConfigSchema>;

const DEFAULT_CONFIG: ChimpJobConfig = {
  extraEnv: [],
  volumeMounts: [],
  volumes: [],
};

export async function loadChimpJobConfig(
  filePath: string | undefined,
): Promise<ChimpJobConfig> {
  if (!filePath) return DEFAULT_CONFIG;

  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) return DEFAULT_CONFIG;

  const text = await file.text();
  const json: unknown = JSON.parse(text);
  return ChimpJobConfigSchema.parse(json);
}
