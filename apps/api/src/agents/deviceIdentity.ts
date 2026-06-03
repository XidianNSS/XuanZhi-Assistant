import { createHash, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type DeviceIdentity = {
  version: 1;
  deviceId: string;
  publicKey: string;
  privateKeyPem: string;
  deviceToken?: string;
  createdAt: string;
};

function toBase64url(bytes: Buffer | Uint8Array) {
  return Buffer.from(bytes).toString('base64url');
}

function sha256Hex(bytes: Buffer | Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function extractEd25519RawPublicKey(publicKeyDer: Buffer) {
  // Ed25519 SPKI DER = 12-byte algorithm header + 32-byte raw public key.
  return publicKeyDer.subarray(publicKeyDer.length - 32);
}

function isDeviceIdentity(value: unknown): value is DeviceIdentity {
  const candidate = value as Partial<DeviceIdentity> | null;
  return (
    candidate?.version === 1 &&
    typeof candidate.deviceId === 'string' &&
    typeof candidate.publicKey === 'string' &&
    typeof candidate.privateKeyPem === 'string'
  );
}

export function getOrCreateDeviceIdentity(identityPath: string): DeviceIdentity {
  const fullPath = resolve(identityPath);
  if (existsSync(fullPath)) {
    const parsed = JSON.parse(readFileSync(fullPath, 'utf8')) as unknown;
    if (isDeviceIdentity(parsed)) {
      return parsed;
    }
    throw new Error(`Invalid OpenClaw device identity file: ${fullPath}`);
  }

  const pair = generateKeyPairSync('ed25519', {
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
    publicKeyEncoding: {
      type: 'spki',
      format: 'der',
    },
  });

  const rawPublicKey = extractEd25519RawPublicKey(pair.publicKey);
  const identity: DeviceIdentity = {
    version: 1,
    deviceId: sha256Hex(rawPublicKey),
    publicKey: toBase64url(rawPublicKey),
    privateKeyPem: pair.privateKey,
    createdAt: new Date().toISOString(),
  };

  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600 });
  return identity;
}

export function signDeviceChallenge(identity: DeviceIdentity, data: string) {
  const privateKey = createPrivateKey(identity.privateKeyPem);
  return toBase64url(sign(null, Buffer.from(data, 'utf8'), privateKey));
}

export function saveDeviceToken(identityPath: string, deviceToken: string) {
  const fullPath = resolve(identityPath);
  const identity = getOrCreateDeviceIdentity(fullPath);
  const updated: DeviceIdentity = {
    ...identity,
    deviceToken,
  };
  writeFileSync(fullPath, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
  return updated;
}
