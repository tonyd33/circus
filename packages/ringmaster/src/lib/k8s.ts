/**
 * Kubernetes utilities for Ringmaster
 */

const LABEL_NAMESPACE = "circus.mnke.org";

/**
 * Namespace a Kubernetes label with the circus.mnke.org prefix
 */
export function namespaceLabel(label: string): string {
  return `${LABEL_NAMESPACE}/${label}`;
}
