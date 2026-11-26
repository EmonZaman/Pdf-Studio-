import { formatCurrency, parseAmount, recalculateStatementBalances } from "./balance-calculator";

export type BangladeshiLedgerProfile =
  | "auto"
  | "islamic_modern" // Finacle-to-Ababil, CITYTOUCH-NPSB with timestamps, RATM DEP, ATM WDL, CT-CARD PMT (Omar Faruq style)
  | "remittance_eftn" // TT-R + 2.5% TT-R-INC pairs, CITY TOUCH/EFTN bursts, NPSB + 10 BDT charge pairs, Loan Recovery (Emon style)
  | "retail_business"; // Sequential CASH DEPOSIT / CASH RECEIVE (145..), CHQ withdrawals (981523..), POS purchases (Shwapno, Aarong, Bata, Daraz), ATM WDL (Masud / Heru / Abdur Rob style)

export interface AiLedgerGeneratorOptions {
  rowCount: number;
  startDate: string; // e.g. "01 Jan 2026" or "2026-01-01" or "14/11/2022"
  endDate: string; // e.g. "17 Oct 2026"
  openingBalance: string | number;
  targetClosingBalance: string | number;
  accountNo?: string;
  accountType?: string;
  branch?: string;
  customerName?: string;
  profile?: BangladeshiLedgerProfile;
  includeDependencies?: boolean;
}

export interface GeneratedLedgerResult {
  openingDate: string;
  statementEndDate: string;
  generationDate: string;
  openingBalance: string;
  totalDeposits: string;
  totalWithdrawals: string;
  availableBalance: string;
  transactions: {
    date: string;
    description: string;
    chq: string;
    withdrawal: string;
    deposit: string;
    balance: string;
  }[];
  dependencyCount: number;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_UPPER = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * Parses common date formats ("01 Jan 2026", "2026-01-01", "14/11/2022", "14-11-2022")
 */
export function parseFlexibleDate(raw: string, fallback: Date): Date {
  if (!raw || !raw.trim()) return fallback;
  const s = raw.trim();

  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]), 12, 0, 0);
    if (!isNaN(d.getTime())) return d;
  }

  const dmyText = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (dmyText) {
    const day = Number(dmyText[1]);
    const monStr = dmyText[2].slice(0, 3).toLowerCase();
    const year = Number(dmyText[3]);
    const monIdx = MONTHS_SHORT.findIndex((m) => m.toLowerCase() === monStr);
    if (monIdx !== -1) {
      const d = new Date(year, monIdx, day, 12, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const dmySlash = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmySlash) {
    const d = new Date(Number(dmySlash[3]), Number(dmySlash[2]) - 1, Number(dmySlash[1]), 12, 0, 0);
    if (!isNaN(d.getTime())) return d;
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed;
  return fallback;
}

export function formatStatementDate(d: Date, useSlash = false): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  if (useSlash) {
    return `${dd}/${mm}/${yyyy}`;
  }
  return `${dd} ${MONTHS_SHORT[d.getMonth()]} ${yyyy}`;
}

function formatIsoTimestamp(d: Date, hour: number, min: number, sec: number): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mi = String(min).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function formatCompactTimestamp(d: Date, hour: number, min: number, sec: number, rand6: string): string {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mi = String(min).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return `${yy}${mm}${dd}${hh}${mi}${ss}${rand6}`;
}

function formatDayOfYearCode(d: Date): string {
  const yy = String(d.getFullYear()).slice(-2);
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const doy = String(Math.floor(diff / oneDay)).padStart(3, "0");
  return `${yy}${doy}`;
}

function randomDigits(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += Math.floor(Math.random() * 10).toString();
  }
  return out;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Regional personas across Bangladesh so every generated statement feels like a distinct real person
interface RegionalPersona {
  city: string;
  atms: string[];
  sscAtms: string[];
  ratmBranches: string[];
  cashAreas: string[];
  merchants: string[];
  utilityProviders: string[];
}

const REGIONAL_PERSONAS: RegionalPersona[] = [
  {
    city: "Dhaka Central",
    atms: [
      "GREEN ROAD RATM",
      "PANTHAPATH RATM",
      "DHANMONDI 27 BR RATM",
      "SATMASJID ROAD RATM",
      "ELEPHANT ROAD RATM",
      "KALABAGAN BR RATM",
      "NEW MARKET RATM",
    ],
    sscAtms: ["PANTHAPATH SSC ATM", "GREEN ROAD ATM", "SHAHBAGH SSC ATM"],
    ratmBranches: ["KAWRAN BAZAR BR RATM", "KAWRAN BAZAR BR RATM 2", "GREEN ROAD RATM", "DHANMONDI BR RATM"],
    cashAreas: ["KARWAN BAZAR", "ZIGATOLA", "HATIRJHEEL", "PANTHAPATH", "DHANMONDI", "NEW MARKET", "FARMGATE"],
    merchants: [
      "PURCHASE FOOD SHWAPNO Green Road",
      "PURCHASE CARD LAZZ PHARMA>Kalabagan",
      "PURCHASE CARD MEENA BAZAR>Dhanmondi",
      "PURCHASE CARD AARONG>Dhanmondi 27",
      "PURCHASE CARD UNIMART>Dhanmondi",
      "PURCHASE CARD STAR KABAB>Dhanmondi",
      "PURCHASE CARD APEX FOOTWEAR>Elephant Rd",
      "PURCHASE CARD BATA BD>New Market",
      "PURCHASE CARD NORTH END COFFEE>Shahbagh",
      "PURCHASE CARD CHALDAL.COM>Dhaka",
      "PURCHASE CARD DARAZ ONLINE>Dhaka",
      "PURCHASE CARD PATHAO PAY>Dhaka",
    ],
    utilityProviders: ["DPDC PREPAID", "DPDC POSTPAID", "TITAS GAS", "DHAKA WASA", "LINK3 INTERNET", "GP POSTPAID"],
  },
  {
    city: "Dhaka North (Mirpur / Uttara)",
    atms: [
      "MIRPUR 10 BR RATM",
      "PALLABI BR RATM",
      "METRO SHEWRAPARA RATM>Mirpur BD",
      "IBRAHIMPUR KAFRUL RATM>Dhaka CantonmenBD",
      "UTTARA JASIMUDDIN RATM",
      "UTTARA SECTOR 7 BR RATM",
      "BENARASHI PALLI RATM>Mirpur TSO BD",
      "KALSHI RATM>Mirpur BD",
    ],
    sscAtms: ["MIRPUR 11 SSC ATM", "UTTARA SECTOR 3 ATM", "SHEWRAPARA SSC ATM"],
    ratmBranches: ["PALLABI BR RATM", "MIRPUR 10 BR RATM", "UTTARA NORTH RATM", "UTTARA JASIMUDDIN RATM"],
    cashAreas: ["MIRPUR", "PALLABI", "UTTARA", "KAFRUL", "SHEWRAPARA", "ABDULLAHPUR", "TONGI"],
    merchants: [
      "PURCHASE CARD SHWAPNO>Mirpur 10",
      "PURCHASE CARD M/S NEW LIFE PHARMACY>Mirpur TSO",
      "PURCHASE CARD LAZZ PHARMA>Mirpur TSO",
      "PURCHASE CARD AGORA SUPER SHOP>Uttara",
      "PURCHASE CARD AARONG>Uttara Sec 3",
      "PURCHASE CARD YELLOW BY BEXIMCO>Uttara",
      "PURCHASE CARD SAILOR>Mirpur 1",
      "PURCHASE CARD WHOLESALE CLUB>Jamuna FP",
      "PURCHASE CARD GARLIC N GINGER>Uttara",
      "PURCHASE CARD FOODPANDA BD>Dhaka",
      "PURCHASE CARD DARAZ SHOPPING>Dhaka",
      "PURCHASE CARD INFINITY MEGA MALL>Uttara",
    ],
    utilityProviders: ["DESCO PREPAID", "DESCO POSTPAID", "TITAS GAS", "DHAKA WASA", "CARNIVAL INTERNET", "ROBI POSTPAID"],
  },
  {
    city: "Dhaka East (Gulshan / Banani / Badda)",
    atms: [
      "GULSHAN AVENUE BR RATM",
      "BANANI 11 BR RATM",
      "BADDA PRAGATI AVENUE RATM",
      "KURIL PRAGATI AVENUE RATM",
      "BASHUNDHARA R/A GATE RATM",
      "MOHAKHALI BR RATM",
      "RAMPURA BAZAR RATM",
    ],
    sscAtms: ["GULSHAN 1 SSC ATM", "BANANI SSC ATM", "JAMUNA FUTURE PARK ATM"],
    ratmBranches: ["GULSHAN BR RATM", "BANANI BR RATM", "BASHUNDHARA CITY RATM", "PRAGATI SARANI RATM"],
    cashAreas: ["BANANI", "GULSHAN", "BADDA", "RAMPURA", "MOHAKHALI", "MALIBAGH", "BARIDHARA"],
    merchants: [
      "PURCHASE CARD UNIMART>Gulshan 2",
      "PURCHASE CARD SHWAPNO>Banani",
      "PURCHASE CARD TAMANNA PHARMACY>Gulshan",
      "PURCHASE CARD AARONG>Gulshan 1",
      "PURCHASE CARD KOREAN BEAUTY>Banani",
      "PURCHASE CARD GLORIA JEANS>Gulshan",
      "PURCHASE CARD MEENA BAZAR>Badda",
      "PURCHASE CARD APEX FOOTWEAR>Bashundhara",
      "PURCHASE CARD PICKABOO ONLINE>Dhaka",
      "PURCHASE CARD CHALDAL GROCERY>Dhaka",
      "PURCHASE CARD BATA BD>Banani",
      "PURCHASE CARD PRAINGON FASHION>Dhaka",
    ],
    utilityProviders: ["DESCO PREPAID", "TITAS GAS", "DHAKA WASA", "AMBER IT INTERNET", "GP POSTPAID", "BANGLALINK POSTPAID"],
  },
  {
    city: "Old Dhaka / Motijheel / Narayanganj",
    atms: [
      "MOTIJHEEL BR RATM",
      "DILKUSHA C/A RATM",
      "POSTA LALBAGH BR RATM",
      "NARAYANGANJ CHASHARA RATM",
      "FATULLAH BR RATM",
      "KAMALAPUR STATION RATM",
      "SADARGHAT BR RATM",
    ],
    sscAtms: ["MOTIJHEEL SSC ATM", "PALTAN SSC ATM", "NARAYANGANJ BAZAR ATM"],
    ratmBranches: ["MOTIJHEEL BR RATM", "NARAYANGANJ BR RATM", "POSTA BR RATM", "NAWABPUR BR RATM"],
    cashAreas: ["MOTIJHEEL", "LALBAGH", "SADARGHAT", "RAJARBAGH", "HAZARIBAGH", "NARAYANGANJ", "FATULLAH"],
    merchants: [
      "PURCHASE FOOD SHWAPNO Fatullah",
      "PURCHASE CARD BATA BD>Narayanganj",
      "PURCHASE CARD AARONG>Narayanganj",
      "PURCHASE CARD DAILY BAZAR>Motijheel",
      "PURCHASE CARD LAZZ PHARMA>Paltan",
      "PURCHASE CARD BILL PAY TREND FASHION",
      "PURCHASE CARD SMART GALLERY>Chashara",
      "PURCHASE CARD APEX FOOTWEAR>Motijheel",
      "PURCHASE CARD MEENA BAZAR>Shantinagar",
      "PURCHASE CARD DARAZ ONLINE>Dhaka",
    ],
    utilityProviders: ["DPDC PREPAID", "DPDC POSTPAID", "TITAS GAS", "DHAKA WASA", "DOT INTERNET", "GP POSTPAID"],
  },
  {
    city: "Chattogram / Sylhet Regional",
    atms: [
      "AGRABAD C/A BR RATM",
      "GEC CIRCLE BR RATM",
      "CHAWKBAZAR BRANCH RECYCL>CHITTAGONG BD",
      "AMBARKHANA BR RATM>SYLHET",
      "ZINDABAZAR BR RATM>SYLHET",
      "NASIRABAD BR RATM>CTG",
      "LALDIGHI CTG RATM",
    ],
    sscAtms: ["AGRABAD SSC ATM", "ZINDABAZAR SSC ATM", "GEC MORE ATM"],
    ratmBranches: ["AGRABAD BR RATM", "AMBARKHANA BR RATM", "GEC CIRCLE RATM", "ZINDABAZAR RATM"],
    cashAreas: ["AGRABAD", "ZINDABAZAR", "AMBARKHANA", "CHAWKBAZAR", "HALISHAHAR", "CHOWMUHUNI", "SONAIMURI"],
    merchants: [
      "PURCHASE CARD SHWAPNO>GEC Circle",
      "PURCHASE CARD KHULSHI MART>Chattogram",
      "PURCHASE CARD AARONG>Nasirabad",
      "PURCHASE CARD LAZZ PHARMA>Zindabazar",
      "PURCHASE CARD BATA BD>Agrabad",
      "PURCHASE CARD APEX FOOTWEAR>Sylhet",
      "PURCHASE CARD SAILOR>GEC Chattogram",
      "PURCHASE CARD WELL FOOD>Chattogram",
      "PURCHASE CARD DARAZ SHOPPING>BD",
      "PURCHASE CARD GENIUS SHOPPING>Sylhet",
    ],
    utilityProviders: ["PDB PREPAID", "BPDB ELECTRICITY", "KARNAPHULI GAS", "JALALABAD GAS", "LINK3 INTERNET", "ROBI POSTPAID"],
  },
];

const NPSB_BANKS = [
  { short: "BRBL", name: "BRAC" },
  { short: "DBBL", name: "DBBL" },
  { short: "IBBL", name: "IBBL" },
  { short: "PUBL", name: "PUBALI" },
  { short: "MTBL", name: "MTB" },
  { short: "EBL", name: "EBL" },
  { short: "PRBL", name: "PRIME" },
  { short: "UCBL", name: "UCB" },
  { short: "SCB", name: "SCB" },
  { short: "IFIC", name: "IFIC" },
  { short: "DHBL", name: "DHAKA" },
  { short: "ETBL", name: "EBL" },
  { short: "NRBC", name: "NRB" },
  { short: "TRBL", name: "TRUST" },
  { short: "SEBL", name: "SOUTHEAST" },
  { short: "EXIM", name: "EXIM" },
];

const CLEARING_BANKS = [
  { name: "SONALI", routing: "200263047" },
  { name: "JANATA", routing: "135261724" },
  { name: "AGRANI", routing: "010261243" },
  { name: "BRAC", routing: "060261726" },
  { name: "DBBL", routing: "090261729" },
  { name: "PRIME", routing: "170261722" },
  { name: "IBBL", routing: "125261728" },
  { name: "PUBALI", routing: "175261725" },
];

const BD_PERSON_NAMES = [
  "MD RAHAT ALI NOMAN",
  "HAFIZUR RAHMAN KHAN",
  "FARID AHMED",
  "KAMRUL HASAN",
  "SHAHRIAR KABIR",
  "TANVIR AHMED CHOWDHURY",
  "NAZMUL HAQUE",
  "ASHRAFUL ISLAM",
  "MAHMUDUL HASAN",
  "REZAUL KARIM",
  "SAIFUL ISLAM",
  "TASNIM AKTER",
  "NUSRAT JAHAN",
  "MOSLEM UDDIN MIAH",
  "MOSTAFA BEGUM",
  "ZAHIDUL ISLAM",
];

interface DraftRow {
  dateObj: Date;
  description: string;
  chq: string;
  kind: "withdrawal" | "deposit";
  category: string;
  amountCents: number;
  adjustableRound: boolean;
  /** Keep +10.00 BDT suffix when adjusted (for embedded-fee NPSB transfers) */
  keepPlusTenFee?: boolean;
  /** Keep multiple of 500 BDT (for ATM withdrawals) */
  keepAtmStep?: boolean;
  allowsFractionalPaisa: boolean;
  minCents: number;
  groupId: string;
  isDependencyChild?: boolean;
}

function detectProfile(options: AiLedgerGeneratorOptions): Exclude<BangladeshiLedgerProfile, "auto"> {
  if (options.profile && options.profile !== "auto") {
    return options.profile;
  }
  const acctType = (options.accountType || "").toUpperCase();
  if (acctType.includes("ISLAMIC") || acctType.includes("DST") || acctType.includes("ABABIL")) {
    return "islamic_modern";
  }
  if (acctType.includes("HIGH VALUE") || acctType.includes("FOREIGN") || acctType.includes("REMIT")) {
    return "remittance_eftn";
  }
  if (acctType.includes("CURRENT") || acctType.includes("RETAIL") || acctType.includes("BUSINESS")) {
    return "retail_business";
  }
  return "islamic_modern";
}

/**
 * Generates a fresh unique pool of 13-digit Bangladeshi bank accounts for each statement
 */
function buildFreshCounterpartyAccounts(count: number): string[] {
  const prefixes = ["105", "106", "107", "120", "126", "201", "205", "210", "218", "220", "230", "261", "270", "311", "344"];
  const set = new Set<string>();
  while (set.size < count) {
    set.add(`${pick(prefixes)}${randomDigits(10)}`);
  }
  return Array.from(set);
}

/**
 * Generates fresh Bangladeshi mobile numbers (017/018/019/016/015/013) for MFS transfers
 */
function buildFreshMfsNumbers(count: number): string[] {
  const prefixes = ["017", "018", "019", "016", "015", "013"];
  const set = new Set<string>();
  while (set.size < count) {
    set.add(`${pick(prefixes)}${randomDigits(8)}`);
  }
  return Array.from(set);
}

/**
 * Picks a persona matching the branch name if possible, otherwise randomizes across Bangladesh regions
 */
function selectRegionalPersona(branch?: string): RegionalPersona {
  const b = (branch || "").toUpperCase();
  if (b.includes("MIRPUR") || b.includes("PALLABI") || b.includes("UTTARA")) return REGIONAL_PERSONAS[1];
  if (b.includes("GULSHAN") || b.includes("BANANI") || b.includes("BADDA")) return REGIONAL_PERSONAS[2];
  if (b.includes("MOTIJHEEL") || b.includes("NARAYANGANJ") || b.includes("POSTA") || b.includes("LALBAG")) return REGIONAL_PERSONAS[3];
  if (b.includes("SYLHET") || b.includes("AMBARKHANA") || b.includes("CHITTAGONG") || b.includes("AGRABAD")) return REGIONAL_PERSONAS[4];
  if (b.includes("DHANMONDI") || b.includes("KARWAN") || b.includes("GREEN ROAD")) {
    // 65% Dhaka Central, 35% another Dhaka persona so repeated runs still feel varied
    return Math.random() < 0.65 ? REGIONAL_PERSONAS[0] : pick(REGIONAL_PERSONAS.slice(0, 3));
  }
  return pick(REGIONAL_PERSONAS);
}

/**
 * Generates an organic, non-repetitive human BDT amount scaled to the account's balance range.
 * Avoids repeating any amount in `recentAmounts`.
 */
function pickUniqueHumanAmountBdt(
  minBdt: number,
  maxBdt: number,
  step: number,
  recentAmounts: number[]
): number {
  const safeMin = Math.max(step, Math.round(minBdt / step) * step);
  const safeMax = Math.max(safeMin + step, Math.round(maxBdt / step) * step);
  const stepsCount = Math.max(1, Math.floor((safeMax - safeMin) / step));

  for (let attempt = 0; attempt < 25; attempt++) {
    // Use a slightly skewed distribution (more small/medium amounts, occasional larger ones)
    const r = Math.pow(Math.random(), 1.35);
    let val = safeMin + Math.floor(r * (stepsCount + 1)) * step;
    // Occasionally add a subtle realistic human offset (like +200, +350, +500, +750) if step allows
    if (step === 100 && Math.random() < 0.4) {
      val += pick([50, 100, 150, 200, 250, 300, 400, 500, 600, 750, 800, 900]);
    }
    if (!recentAmounts.includes(val)) {
      return val;
    }
  }
  return safeMin + randInt(0, stepsCount) * step;
}

/**
 * Generates an authentic, human-like Bangladeshi bank statement ledger with
 * unique per-statement persona, varied non-repetitive transaction types & amounts,
 * real transaction dependencies, and exact opening -> closing balance reconciliation.
 */
export function generateBangladeshiAiLedger(options: AiLedgerGeneratorOptions): GeneratedLedgerResult {
  const targetRows = Math.max(4, Math.min(600, Math.round(Number(options.rowCount) || 40)));
  const useSlashDates = /^\d{1,2}\/\d{1,2}\/\d{4}$/.test((options.startDate || "").trim());

  const startD = parseFlexibleDate(options.startDate, new Date(2026, 0, 1, 12, 0, 0));
  let endD = parseFlexibleDate(options.endDate, new Date(2026, 9, 17, 12, 0, 0));
  if (endD.getTime() <= startD.getTime()) {
    endD = new Date(startD.getTime() + 90 * 24 * 60 * 60 * 1000);
  }

  const openingCents = Math.max(0, Math.round(parseAmount(options.openingBalance) * 100));
  const closingCents = Math.max(50000, Math.round(parseAmount(options.targetClosingBalance) * 100));

  // Scale transaction amounts naturally to the statement's actual balance magnitude
  const avgBalanceBdt = Math.max(25000, (openingCents + closingCents) / 200);
  const scaleFactor = Math.max(0.35, Math.min(4.5, avgBalanceBdt / 320000));

  const accountNo = (options.accountNo || "1781920006484").trim();
  const cardSuffix1 = accountNo.slice(-3) || randomDigits(3);
  const cardSuffix2 = randomDigits(3);
  const cardBin = pick(["474867", "376948", "410520", "528412", "453291"]);
  const cardMid = `${randInt(19, 28)}${randomDigits(5)}`;
  const profile = detectProfile(options);
  const includeDeps = options.includeDependencies !== false;

  // Per-statement unique persona & fresh random counterparties
  const persona = selectRegionalPersona(options.branch);
  const counterparties = buildFreshCounterpartyAccounts(14);
  const mfsNumbers = buildFreshMfsNumbers(6);
  const regularBeneficiaryNames = [pick(BD_PERSON_NAMES), pick(BD_PERSON_NAMES), pick(BD_PERSON_NAMES)];

  const spanMs = Math.max(24 * 3600 * 1000, endD.getTime() - startD.getTime());

  const clusters: DraftRow[][] = [];
  let currentCount = 0;
  let seqDepositNo = randInt(105, 580);
  let seqChqNo = randInt(618500, 989400);
  let seqCtId = randInt(100000350000, 100029500000);
  let seqRatmTrace = randInt(1011200000, 1298500000);
  let groupIdCounter = 1;

  // Sliding anti-repetition windows so no transaction category or exact amount repeats back-to-back
  const recentAmountsBdt: number[] = [];
  const recentCategories: string[] = [];
  const recentDescriptions: string[] = [];

  const rememberTx = (amountBdt: number, category: string, desc: string) => {
    recentAmountsBdt.push(amountBdt);
    if (recentAmountsBdt.length > 12) recentAmountsBdt.shift();
    recentCategories.push(category);
    if (recentCategories.length > 3) recentCategories.shift();
    recentDescriptions.push(desc);
    if (recentDescriptions.length > 8) recentDescriptions.shift();
  };

  // Check if June 30 or Dec 30 falls inside [startD, endD] for half-yearly closing dependency cluster
  let closingDateCandidate: Date | null = null;
  for (let yr = startD.getFullYear(); yr <= endD.getFullYear(); yr++) {
    const jun30 = new Date(yr, 5, 30, 12, 0, 0);
    const dec30 = new Date(yr, 11, 30, 12, 0, 0);
    if (jun30.getTime() >= startD.getTime() && jun30.getTime() <= endD.getTime()) {
      closingDateCandidate = jun30;
      break;
    }
    if (dec30.getTime() >= startD.getTime() && dec30.getTime() <= endD.getTime()) {
      closingDateCandidate = dec30;
      break;
    }
  }

  let hasInsertedHalfYearlyCluster = false;
  let hasInsertedSmsFee = false;
  let hasInsertedCardFee = false;
  let dependencyCount = 0;

  while (currentCount < targetRows) {
    const remaining = targetRows - currentCount;
    const progress = currentCount / Math.max(1, targetRows);
    const jitter = (Math.random() - 0.5) * (0.7 / Math.max(5, targetRows));
    const clampedProgress = Math.max(0.01, Math.min(0.99, progress + jitter));
    const clusterDate = new Date(startD.getTime() + Math.floor(spanMs * clampedProgress));
    clusterDate.setHours(12, 0, 0, 0);

    const gid = `g-${groupIdCounter++}`;
    const doyCode = formatDayOfYearCode(clusterDate);
    const isModernPeriod = progress > 0.5;

    // 1. Half-Yearly Bank Closing Dependency Cluster (4 rows on 30 Jun / 30 Dec)
    if (
      includeDeps &&
      !hasInsertedHalfYearlyCluster &&
      closingDateCandidate &&
      remaining >= 6 &&
      progress >= 0.42
    ) {
      hasInsertedHalfYearlyCluster = true;
      const cDate = closingDateCandidate;
      if (profile === "islamic_modern") {
        const profitCents = randInt(48000, 215000) + randInt(1, 95);
        const taxCents = Math.round(profitCents * 0.15);
        clusters.push([
          {
            dateObj: cDate,
            description: `PROVISIONAL PROFIT POSTING OF ACCOUNT ${accountNo}`,
            chq: "-",
            kind: "deposit",
            category: "closing_profit",
            amountCents: profitCents,
            adjustableRound: false,
            allowsFractionalPaisa: true,
            minCents: 20000,
            groupId: gid,
          },
          {
            dateObj: cDate,
            description: `SOURCE TAX DEDUCTED OF PROVISIONAL PROFIT FROM ACCOUNT ${accountNo}`,
            chq: "-",
            kind: "withdrawal",
            category: "closing_tax",
            amountCents: taxCents,
            adjustableRound: false,
            allowsFractionalPaisa: false,
            minCents: taxCents,
            groupId: gid,
            isDependencyChild: true,
          },
          {
            dateObj: cDate,
            description: `SERVICE CHARGE DEDUCTION FROM ACCOUNT ${accountNo}`,
            chq: "-",
            kind: "withdrawal",
            category: "closing_fee",
            amountCents: 25000,
            adjustableRound: false,
            allowsFractionalPaisa: false,
            minCents: 25000,
            groupId: gid,
            isDependencyChild: true,
          },
          {
            dateObj: cDate,
            description: `VAT OF SERVICE CHARGE DEDUCTION FROM ACCOUNT ${accountNo}`,
            chq: "-",
            kind: "withdrawal",
            category: "closing_vat",
            amountCents: 3750,
            adjustableRound: false,
            allowsFractionalPaisa: false,
            minCents: 3750,
            groupId: gid,
            isDependencyChild: true,
          },
        ]);
        currentCount += 4;
        dependencyCount += 3;
        continue;
      } else {
        const monLabel = `${MONTHS_UPPER[cDate.getMonth()]}-${cDate.getFullYear()}`;
        const maintFee = pick([11500, 23000, 34500]);
        const exciseDuty = avgBalanceBdt > 1000000 ? 300000 : 50000;
        clusters.push([
          {
            dateObj: cDate,
            description: `A/C MAINTENANCE FEE ${monLabel}`,
            chq: "-",
            kind: "withdrawal",
            category: "closing_fee",
            amountCents: maintFee,
            adjustableRound: false,
            allowsFractionalPaisa: false,
            minCents: maintFee,
            groupId: gid,
          },
          {
            dateObj: cDate,
            description: `EXCISE DUTY-${cDate.getFullYear()}`,
            chq: "-",
            kind: "withdrawal",
            category: "closing_excise",
            amountCents: exciseDuty,
            adjustableRound: false,
            allowsFractionalPaisa: false,
            minCents: exciseDuty,
            groupId: gid,
            isDependencyChild: true,
          },
        ]);
        currentCount += 2;
        dependencyCount += 1;
        continue;
      }
    }

    // 2. Annual SMS Renewal Fee (345.00 BDT)
    if (includeDeps && !hasInsertedSmsFee && remaining >= 4 && progress >= 0.3 && Math.random() < 0.35) {
      hasInsertedSmsFee = true;
      const yr = clusterDate.getFullYear();
      const desc =
        profile === "islamic_modern"
          ? `${doyCode}000${randomDigits(6)}-SMS*RENEW*${yr}*BDT*${accountNo}`
          : `SMS*RENEW*${yr}*BDT*${accountNo}`;
      clusters.push([
        {
          dateObj: clusterDate,
          description: desc,
          chq: "-",
          kind: "withdrawal",
          category: "sms_fee",
          amountCents: 34500,
          adjustableRound: false,
          allowsFractionalPaisa: false,
          minCents: 34500,
          groupId: gid,
        },
      ]);
      currentCount += 1;
      continue;
    }

    // 3. Annual Debit Card Fee (575.00 or 690.00 BDT)
    if (includeDeps && !hasInsertedCardFee && remaining >= 4 && progress >= 0.68 && Math.random() < 0.4) {
      hasInsertedCardFee = true;
      const cardFeeCents = pick([57500, 69000]);
      const desc =
        profile === "islamic_modern"
          ? `Debit Card Fee for #${cardBin}${randomDigits(10)}`
          : `CARD FEE 371478S${randomDigits(7)}`;
      clusters.push([
        {
          dateObj: clusterDate,
          description: desc,
          chq: "-",
          kind: "withdrawal",
          category: "card_fee",
          amountCents: cardFeeCents,
          adjustableRound: false,
          allowsFractionalPaisa: false,
          minCents: cardFeeCents,
          groupId: gid,
        },
      ]);
      currentCount += 1;
      continue;
    }

    // 4. Remittance TT Credit + 2.5% Government Incentive Pair
    if (
      includeDeps &&
      (profile === "remittance_eftn" || (profile === "islamic_modern" && Math.random() < 0.04)) &&
      remaining >= 3 &&
      !recentCategories.includes("tt_remit") &&
      Math.random() < (profile === "remittance_eftn" ? 0.16 : 0.5)
    ) {
      const ttRef = `TT-R${randomDigits(11)}`;
      const baseBdt = pickUniqueHumanAmountBdt(
        Math.round(55000 * scaleFactor),
        Math.round(390000 * scaleFactor),
        500,
        recentAmountsBdt
      );
      const baseCents = baseBdt * 100 + pick([0, 0, 0, 50, 80, 20]);
      const incCents = Math.round(baseCents * 0.025);
      rememberTx(baseBdt, "tt_remit", ttRef);
      clusters.push([
        {
          dateObj: clusterDate,
          description: ttRef,
          chq: "-",
          kind: "deposit",
          category: "tt_remit",
          amountCents: baseCents,
          adjustableRound: false,
          allowsFractionalPaisa: false,
          minCents: 2500000,
          groupId: gid,
        },
        {
          dateObj: clusterDate,
          description: `${ttRef}-INC`,
          chq: "-",
          kind: "deposit",
          category: "tt_remit_inc",
          amountCents: incCents,
          adjustableRound: false,
          allowsFractionalPaisa: false,
          minCents: 50000,
          groupId: gid,
          isDependencyChild: true,
        },
      ]);
      currentCount += 2;
      dependencyCount += 1;
      continue;
    }

    // 5. Split Large ATM Withdrawal Dependency Pair (e.g. 60k+20k, 80k+15k, 50k+25k on same day)
    if (
      includeDeps &&
      remaining >= 3 &&
      !recentCategories.includes("atm_split") &&
      !recentCategories.includes("atm_wdl") &&
      Math.random() < 0.09
    ) {
      seqRatmTrace += randInt(12000, 95000);
      const t1 = String(seqRatmTrace).padStart(12, "0");
      const t2 = String(seqRatmTrace + randInt(310, 1650)).padStart(12, "0");
      const s1 = String(randInt(110000, 940000)).padStart(12, "0");
      const s2 = String(Number(s1) + randInt(320, 980)).padStart(12, "0");
      const suffix = isModernPeriod ? "-5" : "";
      const atmLoc = pick(persona.atms);
      const split1 = pickUniqueHumanAmountBdt(40000, 80000, 5000, recentAmountsBdt);
      const split2 = pickUniqueHumanAmountBdt(5000, 25000, 5000, [...recentAmountsBdt, split1]);
      rememberTx(split1, "atm_split", atmLoc);
      rememberTx(split2, "atm_split", atmLoc);
      clusters.push([
        {
          dateObj: clusterDate,
          description: `ATM WDL-${atmLoc}-${t1}-${s1}${suffix}`,
          chq: "-",
          kind: "withdrawal",
          category: "atm_split",
          amountCents: split1 * 100,
          adjustableRound: true,
          keepAtmStep: true,
          allowsFractionalPaisa: false,
          minCents: 1500000,
          groupId: gid,
        },
        {
          dateObj: clusterDate,
          description: `ATM WDL-${atmLoc}-${t2}-${s2}${suffix}`,
          chq: "-",
          kind: "withdrawal",
          category: "atm_split",
          amountCents: split2 * 100,
          adjustableRound: true,
          keepAtmStep: true,
          allowsFractionalPaisa: false,
          minCents: 500000,
          groupId: gid,
          isDependencyChild: true,
        },
      ]);
      currentCount += 2;
      dependencyCount += 1;
      continue;
    }

    // 6. Inter-branch / SSC ATM Withdrawal + 46.00 ATM Charge Dependency Pair
    if (
      includeDeps &&
      remaining >= 3 &&
      !recentCategories.includes("atm_ssc") &&
      Math.random() < 0.08
    ) {
      seqRatmTrace += randInt(15000, 80000);
      const trace = String(seqRatmTrace).padStart(12, "0");
      const seq = String(randInt(100000, 950000)).padStart(12, "0");
      const atmLoc = pick(persona.sscAtms);
      const wdlBdt = pickUniqueHumanAmountBdt(2500, 24000, 500, recentAmountsBdt);
      rememberTx(wdlBdt, "atm_ssc", atmLoc);
      clusters.push([
        {
          dateObj: clusterDate,
          description: `ATM WDL-${atmLoc}-${trace}-${seq}`,
          chq: "-",
          kind: "withdrawal",
          category: "atm_ssc",
          amountCents: wdlBdt * 100,
          adjustableRound: true,
          keepAtmStep: true,
          allowsFractionalPaisa: false,
          minCents: 200000,
          groupId: gid,
        },
        {
          dateObj: clusterDate,
          description: `ATM CASH WITHDRAWL CHARGE${accountNo}`,
          chq: "-",
          kind: "withdrawal",
          category: "atm_charge",
          amountCents: 4600,
          adjustableRound: false,
          allowsFractionalPaisa: false,
          minCents: 4600,
          groupId: gid,
          isDependencyChild: true,
        },
      ]);
      currentCount += 2;
      dependencyCount += 1;
      continue;
    }

    // 7. Clearing Cheque Deposit + 10.00 BACH Clearing Charge Dependency Pair
    if (
      includeDeps &&
      remaining >= 3 &&
      !recentCategories.includes("clg_chq") &&
      Math.random() < 0.06
    ) {
      const chqNum = randomDigits(7);
      const bank = pick(CLEARING_BANKS);
      const dd = String(clusterDate.getDate()).padStart(2, "0");
      const mm = String(clusterDate.getMonth() + 1).padStart(2, "0");
      const yy = String(clusterDate.getFullYear()).slice(-2);
      const depBdt = pickUniqueHumanAmountBdt(
        Math.round(45000 * scaleFactor),
        Math.round(380000 * scaleFactor),
        5000,
        recentAmountsBdt
      );
      rememberTx(depBdt, "clg_chq", bank.name);
      clusters.push([
        {
          dateObj: clusterDate,
          description: `CLG CHQ#${chqNum} ${bank.name}; Routing# ${bank.routing}`,
          chq: "-",
          kind: "deposit",
          category: "clg_chq",
          amountCents: depBdt * 100,
          adjustableRound: true,
          allowsFractionalPaisa: false,
          minCents: 2000000,
          groupId: gid,
        },
        {
          dateObj: clusterDate,
          description: `CLG BACH Charge: CHQ#${chqNum} ${bank.name}; ${dd}/${mm}/${yy}`,
          chq: "-",
          kind: "withdrawal",
          category: "clg_bach_charge",
          amountCents: 1000,
          adjustableRound: false,
          allowsFractionalPaisa: false,
          minCents: 1000,
          groupId: gid,
          isDependencyChild: true,
        },
      ]);
      currentCount += 2;
      dependencyCount += 1;
      continue;
    }

    // 8. Outward CITYTOUCH/NPSB + Separate 10.00 NPSB-CHARGE Row Pair
    if (
      includeDeps &&
      (profile === "remittance_eftn" || profile === "retail_business") &&
      remaining >= 3 &&
      !recentCategories.includes("npsb_paired") &&
      Math.random() < 0.16
    ) {
      const npsbRef = pick(counterparties);
      const wdlBdt = pickUniqueHumanAmountBdt(
        Math.round(6000 * scaleFactor),
        Math.round(85000 * scaleFactor),
        500,
        recentAmountsBdt
      );
      rememberTx(wdlBdt, "npsb_paired", npsbRef);
      clusters.push([
        {
          dateObj: clusterDate,
          description: `CITYTOUCH/NPSB-${npsbRef}`,
          chq: "-",
          kind: "withdrawal",
          category: "npsb_paired",
          amountCents: wdlBdt * 100,
          adjustableRound: true,
          allowsFractionalPaisa: false,
          minCents: 200000,
          groupId: gid,
        },
        {
          dateObj: clusterDate,
          description: `CITYTOUCH/NPSB-CHARGE-${npsbRef}`,
          chq: "-",
          kind: "withdrawal",
          category: "npsb_charge",
          amountCents: 1000,
          adjustableRound: false,
          allowsFractionalPaisa: false,
          minCents: 1000,
          groupId: gid,
          isDependencyChild: true,
        },
      ]);
      currentCount += 2;
      dependencyCount += 1;
      continue;
    }

    // 9. Diverse Single Human Transactions (anti-repetition on category & amount!)
    const isDeposit = Math.random() < 0.45;
    const hr = randInt(8, 22);
    const mi = randInt(0, 59);
    const sc = randInt(0, 59);
    const isoTs = formatIsoTimestamp(clusterDate, hr, mi, sc);
    const compactTs = formatCompactTimestamp(clusterDate, hr, mi, sc, randomDigits(6));
    seqCtId += randInt(1350, 58000);

    if (isDeposit) {
      const depCategories =
        profile === "islamic_modern"
          ? ["dep_ft", "dep_npsb", "dep_ratm", "dep_cash", "dep_eft", "dep_profit"]
          : profile === "remittance_eftn"
          ? ["dep_npsb", "dep_remit", "dep_ft", "dep_eft", "dep_atm_dep", "dep_cash"]
          : ["dep_cash", "dep_receive", "dep_npsb", "dep_ft", "dep_person_tr", "dep_ratm"];

      // Filter out the last 2 categories to avoid consecutive identical types
      const availableCats = depCategories.filter((c) => !recentCategories.slice(-2).includes(c));
      const chosenCat = pick(availableCats.length > 0 ? availableCats : depCategories);

      let desc = "";
      let depBdt = pickUniqueHumanAmountBdt(
        Math.round(5500 * scaleFactor),
        Math.round(165000 * scaleFactor),
        500,
        recentAmountsBdt
      );
      let depCents = depBdt * 100;
      let allowsPaisa = false;

      if (chosenCat === "dep_ft") {
        const senderAcct = pick(counterparties);
        desc = isModernPeriod
          ? `CT-FT-FIN TO ABA-${seqCtId}-${accountNo}-|${senderAcct}-${isoTs}`
          : `CITYTOUCH/FUND TRANSFER-FINACLE TO ABABIL CBLTA-${senderAcct}-${doyCode}${randomDigits(7)}`;
      } else if (chosenCat === "dep_npsb") {
        const bank = pick(NPSB_BANKS);
        const senderRef = pick(counterparties);
        const trace12 = `${doyCode.slice(-3)}${randomDigits(9)}`;
        if (profile === "retail_business") {
          const dd = String(clusterDate.getDate()).padStart(2, "0");
          const mm = String(clusterDate.getMonth() + 1).padStart(2, "0");
          desc = `NPSB IN/000000${randomDigits(6)}/${dd}-${mm}-${clusterDate.getFullYear()}`;
        } else if (isModernPeriod && Math.random() < 0.45) {
          desc = `NPSB IN/${bank.short}|${senderRef}|${trace12}/${trace12}¿P2=${senderRef}`;
        } else {
          desc = `NPSB IN//${bank.short}|${senderRef}|${trace12}`;
        }
      } else if (chosenCat === "dep_ratm") {
        seqRatmTrace += randInt(11000, 75000);
        const t1 = String(seqRatmTrace).padStart(12, "0");
        const s1 = String(randInt(150000, 950000)).padStart(12, "0");
        const ratmBranch = pick(persona.ratmBranches);
        depBdt = pickUniqueHumanAmountBdt(
          Math.round(4500 * scaleFactor),
          Math.round(145000 * scaleFactor),
          500,
          recentAmountsBdt
        );
        depCents = depBdt * 100;
        desc = `RATM DEP- ${ratmBranch}-${t1}-${s1}-`;
      } else if (chosenCat === "dep_cash") {
        const area = pick(persona.cashAreas);
        desc = pick([
          `CASH DEPOSIT ${seqDepositNo++}`,
          `CASH DEPOSIT: ${area} BR`,
          `CASH DEPOSIT BR-${randInt(105, 420)}`,
          `cash deposit ${randInt(108, 490)}`,
        ]);
      } else if (chosenCat === "dep_receive") {
        const area = pick(persona.cashAreas);
        desc = `CASH RECEIVE ${area} (${seqDepositNo++})`;
      } else if (chosenCat === "dep_eft") {
        depBdt = pickUniqueHumanAmountBdt(
          Math.round(18000 * scaleFactor),
          Math.round(125000 * scaleFactor),
          100,
          recentAmountsBdt
        );
        depCents = depBdt * 100 + pick([0, 0, 25, 50, 75, 30]);
        allowsPaisa = true;
        desc = `EFT TranceNumber : 0000000${randomDigits(8)}`;
      } else if (chosenCat === "dep_remit") {
        const bank = pick(["TRBL", "MTBL", "BRBL", "DBBL"]);
        depBdt = pickUniqueHumanAmountBdt(
          Math.round(16000 * scaleFactor),
          Math.round(98000 * scaleFactor),
          100,
          recentAmountsBdt
        );
        depCents = depBdt * 100 + randInt(10, 95);
        allowsPaisa = true;
        desc = `NPSB IN REMIT/${bank}/000${randomDigits(10)}`;
      } else if (chosenCat === "dep_person_tr") {
        const senderName = pick(regularBeneficiaryNames);
        desc = `TR FROM ${senderName}`;
      } else if (chosenCat === "dep_atm_dep") {
        desc = `ATM DEP ${pick(persona.atms)}`;
      } else {
        // dep_profit
        depBdt = pickUniqueHumanAmountBdt(3200, 24500, 100, recentAmountsBdt);
        depCents = depBdt * 100 + randInt(12, 94);
        allowsPaisa = true;
        desc = `PROFIT TRANSFER OF A/C : ${accountNo.slice(0, 5)}100${randomDigits(5)}`;
      }

      rememberTx(depBdt, chosenCat, desc);
      clusters.push([
        {
          dateObj: clusterDate,
          description: desc,
          chq: "-",
          kind: "deposit",
          category: chosenCat,
          amountCents: depCents,
          adjustableRound: true,
          allowsFractionalPaisa: allowsPaisa,
          minCents: 100000,
          groupId: gid,
        },
      ]);
      currentCount += 1;
    } else {
      // Withdrawal row — wide pool of realistic Bangladeshi categories
      const wdlCategories =
        profile === "islamic_modern"
          ? ["wdl_npsb", "wdl_atm", "wdl_ft", "wdl_card_pmt", "wdl_mfs", "wdl_pos", "wdl_utility", "wdl_eftn", "wdl_auto_dr"]
          : profile === "remittance_eftn"
          ? ["wdl_eftn", "wdl_atm", "wdl_ft", "wdl_mfs", "wdl_pos", "wdl_utility", "wdl_npsb", "wdl_loan"]
          : ["wdl_chq", "wdl_atm", "wdl_mfs", "wdl_pos", "wdl_card_pmt", "wdl_ft", "wdl_utility", "wdl_insurance"];

      const availableCats = wdlCategories.filter((c) => !recentCategories.slice(-2).includes(c));
      const chosenCat = pick(availableCats.length > 0 ? availableCats : wdlCategories);

      let desc = "";
      let chq = "-";
      let wdlBdt = pickUniqueHumanAmountBdt(
        Math.round(3000 * scaleFactor),
        Math.round(68000 * scaleFactor),
        500,
        recentAmountsBdt
      );
      let wdlCents = wdlBdt * 100;
      let keepPlusTenFee = false;
      let keepAtmStep = false;
      let allowsPaisa = false;

      if (chosenCat === "wdl_npsb") {
        const destAcct = pick(counterparties);
        const bank = pick(NPSB_BANKS);
        wdlBdt = pickUniqueHumanAmountBdt(
          Math.round(4000 * scaleFactor),
          Math.round(95000 * scaleFactor),
          500,
          recentAmountsBdt
        );
        wdlCents = (wdlBdt + 10) * 100; // +10 BDT NPSB charge embedded
        keepPlusTenFee = true;
        dependencyCount += 1;
        desc = isModernPeriod
          ? `CT-NPSB-${bank.name}-${destAcct}|${accountNo}-${seqCtId}-${isoTs}`
          : `CITYTOUCH-NPSB-${accountNo}-${destAcct} - ${compactTs} -${isoTs}`;
      } else if (chosenCat === "wdl_atm") {
        seqRatmTrace += randInt(10000, 75000);
        const t1 = String(seqRatmTrace).padStart(12, "0");
        const s1 = String(randInt(12000, 980000)).padStart(12, "0");
        const suffix = isModernPeriod ? "-5" : "";
        const loc = pick(persona.atms);
        wdlBdt = pickUniqueHumanAmountBdt(2000, 55000, 500, recentAmountsBdt);
        wdlCents = wdlBdt * 100;
        keepAtmStep = true;
        desc =
          profile === "retail_business"
            ? `ATM WDL/${loc}`
            : `ATM WDL-${loc}-${t1}-${s1}${suffix}`;
      } else if (chosenCat === "wdl_ft") {
        const destAcct = pick(counterparties);
        wdlBdt = pickUniqueHumanAmountBdt(
          Math.round(4500 * scaleFactor),
          Math.round(82000 * scaleFactor),
          500,
          recentAmountsBdt
        );
        wdlCents = wdlBdt * 100;
        desc = isModernPeriod
          ? `CT-FT-${seqCtId}-${destAcct}-${accountNo}|-${isoTs}`
          : `CITYTOUCH/FUND TRANSFER-FRM-${accountNo}-TO-${destAcct}-${doyCode}${randomDigits(7)}`;
      } else if (chosenCat === "wdl_card_pmt") {
        const cardSuffix = pick([cardSuffix1, cardSuffix2]);
        wdlBdt = pickUniqueHumanAmountBdt(
          Math.round(2800 * scaleFactor),
          Math.round(48000 * scaleFactor),
          100,
          recentAmountsBdt
        );
        wdlCents = wdlBdt * 100 + randInt(12, 96);
        allowsPaisa = true;
        desc = isModernPeriod
          ? `CT-CARD PMT-${seqCtId}-${cardMid}-${cardSuffix}|ABABIL-${accountNo}-${isoTs}`
          : `CITYTOUCH-${randomDigits(8)}-${cardMid}-${cardSuffix}`;
      } else if (chosenCat === "wdl_mfs") {
        const mfsBrand = pick(["bKash", "NAGAD", "BKASH"]);
        const mobile = pick(mfsNumbers);
        wdlBdt = pickUniqueHumanAmountBdt(1000, 24500, 100, recentAmountsBdt);
        wdlCents = wdlBdt * 100;
        if (mfsBrand === "bKash" && isModernPeriod) {
          desc = `CT-bKash-${seqCtId}|${mobile}-${accountNo}-${isoTs}`;
        } else {
          desc = `CITYTOUCH-${mfsBrand.toUpperCase()}-${doyCode}${randomDigits(7)}`;
        }
      } else if (chosenCat === "wdl_pos") {
        const merchant = pick(persona.merchants.filter((m) => !recentDescriptions.includes(m)).length > 0
          ? persona.merchants.filter((m) => !recentDescriptions.includes(m))
          : persona.merchants);
        wdlBdt = pickUniqueHumanAmountBdt(650, 14800, 100, recentAmountsBdt);
        wdlCents = wdlBdt * 100 + pick([0, 0, 25, 50, 75, randInt(11, 94)]);
        allowsPaisa = true;
        desc = merchant;
      } else if (chosenCat === "wdl_utility") {
        const provider = pick(persona.utilityProviders);
        wdlBdt = pickUniqueHumanAmountBdt(500, 6800, 100, recentAmountsBdt);
        wdlCents = wdlBdt * 100;
        desc = `CITYTOUCH/${provider}/${doyCode}${randomDigits(7)}`;
      } else if (chosenCat === "wdl_eftn") {
        const bank = pick(NPSB_BANKS);
        const destAcct = pick(counterparties);
        wdlBdt = pickUniqueHumanAmountBdt(
          Math.round(12000 * scaleFactor),
          Math.round(88000 * scaleFactor),
          500,
          recentAmountsBdt
        );
        wdlCents = wdlBdt * 100;
        desc = isModernPeriod
          ? `CT-EFTN-${bank.name}-${destAcct}|${accountNo}-${seqCtId}-${isoTs}`
          : "CITY TOUCH/EFTN";
      } else if (chosenCat === "wdl_auto_dr") {
        wdlBdt = pickUniqueHumanAmountBdt(180, 4200, 100, recentAmountsBdt);
        wdlCents = wdlBdt * 100 + randInt(8, 95);
        allowsPaisa = true;
        desc = `AUTO DR-${randomDigits(7)}-${cardBin}**${cardSuffix1}`;
      } else if (chosenCat === "wdl_chq") {
        chq = String(seqChqNo++);
        wdlBdt = pickUniqueHumanAmountBdt(
          Math.round(8000 * scaleFactor),
          Math.round(78000 * scaleFactor),
          500,
          recentAmountsBdt
        );
        wdlCents = wdlBdt * 100;
        desc = pick(["CASH WITHDRAWAL", "CASH WITHDRAWAL BY SELF", `TRF TO ${pick(regularBeneficiaryNames)}`]);
      } else if (chosenCat === "wdl_loan") {
        wdlBdt = pickUniqueHumanAmountBdt(12000, 32000, 100, recentAmountsBdt);
        wdlCents = wdlBdt * 100 + pick([30, 48, 75, 0]);
        allowsPaisa = true;
        desc = `Loan Recovery For769${accountNo.slice(3)}`;
      } else {
        // wdl_insurance
        wdlBdt = pickUniqueHumanAmountBdt(4500, 18500, 500, recentAmountsBdt);
        wdlCents = wdlBdt * 100;
        desc = pick(["INSURANCE SUNLIFE REGULAR", "INSURANCE METLIFE ALICO", "DPS MONTHLY INSTALLMENT"]);
      }

      rememberTx(wdlBdt, chosenCat, desc);
      clusters.push([
        {
          dateObj: clusterDate,
          description: desc,
          chq,
          kind: "withdrawal",
          category: chosenCat,
          amountCents: wdlCents,
          adjustableRound: true,
          keepPlusTenFee,
          keepAtmStep,
          allowsFractionalPaisa: allowsPaisa,
          minCents: 100000,
          groupId: gid,
        },
      ]);
      currentCount += 1;
    }
  }

  // Sort clusters chronologically by their first row's date
  clusters.sort((a, b) => a[0].dateObj.getTime() - b[0].dateObj.getTime());

  // Flatten rows to exact targetRows
  const rows: DraftRow[] = [];
  for (const cl of clusters) {
    if (rows.length + cl.length <= targetRows) {
      rows.push(...cl);
    } else if (rows.length < targetRows) {
      rows.push(cl[0]);
    }
  }

  // Ensure at least one adjustable deposit and one adjustable withdrawal
  if (!rows.some((r) => r.kind === "deposit" && r.adjustableRound)) {
    rows[0].kind = "deposit";
    rows[0].adjustableRound = true;
  }
  if (!rows.some((r) => r.kind === "withdrawal" && r.adjustableRound)) {
    const lastIdx = rows.length - 1;
    rows[lastIdx].kind = "withdrawal";
    rows[lastIdx].adjustableRound = true;
  }

  // Exact balance reconciliation using UNEQUAL randomized chunks so amounts stay diverse & non-repetitive!
  const computeNetCents = () =>
    rows.reduce((acc, r) => acc + (r.kind === "deposit" ? r.amountCents : -r.amountCents), 0);

  const targetNetCents = closingCents - openingCents;
  const adjDeposits = rows.filter((r) => r.kind === "deposit" && r.adjustableRound);
  const adjWithdrawals = rows.filter((r) => r.kind === "withdrawal" && r.adjustableRound);

  // Step 1: Distribute coarse difference in randomized unequal 500 BDT chunks across adjustable rows
  let diffCents = targetNetCents - computeNetCents();
  let safety = 0;
  while (Math.abs(diffCents) >= 50000 && safety < 4000) {
    safety++;
    const stepMult = Math.abs(diffCents) >= 5000000 ? pick([5, 10, 15, 20]) : Math.abs(diffCents) >= 500000 ? pick([1, 2, 3, 5]) : 1;
    const chunk = stepMult * 50000;
    if (diffCents > 0 && adjDeposits.length > 0) {
      const dep = pick(adjDeposits);
      dep.amountCents += chunk;
      diffCents -= chunk;
    } else if (diffCents < 0 && adjWithdrawals.length > 0) {
      const wdl = pick(adjWithdrawals);
      wdl.amountCents += chunk;
      diffCents += chunk;
    } else {
      break;
    }
  }

  // Step 2: Prevent any intermediate running balance from dipping below a safe floor
  const minFloorCents = Math.min(openingCents, closingCents, 250000);
  for (let pass = 0; pass < 35; pass++) {
    let running = openingCents;
    let dipIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      running += rows[i].kind === "deposit" ? rows[i].amountCents : -rows[i].amountCents;
      if (running < minFloorCents) {
        dipIdx = i;
        break;
      }
    }
    if (dipIdx === -1) break;

    const earlierDep = rows.slice(0, dipIdx + 1).find((r) => r.kind === "deposit" && r.adjustableRound);
    const laterDep = rows
      .slice(dipIdx + 1)
      .find((r) => r.kind === "deposit" && r.adjustableRound && r.amountCents > 1500000);
    if (earlierDep && laterDep) {
      const shift = Math.min(laterDep.amountCents - 500000, randInt(15, 55) * 100000);
      if (shift > 0) {
        earlierDep.amountCents += shift;
        laterDep.amountCents -= shift;
        continue;
      }
    }
    const earlyWdl = rows
      .slice(0, dipIdx + 1)
      .find((r) => r.kind === "withdrawal" && r.adjustableRound && r.amountCents > 1500000);
    const lateWdl = rows.slice(dipIdx + 1).find((r) => r.kind === "withdrawal" && r.adjustableRound);
    if (earlyWdl && lateWdl) {
      const shift = Math.min(earlyWdl.amountCents - 500000, randInt(10, 45) * 100000);
      if (shift > 0) {
        earlyWdl.amountCents -= shift;
        lateWdl.amountCents += shift;
      }
    }
  }

  // Step 3: Exact final paisa reconciliation on a natural non-round row (card payment / POS / profit / remit)
  diffCents = targetNetCents - computeNetCents();
  if (diffCents !== 0) {
    let paisaTarget = rows.find(
      (r) =>
        r.allowsFractionalPaisa &&
        ((diffCents > 0 && r.kind === "deposit") ||
          (diffCents < 0 && r.kind === "withdrawal") ||
          (diffCents > 0 && r.kind === "withdrawal" && r.amountCents - diffCents >= r.minCents) ||
          (diffCents < 0 && r.kind === "deposit" && r.amountCents + diffCents >= r.minCents))
    );

    if (!paisaTarget) {
      paisaTarget = rows.find(
        (r) =>
          r.adjustableRound &&
          !r.keepAtmStep &&
          !r.keepPlusTenFee &&
          !r.description.startsWith("ATM ") &&
          !r.description.startsWith("RATM ") &&
          !r.description.toUpperCase().startsWith("CASH ") &&
          ((diffCents > 0 && r.kind === "deposit") ||
            (diffCents < 0 && r.kind === "withdrawal") ||
            (diffCents > 0 && r.kind === "withdrawal" && r.amountCents - diffCents >= 100000) ||
            (diffCents < 0 && r.kind === "deposit" && r.amountCents + diffCents >= 100000))
      );
    }

    if (!paisaTarget) {
      paisaTarget = diffCents > 0 ? adjDeposits[0] : adjWithdrawals[0];
    }

    if (paisaTarget) {
      if (paisaTarget.kind === "deposit") {
        paisaTarget.amountCents += diffCents;
      } else {
        paisaTarget.amountCents -= diffCents;
      }
    }
  }

  // Ensure monotonic dates
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].dateObj.getTime() < rows[i - 1].dateObj.getTime()) {
      rows[i].dateObj = new Date(rows[i - 1].dateObj.getTime());
    }
  }

  const rawTxRows = [
    {
      date: "",
      description: "Opening Balance",
      chq: "-",
      withdrawal: "",
      deposit: "",
      balance: formatCurrency(openingCents / 100),
    },
    ...rows.map((r) => ({
      date: formatStatementDate(r.dateObj, useSlashDates),
      description: r.description,
      chq: r.chq || "-",
      withdrawal: r.kind === "withdrawal" ? formatCurrency(r.amountCents / 100) : "0.00",
      deposit: r.kind === "deposit" ? formatCurrency(r.amountCents / 100) : "0.00",
      balance: "0.00",
    })),
  ];

  const calc = recalculateStatementBalances(openingCents / 100, rawTxRows, true);
  const genDateObj = new Date(endD.getTime() + 24 * 60 * 60 * 1000);

  return {
    openingDate: formatStatementDate(startD, useSlashDates),
    statementEndDate: formatStatementDate(endD, useSlashDates),
    generationDate: formatStatementDate(genDateObj, useSlashDates),
    openingBalance: formatCurrency(openingCents / 100),
    totalDeposits: calc.totalDeposits,
    totalWithdrawals: calc.totalWithdrawals,
    availableBalance: calc.availableBalance,
    transactions: calc.updatedTransactions,
    dependencyCount,
  };
}
