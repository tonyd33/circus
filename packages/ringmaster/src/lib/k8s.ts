/**
 * Kubernetes utilities for Ringmaster
 */

const LABEL_NAMESPACE = "circus.mnke.org";

export function namespaceLabel(label: string): string {
  return `${LABEL_NAMESPACE}/${label}`;
}

export const Labels = {
  CHIMP_ID: namespaceLabel("chimp-id"),
  CHIMP_PROFILE: namespaceLabel("chimp-profile"),
  MANAGED_BY: namespaceLabel("managed-by"),
};

/**
 * Kubernetes API error (from @kubernetes/client-node)
 */
export interface K8sError extends Error {
  statusCode?: number;
  code?: number | string;
  message: string;
  body?: {
    message?: string;
    reason?: string;
  };
}

/**
 * Check if an error is a Kubernetes error
 */
export function isK8sError(error: unknown): error is K8sError {
  return error instanceof Error && ("statusCode" in error || "code" in error);
}

/**
 * Check if a K8s error indicates a resource not found
 */
export function isK8sNotFound(error: unknown): boolean {
  if (!isK8sError(error)) return false;
  return error.statusCode === 404 || error.code === 404;
}

/**
 * Check if a K8s error indicates a conflict (resource already exists)
 */
export function isK8sConflict(error: unknown): boolean {
  if (!isK8sError(error)) return false;
  return error.statusCode === 409 || error.code === 409;
}
