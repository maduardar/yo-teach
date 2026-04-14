import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const ITERATIONS = 120_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return `${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [saltPart, hashPart] = passwordHash.split(":");
  if (!saltPart || !hashPart) {
    return false;
  }

  const salt = Buffer.from(saltPart, "base64");
  const expectedHash = Buffer.from(hashPart, "base64");
  const actualHash = pbkdf2Sync(password, salt, ITERATIONS, expectedHash.length, DIGEST);

  return timingSafeEqual(actualHash, expectedHash);
}
