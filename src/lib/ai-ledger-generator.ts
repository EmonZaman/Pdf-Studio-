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

  // ISO YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]), 12, 0, 0);
    if (!isNaN(d.getTime())) return d;
  }

  // DD MMM YYYY (e.g. 01 Jan 2026)
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

  // DD/MM/YYYY or DD-MM-YYYY
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

const BD_COUNTERPARTY_ACCOUNTS = [
  "2054616340001",
  "1059999060001",
  "1059260810001",
  "1060281610001",
  "2303530394001",
  "2611281538001",
  "2302568643001",
  "2101678872001",
  "2304419368001",
  "2183929672001",
  "2304701863001",
  "2224101191001",
  "2303569029001",
  "1263161623001",
  "1203772084001",
  "2201105069805001",
  "2304341645001",
  "2701641103001",
  "2303319956001",
  "1263097617001",
  "1053733840001",
  "1070448020001",
  "3115213019032",
  "3115217018923",
  "2011580032417",
  "1063164410001",
  "1022750040051",
  "344211100113818",
];

const BD_ATM_LOCATIONS = [
  "GREEN ROAD RATM",
  "KAWRAN BAZAR BR RATM",
  "PANTHAPATH SSC ATM",
  "DHANMONDI BR RATM",
  "HARVEST RICH RATM",
  "IBRAHIMPUR BAZAR RECYCLE>DHAKA BD",
  "IBRAHIMPUR KAFRUL RATM>Dhaka CantonmenBD",
  "METRO SHEWRAPARA RATM>Mirpur BD",
  "BASHUNDHARA CITY RATM 2>Panthapath BD",
  "BENARASHI PALLI RATM>Mirpur TSO BD",
  "GULSHAN AVENUE RATM",
  "UTTARA JASIMUDDIN RATM",
  "MOTIJHEEL BR RATM",
  "DINAJPUR BR RATM",
];

const BD_BRANCH_COLLECTION_AREAS = [
  "RAMPURA",
  "ZIGATOLA",
  "HATIRJHEEL",
  "RAJARBAGH",
  "HAZARIBAGH",
  "MALIBAGH",
  "KARWAN BAZAR",
  "SADARGHAT BR",
  "BANANI",
  "MIRPUR",
  "LALBAGH",
  "BADDA",
  "UTTARA",
  "CHANDRAGONJ",
  "CHOWMUHUNI",
];

const BD_POS_MERCHANTS = [
  "PURCHASE FOOD SHWAPNO link Road",
  "PURCHASE CARD KOREAN BEAUTY",
  "PURCHASE CARD LAZZ PHARMA>Mirpur TSO",
  "PURCHASE CARD M/S NEW LIFE PHARMACY>Mirpur TSO",
  "PURCHASE ITEMS AARONG BD. Dhaka",
  "PURCHASE SHOE BATA BD.",
  "Purchase Daily Product Shwapno Store",
  "Purchase Medicine Lazz Pharma",
  "PRAINGON FASHION BILL PAY",
  "BILL PAY TREND FASHION",
  "BILL PAY DAILY FASHION",
  "DARAZ ONLINE SHOPPING",
  "PURCHASE CARD WHOLESALE CLUB",
  "PURCHASE CARD GARLIC N GINGER",
];

interface DraftRow {
  dateObj: Date;
  description: string;
  chq: string;
  kind: "withdrawal" | "deposit";
  amountCents: number;
  /** Whether the solver can scale/adjust this row's amount in round BDT */
  adjustableRound: boolean;
  /** Whether the solver can place fractional paisa (.01-.99) on this row */
  allowsFractionalPaisa: boolean;
  /** Minimum allowed amount in cents if adjusted */
  minCents: number;
  /** Group ID so dependent rows stay glued together in exact order on the same date */
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
  return "islamic_modern";
}

/**
 * Generates an authentic, human-like Bangladeshi bank statement ledger with
 * real transaction dependencies and exact opening -> closing balance reconciliation.
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

  const accountNo = (options.accountNo || "1781920006484").trim();
  const cardLast4 = accountNo.slice(-3) || "273";
  const cardAlt3 = "683";
  const profile = detectProfile(options);
  const includeDeps = options.includeDependencies !== false;

  // Generate monotonic dates across [startD, endD]
  const spanMs = Math.max(24 * 3600 * 1000, endD.getTime() - startD.getTime());

  // Build clusters of transactions until we reach exactly `targetRows`
  const clusters: DraftRow[][] = [];
  let currentCount = 0;
  let seqDepositNo = randInt(140, 310);
  let seqChqNo = randInt(981520, 981620);
  let seqCtId = randInt(100000450000, 100018500000);
  let seqRatmTrace = randInt(1018380000, 1194590000);
  let groupIdCounter = 1;

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
    const jitter = (Math.random() - 0.5) * (0.6 / Math.max(5, targetRows));
    const clampedProgress = Math.max(0.01, Math.min(0.99, progress + jitter));
    const clusterDate = new Date(startD.getTime() + Math.floor(spanMs * clampedProgress));
    clusterDate.setHours(12, 0, 0, 0);

    const gid = `g-${groupIdCounter++}`;
    const doyCode = formatDayOfYearCode(clusterDate);
    const isModernPeriod = progress > 0.55;

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
        const profitCents = randInt(55000, 145000); // 550.00 - 1,450.00
        const taxCents = Math.round(profitCents * 0.15); // 15% source tax
        clusters.push([
          {
            dateObj: cDate,
            description: `PROVISIONAL PROFIT POSTING OF ACCOUNT ${accountNo}`,
            chq: "-",
            kind: "deposit",
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
            amountCents: 25000, // 250.00
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
            amountCents: 3750, // 37.50 (15% of 250.00)
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
        clusters.push([
          {
            dateObj: cDate,
            description: `A/C MAINTENANCE FEE ${monLabel}`,
            chq: "-",
            kind: "withdrawal",
            amountCents: 23000, // 230.00
            adjustableRound: false,
            allowsFractionalPaisa: false,
            minCents: 23000,
            groupId: gid,
          },
          {
            dateObj: cDate,
            description: `EXCISE DUTY-${cDate.getFullYear()}`,
            chq: "-",
            kind: "withdrawal",
            amountCents: 50000, // 500.00
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
    }

    // 2. Annual SMS Renewal Fee (345.00 BDT)
    if (includeDeps && !hasInsertedSmsFee && remaining >= 4 && progress >= 0.32 && Math.random() < 0.35) {
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
          amountCents: 34500, // 345.00
          adjustableRound: false,
          allowsFractionalPaisa: false,
          minCents: 34500,
          groupId: gid,
        },
      ]);
      currentCount += 1;
      continue;
    }

    // 3. Annual Debit Card Fee (690.00 BDT)
    if (includeDeps && !hasInsertedCardFee && remaining >= 4 && progress >= 0.72 && Math.random() < 0.4) {
      hasInsertedCardFee = true;
      const desc =
        profile === "islamic_modern"
          ? `Debit Card Fee for #41052018${randomDigits(8)}`
          : `CARD FEE 371478S${randomDigits(7)}`;
      clusters.push([
        {
          dateObj: clusterDate,
          description: desc,
          chq: "-",
          kind: "withdrawal",
          amountCents: 69000, // 690.00
          adjustableRound: false,
          allowsFractionalPaisa: false,
          minCents: 69000,
          groupId: gid,
        },
      ]);
      currentCount += 1;
      continue;
    }

    // 4. Remittance TT Credit + 2.5% Government Incentive Pair (2 rows)
    if (includeDeps && profile === "remittance_eftn" && remaining >= 3 && Math.random() < 0.16) {
      const ttRef = `TT-R${randomDigits(11)}`;
      const baseBdt = randInt(120, 380) * 1000; // 120,000 - 380,000 BDT
      const baseCents = baseBdt * 100;
      const incCents = Math.round(baseCents * 0.025); // 2.5% incentive
      clusters.push([
        {
          dateObj: clusterDate,
          description: ttRef,
          chq: "-",
          kind: "deposit",
          amountCents: baseCents,
          adjustableRound: false, // keep pair linked to 2.5%
          allowsFractionalPaisa: false,
          minCents: 5000000,
          groupId: gid,
        },
        {
          dateObj: clusterDate,
          description: `${ttRef}-INC`,
          chq: "-",
          kind: "deposit",
          amountCents: incCents,
          adjustableRound: false,
          allowsFractionalPaisa: false,
          minCents: 100000,
          groupId: gid,
          isDependencyChild: true,
        },
      ]);
      currentCount += 2;
      dependencyCount += 1;
      continue;
    }

    // 5. Split Large ATM Withdrawal Dependency Pair (80,000 + 20,000 on same day at same RATM)
    if (includeDeps && remaining >= 3 && Math.random() < 0.12) {
      seqRatmTrace += randInt(12000, 95000);
      const t1 = String(seqRatmTrace).padStart(12, "0");
      const t2 = String(seqRatmTrace + randInt(350, 1450)).padStart(12, "0");
      const s1 = String(randInt(150000, 940000)).padStart(12, "0");
      const s2 = String(Number(s1) + randInt(400, 950)).padStart(12, "0");
      const suffix = isModernPeriod ? "-5" : "";
      clusters.push([
        {
          dateObj: clusterDate,
          description: `ATM WDL-GREEN ROAD RATM-${t1}-${s1}${suffix}`,
          chq: "-",
          kind: "withdrawal",
          amountCents: 8000000, // 80,000.00
          adjustableRound: true,
          allowsFractionalPaisa: false,
          minCents: 2000000,
          groupId: gid,
        },
        {
          dateObj: clusterDate,
          description: `ATM WDL-GREEN ROAD RATM-${t2}-${s2}${suffix}`,
          chq: "-",
          kind: "withdrawal",
          amountCents: 2000000, // 20,000.00
          adjustableRound: true,
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

    // 6. Inter-branch / SSC ATM Withdrawal + 46.00 ATM Cash Withdrawal Charge Dependency Pair
    if (includeDeps && remaining >= 3 && Math.random() < 0.11) {
      seqRatmTrace += randInt(15000, 80000);
      const trace = String(seqRatmTrace).padStart(12, "0");
      const seq = String(randInt(100000, 950000)).padStart(12, "0");
      const atmLoc = pick(["ATM WDL-PANTHAPATH SSC ATM", "ATM WDL-GREEN ROAD ATM"]);
      const wdlBdt = pick([3000, 7000, 12000, 13000, 18000, 20000]);
      clusters.push([
        {
          dateObj: clusterDate,
          description: `${atmLoc}-${trace}-${seq}`,
          chq: "-",
          kind: "withdrawal",
          amountCents: wdlBdt * 100,
          adjustableRound: true,
          allowsFractionalPaisa: false,
          minCents: 200000,
          groupId: gid,
        },
        {
          dateObj: clusterDate,
          description: `ATM CASH WITHDRAWL CHARGE${accountNo}`,
          chq: "-",
          kind: "withdrawal",
          amountCents: 4600, // 46.00
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
    if (includeDeps && remaining >= 3 && Math.random() < 0.07) {
      const chqNum = randomDigits(7);
      const dd = String(clusterDate.getDate()).padStart(2, "0");
      const mm = String(clusterDate.getMonth() + 1).padStart(2, "0");
      const yy = String(clusterDate.getFullYear()).slice(-2);
      const depBdt = pick([150000, 200000, 250000, 300000, 400000]);
      clusters.push([
        {
          dateObj: clusterDate,
          description: `CLG CHQ#${chqNum} SONALI; Routing# 200263047`,
          chq: "-",
          kind: "deposit",
          amountCents: depBdt * 100,
          adjustableRound: true,
          allowsFractionalPaisa: false,
          minCents: 2500000,
          groupId: gid,
        },
        {
          dateObj: clusterDate,
          description: `CLG BACH Charge: CHQ#${chqNum} SONALI; ${dd}/${mm}/${yy}`,
          chq: "-",
          kind: "withdrawal",
          amountCents: 1000, // 10.00
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

    // 8. Outward CITYTOUCH/NPSB + Separate 10.00 NPSB-CHARGE Row Pair (for remittance_eftn / retail_business)
    if (
      includeDeps &&
      (profile === "remittance_eftn" || profile === "retail_business") &&
      remaining >= 3 &&
      Math.random() < 0.22
    ) {
      const npsbRef = pick(["1063164410001", "1721510123112", "3115213019032", "3115217018923", "1022750040051", "344211100113818"]);
      const wdlBdt = pick([15000, 20000, 25000, 35000, 40000, 50000, 60000, 75000]);
      clusters.push([
        {
          dateObj: clusterDate,
          description: `CITYTOUCH/NPSB-${npsbRef}`,
          chq: "-",
          kind: "withdrawal",
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
          amountCents: 1000, // 10.00
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

    // 9. Single Authentic Transaction (Deposits or Withdrawals matching the active profile)
    const isDeposit = Math.random() < 0.47;
    const hr = randInt(9, 22);
    const mi = randInt(0, 59);
    const sc = randInt(0, 59);
    const isoTs = formatIsoTimestamp(clusterDate, hr, mi, sc);
    const compactTs = formatCompactTimestamp(clusterDate, hr, mi, sc, randomDigits(6));
    seqCtId += randInt(1200, 45000);

    if (isDeposit) {
      const depRoll = Math.random();
      let desc = "";
      let depBdt = pick([8000, 12500, 14000, 15000, 17000, 20000, 22000, 23500, 25000, 30000, 35000, 40000, 44000, 48000, 71000, 100000, 150000, 200000]);
      let allowsPaisa = false;

      if (profile === "islamic_modern") {
        if (depRoll < 0.34) {
          const senderAcct = pick(BD_COUNTERPARTY_ACCOUNTS);
          if (isModernPeriod) {
            desc = `CT-FT-FIN TO ABA-${seqCtId}-${accountNo}-|${senderAcct}-${isoTs}`;
          } else {
            desc = `CITYTOUCH/FUND TRANSFER-FINACLE TO ABABIL CBLTA-${senderAcct}-${doyCode}${randomDigits(7)}`;
          }
        } else if (depRoll < 0.62) {
          const bankCode = pick(["PUBL", "BRBL", "IFIC", "ETBL", "MTBL"]);
          const senderRef = randomDigits(13);
          const trace12 = `${doyCode.slice(-3)}${randomDigits(9)}`;
          if (isModernPeriod && (bankCode === "MTBL" || bankCode === "BRBL")) {
            desc = `NPSB IN/${bankCode}|${senderRef}|${trace12}/${trace12}¿P2=${senderRef}`;
          } else {
            desc = `NPSB IN//${bankCode}|${senderRef}|${trace12}`;
          }
        } else if (depRoll < 0.84) {
          seqRatmTrace += randInt(11000, 65000);
          const t1 = String(seqRatmTrace).padStart(12, "0");
          const s1 = String(randInt(500000, 890000)).padStart(12, "0");
          const ratmBranch = pick(["KAWRAN BAZAR BR RATM", "KAWRAN BAZAR BR RATM 2", "GREEN ROAD RATM"]);
          depBdt = pick([4000, 8000, 9500, 15000, 21000, 28000, 50000, 120000, 176000]);
          desc = `RATM DEP- ${ratmBranch}-${t1}-${s1}-`;
        } else if (depRoll < 0.94) {
          desc = pick([`CASH DEPOSIT ${seqDepositNo++}`, "CASH DEPOSIT: SADARGHAT BR", "Cash deposit", `cash deposit ${randInt(105, 420)}`]);
        } else {
          desc = `PROFIT TRANSFER OF A/C : ${accountNo.slice(0, 5)}100${randomDigits(5)}`;
          depBdt = randInt(8, 22) * 1000;
          allowsPaisa = true;
        }
      } else if (profile === "remittance_eftn") {
        if (depRoll < 0.35) {
          const bankCode = pick(["DHBL", "BRBL", "ISBL", "PRBL", "IFIC"]);
          desc = `NPSB IN/${bankCode}/${pick(BD_COUNTERPARTY_ACCOUNTS)}`;
        } else if (depRoll < 0.65) {
          desc = `NPSB IN REMIT/${pick(["TRBL", "MTBL"])}/0003402001702`;
          allowsPaisa = true;
        } else if (depRoll < 0.85) {
          desc = isModernPeriod
            ? `CT-FT-${seqCtId}-${accountNo}`
            : `CT/FT-CBLTA-${doyCode}${randomDigits(7)}-${accountNo}`;
        } else {
          desc = `ATM DEPIbrahimpur Kafrul RATM>Dhaka CantonmenBD`;
        }
      } else {
        // retail_business
        if (depRoll < 0.42) {
          desc = `CASH DEPOSIT ${seqDepositNo++}`;
        } else if (depRoll < 0.72) {
          const area = pick(BD_BRANCH_COLLECTION_AREAS);
          desc = `CASH RECEIVE ${area} (${seqDepositNo++})`;
        } else {
          const dd = String(clusterDate.getDate()).padStart(2, "0");
          const mm = String(clusterDate.getMonth() + 1).padStart(2, "0");
          const yyyy = clusterDate.getFullYear();
          desc = `NPSB IN/000000${randomDigits(6)}/${dd}-${mm}-${yyyy}`;
        }
      }

      clusters.push([
        {
          dateObj: clusterDate,
          description: desc,
          chq: "-",
          kind: "deposit",
          amountCents: depBdt * 100,
          adjustableRound: true,
          allowsFractionalPaisa: allowsPaisa,
          minCents: 100000,
          groupId: gid,
        },
      ]);
      currentCount += 1;
    } else {
      // Withdrawal row
      const wdlRoll = Math.random();
      let desc = "";
      let chq = "-";
      let wdlCents = pick([5000, 8000, 10000, 12000, 15000, 20000, 25000, 30000, 45000, 50000, 60000, 80000]) * 100;
      let adjustableRound = true;
      let allowsPaisa = false;

      if (profile === "islamic_modern") {
        if (wdlRoll < 0.30) {
          // Outward NPSB with +10.00 BDT embedded fee (e.g. 30,010.00, 50,010.00)
          const destAcct = pick(BD_COUNTERPARTY_ACCOUNTS);
          const baseBdt = pick([5000, 10000, 13000, 18000, 20000, 21000, 30000, 40000, 50000, 79000, 87500, 100000]);
          wdlCents = (baseBdt + 10) * 100; // +10 BDT NPSB charge included!
          dependencyCount += 1;
          if (isModernPeriod) {
            const bankName = pick(["BRAC", "PRIME", "SCB", "NRB", "DBBL", "UCB"]);
            desc = `CT-NPSB-${bankName}-${destAcct}|${accountNo}-${seqCtId}-${isoTs}`;
          } else {
            desc = `CITYTOUCH-NPSB-${accountNo}-${destAcct} - ${compactTs} -${isoTs}`;
          }
        } else if (wdlRoll < 0.54) {
          // ATM WDL
          seqRatmTrace += randInt(10000, 70000);
          const t1 = String(seqRatmTrace).padStart(12, "0");
          const s1 = String(randInt(12000, 980000)).padStart(12, "0");
          const suffix = isModernPeriod ? "-5" : "";
          const loc = pick(["GREEN ROAD RATM", "DINAJPUR BR RATM", "HARVEST RICH RATM"]);
          const atmBdt = pick([5000, 10000, 12000, 16000, 20000, 50000, 60000, 70000, 80000]);
          wdlCents = atmBdt * 100;
          desc = `ATM WDL-${loc}-${t1}-${s1}${suffix}`;
        } else if (wdlRoll < 0.74) {
          // Fund transfer to another City Bank account
          const destAcct = pick(BD_COUNTERPARTY_ACCOUNTS);
          const ftBdt = pick([8500, 10000, 11000, 18000, 20000, 22000, 48000, 90000]);
          wdlCents = ftBdt * 100;
          if (isModernPeriod) {
            desc = `CT-FT-${seqCtId}-${destAcct}-${accountNo}|-${isoTs}`;
          } else {
            desc = `CITYTOUCH/FUND TRANSFER-FRM-${accountNo}-TO-${destAcct}-${doyCode}${randomDigits(7)}`;
          }
        } else if (wdlRoll < 0.90) {
          // Card payment / Citytouch bill payment (naturally has fractional paisa!)
          const cardSuffix = pick([cardLast4, cardAlt3]);
          const baseBdt = randInt(1200, 47000);
          const paisa = randInt(10, 96);
          wdlCents = baseBdt * 100 + paisa;
          allowsPaisa = true;
          if (isModernPeriod) {
            desc = `CT-CARD PMT-${seqCtId}-2126870-${cardSuffix}|ABABIL-${accountNo}-${isoTs}`;
          } else {
            desc = `CITYTOUCH-${randomDigits(8)}-2126870-${cardSuffix}`;
          }
        } else {
          // AUTO DR or bKash
          if (Math.random() < 0.5) {
            desc = `CT-bKash-${seqCtId}|018${randomDigits(8)}-${accountNo}-${isoTs}`;
            wdlCents = pick([2000, 5000, 10000, 15000]) * 100;
          } else {
            desc = `AUTO DR-${randomDigits(7)}-474867**${cardLast4}`;
            wdlCents = randInt(60, 950) * 100 + randInt(8, 95);
            allowsPaisa = true;
          }
        }
      } else if (profile === "remittance_eftn") {
        if (wdlRoll < 0.38) {
          desc = isModernPeriod
            ? `CT-EFTN-${pick(["PRIME", "IBBL", "UTTARA"])}-${seqCtId}-${pick(BD_COUNTERPARTY_ACCOUNTS)}`
            : "CITY TOUCH/EFTN";
          wdlCents = pick([20000, 40000, 45000, 50000, 75000, 78500, 79000]) * 100;
        } else if (wdlRoll < 0.65) {
          desc = `ATM WDL${pick(BD_ATM_LOCATIONS)}`;
          wdlCents = pick([2000, 5000, 9000, 10000, 15000, 20000]) * 100;
        } else if (wdlRoll < 0.85) {
          desc = isModernPeriod
            ? `CT-BKASH-${seqCtId}`
            : `CITYTOUCH-BKASH-${doyCode}${randomDigits(7)}`;
          wdlCents = pick([1000, 2250, 2400, 5000, 10000]) * 100;
        } else {
          desc = pick(BD_POS_MERCHANTS);
          wdlCents = randInt(550, 8500) * 100 + randInt(0, 99);
          allowsPaisa = true;
        }
      } else {
        // retail_business
        if (wdlRoll < 0.28) {
          desc = "CASH WITHDRAWAL";
          chq = String(seqChqNo++);
          wdlCents = pick([11200, 16500, 22400, 32500, 41500, 51500, 74300]) * 100;
        } else if (wdlRoll < 0.55) {
          desc = `CITYTOUCH-${pick(["BKASH", "NAGAD"])}-01${randomDigits(9)}`;
          wdlCents = pick([2500, 5500, 9500, 13500, 17250, 24150, 39600]) * 100;
        } else if (wdlRoll < 0.80) {
          desc = `ATM WDL/${pick(["Lalmatia Dhanmondi", "CBL Jamuna Future Park", "Savar Br City Center AT", "Mothijil Branch", "Badda, Pragati Avenue A"])}`;
          wdlCents = pick([5000, 9500, 11500, 15000, 22400, 25400]) * 100;
        } else {
          desc = pick(BD_POS_MERCHANTS);
          wdlCents = randInt(1200, 24000) * 100 + randInt(10, 95);
          allowsPaisa = true;
        }
      }

      clusters.push([
        {
          dateObj: clusterDate,
          description: desc,
          chq,
          kind: "withdrawal",
          amountCents: wdlCents,
          adjustableRound,
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

  // Flatten rows (trim if last cluster overshot targetRows, without breaking a 2-row pair)
  let rows: DraftRow[] = [];
  for (const cl of clusters) {
    if (rows.length + cl.length <= targetRows) {
      rows.push(...cl);
    } else if (rows.length < targetRows) {
      rows.push(cl[0]);
    }
  }

  // Ensure we have at least one adjustable deposit, one adjustable withdrawal, and one fractional-paisa-capable row
  if (!rows.some((r) => r.kind === "deposit" && r.adjustableRound)) {
    rows[0].kind = "deposit";
    rows[0].adjustableRound = true;
  }
  if (!rows.some((r) => r.kind === "withdrawal" && r.adjustableRound)) {
    const lastIdx = rows.length - 1;
    rows[lastIdx].kind = "withdrawal";
    rows[lastIdx].adjustableRound = true;
  }

  // Ensure exact reconciliation: openingCents + sum(deposits) - sum(withdrawals) === closingCents
  const computeNetCents = () =>
    rows.reduce((acc, r) => acc + (r.kind === "deposit" ? r.amountCents : -r.amountCents), 0);

  const targetNetCents = closingCents - openingCents;

  // Step 1: Coarse adjustment in round 1,000 BDT (100,000 cents) steps across adjustable rows
  let diffCents = targetNetCents - computeNetCents();
  const adjDeposits = rows.filter((r) => r.kind === "deposit" && r.adjustableRound);
  const adjWithdrawals = rows.filter((r) => r.kind === "withdrawal" && r.adjustableRound);

  if (diffCents > 0 && adjDeposits.length > 0) {
    // Need more deposits (or smaller withdrawals)
    const addPerDepThousand = Math.floor(diffCents / 100000 / adjDeposits.length);
    if (addPerDepThousand > 0) {
      for (const r of adjDeposits) {
        r.amountCents += addPerDepThousand * 100000;
      }
    }
  } else if (diffCents < 0 && adjWithdrawals.length > 0) {
    // Need more withdrawals
    const absDiff = -diffCents;
    const addPerWdlThousand = Math.floor(absDiff / 100000 / adjWithdrawals.length);
    if (addPerWdlThousand > 0) {
      for (const r of adjWithdrawals) {
        r.amountCents += addPerWdlThousand * 100000;
      }
    }
  }

  // Step 2: Medium adjustment in round 500 BDT (50,000 cents) steps
  diffCents = targetNetCents - computeNetCents();
  let safety = 0;
  while (Math.abs(diffCents) >= 50000 && safety < 2000) {
    safety++;
    if (diffCents > 0) {
      const dep = pick(adjDeposits);
      dep.amountCents += 50000;
      diffCents -= 50000;
    } else {
      const wdl = pick(adjWithdrawals);
      wdl.amountCents += 50000;
      diffCents += 50000;
    }
  }

  // Step 3: Prevent any intermediate running balance from dipping below BDT 2,500.00 (250,000 cents)
  // by moving deposit clusters earlier if needed, while keeping cluster pairs intact
  const minFloorCents = Math.min(openingCents, closingCents, 250000);
  for (let pass = 0; pass < 30; pass++) {
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

    // Find a later single-row adjustable deposit and transfer amount to an earlier deposit (or convert dipIdx to deposit)
    const earlierDep = rows.slice(0, dipIdx + 1).find((r) => r.kind === "deposit" && r.adjustableRound);
    const laterDep = rows.slice(dipIdx + 1).find((r) => r.kind === "deposit" && r.adjustableRound && r.amountCents > 1500000);
    if (earlierDep && laterDep) {
      const shift = Math.min(laterDep.amountCents - 500000, 5000000);
      if (shift > 0) {
        earlierDep.amountCents += shift;
        laterDep.amountCents -= shift;
        continue;
      }
    }
    // Otherwise transfer withdrawal weight from before dipIdx to after dipIdx
    const earlyWdl = rows
      .slice(0, dipIdx + 1)
      .find((r) => r.kind === "withdrawal" && r.adjustableRound && r.amountCents > 1500000);
    const lateWdl = rows.slice(dipIdx + 1).find((r) => r.kind === "withdrawal" && r.adjustableRound);
    if (earlyWdl && lateWdl) {
      const shift = Math.min(earlyWdl.amountCents - 500000, 4000000);
      if (shift > 0) {
        earlyWdl.amountCents -= shift;
        lateWdl.amountCents += shift;
      }
    }
  }

  // Step 4: Exact final paisa reconciliation on a row that naturally carries fractional paisa
  // (e.g. CT-CARD PMT, CITYTOUCH merchant/bill payment, PROFIT TRANSFER, or NPSB IN REMIT)
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
      // Pick any adjustable row that is NOT an ATM withdrawal or cash deposit, or convert one to a card/transfer row
      paisaTarget = rows.find(
        (r) =>
          r.adjustableRound &&
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

  // Ensure monotonic dates after all adjustments
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].dateObj.getTime() < rows[i - 1].dateObj.getTime()) {
      rows[i].dateObj = new Date(rows[i - 1].dateObj.getTime());
    }
  }

  // Convert DraftRows into statement transaction objects
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
