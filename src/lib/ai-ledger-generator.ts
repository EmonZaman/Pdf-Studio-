import { formatCurrency, parseAmount, recalculateStatementBalances } from "./balance-calculator";

export type BangladeshiLedgerProfile =
  | "auto"
  | "salaried_executive" // Monthly salary, rent, utility cycle, credit card bill, weekend POS & ATM
  | "sme_business" // Commercial customer deposits, supplier EFTN/NPSB, clearing cheques + BACH fee, cheque withdrawals
  | "remittance_eftn" // Foreign TT-R + 2.5% -INC pairs, post-remittance EFTN/NPSB bursts, Loan Recovery EMI
  | "islamic_modern" // Finacle-to-Ababil, CITYTOUCH-NPSB with timestamps, RATM DEP, ATM WDL, CT-CARD PMT
  | "retail_business"; // Alias/classic retail mix with sequential cash deposits & cheque withdrawals

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
  personaSummary: string;
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

/**
 * Ensures a date falls on a Bangladesh bank working day (Sunday=0 .. Thursday=4; avoids Fri=5, Sat=6)
 */
function snapToBangladeshWorkingDay(d: Date, minD: Date, maxD: Date): Date {
  const copy = new Date(d.getTime());
  const dow = copy.getDay();
  if (dow === 5) {
    // Friday -> Thursday or Sunday
    copy.setDate(copy.getDate() + (copy.getTime() + 2 * 86400000 <= maxD.getTime() ? 2 : -1));
  } else if (dow === 6) {
    // Saturday -> Sunday or Thursday
    copy.setDate(copy.getDate() + (copy.getTime() + 86400000 <= maxD.getTime() ? 1 : -2));
  }
  if (copy.getTime() < minD.getTime()) return new Date(minD.getTime());
  if (copy.getTime() > maxD.getTime()) return new Date(maxD.getTime());
  return copy;
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

/**
 * Box-Muller standard normal sample for realistic log-normal financial distributions
 */
function randNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Samples a realistic log-normal BDT amount within [minBdt, maxBdt] rounded to `step`,
 * avoiding recently used amounts so no repetitive patterns appear.
 */
function sampleLogNormalAmountBdt(
  minBdt: number,
  maxBdt: number,
  step: number,
  recentAmounts: number[],
  medianFraction = 0.28
): number {
  const safeMin = Math.max(step, Math.round(minBdt / step) * step);
  const safeMax = Math.max(safeMin + step, Math.round(maxBdt / step) * step);
  const median = safeMin + (safeMax - safeMin) * medianFraction;
  const mu = Math.log(Math.max(step, median));
  const sigma = 0.58;

  for (let attempt = 0; attempt < 28; attempt++) {
    const raw = Math.exp(mu + sigma * randNormal());
    const clamped = Math.max(safeMin, Math.min(safeMax, raw));
    let rounded = Math.round(clamped / step) * step;
    if (step === 100 && Math.random() < 0.35) {
      rounded += pick([50, 100, 150, 200, 250, 350, 400, 600, 750, 850]);
    }
    if (!recentAmounts.includes(rounded)) {
      return rounded;
    }
  }
  const stepsCount = Math.max(1, Math.floor((safeMax - safeMin) / step));
  return safeMin + randInt(0, stepsCount) * step;
}

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
    city: "Dhaka Central (Dhanmondi / Green Rd)",
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

type ResolvedArchetype = "salaried_executive" | "sme_business" | "remittance_eftn" | "islamic_modern";

const ARCHETYPE_LABELS: Record<ResolvedArchetype, string> = {
  salaried_executive: "Salaried Corporate / Executive",
  sme_business: "SME Business / Trader",
  remittance_eftn: "Freelancer / Remittance Earner",
  islamic_modern: "Modern Islamic / Personal Savings",
};

interface DraftRow {
  dateObj: Date;
  sortTimeSec: number; // Ensures intra-day timestamps are strictly ascending
  description: string;
  chq: string;
  kind: "withdrawal" | "deposit";
  category: string;
  amountCents: number;
  adjustableRound: boolean;
  keepPlusTenFee?: boolean;
  keepAtmStep?: boolean;
  allowsFractionalPaisa: boolean;
  minCents: number;
  groupId: string;
  isDependencyChild?: boolean;
}

function resolveArchetype(options: AiLedgerGeneratorOptions): ResolvedArchetype {
  if (options.profile && options.profile !== "auto") {
    if (options.profile === "retail_business") return "sme_business";
    return options.profile;
  }
  // Smart variation: randomly vary archetypes across generations while respecting strong account-type hints
  const acctType = (options.accountType || "").toUpperCase();
  if (acctType.includes("CURRENT")) {
    return Math.random() < 0.75 ? "sme_business" : "salaried_executive";
  }
  const pool: ResolvedArchetype[] = ["salaried_executive", "sme_business", "remittance_eftn", "islamic_modern"];
  return pick(pool);
}

function buildFreshCounterpartyAccounts(count: number): string[] {
  const prefixes = ["105", "106", "107", "120", "126", "201", "205", "210", "218", "220", "230", "261", "270", "311", "344"];
  const set = new Set<string>();
  while (set.size < count) {
    set.add(`${pick(prefixes)}${randomDigits(10)}`);
  }
  return Array.from(set);
}

function buildFreshMfsNumbers(count: number): string[] {
  const prefixes = ["017", "018", "019", "016", "015", "013"];
  const set = new Set<string>();
  while (set.size < count) {
    set.add(`${pick(prefixes)}${randomDigits(8)}`);
  }
  return Array.from(set);
}

function selectRegionalPersona(branch?: string): RegionalPersona {
  const b = (branch || "").toUpperCase();
  // 55% match branch region, 45% vary across other personas so consecutive statements differ naturally
  if (Math.random() < 0.55) {
    if (b.includes("MIRPUR") || b.includes("PALLABI") || b.includes("UTTARA")) return REGIONAL_PERSONAS[1];
    if (b.includes("GULSHAN") || b.includes("BANANI") || b.includes("BADDA")) return REGIONAL_PERSONAS[2];
    if (b.includes("MOTIJHEEL") || b.includes("NARAYANGANJ") || b.includes("POSTA") || b.includes("LALBAG")) return REGIONAL_PERSONAS[3];
    if (b.includes("SYLHET") || b.includes("AMBARKHANA") || b.includes("CHITTAGONG") || b.includes("AGRABAD")) return REGIONAL_PERSONAS[4];
    if (b.includes("DHANMONDI") || b.includes("KARWAN") || b.includes("GREEN ROAD")) return REGIONAL_PERSONAS[0];
  }
  return pick(REGIONAL_PERSONAS);
}

/**
 * Generates an autonomous, behaviorally simulated Bangladeshi bank statement ledger.
 * Every statement builds a unique financial archetype, regional persona, recurring
 * monthly schedule (salary/rent/EMI/utilities/closing entries), counterparty graph,
 * Bangladesh working-day rules (Sun-Thu for branch/clearing), log-normal human amounts,
 * and exact opening -> closing balance reconciliation.
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

  const avgBalanceBdt = Math.max(25000, (openingCents + closingCents) / 200);
  const scaleFactor = Math.max(0.35, Math.min(4.5, avgBalanceBdt / 320000));

  const accountNo = (options.accountNo || "1781920006484").trim();
  const isIslamicAcct = (options.accountType || "").toUpperCase().includes("ISLAMIC");
  const cardSuffix1 = accountNo.slice(-3) || randomDigits(3);
  const cardSuffix2 = randomDigits(3);
  const cardBin = pick(["474867", "376948", "410520", "528412", "453291"]);
  const cardMid = `${randInt(19, 28)}${randomDigits(5)}`;

  const archetype = resolveArchetype(options);
  const persona = selectRegionalPersona(options.branch);
  const includeDeps = options.includeDependencies !== false;

  // Fresh unique counterparty graph per statement:
  // 4 recurring contacts (landlord, family, regular supplier/client, own secondary bank) + 12 occasional contacts
  const allCounterparties = buildFreshCounterpartyAccounts(16);
  const landlordAcct = allCounterparties[0];
  const familyAcct = allCounterparties[1];
  const primaryClientAcct = allCounterparties[2];
  const secondaryOwnAcct = allCounterparties[3];
  const occasionalAccts = allCounterparties.slice(4);
  const mfsNumbers = buildFreshMfsNumbers(6);
  const contactNames = [pick(BD_PERSON_NAMES), pick(BD_PERSON_NAMES), pick(BD_PERSON_NAMES), pick(BD_PERSON_NAMES)];

  const spanMs = Math.max(24 * 3600 * 1000, endD.getTime() - startD.getTime());
  const clusters: DraftRow[][] = [];
  let currentCount = 0;
  let seqDepositNo = randInt(108, 620);
  let seqChqNo = randInt(618500, 989400);
  let seqCtId = randInt(100000350000, 100029500000);
  let seqRatmTrace = randInt(1011200000, 1298500000);
  let groupIdCounter = 1;
  let dependencyCount = 0;

  const recentAmountsBdt: number[] = [];
  const recentCategories: string[] = [];
  const recentDescriptions: string[] = [];

  const rememberTx = (amountBdt: number, category: string, desc: string) => {
    recentAmountsBdt.push(amountBdt);
    if (recentAmountsBdt.length > 14) recentAmountsBdt.shift();
    recentCategories.push(category);
    if (recentCategories.length > 3) recentCategories.shift();
    recentDescriptions.push(desc);
    if (recentDescriptions.length > 8) recentDescriptions.shift();
  };

  // Helper to iterate months within [startD, endD]
  const monthsInSpan: { year: number; month: number }[] = [];
  {
    const cur = new Date(startD.getFullYear(), startD.getMonth(), 1, 12, 0, 0);
    while (cur.getTime() <= endD.getTime()) {
      monthsInSpan.push({ year: cur.getFullYear(), month: cur.getMonth() });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  // =========================================================================
  // PHASE 1: Realistic Recurring Monthly Anchors (Salary, Rent, EMI, Closing)
  // =========================================================================
  const anchorBudget = Math.min(Math.floor(targetRows * 0.28), Math.max(2, monthsInSpan.length * 2));
  const salaryDay = randInt(1, 4);
  const salaryBaseBdt = sampleLogNormalAmountBdt(
    Math.round(55000 * scaleFactor),
    Math.round(185000 * scaleFactor),
    500,
    [],
    0.45
  );
  const rentDay = randInt(3, 8);
  const rentBdt = sampleLogNormalAmountBdt(
    Math.round(18000 * scaleFactor),
    Math.round(52000 * scaleFactor),
    1000,
    [salaryBaseBdt],
    0.4
  );
  const emiBdt = sampleLogNormalAmountBdt(12000, 28500, 100, [], 0.45);
  const emiPaisa = pick([30, 48, 75, 20]);

  for (const { year, month } of monthsInSpan) {
    if (currentCount >= anchorBudget) break;

    // Half-yearly bank closing (30 Jun / 30 Dec)
    if (includeDeps && (month === 5 || month === 11)) {
      const cDate = new Date(year, month, 30, 12, 0, 0);
      if (cDate.getTime() >= startD.getTime() && cDate.getTime() <= endD.getTime() && targetRows - currentCount >= 5) {
        const gid = `g-${groupIdCounter++}`;
        if (isIslamicAcct || archetype === "islamic_modern") {
          const profitCents = randInt(48000, 225000) + randInt(1, 95);
          const taxCents = Math.round(profitCents * 0.15);
          clusters.push([
            {
              dateObj: cDate,
              sortTimeSec: 64800,
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
              sortTimeSec: 64805,
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
              sortTimeSec: 64810,
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
              sortTimeSec: 64815,
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
        } else {
          const monLabel = `${MONTHS_UPPER[month]}-${year}`;
          const maintFee = pick([11500, 23000, 34500]);
          const exciseDuty = avgBalanceBdt > 1000000 ? 300000 : 50000;
          clusters.push([
            {
              dateObj: cDate,
              sortTimeSec: 64800,
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
              sortTimeSec: 64810,
              description: `EXCISE DUTY-${year}`,
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
        }
      }
    }

    // Monthly Salaried Executive anchors: Salary Credit + Apartment Rent
    if (archetype === "salaried_executive" && currentCount + 2 <= anchorBudget) {
      const sDate = snapToBangladeshWorkingDay(new Date(year, month, salaryDay, 12, 0, 0), startD, endD);
      if (sDate.getTime() >= startD.getTime() && sDate.getTime() <= endD.getTime()) {
        const salJitter = pick([0, 0, 0, 500, 1200, -300, 2500]);
        const salAmount = Math.max(25000, salaryBaseBdt + salJitter);
        clusters.push([
          {
            dateObj: sDate,
            sortTimeSec: randInt(39600, 50400),
            description: `EFT TranceNumber : 0000000${randomDigits(8)}`,
            chq: "-",
            kind: "deposit",
            category: "monthly_salary",
            amountCents: salAmount * 100,
            adjustableRound: true,
            allowsFractionalPaisa: false,
            minCents: 2000000,
            groupId: `g-${groupIdCounter++}`,
          },
        ]);
        currentCount += 1;
      }

      const rDate = new Date(year, month, rentDay, 12, 0, 0);
      if (rDate.getTime() >= startD.getTime() && rDate.getTime() <= endD.getTime() && currentCount < anchorBudget) {
        seqCtId += randInt(1500, 18000);
        const hr = randInt(10, 19);
        const mi = randInt(5, 55);
        const sc = randInt(5, 55);
        const isoTs = formatIsoTimestamp(rDate, hr, mi, sc);
        clusters.push([
          {
            dateObj: rDate,
            sortTimeSec: hr * 3600 + mi * 60 + sc,
            description: `CT-FT-${seqCtId}-${landlordAcct}-${accountNo}|-${isoTs}`,
            chq: "-",
            kind: "withdrawal",
            category: "monthly_rent",
            amountCents: rentBdt * 100,
            adjustableRound: true,
            allowsFractionalPaisa: false,
            minCents: 1000000,
            groupId: `g-${groupIdCounter++}`,
          },
        ]);
        currentCount += 1;
      }
    }

    // Monthly Remittance Earner anchor: Foreign Remittance TT-R + 2.5% -INC pair + Monthly Loan EMI
    if (archetype === "remittance_eftn" && includeDeps && currentCount + 3 <= anchorBudget) {
      const ttDay = randInt(8, 16);
      const ttDate = snapToBangladeshWorkingDay(new Date(year, month, ttDay, 12, 0, 0), startD, endD);
      if (ttDate.getTime() >= startD.getTime() && ttDate.getTime() <= endD.getTime()) {
        const ttRef = `TT-R${randomDigits(11)}`;
        const baseBdt = sampleLogNormalAmountBdt(
          Math.round(95000 * scaleFactor),
          Math.round(420000 * scaleFactor),
          500,
          recentAmountsBdt,
          0.45
        );
        const baseCents = baseBdt * 100 + pick([0, 0, 50, 80, 20]);
        const incCents = Math.round(baseCents * 0.025);
        rememberTx(baseBdt, "tt_remit", ttRef);
        const gid = `g-${groupIdCounter++}`;
        clusters.push([
          {
            dateObj: ttDate,
            sortTimeSec: 41400,
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
            dateObj: ttDate,
            sortTimeSec: 41460,
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
      }

      const emiDate = new Date(year, month, 1, 12, 0, 0);
      if (emiDate.getTime() >= startD.getTime() && emiDate.getTime() <= endD.getTime() && currentCount < anchorBudget) {
        clusters.push([
          {
            dateObj: emiDate,
            sortTimeSec: 36900,
            description: `Loan Recovery For769${accountNo.slice(3)}`,
            chq: "-",
            kind: "withdrawal",
            category: "monthly_emi",
            amountCents: emiBdt * 100 + emiPaisa,
            adjustableRound: false,
            allowsFractionalPaisa: true,
            minCents: 500000,
            groupId: `g-${groupIdCounter++}`,
          },
        ]);
        currentCount += 1;
      }
    }
  }

  // Annual SMS Renewal & Debit Card Fee (1 each if span >= 90 days)
  const spanDays = spanMs / 86400000;
  if (includeDeps && spanDays >= 75 && targetRows - currentCount >= 4) {
    const smsDate = new Date(startD.getTime() + Math.floor(spanMs * (0.25 + Math.random() * 0.25)));
    smsDate.setHours(12, 0, 0, 0);
    const yr = smsDate.getFullYear();
    const doy = formatDayOfYearCode(smsDate);
    clusters.push([
      {
        dateObj: smsDate,
        sortTimeSec: 43200,
        description:
          isIslamicAcct || archetype === "islamic_modern"
            ? `${doy}000${randomDigits(6)}-SMS*RENEW*${yr}*BDT*${accountNo}`
            : `SMS*RENEW*${yr}*BDT*${accountNo}`,
        chq: "-",
        kind: "withdrawal",
        category: "sms_fee",
        amountCents: 34500,
        adjustableRound: false,
        allowsFractionalPaisa: false,
        minCents: 34500,
        groupId: `g-${groupIdCounter++}`,
      },
    ]);
    currentCount += 1;

    const cardDate = new Date(startD.getTime() + Math.floor(spanMs * (0.62 + Math.random() * 0.25)));
    cardDate.setHours(12, 0, 0, 0);
    const feeCents = pick([57500, 69000]);
    clusters.push([
      {
        dateObj: cardDate,
        sortTimeSec: 46800,
        description:
          isIslamicAcct || archetype === "islamic_modern"
            ? `Debit Card Fee for #${cardBin}${randomDigits(10)}`
            : `CARD FEE 371478S${randomDigits(7)}`,
        chq: "-",
        kind: "withdrawal",
        category: "card_fee",
        amountCents: feeCents,
        adjustableRound: false,
        allowsFractionalPaisa: false,
        minCents: feeCents,
        groupId: `g-${groupIdCounter++}`,
      },
    ]);
    currentCount += 1;
  }

  // =========================================================================
  // PHASE 2: Organic Daily Cash-Flow Transactions & Linked Dependencies
  // =========================================================================
  while (currentCount < targetRows) {
    const remaining = targetRows - currentCount;
    const progress = (currentCount - anchorBudget * 0.5) / Math.max(1, targetRows);
    const baseProgress = Math.max(0.01, Math.min(0.99, Math.random()));
    const rawDate = new Date(startD.getTime() + Math.floor(spanMs * baseProgress));
    rawDate.setHours(12, 0, 0, 0);

    const gid = `g-${groupIdCounter++}`;
    const isModernPeriod = baseProgress > 0.45;
    const doyCode = formatDayOfYearCode(rawDate);

    // Choose realistic dependency pair occasionally (with anti-repetition)
    const depRoll = Math.random();
    if (includeDeps && remaining >= 3 && depRoll < 0.08 && !recentCategories.includes("atm_split")) {
      // Split High-Value ATM Withdrawal Pair (same day, same RATM, ascending timestamps)
      seqRatmTrace += randInt(12000, 95000);
      const t1 = String(seqRatmTrace).padStart(12, "0");
      const t2 = String(seqRatmTrace + randInt(310, 1650)).padStart(12, "0");
      const s1 = String(randInt(110000, 940000)).padStart(12, "0");
      const s2 = String(Number(s1) + randInt(320, 980)).padStart(12, "0");
      const suffix = isModernPeriod ? "-5" : "";
      const atmLoc = pick(persona.atms);
      const split1 = sampleLogNormalAmountBdt(40000, 80000, 5000, recentAmountsBdt, 0.6);
      const split2 = sampleLogNormalAmountBdt(5000, 25000, 5000, [...recentAmountsBdt, split1], 0.4);
      const baseSec = randInt(36000, 72000);
      rememberTx(split1, "atm_split", atmLoc);
      rememberTx(split2, "atm_split", atmLoc);
      clusters.push([
        {
          dateObj: rawDate,
          sortTimeSec: baseSec,
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
          dateObj: rawDate,
          sortTimeSec: baseSec + 95,
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

    if (includeDeps && remaining >= 3 && depRoll >= 0.08 && depRoll < 0.15 && !recentCategories.includes("atm_ssc")) {
      // Inter-bank / SSC ATM Withdrawal + 46.00 Fee Pair
      seqRatmTrace += randInt(15000, 80000);
      const trace = String(seqRatmTrace).padStart(12, "0");
      const seq = String(randInt(100000, 950000)).padStart(12, "0");
      const atmLoc = pick(persona.sscAtms);
      const wdlBdt = sampleLogNormalAmountBdt(2500, 24000, 500, recentAmountsBdt, 0.35);
      const baseSec = randInt(36000, 75000);
      rememberTx(wdlBdt, "atm_ssc", atmLoc);
      clusters.push([
        {
          dateObj: rawDate,
          sortTimeSec: baseSec,
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
          dateObj: rawDate,
          sortTimeSec: baseSec + 5,
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

    if (
      includeDeps &&
      remaining >= 3 &&
      depRoll >= 0.15 &&
      depRoll < 0.21 &&
      (archetype === "sme_business" || Math.random() < 0.45) &&
      !recentCategories.includes("clg_chq")
    ) {
      // Clearing Cheque Deposit + BACH 10.00 Charge (Strictly Sun-Thu banking days!)
      const workDate = snapToBangladeshWorkingDay(rawDate, startD, endD);
      const chqNum = randomDigits(7);
      const bank = pick(CLEARING_BANKS);
      const dd = String(workDate.getDate()).padStart(2, "0");
      const mm = String(workDate.getMonth() + 1).padStart(2, "0");
      const yy = String(workDate.getFullYear()).slice(-2);
      const depBdt = sampleLogNormalAmountBdt(
        Math.round(45000 * scaleFactor),
        Math.round(360000 * scaleFactor),
        5000,
        recentAmountsBdt,
        0.4
      );
      const baseSec = randInt(39600, 54000);
      rememberTx(depBdt, "clg_chq", bank.name);
      clusters.push([
        {
          dateObj: workDate,
          sortTimeSec: baseSec,
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
          dateObj: workDate,
          sortTimeSec: baseSec + 10,
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

    if (
      includeDeps &&
      remaining >= 3 &&
      depRoll >= 0.21 &&
      depRoll < 0.29 &&
      (archetype === "remittance_eftn" || archetype === "sme_business") &&
      !recentCategories.includes("npsb_paired")
    ) {
      // Paired Outward CITYTOUCH/NPSB + Separate 10.00 Charge Row
      const npsbRef = Math.random() < 0.4 ? pick([familyAcct, secondaryOwnAcct]) : pick(occasionalAccts);
      const wdlBdt = sampleLogNormalAmountBdt(
        Math.round(6000 * scaleFactor),
        Math.round(85000 * scaleFactor),
        500,
        recentAmountsBdt,
        0.35
      );
      const baseSec = randInt(36000, 74000);
      rememberTx(wdlBdt, "npsb_paired", npsbRef);
      clusters.push([
        {
          dateObj: rawDate,
          sortTimeSec: baseSec,
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
          dateObj: rawDate,
          sortTimeSec: baseSec + 5,
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

    // Single Human Transaction tailored to the active Archetype & Persona
    const depositProbability =
      archetype === "sme_business"
        ? 0.48
        : archetype === "salaried_executive"
        ? 0.34
        : archetype === "remittance_eftn"
        ? 0.38
        : 0.44;
    const isDeposit = Math.random() < depositProbability;

    const hr = randInt(9, 22);
    const mi = randInt(0, 59);
    const sc = randInt(0, 59);
    const sortSec = hr * 3600 + mi * 60 + sc;
    seqCtId += randInt(1350, 58000);

    if (isDeposit) {
      const depCats =
        archetype === "sme_business"
          ? ["dep_cash", "dep_receive", "dep_npsb", "dep_ft", "dep_ratm", "dep_person_tr"]
          : archetype === "salaried_executive"
          ? ["dep_npsb", "dep_ft", "dep_ratm", "dep_eft", "dep_profit"]
          : archetype === "remittance_eftn"
          ? ["dep_remit", "dep_npsb", "dep_ft", "dep_atm_dep", "dep_eft"]
          : ["dep_ft", "dep_npsb", "dep_ratm", "dep_cash", "dep_profit", "dep_eft"];

      const availableCats = depCats.filter((c) => !recentCategories.slice(-2).includes(c));
      const chosenCat = pick(availableCats.length > 0 ? availableCats : depCats);

      // Branch counter deposits only happen Sun-Thu in Bangladesh
      const txDate =
        chosenCat === "dep_cash" || chosenCat === "dep_receive" || chosenCat === "dep_eft"
          ? snapToBangladeshWorkingDay(rawDate, startD, endD)
          : rawDate;
      const isoTs = formatIsoTimestamp(txDate, hr, mi, sc);
      const txDoy = formatDayOfYearCode(txDate);

      let desc = "";
      let depBdt = sampleLogNormalAmountBdt(
        Math.round(5500 * scaleFactor),
        Math.round(165000 * scaleFactor),
        500,
        recentAmountsBdt,
        0.3
      );
      let depCents = depBdt * 100;
      let allowsPaisa = false;

      if (chosenCat === "dep_ft") {
        const senderAcct = Math.random() < 0.38 ? primaryClientAcct : pick(occasionalAccts);
        desc = isModernPeriod
          ? `CT-FT-FIN TO ABA-${seqCtId}-${accountNo}-|${senderAcct}-${isoTs}`
          : `CITYTOUCH/FUND TRANSFER-FINACLE TO ABABIL CBLTA-${senderAcct}-${txDoy}${randomDigits(7)}`;
      } else if (chosenCat === "dep_npsb") {
        const bank = pick(NPSB_BANKS);
        const senderRef = Math.random() < 0.35 ? primaryClientAcct : pick(occasionalAccts);
        const trace12 = `${txDoy.slice(-3)}${randomDigits(9)}`;
        if (isModernPeriod && Math.random() < 0.45) {
          desc = `NPSB IN/${bank.short}|${senderRef}|${trace12}/${trace12}¿P2=${senderRef}`;
        } else {
          desc = `NPSB IN//${bank.short}|${senderRef}|${trace12}`;
        }
      } else if (chosenCat === "dep_ratm") {
        seqRatmTrace += randInt(11000, 75000);
        const t1 = String(seqRatmTrace).padStart(12, "0");
        const s1 = String(randInt(150000, 950000)).padStart(12, "0");
        const ratmBranch = pick(persona.ratmBranches);
        depBdt = sampleLogNormalAmountBdt(
          Math.round(4500 * scaleFactor),
          Math.round(145000 * scaleFactor),
          500,
          recentAmountsBdt,
          0.32
        );
        depCents = depBdt * 100;
        desc = `RATM DEP- ${ratmBranch}-${t1}-${s1}-`;
      } else if (chosenCat === "dep_cash") {
        const area = pick(persona.cashAreas);
        desc = pick([
          `CASH DEPOSIT ${seqDepositNo++}`,
          `CASH DEPOSIT: ${area} BR`,
          `CASH DEPOSIT BR-${randInt(105, 420)}`,
        ]);
      } else if (chosenCat === "dep_receive") {
        const area = pick(persona.cashAreas);
        desc = `CASH RECEIVE ${area} (${seqDepositNo++})`;
      } else if (chosenCat === "dep_eft") {
        depBdt = sampleLogNormalAmountBdt(
          Math.round(16000 * scaleFactor),
          Math.round(120000 * scaleFactor),
          100,
          recentAmountsBdt,
          0.38
        );
        depCents = depBdt * 100 + pick([0, 0, 25, 50, 75, 30]);
        allowsPaisa = true;
        desc = `EFT TranceNumber : 0000000${randomDigits(8)}`;
      } else if (chosenCat === "dep_remit") {
        const bank = pick(["TRBL", "MTBL", "BRBL", "DBBL"]);
        depBdt = sampleLogNormalAmountBdt(
          Math.round(18000 * scaleFactor),
          Math.round(110000 * scaleFactor),
          100,
          recentAmountsBdt,
          0.4
        );
        depCents = depBdt * 100 + randInt(10, 95);
        allowsPaisa = true;
        desc = `NPSB IN REMIT/${bank}/000${randomDigits(10)}`;
      } else if (chosenCat === "dep_person_tr") {
        desc = `TR FROM ${pick(contactNames)}`;
      } else if (chosenCat === "dep_atm_dep") {
        desc = `ATM DEP ${pick(persona.atms)}`;
      } else {
        depBdt = sampleLogNormalAmountBdt(3200, 24500, 100, recentAmountsBdt, 0.35);
        depCents = depBdt * 100 + randInt(12, 94);
        allowsPaisa = true;
        desc = `PROFIT TRANSFER OF A/C : ${accountNo.slice(0, 5)}100${randomDigits(5)}`;
      }

      rememberTx(depBdt, chosenCat, desc);
      clusters.push([
        {
          dateObj: txDate,
          sortTimeSec: sortSec,
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
      // Withdrawal categories tailored to archetype
      const wdlCats =
        archetype === "salaried_executive"
          ? ["wdl_pos", "wdl_atm", "wdl_utility", "wdl_mfs", "wdl_card_pmt", "wdl_npsb", "wdl_ft", "wdl_auto_dr"]
          : archetype === "sme_business"
          ? ["wdl_chq", "wdl_npsb", "wdl_eftn", "wdl_atm", "wdl_ft", "wdl_mfs", "wdl_pos", "wdl_utility"]
          : archetype === "remittance_eftn"
          ? ["wdl_eftn", "wdl_npsb", "wdl_ft", "wdl_atm", "wdl_mfs", "wdl_pos", "wdl_utility", "wdl_card_pmt"]
          : ["wdl_npsb", "wdl_atm", "wdl_ft", "wdl_card_pmt", "wdl_mfs", "wdl_pos", "wdl_utility", "wdl_auto_dr", "wdl_insurance"];

      const availableCats = wdlCats.filter((c) => !recentCategories.slice(-2).includes(c));
      const chosenCat = pick(availableCats.length > 0 ? availableCats : wdlCats);

      const txDate =
        chosenCat === "wdl_chq" || chosenCat === "wdl_eftn"
          ? snapToBangladeshWorkingDay(rawDate, startD, endD)
          : rawDate;
      const isoTs = formatIsoTimestamp(txDate, hr, mi, sc);
      const compactTs = formatCompactTimestamp(txDate, hr, mi, sc, randomDigits(6));
      const txDoy = formatDayOfYearCode(txDate);

      let desc = "";
      let chq = "-";
      let wdlBdt = sampleLogNormalAmountBdt(
        Math.round(3000 * scaleFactor),
        Math.round(68000 * scaleFactor),
        500,
        recentAmountsBdt,
        0.28
      );
      let wdlCents = wdlBdt * 100;
      let keepPlusTenFee = false;
      let keepAtmStep = false;
      let allowsPaisa = false;

      if (chosenCat === "wdl_npsb") {
        const destAcct = Math.random() < 0.35 ? pick([familyAcct, secondaryOwnAcct]) : pick(occasionalAccts);
        const bank = pick(NPSB_BANKS);
        wdlBdt = sampleLogNormalAmountBdt(
          Math.round(4500 * scaleFactor),
          Math.round(92000 * scaleFactor),
          500,
          recentAmountsBdt,
          0.32
        );
        wdlCents = (wdlBdt + 10) * 100;
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
        wdlBdt = sampleLogNormalAmountBdt(2000, 52000, 500, recentAmountsBdt, 0.28);
        wdlCents = wdlBdt * 100;
        keepAtmStep = true;
        desc = `ATM WDL-${loc}-${t1}-${s1}${suffix}`;
      } else if (chosenCat === "wdl_ft") {
        const destAcct = Math.random() < 0.4 ? pick([familyAcct, landlordAcct]) : pick(occasionalAccts);
        wdlBdt = sampleLogNormalAmountBdt(
          Math.round(4500 * scaleFactor),
          Math.round(78000 * scaleFactor),
          500,
          recentAmountsBdt,
          0.3
        );
        wdlCents = wdlBdt * 100;
        desc = isModernPeriod
          ? `CT-FT-${seqCtId}-${destAcct}-${accountNo}|-${isoTs}`
          : `CITYTOUCH/FUND TRANSFER-FRM-${accountNo}-TO-${destAcct}-${txDoy}${randomDigits(7)}`;
      } else if (chosenCat === "wdl_card_pmt") {
        const cardSuffix = pick([cardSuffix1, cardSuffix2]);
        wdlBdt = sampleLogNormalAmountBdt(
          Math.round(3200 * scaleFactor),
          Math.round(48000 * scaleFactor),
          100,
          recentAmountsBdt,
          0.32
        );
        wdlCents = wdlBdt * 100 + randInt(12, 96);
        allowsPaisa = true;
        desc = isModernPeriod
          ? `CT-CARD PMT-${seqCtId}-${cardMid}-${cardSuffix}|ABABIL-${accountNo}-${isoTs}`
          : `CITYTOUCH-${randomDigits(8)}-${cardMid}-${cardSuffix}`;
      } else if (chosenCat === "wdl_mfs") {
        const mfsBrand = pick(["bKash", "NAGAD", "BKASH"]);
        const mobile = pick(mfsNumbers);
        wdlBdt = sampleLogNormalAmountBdt(1000, 24000, 100, recentAmountsBdt, 0.25);
        wdlCents = wdlBdt * 100;
        desc =
          mfsBrand === "bKash" && isModernPeriod
            ? `CT-bKash-${seqCtId}|${mobile}-${accountNo}-${isoTs}`
            : `CITYTOUCH-${mfsBrand.toUpperCase()}-${txDoy}${randomDigits(7)}`;
      } else if (chosenCat === "wdl_pos") {
        const freshMerchants = persona.merchants.filter((m) => !recentDescriptions.includes(m));
        const merchant = pick(freshMerchants.length > 0 ? freshMerchants : persona.merchants);
        wdlBdt = sampleLogNormalAmountBdt(650, 14500, 100, recentAmountsBdt, 0.24);
        wdlCents = wdlBdt * 100 + pick([0, 0, 25, 50, 75, randInt(11, 94)]);
        allowsPaisa = true;
        desc = merchant;
      } else if (chosenCat === "wdl_utility") {
        const provider = pick(persona.utilityProviders);
        wdlBdt = sampleLogNormalAmountBdt(500, 6800, 100, recentAmountsBdt, 0.3);
        wdlCents = wdlBdt * 100;
        desc = `CITYTOUCH/${provider}/${txDoy}${randomDigits(7)}`;
      } else if (chosenCat === "wdl_eftn") {
        const bank = pick(NPSB_BANKS);
        const destAcct = Math.random() < 0.35 ? secondaryOwnAcct : pick(occasionalAccts);
        wdlBdt = sampleLogNormalAmountBdt(
          Math.round(12000 * scaleFactor),
          Math.round(88000 * scaleFactor),
          500,
          recentAmountsBdt,
          0.35
        );
        wdlCents = wdlBdt * 100;
        desc = isModernPeriod
          ? `CT-EFTN-${bank.name}-${destAcct}|${accountNo}-${seqCtId}-${isoTs}`
          : "CITY TOUCH/EFTN";
      } else if (chosenCat === "wdl_auto_dr") {
        wdlBdt = sampleLogNormalAmountBdt(180, 4200, 100, recentAmountsBdt, 0.25);
        wdlCents = wdlBdt * 100 + randInt(8, 95);
        allowsPaisa = true;
        desc = `AUTO DR-${randomDigits(7)}-${cardBin}**${cardSuffix1}`;
      } else if (chosenCat === "wdl_chq") {
        chq = String(seqChqNo++);
        wdlBdt = sampleLogNormalAmountBdt(
          Math.round(8500 * scaleFactor),
          Math.round(78000 * scaleFactor),
          500,
          recentAmountsBdt,
          0.35
        );
        wdlCents = wdlBdt * 100;
        desc = pick(["CASH WITHDRAWAL", "CASH WITHDRAWAL BY SELF", `TRF TO ${pick(contactNames)}`]);
      } else {
        wdlBdt = sampleLogNormalAmountBdt(4500, 18500, 500, recentAmountsBdt, 0.35);
        wdlCents = wdlBdt * 100;
        desc = pick(["INSURANCE SUNLIFE REGULAR", "INSURANCE METLIFE ALICO", "DPS MONTHLY INSTALLMENT"]);
      }

      rememberTx(wdlBdt, chosenCat, desc);
      clusters.push([
        {
          dateObj: txDate,
          sortTimeSec: sortSec,
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

  // Sort clusters chronologically by (date, intra-day timestamp)
  clusters.sort((a, b) => {
    const dayDiff = a[0].dateObj.getTime() - b[0].dateObj.getTime();
    if (dayDiff !== 0) return dayDiff;
    return a[0].sortTimeSec - b[0].sortTimeSec;
  });

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

  // =========================================================================
  // PHASE 3: Smooth Balance Trajectory & Exact Paisa Reconciliation
  // =========================================================================
  const computeNetCents = () =>
    rows.reduce((acc, r) => acc + (r.kind === "deposit" ? r.amountCents : -r.amountCents), 0);

  const targetNetCents = closingCents - openingCents;
  const adjDeposits = rows.filter((r) => r.kind === "deposit" && r.adjustableRound);
  const adjWithdrawals = rows.filter((r) => r.kind === "withdrawal" && r.adjustableRound);

  // Distribute coarse difference in randomized unequal 500 BDT chunks across adjustable rows
  let diffCents = targetNetCents - computeNetCents();
  let safety = 0;
  while (Math.abs(diffCents) >= 50000 && safety < 5000) {
    safety++;
    const stepMult =
      Math.abs(diffCents) >= 5000000
        ? pick([3, 5, 8, 12, 17])
        : Math.abs(diffCents) >= 500000
        ? pick([1, 2, 3, 5])
        : 1;
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

  // Prevent any intermediate running balance from dipping below a healthy positive floor
  const minFloorCents = Math.min(openingCents, closingCents, 250000);
  for (let pass = 0; pass < 40; pass++) {
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

  // Exact final paisa reconciliation on a natural non-round row (card payment / POS / profit / remit)
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
    personaSummary: `${ARCHETYPE_LABELS[archetype]} · ${persona.city}`,
  };
}
