// @ts-nocheck

import { Repository } from "typeorm";
import { Loan, InterestMethod, RepaymentFrequency, LoanStatus } from "../entities/Loan";
import { BorrowerProfile } from "../entities/BorrowerProfile";
import { Organization } from "../entities/Organization";
import { RepaymentSchedule, ScheduleStatus } from "../entities/RepaymentSchedule";
import { LoanCollateral, CollateralType } from "../entities/LoanCollateral";

export interface LoanData {
  borrowerId: number;
  purposeOfLoan: string;
  branchName: string;
  loanOfficer: string;
  disbursedAmount: number;
  disbursementDate: Date;
  annualInterestRate: number;
  interestMethod: InterestMethod;
  termInMonths: number;
  repaymentFrequency: RepaymentFrequency;
  gracePeriodMonths?: number;
  notes?: string;
}

export interface CollateralData {
  collateralType: CollateralType;
  description: string;
  collateralValue: number;
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorAddress?: string;
  proofOfOwnershipUrl?: string;
  proofOfOwnershipType?: string;
  ownerIdentificationUrl?: string;
  legalDocumentUrl?: string;
  physicalEvidenceUrl?: string;
  additionalDocumentsUrls?: string[];
  valuationDate?: Date;
  valuedBy?: string;
  notes?: string;
}

export interface LoanResponse {
  success: boolean;
  message: string;
  data?: any;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: string;
}

export class LoanService {
  constructor(
    private loanRepository: Repository<Loan>,
    private borrowerRepository: Repository<BorrowerProfile>,
    private organizationRepository: Repository<Organization>,
    private scheduleRepository: Repository<RepaymentSchedule>,
    private collateralRepository: Repository<LoanCollateral>
  ) {}

  async createLoan(loanData: LoanData, organizationId: number, collaterals?: CollateralData[]): Promise<LoanResponse> {
    try {
      const organization = await this.organizationRepository.findOne({
        where: { id: organizationId, isActive: true }
      });

      if (!organization) {
        return {
          success: false,
          message: "Organization not found or inactive"
        };
      }

      const borrower = await this.borrowerRepository.findOne({
        where: { id: loanData.borrowerId, organizationId, isActive: true }
      });

      if (!borrower) {
        return {
          success: false,
          message: "Borrower not found or inactive"
        };
      }

      if (!borrower.isEligibleForLoan()) {
        return {
          success: false,
          message: "Borrower is not eligible for loan"
        };
      }

      const loanId = await this.generateLoanId(organizationId);

      // Calculate loan terms
      const loanCalculations = this.calculateLoanTerms(loanData);

      // Create loan
      const loan = this.loanRepository.create({
        ...loanData,
        ...loanCalculations,
        loanId,
        organizationId,
        outstandingPrincipal: loanData.disbursedAmount,
        status: LoanStatus.PENDING,
        isActive: true
      });

      const savedLoan = await this.loanRepository.save(loan);

      // Create repayment schedule
      await this.generateRepaymentSchedule(savedLoan);

      // Create collaterals if provided
      if (collaterals && collaterals.length > 0) {
        for (const collateralData of collaterals) {
          await this.addCollateral(savedLoan.id, collateralData);
        }
      }

      // Load complete loan data
      const completeLoan = await this.loanRepository.findOne({
        where: { id: savedLoan.id },
        relations: ["borrower", "collaterals", "repaymentSchedules"]
      });

      return {
        success: true,
        message: "Loan created successfully",
        data: completeLoan
      };
    } catch (error: any) {
      console.error("Create loan error:", error);
      return {
        success: false,
        message: "Failed to create loan",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      };
    }
  }

  async getLoans(
    organizationId: number,
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: LoanStatus,
    borrowerId?: number
  ): Promise<LoanResponse> {
    try {
      const skip = (page - 1) * limit;
      const queryBuilder = this.loanRepository.createQueryBuilder("loan")
        .leftJoinAndSelect("loan.borrower", "borrower")
        .leftJoinAndSelect("loan.collaterals", "collaterals")
        .where("loan.organizationId = :organizationId", { organizationId });

      if (search) {
        queryBuilder.andWhere(
          "(loan.loanId ILIKE :search OR borrower.firstName ILIKE :search OR borrower.lastName ILIKE :search OR borrower.nationalId ILIKE :search)",
          { search: `%${search}%` }
        );
      }

      if (status) {
        queryBuilder.andWhere("loan.status = :status", { status });
      }

      if (borrowerId) {
        queryBuilder.andWhere("loan.borrowerId = :borrowerId", { borrowerId });
      }

      queryBuilder
        .orderBy("loan.createdAt", "DESC")
        .skip(skip)
        .take(limit);

      const [loans, total] = await queryBuilder.getManyAndCount();
      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        message: "Loans retrieved successfully",
        data: loans,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (error: any) {
      console.error("Get loans error:", error);
      return {
        success: false,
        message: "Failed to retrieve loans",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      };
    }
  }

  async getLoanById(loanId: number, organizationId: number): Promise<LoanResponse> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: [
          "borrower",
          "collaterals",
          "repaymentSchedules",
          "transactions",
          "classifications"
        ]
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      return {
        success: true,
        message: "Loan retrieved successfully",
        data: loan
      };
    } catch (error: any) {
      console.error("Get loan by ID error:", error);
      return {
        success: false,
        message: "Failed to retrieve loan",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      };
    }
  }

  async updateLoan(
    loanId: number,
    updateData: Partial<LoanData>,
    organizationId: number
  ): Promise<LoanResponse> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId }
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      // Prevent updates to disbursed loans unless specific fields
      if (loan.status === LoanStatus.DISBURSED || loan.status === LoanStatus.PERFORMING) {
        const allowedFields = ["notes", "loanOfficer", "branchName"];
        const updateFields = Object.keys(updateData);
        const hasDisallowedFields = updateFields.some(field => !allowedFields.includes(field));

        if (hasDisallowedFields) {
          return {
            success: false,
            message: "Cannot update loan terms after disbursement. Only notes, loan officer, and branch can be updated."
          };
        }
      }

      // Update loan
      Object.assign(loan, updateData);

      // Recalculate terms if financial parameters changed
      if (updateData.disbursedAmount || updateData.annualInterestRate || updateData.termInMonths) {
        const recalculatedTerms = this.calculateLoanTerms(loan);
        Object.assign(loan, recalculatedTerms);
      }

      const updatedLoan = await this.loanRepository.save(loan);

      return {
        success: true,
        message: "Loan updated successfully",
        data: updatedLoan
      };
    } catch (error: any) {
      console.error("Update loan error:", error);
      return {
        success: false,
        message: "Failed to update loan",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      };
    }
  }

  async approveLoan(loanId: number, organizationId: number): Promise<LoanResponse> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId },
        relations: ["collaterals"]
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      if (loan.status !== LoanStatus.PENDING) {
        return {
          success: false,
          message: "Only pending loans can be approved"
        };
      }

      // Validate minimum collateral coverage (example: 120% of loan amount)
      const totalCollateralValue = loan.totalCollateralValue;
      const minimumCoverage = loan.disbursedAmount * 1.2;

      if (totalCollateralValue < minimumCoverage) {
        return {
          success: false,
          message: `Insufficient collateral. Required: ${minimumCoverage}, Available: ${totalCollateralValue}`
        };
      }

      loan.status = LoanStatus.APPROVED;
      await this.loanRepository.save(loan);

      return {
        success: true,
        message: "Loan approved successfully",
        data: loan
      };
    } catch (error: any) {
      console.error("Approve loan error:", error);
      return {
        success: false,
        message: "Failed to approve loan",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      };
    }
  }

  async disburseLoan(loanId: number, organizationId: number, disbursementDate?: Date): Promise<LoanResponse> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId, organizationId }
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      if (loan.status !== LoanStatus.APPROVED) {
        return {
          success: false,
          message: "Only approved loans can be disbursed"
        };
      }

      loan.status = LoanStatus.DISBURSED;
      if (disbursementDate) {
        loan.disbursementDate = disbursementDate;
        // Recalculate maturity date and first payment date
        const calculations = this.calculateLoanTerms(loan);
        Object.assign(loan, calculations);
      }

      await this.loanRepository.save(loan);

      // Update repayment schedule with new dates if disbursement date changed
      if (disbursementDate) {
        await this.regenerateRepaymentSchedule(loan);
      }

      return {
        success: true,
        message: "Loan disbursed successfully",
        data: loan
      };
    } catch (error: any) {
      console.error("Disburse loan error:", error);
      return {
        success: false,
        message: "Failed to disburse loan",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      };
    }
  }

  async addCollateral(loanId: number, collateralData: CollateralData): Promise<LoanResponse> {
    try {
      const loan = await this.loanRepository.findOne({
        where: { id: loanId }
      });

      if (!loan) {
        return {
          success: false,
          message: "Loan not found"
        };
      }

      const collateralId = await this.generateCollateralId(loan.loanId);

      const collateral = this.collateralRepository.create({
        ...collateralData,
        collateralId,
        loanId,
        isActive: true
      });

      const savedCollateral = await this.collateralRepository.save(collateral);

      return {
        success: true,
        message: "Collateral added successfully",
        data: savedCollateral
      };
    } catch (error: any) {
      console.error("Add collateral error:", error);
      return {
        success: false,
        message: "Failed to add collateral",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      };
    }
  }

  private calculateLoanTerms(loanData: Partial<LoanData>): Partial<Loan> {
    const {
      disbursedAmount,
      annualInterestRate,
      termInMonths,
      interestMethod,
      repaymentFrequency,
      gracePeriodMonths = 0,
      disbursementDate
    } = loanData;

    if (!disbursedAmount || !annualInterestRate || !termInMonths) {
      throw new Error("Required loan parameters missing");
    }

    // Calculate payment frequency per year
    const paymentsPerYear = this.getPaymentsPerYear(repaymentFrequency || RepaymentFrequency.MONTHLY);
    const totalNumberOfInstallments = Math.ceil(termInMonths * paymentsPerYear / 12);

    let totalInterestAmount: number;
    let monthlyInstallmentAmount: number;

    if (interestMethod === InterestMethod.FLAT) {
      // Flat rate calculation
      totalInterestAmount = (disbursedAmount * annualInterestRate * termInMonths) / (12 * 100);
      monthlyInstallmentAmount = (disbursedAmount + totalInterestAmount) / totalNumberOfInstallments;
    } else {
      // Reducing balance calculation
      const monthlyRate = annualInterestRate / (12 * 100);
      const effectiveTerms = totalNumberOfInstallments;
      
      if (monthlyRate === 0) {
        monthlyInstallmentAmount = disbursedAmount / effectiveTerms;
        totalInterestAmount = 0;
      } else {
        monthlyInstallmentAmount = disbursedAmount * 
          (monthlyRate * Math.pow(1 + monthlyRate, effectiveTerms)) / 
          (Math.pow(1 + monthlyRate, effectiveTerms) - 1);
        totalInterestAmount = (monthlyInstallmentAmount * effectiveTerms) - disbursedAmount;
      }
    }

    const totalAmountToBeRepaid = disbursedAmount + totalInterestAmount;

    // Calculate dates
    const baseDate = disbursementDate || new Date();
    const agreedMaturityDate = new Date(baseDate);
    agreedMaturityDate.setMonth(agreedMaturityDate.getMonth() + termInMonths);

    const agreedFirstPaymentDate = new Date(baseDate);
    agreedFirstPaymentDate.setMonth(agreedFirstPaymentDate.getMonth() + gracePeriodMonths);

    return {
      totalNumberOfInstallments,
      totalInterestAmount: Math.round(totalInterestAmount * 100) / 100,
      totalAmountToBeRepaid: Math.round(totalAmountToBeRepaid * 100) / 100,
      monthlyInstallmentAmount: Math.round(monthlyInstallmentAmount * 100) / 100,
      agreedMaturityDate,
      agreedFirstPaymentDate
    };
  }

  private getPaymentsPerYear(frequency: RepaymentFrequency): number {
    switch (frequency) {
      case RepaymentFrequency.DAILY: return 365;
      case RepaymentFrequency.WEEKLY: return 52;
      case RepaymentFrequency.BIWEEKLY: return 26;
      case RepaymentFrequency.MONTHLY: return 12;
      case RepaymentFrequency.QUARTERLY: return 4;
      case RepaymentFrequency.SEMI_ANNUALLY: return 2;
      case RepaymentFrequency.ANNUALLY: return 1;
      default: return 12;
    }
  }

  private async generateRepaymentSchedule(loan: Loan): Promise<void> {
    const schedules: Partial<RepaymentSchedule>[] = [];
    const startDate = new Date(loan.agreedFirstPaymentDate);
    
    let remainingPrincipal = loan.disbursedAmount;
    const monthlyRate = loan.annualInterestRate / (12 * 100);

    for (let i = 1; i <= loan.totalNumberOfInstallments; i++) {
      const dueDate = new Date(startDate);
      
      // Calculate due date based on payment frequency
      switch (loan.repaymentFrequency) {
        case RepaymentFrequency.MONTHLY:
          dueDate.setMonth(dueDate.getMonth() + (i - 1));
          break;
        case RepaymentFrequency.WEEKLY:
          dueDate.setDate(dueDate.getDate() + ((i - 1) * 7));
          break;
        case RepaymentFrequency.BIWEEKLY:
          dueDate.setDate(dueDate.getDate() + ((i - 1) * 14));
          break;
        case RepaymentFrequency.QUARTERLY:
          dueDate.setMonth(dueDate.getMonth() + ((i - 1) * 3));
          break;
        default:
          dueDate.setMonth(dueDate.getMonth() + (i - 1));
      }

      let duePrincipal: number;
      let dueInterest: number;

      if (loan.interestMethod === InterestMethod.FLAT) {
        duePrincipal = loan.disbursedAmount / loan.totalNumberOfInstallments;
        dueInterest = loan.totalInterestAmount / loan.totalNumberOfInstallments;
      } else {
        // Reducing balance
        dueInterest = remainingPrincipal * monthlyRate;
        duePrincipal = loan.monthlyInstallmentAmount - dueInterest;
        
        // Adjust last payment for rounding
        if (i === loan.totalNumberOfInstallments) {
          duePrincipal = remainingPrincipal;
        }
      }

      const dueTotal = duePrincipal + dueInterest;

      schedules.push({
        loanId: loan.id,
        installmentNumber: i,
        dueDate,
        duePrincipal: Math.round(duePrincipal * 100) / 100,
        dueInterest: Math.round(dueInterest * 100) / 100,
        dueTotal: Math.round(dueTotal * 100) / 100,
        outstandingPrincipal: Math.round((remainingPrincipal - duePrincipal) * 100) / 100,
        status: ScheduleStatus.PENDING
      });

      remainingPrincipal -= duePrincipal;
    }

    await this.scheduleRepository.save(schedules);
  }

  private async regenerateRepaymentSchedule(loan: Loan): Promise<void> {
    // Delete existing schedules
    await this.scheduleRepository.delete({ loanId: loan.id });
    
    // Generate new schedules
    await this.generateRepaymentSchedule(loan);
  }

  private async generateLoanId(organizationId: number): Promise<string> {
    const year = new Date().getFullYear();
    let attempts = 0;
    const maxAttempts = 1000;

    while (attempts < maxAttempts) {
      const randomNumber = Math.floor(10000 + Math.random() * 90000);
      const loanId = `L-${year}-${randomNumber}`;

      const existing = await this.loanRepository.findOne({
        where: { loanId, organizationId }
      });

      if (!existing) {
        return loanId;
      }

      attempts++;
    }

    throw new Error("Unable to generate unique loan ID");
  }

  private async generateCollateralId(loanId: string): Promise<string> {
    const existingCount = await this.collateralRepository.count({
      where: { loan: { loanId } }
    });
    
    return `COL-${loanId}-${String(existingCount + 1).padStart(2, '0')}`;
  }
}