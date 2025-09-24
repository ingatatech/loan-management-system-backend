import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Index,
  JoinColumn,
} from "typeorm";
import { Organization } from "./Organization";
import { BorrowerProfile } from "./BorrowerProfile";
import { LoanCollateral } from "./LoanCollateral";
import { RepaymentSchedule } from "./RepaymentSchedule";
import { RepaymentTransaction } from "./RepaymentTransaction";
import { LoanClassification } from "./LoanClassification";
import { NumberUtils } from "../utils/NumberUtils";
import { LoanReview } from "./LoanReview";
import { Guarantor } from "./Guarantor"
import { BouncedCheque } from "./BouncedCheque";
export enum BusinessType {
  MICRO = "micro",
  SMALL = "small",
  MEDIUM = "medium",
  LARGE = "large",
  YOUTH_BUSINESS = "youth_business",
  PUBLIC_COMPANY = "public_company",
  PRIVATE_COMPANY = "private_company",
  COOPERATIVE = "cooperative",
  PARTNERSHIP = "partnership",
  FOUNDATION = "foundation"
}

export enum IncomeFrequency {
  DAILY = "daily",
  WEEKLY = "weekly",
  MONTHLY = "monthly",
  QUARTERLY = "quarterly",
  ANNUALLY = "annually"
}


export enum EconomicSector {
  AGRICULTURE_LIVESTOCK_FISHING = "agriculture_livestock_fishing",
  PUBLIC_WORKS_CONSTRUCTION = "public_works_construction",
  COMMERCE_RESTAURANTS_HOTELS = "commerce_restaurants_hotels",
  TRANSPORT_WAREHOUSES = "transport_warehouses",
  MANUFACTURING = "manufacturing",
  SERVICES = "services",
  TECHNOLOGY = "technology",
  HEALTHCARE = "healthcare",
  EDUCATION = "education",
  FINANCIAL_SERVICES = "financial_services",
  OTHERS = "others"
}

// ✅ NEW: Borrower Type Enum
export enum BorrowerType {
  INDIVIDUAL = "individual",
  INSTITUTION = "institution"
}
// ✅ NEW: Institution Type Enum
export enum InstitutionType {
  COMPANY = "company",
  COOPERATIVE = "cooperative",
  OTHER = "other"
}



export enum MaritalStatus {
  SINGLE = "single",
  MARRIED = "married",
  DIVORCED = "divorced",
  WIDOWED = "widowed"
}

// ✅ NEW: Income Source Interface for array storage
export interface IncomeSourceInfo {
  source: string;
  otherSource?: string;
  frequency: IncomeFrequency;
  amount: number;
}

export interface InstitutionProfile {
  institutionName: string;
  institutionType: InstitutionType;
  otherInstitutionType?: string;
  licenseNumber: string;
  registrationDate: string;
  tinNumber: string;
  legalDocumentUrl?: string; // RDB, RGB, or RCA
  address?: any;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
}

// ✅ NEW: Spouse Information Interface
export interface SpouseInfo {
  firstName: string;
  lastName: string;
  middleName?: string;
  nationalId: string;
  phone: string;
  email?: string;
  occupation?: string;
  crbReportUrl?: string; // Credit worthiness document
}

export interface LoanApprovalData {
  annualInterestRate: number;
  disbursementDate: Date;
  agreedMaturityDate: Date;
  repaymentFrequency: RepaymentFrequency;
  interestMethod: InterestMethod;
  gracePeriodMonths?: number;
}

export interface LoanData {
  borrowerId: number;
  purposeOfLoan: string;
  branchName: string;
  bisinessOfficer: string;
  loanOfficer: string;
  disbursedAmount: number;
  businessType?: BusinessType | null;
  economicSector?: EconomicSector | null;
  notes?: string;
}

export enum InterestMethod {
  FLAT = "flat",
  REDUCING_BALANCE = "reducing_balance"
}

export enum RepaymentFrequency {
  DAILY = "daily",
  WEEKLY = "weekly",
  BIWEEKLY = "biweekly",
  MONTHLY = "monthly",
  QUARTERLY = "quarterly",
  SEMI_ANNUALLY = "semi_annually",
  ANNUALLY = "annually"
}

export enum LoanStatus {
  PENDING = "pending",
  APPROVED = "approved",
  DISBURSED = "disbursed",
  PERFORMING = "performing",
  WATCH = "watch",
  SUBSTANDARD = "substandard",
  DOUBTFUL = "doubtful",
  LOSS = "loss",
  WRITTEN_OFF = "written_off",
  CLOSED = "closed",
  REJECTED = "rejected" // ✅ NEW STATUS
}
export interface ShareholderBoardMemberInfo {
  type: 'shareholder' | 'board_member';
  firstName: string;
  lastName: string;
  middleName?: string;
  nationalId: string;
  phone: string;
  email?: string;
  position?: string; 
  sharePercentage?: number;
  
  documents?: {
    identificationUrl?: string;
    proofOfSharesUrl?: string;
    boardResolutionUrl?: string;
    crbReportUrl?: string;
  };
}

@Entity("loans")
@Index(["organizationId", "loanId"], { unique: true })
@Index(["borrowerId"])
@Index(["loanOfficer"])
@Index(["status"])
@Index(["disbursementDate"])
@Index(["borrowerType"])
export class Loan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50, unique: true })
  loanId: string;

  @Column({
    type: "enum",
    enum: BorrowerType,
    default: BorrowerType.INDIVIDUAL
  })
  borrowerType: BorrowerType;


  @Column({ type: "jsonb", nullable: true })
  institutionProfile: InstitutionProfile | null;

  @Column({
    type: "enum",
    enum: MaritalStatus,
    nullable: true
  })
  maritalStatus: MaritalStatus | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  marriageCertificateUrl: string | null;

  @Column({ type: "jsonb", nullable: true })
  spouseInfo: SpouseInfo | null;

  @Column({ type: "jsonb", nullable: true })

  @Column({ type: "jsonb", nullable: true })
  shareholderBoardMembers: ShareholderBoardMemberInfo[] | null;

  // ========================================
  // ✅ NEW: Witness CRB Report
  // ========================================

  @Column({ type: "varchar", length: 500, nullable: true })
  witnessCrbReportUrl: string | null;

  // ========================================
  // ✅ ENHANCED: Multiple Income Sources
  // ========================================

  @Column({ type: "jsonb", nullable: true })
  incomeSources: IncomeSourceInfo[] | null;

  // Keep old fields for backward compatibility
  @Column({ type: "varchar", length: 200, nullable: true })
  incomeSource: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  otherIncomeSource: string | null;

  @Column({
    type: "enum",
    enum: IncomeFrequency,
    nullable: true
  })
  incomeFrequency: IncomeFrequency | null;

  @Column({ type: "decimal", precision: 15, scale: 2, nullable: true })
  incomeAmount: number | null;










  @Column({ type: "varchar", length: 255, nullable: true })
  otherInstitutionType: string | null;
  @Column({ type: "varchar", length: 100, nullable: true })
  institutionName: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  licenseNumber: string | null;

  @Column({ type: "date", nullable: true })
  registrationDate: Date | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  tinNumber: string | null;

  // ✅ NEW: Spouse information fields
  @Column({ type: "varchar", length: 100, nullable: true })
  spouseFirstName: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  spouseLastName: string | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  spouseNationalId: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  spousePhone: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  spouseEmail: string | null;

  // ✅ NEW: Document URLs for enhanced functionality
  @Column({ type: "text", nullable: true })
  institutionLegalDocumentUrls: string | null; // RDB, RGB, RCA based on institution type

  @Column({ type: "text", nullable: true })
  marriageCertificateUrls: string | null;

  @Column({ type: "text", nullable: true })
  spouseCrbReportUrls: string | null;

  @Column({ type: "text", nullable: true })
  witnessCrbReportUrls: string | null;

  @Column({ type: "text", nullable: true })
  borrowerCrbReportUrls: string | null;



  @Column({ type: "int", nullable: true })
  borrowerId: number | null;

  @Column({ type: "int", nullable: true })
  institutionId: number | null;

  @Column({ type: "text" })
  purposeOfLoan: string;
  @Column({
    type: "enum",
    enum: BusinessType,
    nullable: true
  })
  businessType: BusinessType | null;
  @Column({
    type: "enum",
    enum: EconomicSector,
    nullable: true
  })
  economicSector: EconomicSector | null;

  @Column({ type: "varchar", length: 100 })
  branchName: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  businessOfficer: string;

  @Column({ type: "varchar", length: 200, nullable: true })
  loanOfficer: string;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  disbursedAmount: number;


  // ✅ FIELDS THAT WILL BE SET DURING APPROVAL (nullable initially)
  @Column({ type: "date", nullable: true })
  disbursementDate: Date | null;

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  annualInterestRate: number | null;

  @Column({
    type: "enum",
    enum: InterestMethod,
    nullable: true
  })
  interestMethod: InterestMethod | null;

  @Column({ type: "int", nullable: true })
  termInMonths: number | null;

  @Column({ type: "date", nullable: true })
  agreedMaturityDate: Date | null;

  @Column({
    type: "enum",
    enum: RepaymentFrequency,
    nullable: true
  })
  repaymentFrequency: RepaymentFrequency | null;

  @Column({ type: "int", default: 0 })
  gracePeriodMonths: number;

  // ✅ CALCULATED FIELDS (set during approval)
  @Column({ type: "date", nullable: true })
  agreedFirstPaymentDate: Date | null;

  @Column({ type: "int", nullable: true })
  totalNumberOfInstallments: number | null;

  @Column({ type: "decimal", precision: 15, scale: 2, nullable: true })
  totalInterestAmount: number | null;

  @Column({ type: "decimal", precision: 15, scale: 2, nullable: true })
  totalAmountToBeRepaid: number | null;

  @Column({ type: "decimal", precision: 15, scale: 2, nullable: true })
  monthlyInstallmentAmount: number | null;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  outstandingPrincipal: number;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  accruedInterestToDate: number;

  @Column({ type: "int", default: 0 })
  daysInArrears: number;

  @Column({
    type: "enum",
    enum: LoanStatus,
    default: LoanStatus.PENDING
  })
  status: LoanStatus;

  // ✅ NEW: Approval tracking fields
  @Column({ type: "int", nullable: true })
  approvedBy: number | null;

  @Column({ type: "timestamp", nullable: true })
  approvedAt: Date | null;

  // ✅ NEW: Rejection tracking fields
  @Column({ type: "int", nullable: true })
  rejectedBy: number | null;

  @Column({ type: "timestamp", nullable: true })
  rejectedAt: Date | null;

  @Column({ type: "text", nullable: true })
  rejectionReason: string | null;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @OneToMany(() => Guarantor, (guarantor) => guarantor.loan, {
    cascade: ["remove"],
  })
  guarantors: Guarantor[];



  @OneToMany(() => BouncedCheque, (bouncedCheques) => bouncedCheques.loan, {
    cascade: ["remove"],
  })
  bouncedCheques: BouncedCheque[];

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "int" })
  organizationId: number;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @Column({ type: "int", nullable: true })
  updatedBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // ===== RELATIONSHIPS (100% UNCHANGED) =====
  @ManyToOne(() => Organization, (organization) => organization.loans)
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @ManyToOne(() => BorrowerProfile, (borrower) => borrower.loans, { nullable: true })
  @JoinColumn({ name: "borrowerId" })
  borrower: BorrowerProfile;



  @OneToMany(() => LoanCollateral, (collateral) => collateral.loan, {
    cascade: ["remove"],
  })
  collaterals: LoanCollateral[];

  @OneToMany(() => LoanReview, (review) => review.loan, {
    cascade: ["remove"],
  })
  reviews: LoanReview[];

  @OneToMany(() => RepaymentSchedule, (schedule) => schedule.loan, {
    cascade: ["remove"],
  })
  repaymentSchedules: RepaymentSchedule[];

  @OneToMany(() => RepaymentTransaction, (transaction) => transaction.loan, {
    cascade: ["remove"],
  })
  transactions: RepaymentTransaction[];

  @OneToMany(() => LoanClassification, (classification) => classification.loan, {
    cascade: ["remove"],
  })
  classifications: LoanClassification[];

  // ===== ALL BUSINESS METHODS REMAIN 100% UNCHANGED =====
  getMaxDaysOverdue(): number {
    if (!this.repaymentSchedules || this.repaymentSchedules.length === 0) {
      return 0;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let maxDaysOverdue = 0;

    for (const schedule of this.repaymentSchedules) {
      if (schedule.isPaid || schedule.paymentStatus === 'paid') {
        continue;
      }

      const dueDate = schedule.dueDate instanceof Date
        ? schedule.dueDate
        : new Date(schedule.dueDate);

      dueDate.setHours(0, 0, 0, 0);

      if (dueDate < today) {
        const daysOverdue = Math.floor(
          (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        maxDaysOverdue = Math.max(maxDaysOverdue, daysOverdue);
      }
    }

    return maxDaysOverdue;
  }

  getAutomaticClassification(): LoanStatus {
    const daysOverdue = this.getMaxDaysOverdue();

    if (daysOverdue === 0) return LoanStatus.PERFORMING;
    if (daysOverdue <= 30) return LoanStatus.WATCH;
    if (daysOverdue <= 90) return LoanStatus.SUBSTANDARD;
    if (daysOverdue <= 180) return LoanStatus.DOUBTFUL;
    return LoanStatus.LOSS;
  }

  get totalInstallmentsPaid(): number {
    const paidSchedules = this.repaymentSchedules?.filter(s => s.isPaid) || [];
    return Number(paidSchedules.length) || 0;
  }

  get totalInstallmentsOutstanding(): number {
    const total = Number(this.totalNumberOfInstallments) || 0;
    const paid = this.totalInstallmentsPaid;
    return Math.max(0, total - paid);
  }

  get principalRepaidToDate(): number {
    const transactions = this.transactions?.filter(t => t.isActive) || [];
    const totalPrincipal = transactions.reduce((sum, t) => {
      const principal = Number(t.principalPaid) || 0;
      return sum + principal;
    }, 0);
    return Number(totalPrincipal.toFixed(2)) || 0;
  }

  get balanceOutstanding(): number {
    const principal = Number(this.outstandingPrincipal) || 0;
    const interest = Number(this.accruedInterestToDate) || 0;
    return Number((principal + interest).toFixed(2));
  }

  getPerformanceMetrics() {
    const totalInstallments = NumberUtils.safeNumber(this.totalNumberOfInstallments);
    const installmentsPaid = NumberUtils.safeNumber(this.totalInstallmentsPaid);
    const principalRepaid = NumberUtils.safeNumber(this.principalRepaidToDate);
    const disbursedAmount = NumberUtils.safeNumber(this.disbursedAmount);
    const outstandingPrincipal = NumberUtils.safeNumber(this.outstandingPrincipal);
    const accruedInterest = NumberUtils.safeNumber(this.accruedInterestToDate);

    const installmentsOutstanding = Math.max(0,
      NumberUtils.safeSubtraction(totalInstallments, installmentsPaid)
    );

    const balanceOutstanding = NumberUtils.safeAddition(
      outstandingPrincipal,
      accruedInterest
    );

    const paymentCompletionRate = totalInstallments > 0
      ? NumberUtils.safeMultiplication(
        NumberUtils.safeDivision(installmentsPaid, totalInstallments),
        100
      )
      : 0;

    const principalRecoveryRate = disbursedAmount > 0
      ? NumberUtils.safeMultiplication(
        NumberUtils.safeDivision(principalRepaid, disbursedAmount),
        100
      )
      : 0;

    return {
      totalInstallments,
      installmentsPaid,
      installmentsOutstanding,
      principalRepaid: Number(principalRepaid.toFixed(2)),
      balanceOutstanding: Number(balanceOutstanding.toFixed(2)),
      paymentCompletionRate: Number(paymentCompletionRate.toFixed(2)),
      principalRecoveryRate: Number(principalRecoveryRate.toFixed(2))
    };
  }

  get totalCollateralValue(): number {
    if (!this.collaterals || this.collaterals.length === 0) {
      return 0;
    }

    const totalEffectiveValue = this.collaterals.reduce((total, collateral) => {
      return total + collateral.effectiveValue;
    }, 0);

    return Math.round(totalEffectiveValue * 100) / 100;
  }

  getCollateralBreakdown() {
    if (!this.collaterals || this.collaterals.length === 0) {
      return {
        totalOriginalValue: 0,
        totalEffectiveValue: 0,
        totalHaircutAmount: 0,
        averageHaircutPercentage: 0,
        collateralsByType: {},
        needsRevaluation: 0
      };
    }

    let totalOriginalValue = 0;
    let totalEffectiveValue = 0;
    let totalHaircutAmount = 0;
    let needsRevaluationCount = 0;
    const collateralsByType: Record<string, any> = {};

    this.collaterals.forEach(collateral => {
      const breakdown = collateral.getValuationBreakdown();

      totalOriginalValue += breakdown.originalValue;
      totalEffectiveValue += breakdown.effectiveValue;
      totalHaircutAmount += breakdown.haircutAmount;

      if (collateral.needsRevaluation()) {
        needsRevaluationCount++;
      }

      const type = collateral.collateralType;
      if (!collateralsByType[type]) {
        collateralsByType[type] = {
          count: 0,
          originalValue: 0,
          effectiveValue: 0,
          haircutAmount: 0,
          valuationPercentage: breakdown.valuationPercentage
        };
      }

      collateralsByType[type].count++;
      collateralsByType[type].originalValue += breakdown.originalValue;
      collateralsByType[type].effectiveValue += breakdown.effectiveValue;
      collateralsByType[type].haircutAmount += breakdown.haircutAmount;
    });

    const averageHaircutPercentage = totalOriginalValue > 0
      ? (totalHaircutAmount / totalOriginalValue) * 100
      : 0;

    return {
      totalOriginalValue: Math.round(totalOriginalValue * 100) / 100,
      totalEffectiveValue: Math.round(totalEffectiveValue * 100) / 100,
      totalHaircutAmount: Math.round(totalHaircutAmount * 100) / 100,
      averageHaircutPercentage: Math.round(averageHaircutPercentage * 100) / 100,
      collateralsByType,
      needsRevaluation: needsRevaluationCount
    };
  }

  getCollateralCoverageRatio(): number {
    if (this.outstandingPrincipal <= 0) return 0;
    return (this.totalCollateralValue / this.outstandingPrincipal) * 100;
  }

  isAdequatelyCollateralized(): boolean {
    return this.getCollateralCoverageRatio() >= 100;
  }

  getCollateralDeficiency(): number {
    const deficiency = this.outstandingPrincipal - this.totalCollateralValue;
    return Math.max(0, Math.round(deficiency * 100) / 100);
  }

  get totalPaidAmount(): number {
    return this.transactions?.reduce((total, transaction) =>
      total + (transaction.amountPaid || 0), 0) || 0;
  }

  get totalPrincipalPaid(): number {
    return this.transactions?.reduce((total, transaction) =>
      total + (transaction.principalPaid || 0), 0) || 0;
  }

  get totalInterestPaid(): number {
    return this.transactions?.reduce((total, transaction) =>
      total + (transaction.interestPaid || 0), 0) || 0;
  }

  get remainingBalance(): number {
    return this.outstandingPrincipal + this.accruedInterestToDate;
  }

  get loanToValueRatio(): number {
    return this.totalCollateralValue > 0
      ? (this.disbursedAmount / this.totalCollateralValue) * 100
      : 0;
  }

  isOverdue(): boolean {
    return this.daysInArrears > 0;
  }

  isPerforming(): boolean {
    return this.daysInArrears <= 30 && this.status === LoanStatus.PERFORMING;
  }

  getClassificationCategory(): string {
    if (this.daysInArrears <= 30) return "Normal/Standard";
    if (this.daysInArrears <= 90) return "Watch";
    if (this.daysInArrears <= 180) return "Substandard";
    if (this.daysInArrears <= 365) return "Doubtful";
    return "Loss";
  }

  getProvisioningRate(): number {
    const category = this.getClassificationCategory();
    switch (category) {
      case "Normal/Standard": return 0.01;
      case "Watch": return 0.05;
      case "Substandard": return 0.25;
      case "Doubtful": return 0.50;
      case "Loss": return 1.00;
      default: return 0.01;
    }
  }

  calculateNetExposure(): number {
    const netExposure = Math.max(0, this.outstandingPrincipal - this.totalCollateralValue);
    return Math.round(netExposure * 100) / 100;
  }

  calculateProvisionRequired(): number {
    const netExposure = this.calculateNetExposure();
    const provisioningRate = this.getProvisioningRate();
    const provision = netExposure * provisioningRate;
    return Math.round(provision * 100) / 100;
  }
}