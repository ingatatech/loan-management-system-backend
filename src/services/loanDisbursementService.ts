import { Repository } from "typeorm";
import dbConnection from "../db";
import { Loan, LoanStatus, InterestMethod, RepaymentFrequency } from "../entities/Loan";
import { LoanAnalysisReport } from "../entities/LoanAnalysisReport";
import { ClientBorrowerAccount } from "../entities/ClientBorrowerAccount";
import { ContractSignature } from "../entities/ContractSignature";
import { MortgageRegistration } from "../entities/MortgageRegistration";
import { LoanDisbursement } from "../entities/LoanDisbursement";
import { RepaymentSchedule, ScheduleStatus, PaymentStatus } from "../entities/RepaymentSchedule";
import { UploadToCloud } from "../helpers/cloud";

const VAT_RATE = 0.18; // 18% VAT

interface ThreeStepDisbursementRequest {
  // Auto-fill source
  borrowerAccountNumber: string; // From Step 1
  
  // Step 2: Contract Signature
  notaryName: string;
  notarizationDate: string;
  notaryLicenceNumber: string;
  notaryTelephone: string;
  addressDistrict: string;
  addressSector: string;
  notarisedContractFile: Express.Multer.File;
  
  // Step 3: Mortgage Registration
  notarisedAOMAFile: Express.Multer.File;
  rdbFeesFile: Express.Multer.File;
  
  // Step 4: Loan Disbursement
  commissionRate: number;
  insurancePolicyFees?: number;
  fireInsurancePolicyFees?: number;
  otherFees?: number;
  proofOfDisbursementFile: Express.Multer.File;
}

interface ServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
}

export class LoanDisbursementService {
  private loanRepository: Repository<Loan>;
  private analysisReportRepository: Repository<LoanAnalysisReport>;
  private clientAccountRepository: Repository<ClientBorrowerAccount>;
  private contractSignatureRepository: Repository<ContractSignature>;
  private mortgageRegistrationRepository: Repository<ContractSignature>;
  private mortgageRegistrationRepository: Repository<MortgageRegistration>;
  private disbursementRepository: Repository<LoanDisbursement>;
  private repaymentScheduleRepository: Repository<RepaymentSchedule>;

  constructor() {
    this.loanRepository = dbConnection.getRepository(Loan);
    this.analysisReportRepository = dbConnection.getRepository(LoanAnalysisReport);
    this.clientAccountRepository = dbConnection.getRepository(ClientBorrowerAccount);
    this.contractSignatureRepository = dbConnection.getRepository(ContractSignature);
    this.mortgageRegistrationRepository = dbConnection.getRepository(MortgageRegistration);
    this.disbursementRepository = dbConnection.getRepository(LoanDisbursement);
    this.repaymentScheduleRepository = dbConnection.getRepository(RepaymentSchedule);
  }

  /**
   * STEPS 2-4: Contract Signature, Mortgage Registration, Loan Disbursement
   * Uses borrowerAccountNumber from Step 1 for auto-fill
   */
  async createThreeStepDisbursement(
    data: ThreeStepDisbursementRequest,
    organizationId: number,
    createdBy: number
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      console.log('=== THREE-STEP DISBURSEMENT START ===');

      // ===== AUTO-FILL: Get client account and related data =====
      const clientAccount = await queryRunner.manager.findOne(ClientBorrowerAccount, {
        where: { accountNumber: data.borrowerAccountNumber, organizationId },
        relations: ['loan', 'loan.analysisReports', 'borrower']
      });

      if (!clientAccount) {
        throw new Error("Client account not found");
      }

      const loan = clientAccount.loan;

      if (!loan) {
        throw new Error("Loan not found for this client account");
      }

      // ✅ CRITICAL FIX: Check for approved analysis report instead of direct loan status
      console.log('🔍 Checking for approved analysis report...');
      
      if (!loan.analysisReports || loan.analysisReports.length === 0) {
        throw new Error("No analysis reports found for this loan");
      }

      // Find approved and finalized analysis report
      const approvedReport = loan.analysisReports.find(
        report => report.reportType === 'approve' && report.isFinalized
      );

      if (!approvedReport) {
        throw new Error("No approved and finalized analysis report found. Loan cannot be disbursed without approval.");
      }

      if (!approvedReport.approvalConditions) {
        throw new Error("Approved analysis report does not contain approval conditions");
      }

      console.log('✓ Found approved analysis report:', approvedReport.reportId);

      const approvalConditions = approvedReport.approvalConditions;
      console.log('✓ Auto-filled data from client account and analysis report');

      // ===== STEP 2: CONTRACT SIGNATURE =====
      console.log('🔹 STEP 2: Creating contract signature');

      const contractFileUpload = await UploadToCloud(data.notarisedContractFile);

      const contractSignature = queryRunner.manager.create(ContractSignature, {
        borrowerAccountNumber: data.borrowerAccountNumber,
        loanId: loan.id,
        loanApplicationNumber: loan.loanId,
        notaryName: data.notaryName,
        notarizationDate: new Date(data.notarizationDate),
        notaryLicenceNumber: data.notaryLicenceNumber,
        notaryTelephone: data.notaryTelephone,
        addressDistrict: data.addressDistrict,
        addressSector: data.addressSector,
        notarisedContractFileUrl: contractFileUpload.secure_url,
        organizationId,
        createdBy
      });

      const savedContractSignature = await queryRunner.manager.save(ContractSignature, contractSignature);
      console.log('✓ Contract signature created');

      // ===== STEP 3: MORTGAGE REGISTRATION =====
      console.log('🔹 STEP 3: Creating mortgage registration');

      const aomaFileUpload = await UploadToCloud(data.notarisedAOMAFile);
      const rdbFeesUpload = await UploadToCloud(data.rdbFeesFile);

      const mortgageRegistration = queryRunner.manager.create(MortgageRegistration, {
        borrowerAccountNumber: data.borrowerAccountNumber,
        loanId: loan.id,
        loanApplicationNumber: loan.loanId,
        notarisedAOMAFileUrl: aomaFileUpload.secure_url,
        rdbFeesFileUrl: rdbFeesUpload.secure_url,
        organizationId,
        createdBy
      });

      const savedMortgageRegistration = await queryRunner.manager.save(MortgageRegistration, mortgageRegistration);
      console.log('✓ Mortgage registration created');

      // ===== STEP 4: LOAN DISBURSEMENT CALCULATIONS =====
      console.log('🔹 STEP 4: Calculating disbursement');

      const approvedAmount = approvalConditions.approvedAmount;
      const commissionRate = data.commissionRate;

      // Calculate commission
      const commissionAmount = (commissionRate * approvedAmount) / 100;
      const vatAmount = commissionAmount * VAT_RATE;
      const totalCommissionWithVAT = commissionAmount + vatAmount;

      // Calculate insurance fees
      const insurancePolicyFees = data.insurancePolicyFees || 0;
      const fireInsurancePolicyFees = data.fireInsurancePolicyFees || 0;
      const totalInsuranceFees = insurancePolicyFees + fireInsurancePolicyFees;

      // Other fees
      const otherFees = data.otherFees || 0;

      // Net amount payable
      const netAmountPayable = approvedAmount - totalCommissionWithVAT - totalInsuranceFees - otherFees;

      if (netAmountPayable <= 0) {
        throw new Error("Net amount payable cannot be zero or negative. Total deductions exceed approved amount.");
      }

      const proofFileUpload = await UploadToCloud(data.proofOfDisbursementFile);

      const disbursement = queryRunner.manager.create(LoanDisbursement, {
        borrowerAccountNumber: data.borrowerAccountNumber,
        loanId: loan.id,
        applicationNumber: loan.loanId,
        approvedAmount,
        commissionRate,
        commissionAmount: Number(commissionAmount.toFixed(2)),
        vatAmount: Number(vatAmount.toFixed(2)),
        totalCommissionWithVAT: Number(totalCommissionWithVAT.toFixed(2)),
        insurancePolicyFees: Number(insurancePolicyFees.toFixed(2)),
        fireInsurancePolicyFees: Number(fireInsurancePolicyFees.toFixed(2)),
        totalInsuranceFees: Number(totalInsuranceFees.toFixed(2)),
        otherFees: Number(otherFees.toFixed(2)),
        netAmountPayable: Number(netAmountPayable.toFixed(2)),
        proofOfDisbursementFileUrl: proofFileUpload.secure_url,
        organizationId,
        createdBy
      });

      const savedDisbursement = await queryRunner.manager.save(LoanDisbursement, disbursement);
      console.log('✓ Disbursement calculations saved');

      // ===== UPDATE LOAN WITH APPROVED INFORMATION =====
      console.log('🔹 Updating loan with approved information');

      // CRITICAL FIX: Convert string values to proper enum values with correct casing
      const repaymentFrequency = this.normalizeRepaymentFrequency(approvalConditions.paymentModality);
      const interestMethod = this.normalizeInterestMethod(approvalConditions.interestMethod);
      
      // CRITICAL FIX: Calculate total number of installments based on term and frequency
      const termInMonths = approvalConditions.repaymentPeriod;
      const totalNumberOfInstallments = this.calculateTotalInstallments(termInMonths, repaymentFrequency);
      
      // CRITICAL FIX: Calculate loan amounts for repayment schedule
      const loanAmounts = this.calculateLoanAmounts(
        netAmountPayable,
        approvalConditions.interestRate,
        termInMonths,
        repaymentFrequency,
        interestMethod
      );

      // CRITICAL FIX: Use proper enum types and ensure all required values are set
      await queryRunner.manager.update(Loan, loan.id, {
        // IMPORTANT: Use netAmountPayable as the actual disbursed amount
        disbursedAmount: netAmountPayable,
        termInMonths: termInMonths,
        repaymentFrequency: repaymentFrequency, // Now properly normalized enum value
        annualInterestRate: approvalConditions.interestRate,
        interestMethod: interestMethod, // Now properly normalized enum value
        gracePeriodMonths: approvalConditions.gracePeriodMonths || 0,
        disbursementDate: new Date(),
        
        // CRITICAL FIX: Set calculated fields for repayment schedule
        totalNumberOfInstallments: totalNumberOfInstallments,
        totalInterestAmount: loanAmounts.totalInterest,
        totalAmountToBeRepaid: loanAmounts.totalAmount,
        monthlyInstallmentAmount: loanAmounts.installmentAmount,
        outstandingPrincipal: netAmountPayable,
        accruedInterestToDate: 0,
        daysInArrears: 0,
        
        // CRITICAL FIX: Set first payment date (1 month from disbursement for monthly, adjust for others)
        agreedFirstPaymentDate: this.calculateFirstPaymentDate(new Date(), repaymentFrequency),
        
        status: LoanStatus.DISBURSED
      });

      // Reload loan with updated data
      const updatedLoan = await queryRunner.manager.findOne(Loan, {
        where: { id: loan.id }
      });

      if (!updatedLoan) {
        throw new Error("Failed to reload loan");
      }

      // ===== GENERATE REPAYMENT SCHEDULE =====
      console.log('🔹 Generating repayment schedule');
      const repaymentSchedule = this.generateRepaymentSchedule(updatedLoan);
      await queryRunner.manager.save(RepaymentSchedule, repaymentSchedule);
      console.log(`✓ Generated ${repaymentSchedule.length} repayment schedules`);

      await queryRunner.commitTransaction();
      console.log('=== THREE-STEP DISBURSEMENT COMPLETED ===');

      return {
        success: true,
        message: "Loan disbursement completed successfully (3 steps)",
        data: {
          clientAccount,
          contractSignature: savedContractSignature,
          mortgageRegistration: savedMortgageRegistration,
          loanDisbursement: savedDisbursement,
          loan: updatedLoan,
          repaymentSchedule,
          analysisReportSummary: approvalConditions,
          approvedReportId: approvedReport.reportId,
          netAmountPayable,
          actualDisbursedAmount: netAmountPayable,
          calculatedValues: {
            totalInstallments: totalNumberOfInstallments,
            totalInterest: loanAmounts.totalInterest,
            monthlyInstallment: loanAmounts.installmentAmount
          }
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Three-step disbursement error:', error);
      return {
        success: false,
        message: error.message || "Failed to complete three-step disbursement"
      };
    } finally {
      await queryRunner.release();
    }
  }

  // Helper method to normalize repayment frequency to enum value
  private normalizeRepaymentFrequency(frequency: string): RepaymentFrequency {
    if (!frequency) {
      return RepaymentFrequency.MONTHLY; // Default
    }

    const normalized = frequency.toLowerCase().trim();
    
    switch (normalized) {
      case 'daily':
        return RepaymentFrequency.DAILY;
      case 'weekly':
        return RepaymentFrequency.WEEKLY;
      case 'biweekly':
      case 'bi-weekly':
      case 'bi weekly':
        return RepaymentFrequency.BIWEEKLY;
      case 'monthly':
        return RepaymentFrequency.MONTHLY;
      case 'quarterly':
        return RepaymentFrequency.QUARTERLY;
      case 'semi_annually':
      case 'semi-annually':
      case 'semi annually':
      case 'semiannually':
        return RepaymentFrequency.SEMI_ANNUALLY;
      case 'annually':
        return RepaymentFrequency.ANNUALLY;
      default:
        console.warn(`Unknown repayment frequency: "${frequency}", defaulting to MONTHLY`);
        return RepaymentFrequency.MONTHLY;
    }
  }

  // Helper method to normalize interest method to enum value
  private normalizeInterestMethod(method: string): InterestMethod {
    if (!method) {
      return InterestMethod.FLAT; // Default
    }

    const normalized = method.toLowerCase().trim();
    
    if (normalized.includes('flat')) {
      return InterestMethod.FLAT;
    } else if (normalized.includes('reducing') || normalized.includes('balance')) {
      return InterestMethod.REDUCING_BALANCE;
    } else {
      console.warn(`Unknown interest method: "${method}", defaulting to FLAT`);
      return InterestMethod.FLAT;
    }
  }

  // Calculate total number of installments based on term and frequency
  private calculateTotalInstallments(termInMonths: number, frequency: RepaymentFrequency): number {
    switch (frequency) {
      case RepaymentFrequency.DAILY:
        return termInMonths * 30; // Approximate 30 days per month
      case RepaymentFrequency.WEEKLY:
        return Math.ceil(termInMonths * 4.345); // Average weeks per month
      case RepaymentFrequency.BIWEEKLY:
        return Math.ceil(termInMonths * 2.173); // Average biweeks per month
      case RepaymentFrequency.MONTHLY:
        return termInMonths;
      case RepaymentFrequency.QUARTERLY:
        return Math.ceil(termInMonths / 3);
      case RepaymentFrequency.SEMI_ANNUALLY:
        return Math.ceil(termInMonths / 6);
      case RepaymentFrequency.ANNUALLY:
        return Math.ceil(termInMonths / 12);
      default:
        return termInMonths; // Default to monthly
    }
  }

  // Calculate loan amounts for repayment schedule
  private calculateLoanAmounts(
    principal: number,
    annualInterestRate: number,
    termInMonths: number,
    frequency: RepaymentFrequency,
    interestMethod: InterestMethod
  ): {
    totalInterest: number;
    totalAmount: number;
    installmentAmount: number;
  } {
    const totalInstallments = this.calculateTotalInstallments(termInMonths, frequency);
    const periodicRate = this.getPeriodicRate(annualInterestRate, frequency);
    
    let totalInterest: number;
    let installmentAmount: number;
    
    if (interestMethod === InterestMethod.FLAT) {
      // Flat interest calculation
      totalInterest = principal * (annualInterestRate / 100) * (termInMonths / 12);
      installmentAmount = (principal + totalInterest) / totalInstallments;
    } else {
      // Reducing balance calculation (amortization)
      const monthlyRate = annualInterestRate / 100 / 12;
      const monthlyInstallment = (principal * monthlyRate * Math.pow(1 + monthlyRate, termInMonths)) / 
                                 (Math.pow(1 + monthlyRate, termInMonths) - 1);
      
      // Calculate total amount paid
      const totalAmount = monthlyInstallment * termInMonths;
      totalInterest = totalAmount - principal;
      installmentAmount = monthlyInstallment;
    }
    
    const totalAmount = principal + totalInterest;
    
    return {
      totalInterest: Number(totalInterest.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2)),
      installmentAmount: Number(installmentAmount.toFixed(2))
    };
  }

  // Calculate first payment date based on disbursement date and frequency
  private calculateFirstPaymentDate(disbursementDate: Date, frequency: RepaymentFrequency): Date {
    const firstPaymentDate = new Date(disbursementDate);
    
    switch (frequency) {
      case RepaymentFrequency.DAILY:
        firstPaymentDate.setDate(firstPaymentDate.getDate() + 1);
        break;
      case RepaymentFrequency.WEEKLY:
        firstPaymentDate.setDate(firstPaymentDate.getDate() + 7);
        break;
      case RepaymentFrequency.BIWEEKLY:
        firstPaymentDate.setDate(firstPaymentDate.getDate() + 14);
        break;
      case RepaymentFrequency.MONTHLY:
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
        break;
      case RepaymentFrequency.QUARTERLY:
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 3);
        break;
      case RepaymentFrequency.SEMI_ANNUALLY:
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 6);
        break;
      case RepaymentFrequency.ANNUALLY:
        firstPaymentDate.setFullYear(firstPaymentDate.getFullYear() + 1);
        break;
      default:
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1); // Default to monthly
    }
    
    return firstPaymentDate;
  }

  // Generate repayment schedule with proper type safety and null checks
  private generateRepaymentSchedule(loan: Loan): RepaymentSchedule[] {
    const schedule: RepaymentSchedule[] = [];
    
    // CRITICAL FIX: Use the actual disbursed amount (netAmountPayable)
    const principal = loan.disbursedAmount;
    const totalTerms = loan.totalNumberOfInstallments;
    const annualInterestRate = loan.annualInterestRate;
    const agreedFirstPaymentDate = loan.agreedFirstPaymentDate;
    const repaymentFrequency = loan.repaymentFrequency;
    const interestMethod = loan.interestMethod;
    
    // Add comprehensive null checks with meaningful error messages
    if (!principal || principal <= 0) {
      throw new Error("Loan disbursed amount is invalid or not set");
    }
    
    if (!totalTerms || totalTerms <= 0) {
      throw new Error(`Total number of installments is invalid: ${totalTerms}`);
    }
    
    if (!annualInterestRate || annualInterestRate <= 0) {
      throw new Error("Annual interest rate is invalid");
    }
    
    if (!agreedFirstPaymentDate) {
      throw new Error("First payment date is not set");
    }
    
    if (!repaymentFrequency) {
      throw new Error("Repayment frequency is not set");
    }
    
    if (!interestMethod) {
      throw new Error("Interest method is not set");
    }
    
    console.log('🔹 Generating repayment schedule with:', {
      principal,
      totalTerms,
      annualInterestRate,
      repaymentFrequency,
      interestMethod,
      agreedFirstPaymentDate,
      netAmountPayableUsed: principal
    });
    
    let remainingPrincipal = principal;
    const periodicRate = this.getPeriodicRate(annualInterestRate, repaymentFrequency);

    for (let i = 1; i <= totalTerms; i++) {
      const dueDate = this.calculateInstallmentDueDate(
        agreedFirstPaymentDate,
        i,
        repaymentFrequency
      );

      let duePrincipal: number;
      let dueInterest: number;

      if (interestMethod === InterestMethod.FLAT) {
        duePrincipal = principal / totalTerms;
        dueInterest = (loan.totalInterestAmount || 0) / totalTerms;
        remainingPrincipal -= duePrincipal;
      } else {
        dueInterest = remainingPrincipal * periodicRate;
        duePrincipal = (loan.monthlyInstallmentAmount || 0) - dueInterest;
        remainingPrincipal -= duePrincipal;
      }

      // Adjust for rounding errors on last installment
      if (i === totalTerms) {
        duePrincipal += remainingPrincipal;
        remainingPrincipal = 0;
      }

      remainingPrincipal = Math.max(0, Math.round(remainingPrincipal * 100) / 100);

      const installment = new RepaymentSchedule();
      installment.loanId = loan.id;
      installment.installmentNumber = i;
      installment.dueDate = dueDate;
      installment.duePrincipal = Math.round(duePrincipal * 100) / 100;
      installment.dueInterest = Math.round(dueInterest * 100) / 100;
      installment.dueTotal = Math.round((duePrincipal + dueInterest) * 100) / 100;
      installment.outstandingPrincipal = remainingPrincipal;
      installment.status = ScheduleStatus.PENDING;
      installment.paidPrincipal = 0;
      installment.paidInterest = 0;
      installment.paidTotal = 0;
      installment.outstandingInterest = installment.dueInterest;
      installment.penaltyAmount = 0;
      installment.daysOverdue = 0;
      installment.isPaid = false;
      installment.paymentStatus = PaymentStatus.PENDING;
      installment.delayedDays = 0;
      installment.actualPaymentDate = null;
      installment.paidDate = null;
      installment.paidTimestamp = null;
      installment.lastPaymentAttempt = null;
      installment.paymentAttemptCount = 0;
      installment.notes = null;

      schedule.push(installment);
    }

    console.log('✓ Repayment schedule generated successfully');
    return schedule;
  }

  private getPeriodicRate(annualRate: number, frequency: RepaymentFrequency): number {
    const periodsPerYear: Record<RepaymentFrequency, number> = {
      [RepaymentFrequency.DAILY]: 365,
      [RepaymentFrequency.WEEKLY]: 52,
      [RepaymentFrequency.BIWEEKLY]: 26,
      [RepaymentFrequency.MONTHLY]: 12,
      [RepaymentFrequency.QUARTERLY]: 4,
      [RepaymentFrequency.SEMI_ANNUALLY]: 2,
      [RepaymentFrequency.ANNUALLY]: 1
    };
    
    const periods = periodsPerYear[frequency] || 12;
    return annualRate / 100 / periods;
  }

  private calculateInstallmentDueDate(
    firstPaymentDate: Date, 
    installmentNumber: number, 
    frequency: RepaymentFrequency
  ): Date {
    const dueDate = new Date(firstPaymentDate);

    switch (frequency) {
      case RepaymentFrequency.DAILY:
        dueDate.setDate(dueDate.getDate() + (installmentNumber - 1));
        break;
      case RepaymentFrequency.WEEKLY:
        dueDate.setDate(dueDate.getDate() + (installmentNumber - 1) * 7);
        break;
      case RepaymentFrequency.BIWEEKLY:
        dueDate.setDate(dueDate.getDate() + (installmentNumber - 1) * 14);
        break;
      case RepaymentFrequency.MONTHLY:
        dueDate.setMonth(dueDate.getMonth() + (installmentNumber - 1));
        break;
      case RepaymentFrequency.QUARTERLY:
        dueDate.setMonth(dueDate.getMonth() + (installmentNumber - 1) * 3);
        break;
      case RepaymentFrequency.SEMI_ANNUALLY:
        dueDate.setMonth(dueDate.getMonth() + (installmentNumber - 1) * 6);
        break;
      case RepaymentFrequency.ANNUALLY:
        dueDate.setFullYear(dueDate.getFullYear() + (installmentNumber - 1));
        break;
      default:
        // Fallback to monthly
        dueDate.setMonth(dueDate.getMonth() + (installmentNumber - 1));
        break;
    }

    return dueDate;
  }
}

export default new LoanDisbursementService();