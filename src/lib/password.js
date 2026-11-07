import bcrypt from "bcryptjs";

const ROUNDS = 12;
let dummyHash;

function dummy() {
  if (!dummyHash) dummyHash = bcrypt.hash("not-a-real-admin-password", ROUNDS);
  return dummyHash;
}

export function passwordError(password) {
  if (typeof password !== "string" || password.length < 10 || password.length > 72) {
    return "Use 10 to 72 characters.";
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Include at least one letter and one number.";
  }
  return "";
}

export function hashPassword(password) {
  return bcrypt.hash(password, ROUNDS);
}

export async function passwordsMatch(password, hash) {
  const comparison = hash || (await dummy());
  const matches = await bcrypt.compare(password, comparison);
  return Boolean(hash) && matches;
}
