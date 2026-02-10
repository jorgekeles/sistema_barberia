const COUNTRY_TO_TIMEZONE: Record<string, string> = {
  AR: "America/Argentina/Buenos_Aires",
  UY: "America/Montevideo",
  CL: "America/Santiago",
  BR: "America/Sao_Paulo",
  PY: "America/Asuncion",
  BO: "America/La_Paz",
  PE: "America/Lima",
  CO: "America/Bogota",
  EC: "America/Guayaquil",
  VE: "America/Caracas",
  MX: "America/Mexico_City",
  US: "America/New_York",
  CA: "America/Toronto",
  ES: "Europe/Madrid",
  PT: "Europe/Lisbon",
  IT: "Europe/Rome",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  GB: "Europe/London",
};

export function deriveTimezoneFromCountry(countryCode: string) {
  const cc = countryCode.toUpperCase();
  return COUNTRY_TO_TIMEZONE[cc] ?? "America/Argentina/Buenos_Aires";
}
