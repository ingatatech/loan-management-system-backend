
// @ts-nocheck
import { Repository } from "typeorm";
import dbConnection from "../db";
import {
  Loan,
  LoanStatus,
  InterestMethod,
  RepaymentFrequency,
  RepaymentModality,
  CustomScheduleItem,
} from "../entities/Loan";
import { LoanAnalysisReport } from "../entities/LoanAnalysisReport";
import { ClientBorrowerAccount } from "../entities/ClientBorrowerAccount";
import { ContractSignature } from "../entities/ContractSignature";
import { MortgageRegistration } from "../entities/MortgageRegistration";
import { LoanDisbursement } from "../entities/LoanDisbursement";
import {
  RepaymentSchedule,
  ScheduleStatus,
  PaymentStatus,
} from "../entities/RepaymentSchedule";
import { UploadToCloud } from "../helpers/cloud";

const VAT_RATE = 0.18; // 18% VAT

// ✅ FIX: Added interestMethod to the request interface
interface ThreeStepDisbursementRequest {
  borrowerAccountNumber: string;
  notaryName: string;
  notarizationDate: string;
  notaryLicenceNumber: string;
  notaryTelephone: string;
  addressDistrict: string;
  addressSector: string;
  notarisedContractFile: Express.Multer.File;
  notarisedAOMAFile: Express.Multer.File;
  rdbFeesFile: Express.Multer.File;
  mortgageRegistrationCertificate?: Express.Multer.File;
  commissionRate: number;
  insurancePolicyFees?: number;
  fireInsurancePolicyFees?: number;
  otherFees?: number;
  proofOfDisbursementFile: Express.Multer.File;
  repaymentModality?: RepaymentModality;
  singlePaymentMonths?: number;
  customSchedule?: CustomScheduleItem[];
  paymentFrequency?: string;
  // ✅ NEW: interestMethod sent from frontend UI selector
  interestMethod?: string;
}

interface ServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
}

export class UpdatedLoanDisbursementService {
  private loanRepository: Repository<Loan>;
  private analysisReportRepository: Repository<LoanAnalysisReport>;
  private clientAccountRepository: Repository<ClientBorrowerAccount>;
  private contractSignatureRepository: Repository<ContractSignature>;
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

  async createThreeStepDisbursement(
    data: ThreeStepDisbursementRequest,
    organizationId: number,
    createdBy: number
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // ===== STEP 1: FIND CLIENT ACCOUNT AND VALIDATE =====
      const clientAccount = await queryRunner.manager.findOne(
        ClientBorrowerAccount,
        {
          where: { accountNumber: data.borrowerAccountNumber, organizationId },
          relations: ["loans", "loans.analysisReports", "borrower"],
        }
      );

      if (!clientAccount) {
        throw new Error("Client account not found");
      }

      // ===== FIX: Find loan by ID directly if provided, otherwise use account's loans =====
      let targetLoan: Loan | null = null;
      const requestedLoanId = data.loanId ? parseInt(data.loanId.toString()) : null;

      if (requestedLoanId) {
        // Find loan directly by ID and organizationId
        targetLoan = await queryRunner.manager.findOne(Loan, {
          where: { id: requestedLoanId, organizationId },
          relations: ["analysisReports", "borrower"]
        });
        
        if (!targetLoan) {
          throw new Error(`Loan with ID ${requestedLoanId} not found`);
        }
      } else if (clientAccount.loans && clientAccount.loans.length > 0) {
        // Fallback to account's loans if no loanId provided
        const sortedLoans = clientAccount.loans.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        targetLoan = sortedLoans[0];
      }

      if (!targetLoan) {
        throw new Error("No loan found for this client account");
      }

      // Delete existing schedules to regenerate fresh
      const existingSchedules = await queryRunner.manager.find(
        RepaymentSchedule,
        { where: { loanId: targetLoan.id } }
      );

      if (existingSchedules.length > 0) {
        await queryRunner.manager.delete(RepaymentSchedule, {
          loanId: targetLoan.id,
        });
      }

      // ===== RESOLVE APPROVAL CONDITIONS WITH CORRECT PRIORITY =====
      let approvedReport = null;
      let approvalConditions = null;

      if (
        targetLoan.analysisReports &&
        targetLoan.analysisReports.length > 0
      ) {
        approvedReport = targetLoan.analysisReports.find(
          (report) => report.reportType === "approve" && report.isFinalized
        );
        if (!approvedReport) {
          approvedReport = targetLoan.analysisReports.find(
            (report) => report.reportType === "approve"
          );
        }
        if (!approvedReport) {
          approvedReport = targetLoan.analysisReports[0];
        }
        approvalConditions = approvedReport?.approvalConditions;
      }

      // ✅ CRITICAL FIX: Use frontend repaymentPeriod if available, otherwise fall back
      // Priority: 1. Frontend data.repaymentPeriod, 2. approvalConditions, 3. loan entity, 4. default 12
      const termInMonths = data.repaymentPeriod || 
                           approvalConditions?.repaymentPeriod || 
                           targetLoan.termInMonths || 
                           12;

      if (!approvalConditions) {
        approvalConditions = {
          approvedAmount: parseFloat(targetLoan.disbursedAmount) || 0,
          interestRate: parseFloat(targetLoan.annualInterestRate) || 8.5,
          paymentModality: targetLoan.preferredPaymentFrequency || "monthly",
          repaymentPeriod: termInMonths, // ✅ Use corrected value
          repaymentPeriodUnit: data.repaymentPeriodUnit || "months",
          interestMethod: targetLoan.interestMethod || "flat",
          gracePeriodMonths: targetLoan.gracePeriodMonths || 0,
          singlePaymentMonths: targetLoan.singlePaymentMonths,
          customSchedule: targetLoan.customRepaymentSchedule,
        };

        if (
          !approvalConditions.approvedAmount ||
          approvalConditions.approvedAmount <= 0
        ) {
          const requestedAmount =
            parseFloat(targetLoan.disbursedAmount) ||
            parseFloat(targetLoan.requestedAmount) ||
            0;
          if (requestedAmount > 0) {
            approvalConditions.approvedAmount = requestedAmount;
          }
        }
      } else {
        // ✅ Override with frontend value if provided
        if (data.repaymentPeriod) {
          approvalConditions.repaymentPeriod = data.repaymentPeriod;
        }
        if (data.repaymentPeriodUnit) {
          approvalConditions.repaymentPeriodUnit = data.repaymentPeriodUnit;
        }
      }

      if (
        !approvalConditions.approvedAmount ||
        approvalConditions.approvedAmount <= 0
      ) {
        throw new Error(
          "Approved amount is invalid or not set. Cannot proceed with disbursement."
        );
      }

      // ===== STEP 2: CONTRACT SIGNATURE =====
      const contractFileUpload = await UploadToCloud(data.notarisedContractFile);

      const contractSignature = queryRunner.manager.create(ContractSignature, {
        borrowerAccountNumber: data.borrowerAccountNumber,
        loanId: targetLoan.id,
        loanApplicationNumber: targetLoan.loanId,
        notaryName: data.notaryName,
        notarizationDate: new Date(data.notarizationDate),
        notaryLicenceNumber: data.notaryLicenceNumber,
        notaryTelephone: data.notaryTelephone,
        addressDistrict: data.addressDistrict,
        addressSector: data.addressSector,
        notarisedContractFileUrl: contractFileUpload.secure_url,
        organizationId,
        createdBy,
      });

      const savedContractSignature = await queryRunner.manager.save(
        ContractSignature,
        contractSignature
      );

      // ===== STEP 3: MORTGAGE REGISTRATION =====
      const aomaFileUpload = await UploadToCloud(data.notarisedAOMAFile);
      const rdbFeesUpload = await UploadToCloud(data.rdbFeesFile);

      let mortgageCertificateUrl = null;
      if (data.mortgageRegistrationCertificate) {
        const mortgageCertificateUpload = await UploadToCloud(
          data.mortgageRegistrationCertificate
        );
        mortgageCertificateUrl = mortgageCertificateUpload.secure_url;
      }

      const mortgageRegistration = queryRunner.manager.create(
        MortgageRegistration,
        {
          borrowerAccountNumber: data.borrowerAccountNumber,
          loanId: targetLoan.id,
          loanApplicationNumber: targetLoan.loanId,
          notarisedAOMAFileUrl: aomaFileUpload.secure_url,
          rdbFeesFileUrl: rdbFeesUpload.secure_url,
          mortgageRegistrationCertificateUrl: mortgageCertificateUrl,
          organizationId,
          createdBy,
        }
      );

      const savedMortgageRegistration = await queryRunner.manager.save(
        MortgageRegistration,
        mortgageRegistration
      );

      // ===== STEP 4: DISBURSEMENT FINANCIALS =====
      const commissionRate = data.commissionRate;
      const approvedAmount = approvalConditions.approvedAmount;

      const commissionAmount = (commissionRate * approvedAmount) / 100;
      const vatAmount = commissionAmount * VAT_RATE;
      const totalCommissionWithVAT = commissionAmount + vatAmount;

      const insurancePolicyFees = data.insurancePolicyFees || 0;
      const fireInsurancePolicyFees = data.fireInsurancePolicyFees || 0;
      const totalInsuranceFees = insurancePolicyFees + fireInsurancePolicyFees;
      const otherFees = data.otherFees || 0;

      const netAmountPayable =
        approvedAmount -
        totalCommissionWithVAT -
        totalInsuranceFees -
        otherFees;

      if (netAmountPayable <= 0) {
        throw new Error(
          "Net amount payable cannot be zero or negative. Total deductions exceed approved amount."
        );
      }

      const proofFileUpload = await UploadToCloud(data.proofOfDisbursementFile);

      const disbursement = queryRunner.manager.create(LoanDisbursement, {
        borrowerAccountNumber: data.borrowerAccountNumber,
        loanId: targetLoan.id,
        applicationNumber: targetLoan.loanId,
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
        createdBy,
      });

      const savedDisbursement = await queryRunner.manager.save(
        LoanDisbursement,
        disbursement
      );

      // ===== REPAYMENT SCHEDULE GENERATION =====
      const repaymentModality =
        data.repaymentModality ||
        approvalConditions?.repaymentModality ||
        "multiple_with_interest";

      const singlePaymentMonths =
        data.singlePaymentMonths !== undefined
          ? data.singlePaymentMonths
          : approvalConditions?.singlePaymentMonths;

      const customSchedule =
        data.customSchedule || approvalConditions?.customSchedule;

      const paymentFrequency = this.normalizeRepaymentFrequency(
        data.paymentFrequency || approvalConditions.paymentModality
      );

      // ✅ FIX: For customized schedule, don't use interestMethod from frontend
      // For other modalities, use frontend interestMethod if provided
      let rawInterestMethod: string;
      
      if (repaymentModality === "customized") {
        // For custom schedule, use existing loan/approval data, ignore frontend interestMethod
        rawInterestMethod =
          approvalConditions?.interestMethod ||
          targetLoan.interestMethod ||
          "flat";
      } else {
        // For standard schedules, prioritize frontend selection
        rawInterestMethod =
          data.interestMethod ||
          approvalConditions?.interestMethod ||
          targetLoan.interestMethod ||
          "flat";
      }

      const interestMethod = this.normalizeInterestMethod(rawInterestMethod);

      // ✅ Use the resolved term consistently
      const resolvedTermInMonths = approvalConditions.repaymentPeriod;
      const totalNumberOfInstallments = this.calculateTotalInstallments(
        resolvedTermInMonths,
        paymentFrequency
      );

      const today = new Date();
      const firstPaymentDate = this.calculateFirstPaymentDate(
        today,
        paymentFrequency
      );

      const loanAmounts = this.calculateLoanAmounts(
        approvedAmount,
        approvalConditions.interestRate,
        resolvedTermInMonths,
        paymentFrequency,
        interestMethod // ✅ FIX: pass the resolved interestMethod
      );

      // ✅ FIX: Update loan with the resolved interestMethod so schedule generation
      // uses the exact same method that was selected on the frontend
      await queryRunner.manager.update(Loan, targetLoan.id, {
        disbursedAmount: approvedAmount,
        termInMonths: resolvedTermInMonths, // ✅ Store the CORRECT term
        repaymentFrequency: paymentFrequency,
        annualInterestRate: approvalConditions.interestRate,
        interestMethod: interestMethod, // ✅ FIX: store the actual method used
        gracePeriodMonths: approvalConditions.gracePeriodMonths || 0,
        disbursementDate: today,
        totalNumberOfInstallments: totalNumberOfInstallments,
        totalInterestAmount: loanAmounts.totalInterest,
        totalAmountToBeRepaid: loanAmounts.totalAmount,
        monthlyInstallmentAmount: loanAmounts.installmentAmount,
        outstandingPrincipal: approvedAmount,
        accruedInterestToDate: 0,
        daysInArrears: 0,
        agreedFirstPaymentDate: firstPaymentDate,
        repaymentModality: repaymentModality as RepaymentModality,
        singlePaymentMonths: singlePaymentMonths,
        customRepaymentSchedule: customSchedule || null,
        isManualSchedule: repaymentModality === "customized",
        status: LoanStatus.DISBURSED,
      });

      const updatedLoan = await queryRunner.manager.findOne(Loan, {
        where: { id: targetLoan.id },
      });

      if (!updatedLoan) {
        throw new Error("Failed to reload loan");
      }

      const repaymentSchedule =
        await this.generateRepaymentScheduleByModality(
          updatedLoan,
          repaymentModality,
          customSchedule,
          singlePaymentMonths
        );

      await queryRunner.manager.save(RepaymentSchedule, repaymentSchedule);

      await queryRunner.commitTransaction();

      return {
        success: true,
        message: "Loan disbursement completed successfully",
        data: {
          clientAccount,
          contractSignature: savedContractSignature,
          mortgageRegistration: savedMortgageRegistration,
          loanDisbursement: savedDisbursement,
          loan: updatedLoan,
          repaymentSchedule,
          analysisReportSummary: approvalConditions,
          approvedReportId: approvedReport?.reportId || null,
          netAmountPayable,
          actualDisbursedAmount: netAmountPayable,
          repaymentBasedOnAmount: approvedAmount,
          calculatedValues: {
            totalInstallments: totalNumberOfInstallments,
            totalInterest: loanAmounts.totalInterest,
            monthlyInstallment: loanAmounts.installmentAmount,
            principalForRepayment: approvedAmount,
            firstPaymentDate: firstPaymentDate,
            repaymentModality: repaymentModality,
            interestMethod: interestMethod, // ✅ FIX: return the method used for transparency
          },
        },
      };
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      return {
        success: false,
        message:
          error.message || "Failed to complete three-step disbursement",
      };
    } finally {
      await queryRunner.release();
    }
  }

  // ===================================================================
  // SCHEDULE GENERATION BY MODALITY
  // ===================================================================

  private async generateRepaymentScheduleByModality(
    loan: Loan,
    modality: string,
    customSchedule?: any[],
    singlePaymentMonths?: number
  ): Promise<RepaymentSchedule[]> {
    const today = new Date();
    const firstPaymentDate = this.calculateFirstPaymentDate(
      today,
      loan.repaymentFrequency!
    );

    switch (modality) {
      case "single":
        return this.generateSinglePaymentSchedule(
          loan,
          singlePaymentMonths,
          firstPaymentDate
        );

      case "multiple_only_interest":
        return this.generateInterestOnlySchedule(loan, firstPaymentDate);

      case "customized":
        if (!customSchedule || customSchedule.length === 0) {
          throw new Error(
            "Custom schedule is required for customized repayment modality"
          );
        }
        return this.generateCustomizedSchedule(
          loan,
          customSchedule,
          firstPaymentDate
        );

      case "multiple_with_interest":
      default:
        return this.generateRepaymentSchedule(loan, firstPaymentDate);
    }
  }

  // -------------------------------------------------------------------
  // SINGLE PAYMENT
  // -------------------------------------------------------------------
  private generateSinglePaymentSchedule(
    loan: Loan,
    singlePaymentMonths?: number,
    firstPaymentDate?: Date
  ): RepaymentSchedule[] {
    const principal = loan.disbursedAmount;
    const annualRate = loan.annualInterestRate || 0;
    const months = singlePaymentMonths || loan.termInMonths || 12;

    // Simple interest for single payment
    const totalInterest = principal * (annualRate / 100) * (months / 12);
    const totalAmount = principal + totalInterest;

    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + months);

    const installment = new RepaymentSchedule();
    installment.loanId = loan.id;
    installment.installmentNumber = 1;
    installment.dueDate = dueDate;
    installment.duePrincipal = Math.round(principal * 100) / 100;
    installment.dueInterest = Math.round(totalInterest * 100) / 100;
    installment.dueTotal = Math.round(totalAmount * 100) / 100;
    installment.outstandingPrincipal = 0;
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
    installment.notes = `Single payment due in ${months} months - Total: ${totalAmount.toFixed(2)}`;

    return [installment];
  }

  // -------------------------------------------------------------------
  // INTEREST-ONLY (balloon)
  // -------------------------------------------------------------------
  private generateInterestOnlySchedule(
    loan: Loan,
    firstPaymentDate: Date
  ): RepaymentSchedule[] {
    const schedule: RepaymentSchedule[] = [];
    const principal = loan.disbursedAmount;
    const totalTerms = loan.totalNumberOfInstallments || 12;
    const periodicRate = this.getPeriodicRate(
      loan.annualInterestRate || 0,
      loan.repaymentFrequency!
    );
    const periodicInterest = principal * periodicRate;

    // Interest-only installments (all except last)
    for (let i = 1; i < totalTerms; i++) {
      const dueDate = this.calculateInstallmentDueDate(
        firstPaymentDate,
        i,
        loan.repaymentFrequency!
      );

      const installment = new RepaymentSchedule();
      installment.loanId = loan.id;
      installment.installmentNumber = i;
      installment.dueDate = dueDate;
      installment.duePrincipal = 0;
      installment.dueInterest = Math.round(periodicInterest * 100) / 100;
      installment.dueTotal = installment.dueInterest;
      installment.outstandingPrincipal = principal;
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
      installment.notes = "Interest-only payment";

      schedule.push(installment);
    }

    // Final balloon payment: principal + last interest
    const finalDueDate = this.calculateInstallmentDueDate(
      firstPaymentDate,
      totalTerms,
      loan.repaymentFrequency!
    );

    const finalInstallment = new RepaymentSchedule();
    finalInstallment.loanId = loan.id;
    finalInstallment.installmentNumber = totalTerms;
    finalInstallment.dueDate = finalDueDate;
    finalInstallment.duePrincipal = Math.round(principal * 100) / 100;
    finalInstallment.dueInterest = Math.round(periodicInterest * 100) / 100;
    finalInstallment.dueTotal =
      Math.round((principal + periodicInterest) * 100) / 100;
    finalInstallment.outstandingPrincipal = 0;
    finalInstallment.status = ScheduleStatus.PENDING;
    finalInstallment.paidPrincipal = 0;
    finalInstallment.paidInterest = 0;
    finalInstallment.paidTotal = 0;
    finalInstallment.outstandingInterest = finalInstallment.dueInterest;
    finalInstallment.penaltyAmount = 0;
    finalInstallment.daysOverdue = 0;
    finalInstallment.isPaid = false;
    finalInstallment.paymentStatus = PaymentStatus.PENDING;
    finalInstallment.delayedDays = 0;
    finalInstallment.actualPaymentDate = null;
    finalInstallment.paidDate = null;
    finalInstallment.paidTimestamp = null;
    finalInstallment.lastPaymentAttempt = null;
    finalInstallment.paymentAttemptCount = 0;
    finalInstallment.notes = "Final payment: Principal + Interest";

    schedule.push(finalInstallment);

    return schedule;
  }

  // -------------------------------------------------------------------
  // CUSTOMIZED SCHEDULE
  // -------------------------------------------------------------------
  private generateCustomizedSchedule(
    loan: Loan,
    customSchedule: CustomScheduleItem[],
    firstPaymentDate: Date
  ): RepaymentSchedule[] {
    const principal = loan.disbursedAmount;
    const schedule: RepaymentSchedule[] = [];
    let remainingPrincipal = principal;

    customSchedule.forEach((item, index) => {
      // ✅ FIX: Use frontend-provided principal/interest directly
      // Frontend sends exact breakdown, no need for fallback calculation
      const principalPortion = item.principal || 0;
      const interestPortion = item.interest || 0;

      let dueDate: Date;
      if (item.dueDate) {
        dueDate = new Date(item.dueDate);
      } else {
        dueDate = this.calculateInstallmentDueDate(
          firstPaymentDate,
          item.installmentNumber,
          loan.repaymentFrequency!
        );
      }

      const installment = new RepaymentSchedule();
      installment.loanId = loan.id;
      installment.installmentNumber = item.installmentNumber;
      installment.dueDate = dueDate;
      installment.duePrincipal = Math.round(principalPortion * 100) / 100;
      installment.dueInterest = Math.round(interestPortion * 100) / 100;
      installment.dueTotal = Math.round(item.amount * 100) / 100;

      remainingPrincipal -= principalPortion;
      installment.outstandingPrincipal =
        Math.round(Math.max(0, remainingPrincipal) * 100) / 100;

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
      installment.notes = item.notes || "Customized payment";

      schedule.push(installment);
    });

    return schedule;
  }

  // -------------------------------------------------------------------
  // STANDARD AMORTIZATION — supports both FLAT and REDUCING_BALANCE
  // -------------------------------------------------------------------
  private generateRepaymentSchedule(
    loan: Loan,
    firstPaymentDate: Date
  ): RepaymentSchedule[] {
    const schedule: RepaymentSchedule[] = [];

    const principal = loan.disbursedAmount;
    const totalTerms = loan.totalNumberOfInstallments;
    const annualInterestRate = loan.annualInterestRate;
    const repaymentFrequency = loan.repaymentFrequency;
    const interestMethod = loan.interestMethod;

    if (!principal || principal <= 0)
      throw new Error("Loan disbursed amount is invalid or not set");
    if (!totalTerms || totalTerms <= 0)
      throw new Error(`Total number of installments is invalid: ${totalTerms}`);
    if (!annualInterestRate || annualInterestRate <= 0)
      throw new Error("Annual interest rate is invalid");
    if (!repaymentFrequency)
      throw new Error("Repayment frequency is not set");
    if (!interestMethod)
      throw new Error("Interest method is not set");

    let remainingPrincipal = principal;
    const periodicRate = this.getPeriodicRate(
      annualInterestRate,
      repaymentFrequency
    );

    // ✅ FIX: Pre-calculate PMT for reducing balance (used each period)
    const pmtAmount =
      interestMethod === InterestMethod.REDUCING_BALANCE
        ? (principal *
            (periodicRate * Math.pow(1 + periodicRate, totalTerms))) /
          (Math.pow(1 + periodicRate, totalTerms) - 1)
        : 0; // not used for flat

    for (let i = 1; i <= totalTerms; i++) {
      const dueDate = this.calculateInstallmentDueDate(
        firstPaymentDate,
        i,
        repaymentFrequency
      );

      let duePrincipal: number;
      let dueInterest: number;

      if (interestMethod === InterestMethod.FLAT) {
        // ✅ FLAT: equal principal + equal interest every period
        duePrincipal = principal / totalTerms;
        dueInterest = (loan.totalInterestAmount || 0) / totalTerms;
        remainingPrincipal -= duePrincipal;
      } else {
        // ✅ REDUCING_BALANCE: interest on remaining balance, PMT is constant
        dueInterest = remainingPrincipal * periodicRate;
        duePrincipal = pmtAmount - dueInterest;
        remainingPrincipal -= duePrincipal;
      }

      // Last installment: absorb any floating-point rounding residual
      if (i === totalTerms) {
        duePrincipal += remainingPrincipal;
        remainingPrincipal = 0;
      }

      remainingPrincipal = Math.max(
        0,
        Math.round(remainingPrincipal * 100) / 100
      );

      const installment = new RepaymentSchedule();
      installment.loanId = loan.id;
      installment.installmentNumber = i;
      installment.dueDate = dueDate;
      installment.duePrincipal = Math.round(duePrincipal * 100) / 100;
      installment.dueInterest = Math.round(dueInterest * 100) / 100;
      installment.dueTotal =
        Math.round((duePrincipal + dueInterest) * 100) / 100;
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

    return schedule;
  }

  // ===================================================================
  // HELPER METHODS
  // ===================================================================

  private normalizeRepaymentFrequency(
    frequency: string
  ): RepaymentFrequency {
    if (!frequency) return RepaymentFrequency.MONTHLY;
    const normalized = frequency.toLowerCase().trim();

    switch (normalized) {
      case "daily":
        return RepaymentFrequency.DAILY;
      case "weekly":
        return RepaymentFrequency.WEEKLY;
      case "biweekly":
      case "bi-weekly":
      case "bi weekly":
        return RepaymentFrequency.BIWEEKLY;
      case "monthly":
        return RepaymentFrequency.MONTHLY;
      case "quarterly":
        return RepaymentFrequency.QUARTERLY;
      case "semi_annually":
      case "semi-annually":
      case "semi annually":
      case "semiannually":
        return RepaymentFrequency.SEMI_ANNUALLY;
      case "annually":
        return RepaymentFrequency.ANNUALLY;
      default:
        return RepaymentFrequency.MONTHLY;
    }
  }

  // ✅ FIX: normalizeInterestMethod now defaults to FLAT explicitly
  // and handles all common string variations from frontend
  private normalizeInterestMethod(
    method: string | undefined
  ): InterestMethod {
    if (!method) return InterestMethod.FLAT;
    const normalized = method.toLowerCase().trim();

    if (normalized.includes("reducing") || normalized.includes("balance")) {
      return InterestMethod.REDUCING_BALANCE;
    }
    // 'flat' | '' | undefined → FLAT
    return InterestMethod.FLAT;
  }


  private calculateTotalInstallments(
    termInMonths: number,
    frequency: RepaymentFrequency
  ): number {
    switch (frequency) {
      case RepaymentFrequency.DAILY:
        return termInMonths * 30; // Approximate daily payments
      
      case RepaymentFrequency.WEEKLY:
        return Math.ceil(termInMonths * 4.345); // Weeks in a month
      
      case RepaymentFrequency.BIWEEKLY:
        return Math.ceil(termInMonths * 2.173); // Bi-weekly periods in a month
      
      case RepaymentFrequency.MONTHLY:
        return termInMonths; // 1 per month
      
      case RepaymentFrequency.QUARTERLY:
        return Math.ceil(termInMonths / 4); // Every 4 months = 3 payments per year
      
      case RepaymentFrequency.SEMI_ANNUALLY:
        return Math.ceil(termInMonths / 6); // Every 6 months = 2 payments per year
      
      case RepaymentFrequency.ANNUALLY:
        return Math.ceil(termInMonths / 12); // Every 12 months = 1 payment per year
      
      default:
        return termInMonths; // Default to monthly
    }
  }

  private calculateLoanAmounts(
    principal: number,
    annualInterestRate: number,
    termInMonths: number,
    frequency: RepaymentFrequency,
    interestMethod: InterestMethod
  ): { totalInterest: number; totalAmount: number; installmentAmount: number } {
    const totalInstallments = this.calculateTotalInstallments(
      termInMonths,
      frequency
    );
    const periodicRate = this.getPeriodicRate(annualInterestRate, frequency);

    let totalInterest: number;
    let installmentAmount: number;

    if (interestMethod === InterestMethod.FLAT) {
      // ✅ FLAT: totalInterest based on full principal for full term
      totalInterest =
        principal * (annualInterestRate / 100) * (termInMonths / 12);
      installmentAmount = (principal + totalInterest) / totalInstallments;
    } else {
      // ✅ REDUCING_BALANCE: PMT formula, interest is less than flat
      const pmtAmount =
        (principal * (periodicRate * Math.pow(1 + periodicRate, totalInstallments))) /
        (Math.pow(1 + periodicRate, totalInstallments) - 1);

      const totalAmount = pmtAmount * totalInstallments;
      totalInterest = totalAmount - principal;
      installmentAmount = pmtAmount;
    }

    const totalAmount = principal + totalInterest;

    return {
      totalInterest: Number(totalInterest.toFixed(2)),
      totalAmount: Number(totalAmount.toFixed(2)),
      installmentAmount: Number(installmentAmount.toFixed(2)),
    };
  }

  private calculateFirstPaymentDate(
    disbursementDate: Date,
    frequency: RepaymentFrequency
  ): Date {
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
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 4); // Every 4 months
        break;
      case RepaymentFrequency.SEMI_ANNUALLY:
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 6); // Every 6 months
        break;
      case RepaymentFrequency.ANNUALLY:
        firstPaymentDate.setFullYear(firstPaymentDate.getFullYear() + 1); // Every 12 months
        break;
      default:
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
    }

    return firstPaymentDate;
  }

  private getPeriodicRate(
    annualRate: number,
    frequency: RepaymentFrequency
  ): number {
    const periodsPerYear: Record<RepaymentFrequency, number> = {
      [RepaymentFrequency.DAILY]: 365,
      [RepaymentFrequency.WEEKLY]: 52,
      [RepaymentFrequency.BIWEEKLY]: 26,
      [RepaymentFrequency.MONTHLY]: 12,
      [RepaymentFrequency.QUARTERLY]: 3, // 3 payments per year
      [RepaymentFrequency.SEMI_ANNUALLY]: 2, // 2 payments per year
      [RepaymentFrequency.ANNUALLY]: 1, // 1 payment per year
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
        dueDate.setMonth(dueDate.getMonth() + (installmentNumber - 1) * 4); // Every 4 months
        break;
      case RepaymentFrequency.SEMI_ANNUALLY:
        dueDate.setMonth(dueDate.getMonth() + (installmentNumber - 1) * 6); // Every 6 months
        break;
      case RepaymentFrequency.ANNUALLY:
        dueDate.setFullYear(dueDate.getFullYear() + (installmentNumber - 1)); // Every 12 months
        break;
      default:
        dueDate.setMonth(dueDate.getMonth() + (installmentNumber - 1));
        break;
    }

    return dueDate;
  }
}

export default new UpdatedLoanDisbursementService();