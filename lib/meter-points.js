export function normalizeMeterPoint(value, fuelType) {
  let number = String(value || "").trim().replace(/[\s-]/g, "");
  if (fuelType === "gas" && /^\d{1,7}$/.test(number)) {
    number = number.padStart(7, "0");
  }
  return number;
}

export function meterPointIssue(value, fuelType) {
  const number = normalizeMeterPoint(value, fuelType);
  if (fuelType === "gas") {
    return /^\d{7}$/.test(number) ? null : "GPRN must contain 7 digits";
  }
  return /^10\d{9}$/.test(number) ? null : "MPRN must be 11 digits and start with 10";
}

export function comparableMeterPoint(value) {
  return String(value || "").trim().replace(/[\s-]/g, "");
}
