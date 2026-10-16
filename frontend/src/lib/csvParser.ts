// Bank statement CSV parser and intelligent column detector.
// Handles multi-bank formats, currency/decimal conventions, delimiters and smart categorisation.

import type { MovementType } from "./types";

export interface ColumnMapping {
  dateCol: number;
  descCol: number;
  amountCol: number;
  debitCol?: number;
  creditCol?: number;
}

export interface DetectedColumns {
  dateCol: number;
  descCol: number;
  amountCol: number;
  debitCol: number;
  creditCol: number;
  hasSplitAmount: boolean;
}

export interface ParsedCsvRow {
  rowId: string;
  originalIndex: number;
  date: string;
  what: string;
  amount_cents: number;
  type: MovementType;
  category: string;
  selected: boolean;
  matchedRule?: boolean;
  isDuplicate?: boolean;
  duplicateReason?: string;
  error?: string;
}

export interface RuleSuggestion {
  pattern: string;
  category: string;
  type?: MovementType;
}

export interface CsvParseResult {
  delimiter: string;
  headers: string[];
  rawRows: string[][];
  detected: DetectedColumns;
  rows: ParsedCsvRow[];
  totalValid: number;
  totalInvalid: number;
}

/**
 * Strips UTF-8 BOM, normalises line breaks and splits CSV respecting quotes.
 */
export function parseCsvRows(text: string): { delimiter: string; headers: string[]; rows: string[][] } {
  // Strip BOM
  let cleanText = text.replace(/^\uFEFF/, "").trim();
  if (!cleanText) {
    return { delimiter: ",", headers: [], rows: [] };
  }

  // Detect delimiter by checking frequency of common delimiters in the first non-empty lines
  const firstLines = cleanText.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0).slice(0, 5);
  const delimiters = [",", ";", "\t"];
  let bestDelimiter = ",";
  let bestScore = -1;

  for (const d of delimiters) {
    const counts = firstLines.map((line) => {
      let count = 0;
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') inQuotes = !inQuotes;
        else if (line[i] === d && !inQuotes) count++;
      }
      return count;
    });
    // Delimiter should appear in all sample lines and have consistent count > 0
    if (counts.length > 0 && counts[0]! > 0) {
      const isConsistent = counts.every((c) => c === counts[0]);
      const score = (counts[0]! * 10) + (isConsistent ? 50 : 0);
      if (score > bestScore) {
        bestScore = score;
        bestDelimiter = d;
      }
    }
  }

  // Full character-by-character CSV tokenizer supporting quotes, multiline values, and escaped quotes
  const allRows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === bestDelimiter && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++; // handle CRLF
      currentRow.push(currentField.trim());
      currentField = "";
      // Only push non-empty rows
      if (currentRow.some((f) => f.length > 0)) {
        allRows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  // Flush remaining field/row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      allRows.push(currentRow);
    }
  }

  if (allRows.length === 0) {
    return { delimiter: bestDelimiter, headers: [], rows: [] };
  }

  const headers = allRows[0]!.map((h) => h.replace(/^["']|["']$/g, "").trim());
  const rows = allRows.slice(1);

  return { delimiter: bestDelimiter, headers, rows };
}

/**
 * Normalises arbitrary date strings from bank statements into ISO `YYYY-MM-DD`.
 */
export function parseCsvDate(raw: string): string | null {
  if (!raw) return null;
  // Clean string and strip time component if present
  const clean = raw.trim().replace(/^["']|["']$/g, "").split(/[\sT]/)[0]!;

  // ISO: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return isValidDate(Number(y), Number(m), Number(d));
  }

  // Standard Latin/European: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const latinMatch = clean.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (latinMatch) {
    let [, dStr, mStr, yStr] = latinMatch;
    let y = Number(yStr);
    if (y < 100) y += y > 50 ? 1900 : 2000;
    const d = Number(dStr);
    const m = Number(mStr);

    // If month > 12 and day <= 12, it is US formatted MM/DD/YYYY
    if (m > 12 && d <= 12) {
      return isValidDate(y, d, m);
    }
    return isValidDate(y, m, d);
  }

  return null;
}

function isValidDate(year: number, month: number, day: number): string | null {
  if (year < 1970 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const dateObj = new Date(year, month - 1, day);
  if (
    dateObj.getFullYear() !== year ||
    dateObj.getMonth() !== month - 1 ||
    dateObj.getDate() !== day
  ) {
    return null;
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Parses bank monetary representations into absolute integer cents and sign (-1 = expense, 1 = income).
 */
export function parseCsvAmount(raw: string): { cents: number; sign: number } | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;

  let isNegative = false;

  // Accounting parentheses: (120.50) -> negative
  if (s.startsWith("(") && s.endsWith(")")) {
    isNegative = true;
    s = s.slice(1, -1).trim();
  }

  // Trailing minus: 120.50-
  if (s.endsWith("-")) {
    isNegative = true;
    s = s.slice(0, -1).trim();
  }

  // Leading minus
  if (s.startsWith("-")) {
    isNegative = true;
    s = s.slice(1).trim();
  }

  // Strip currency symbols and letters (USD, EUR, $, etc.)
  s = s.replace(/[^0-9,.-]/g, "").trim();

  // If after stripping, there's another minus
  if (s.startsWith("-")) {
    isNegative = true;
    s = s.slice(1).trim();
  }

  if (!s) return null;

  // Handle separators: distinguish 1,250.50 (US) from 1.250,50 (European/Latin)
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  let normalised = s;
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // 1.250,50 -> 1250.50
      normalised = s.replace(/\./g, "").replace(",", ".");
    } else {
      // 1,250.50 -> 1250.50
      normalised = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = s.split(",");
    if (parts.length === 2 && parts[1]!.length <= 2) {
      // Decimal comma: 1250,50 or 12,50
      normalised = `${parts[0]!}.${parts[1]!}`;
    } else {
      // Thousands comma: 1,250 or 1,250,000
      normalised = s.replace(/,/g, "");
    }
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length > 2) {
      // Thousands dot: 1.250.000
      normalised = s.replace(/\./g, "");
    } else if (parts.length === 2 && parts[1]!.length === 3) {
      // European thousand dot without decimals: 1.250
      normalised = s.replace(/\./g, "");
    }
  }

  const num = parseFloat(normalised);
  if (!Number.isFinite(num)) return null;

  const cents = Math.round(Math.abs(num) * 100);
  if (cents < 0) return null;

  return {
    cents,
    sign: isNegative ? -1 : 1,
  };
}

/**
 * Normalises strings for accent-insensitive keyword matching.
 */
function cleanKeyword(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Intelligent heuristic to suggest categories based on transaction description.
 * Prioritises custom learned user rules, then direct category name matches, then domain keywords.
 */
export function suggestCategory(
  description: string,
  categories: Array<{ id: string; name: string }>,
  userRules: RuleSuggestion[] = [],
): { category: string; matchedRule: boolean; type?: MovementType } {
  if (!description || categories.length === 0) return { category: "", matchedRule: false };
  const descNorm = cleanKeyword(description);

  // 1. Custom learned user rules (highest priority)
  for (const rule of userRules) {
    const patNorm = cleanKeyword(rule.pattern);
    if (patNorm.length >= 2 && descNorm.includes(patNorm)) {
      if (categories.some((c) => c.id === rule.category)) {
        return { category: rule.category, matchedRule: true, type: rule.type };
      }
    }
  }

  // Common keyword mapping to common category names
  const keywordMap: Record<string, string[]> = {
    alimentacion: ["super", "mercado", "carulla", "jumbo", "exito", "d1", "oxxo", "restaurante", "cafeteria", "starbucks", "mcdonald", "almuerzo", "cena", "uber eats", "rappi"],
    supermercado: ["super", "mercado", "carulla", "jumbo", "exito", "d1", "oxxo"],
    transporte: ["uber", "didi", "cabify", "gasolina", "combustible", "peaje", "metro", "bus", "estacionamiento", "parking", "taller"],
    servicios: ["luz", "electricidad", "agua", "gas", "internet", "enel", "claro", "movistar", "tigo", "telefon", "fibra"],
    vivienda: ["arriendo", "alquiler", "renta", "expensa", "administracion", "mantenimiento", "inmueble"],
    salud: ["farmacia", "drogueria", "hospital", "clinica", "medico", "doctor", "odontolog", "laboratorio"],
    entretenimiento: ["netflix", "spotify", "hbo", "cine", "disney", "prime video", "steam", "playstation", "teatro"],
    educacion: ["curso", "universidad", "colegio", "platzi", "udemy", "libro", "matricula"],
    sueldo: ["nomina", "sueldo", "salario", "honorarios", "pago cliente", "transferencia recibida", "abono"],
  };

  // 2. Direct name match with existing categories
  for (const cat of categories) {
    const catNorm = cleanKeyword(cat.name);
    if (catNorm.length >= 3 && (descNorm.includes(catNorm) || catNorm.includes(descNorm))) {
      return { category: cat.id, matchedRule: false };
    }
  }

  // 3. Keyword match
  for (const cat of categories) {
    const catNorm = cleanKeyword(cat.name);
    for (const [group, words] of Object.entries(keywordMap)) {
      if (catNorm.includes(group) || group.includes(catNorm)) {
        if (words.some((w) => descNorm.includes(w))) {
          return { category: cat.id, matchedRule: false };
        }
      }
    }
  }

  return { category: "", matchedRule: false };
}

/**
 * Automatically inspects headers and sample rows to detect column positions.
 */
export function detectColumns(headers: string[], sampleRows: string[][]): DetectedColumns {
  const normHeaders = headers.map((h) => cleanKeyword(h));

  let dateCol = -1;
  let descCol = -1;
  let amountCol = -1;
  let debitCol = -1;
  let creditCol = -1;

  // 1. Header name inspection
  normHeaders.forEach((h, idx) => {
    if (dateCol === -1 && /fecha|date|dia|f\.?\s*valor|operacion/.test(h)) {
      dateCol = idx;
    } else if (descCol === -1 && /concepto|descrip|detalle|movimiento|referencia|glosa|nota|beneficiario|comercio/.test(h)) {
      descCol = idx;
    } else if (debitCol === -1 && /debito|cargo|gasto|salida|egreso/.test(h)) {
      debitCol = idx;
    } else if (creditCol === -1 && /credito|abono|ingreso|entrada/.test(h)) {
      creditCol = idx;
    } else if (amountCol === -1 && /monto|importe|amount|valor|saldo/.test(h)) {
      amountCol = idx;
    }
  });

  // 2. Data inspection fallback for date column if not found in headers
  if (dateCol === -1 && sampleRows.length > 0) {
    for (let col = 0; col < headers.length; col++) {
      const matchCount = sampleRows.filter((row) => row[col] && parseCsvDate(row[col]!) !== null).length;
      if (matchCount >= Math.min(3, sampleRows.length)) {
        dateCol = col;
        break;
      }
    }
  }

  // 3. Data inspection fallback for amount column if not found
  if (amountCol === -1 && debitCol === -1 && creditCol === -1 && sampleRows.length > 0) {
    for (let col = 0; col < headers.length; col++) {
      if (col === dateCol || col === descCol) continue;
      const matchCount = sampleRows.filter((row) => row[col] && parseCsvAmount(row[col]!) !== null).length;
      if (matchCount >= Math.min(3, sampleRows.length)) {
        amountCol = col;
        break;
      }
    }
  }

  // 4. Fallback default indexes
  if (dateCol === -1) dateCol = 0;
  if (descCol === -1) descCol = Math.min(1, headers.length - 1);
  if (amountCol === -1 && debitCol === -1) amountCol = Math.min(2, headers.length - 1);

  const hasSplitAmount = debitCol !== -1 && creditCol !== -1;

  return {
    dateCol,
    descCol,
    amountCol: amountCol !== -1 ? amountCol : debitCol,
    debitCol,
    creditCol,
    hasSplitAmount,
  };
}

/**
 * Processes parsed CSV rows using the designated column mapping and suggests categories.
 */
export function buildMovementRows(
  rawRows: string[][],
  mapping: ColumnMapping,
  categories: Array<{ id: string; name: string }>,
  userRules: RuleSuggestion[] = [],
): ParsedCsvRow[] {
  return rawRows.map((row, idx) => {
    const rawDate = row[mapping.dateCol] ?? "";
    const rawDesc = row[mapping.descCol] ?? "";
    const date = parseCsvDate(rawDate);
    const what = rawDesc.trim() || "Movimiento importado";

    let amount_cents = 0;
    let type: MovementType = "gasto";
    let error: string | undefined;

    if (mapping.debitCol !== undefined && mapping.creditCol !== undefined) {
      const debitRaw = row[mapping.debitCol] ?? "";
      const creditRaw = row[mapping.creditCol] ?? "";
      const debitParsed = parseCsvAmount(debitRaw);
      const creditParsed = parseCsvAmount(creditRaw);

      if (creditParsed && creditParsed.cents > 0) {
        amount_cents = creditParsed.cents;
        type = "ingreso";
      } else if (debitParsed && debitParsed.cents > 0) {
        amount_cents = debitParsed.cents;
        type = "gasto";
      } else if (mapping.amountCol !== undefined) {
        const amtParsed = parseCsvAmount(row[mapping.amountCol] ?? "");
        if (amtParsed) {
          amount_cents = amtParsed.cents;
          type = amtParsed.sign < 0 ? "gasto" : "ingreso";
        }
      }
    } else {
      const amtParsed = parseCsvAmount(row[mapping.amountCol] ?? "");
      if (amtParsed) {
        amount_cents = amtParsed.cents;
        type = amtParsed.sign < 0 ? "gasto" : "ingreso";
      }
    }

    if (!date) {
      error = "Fecha inválida";
    } else if (amount_cents <= 0) {
      error = "Monto inválido";
    }

    const suggestion = suggestCategory(what, categories, userRules);
    const category = suggestion.category;
    if (suggestion.matchedRule && suggestion.type) {
      type = suggestion.type;
    }

    return {
      rowId: `imp-${idx}-${Date.now().toString(36)}`,
      originalIndex: idx,
      date: date || "",
      what,
      amount_cents,
      type,
      category,
      selected: !error && amount_cents > 0,
      matchedRule: suggestion.matchedRule,
      error,
    };
  });
}
