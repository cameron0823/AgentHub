import type { providerCredentials } from "./db/schema";
import { decrypt, encrypt } from "./trust-engine";

const SEALED_PREFIX = "enc:v1:";
type ProviderCredentialRow = typeof providerCredentials.$inferSelect;
type SecretFields = "apiKey" | "accessToken" | "refreshToken";

function sealSecret(value: string | null | undefined) {
  if (!value) return value ?? null;
  if (value.startsWith(SEALED_PREFIX)) return value;
  const sealed = encrypt(value);
  return `${SEALED_PREFIX}${sealed.encryptedValue}.${sealed.iv}.${sealed.authTag}`;
}

function openSecret(value: string | null | undefined) {
  if (!value) return value ?? null;
  if (!value.startsWith(SEALED_PREFIX)) return value;

  const [encryptedValue, iv, authTag] = value.slice(SEALED_PREFIX.length).split(".");
  if (!encryptedValue || !iv || !authTag) {
    throw new Error("Provider credential has an invalid encrypted payload.");
  }
  return decrypt(encryptedValue, iv, authTag);
}

export function encryptProviderCredentialValues<T extends Partial<Record<SecretFields, string | null | undefined>>>(
  values: T,
): T {
  return {
    ...values,
    ...(Object.prototype.hasOwnProperty.call(values, "apiKey") && { apiKey: sealSecret(values.apiKey) }),
    ...(Object.prototype.hasOwnProperty.call(values, "accessToken") && { accessToken: sealSecret(values.accessToken) }),
    ...(Object.prototype.hasOwnProperty.call(values, "refreshToken") && {
      refreshToken: sealSecret(values.refreshToken),
    }),
  };
}

export function decryptProviderCredential<T extends Partial<Record<SecretFields, string | null>>>(credential: T): T {
  return {
    ...credential,
    apiKey: openSecret(credential.apiKey),
    accessToken: openSecret(credential.accessToken),
    refreshToken: openSecret(credential.refreshToken),
  };
}

export function decryptProviderCredentials<T extends Partial<Record<SecretFields, string | null>>>(credentials: T[]) {
  return credentials.map((credential) => decryptProviderCredential(credential));
}

export function redactProviderCredential<T extends ProviderCredentialRow>(credential: T) {
  return {
    ...credential,
    apiKey: credential.apiKey ? "[stored]" : null,
    accessToken: credential.accessToken ? "[stored]" : null,
    refreshToken: credential.refreshToken ? "[stored]" : null,
  };
}
