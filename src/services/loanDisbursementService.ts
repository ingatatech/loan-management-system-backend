
// @ts-nocheck

import { Repository } from "typeorm";
import dbConnection from "../db";
import { Loan, LoanStatus, InterestMethod, RepaymentFrequency, RepaymentModality, CustomScheduleItem } from "../entities/Loan";
import { LoanAnalysisReport } from "../entities/LoanAnalysisReport";
import { ClientBorrowerAccount } from "../entities/ClientBorrowerAccount";
import { ContractSignature } from "../entities/ContractSignature";
import { MortgageRegistration } from "../entities/MortgageRegistration";
import { LoanDisbursement } from "../entities/LoanDisbursement";
import { RepaymentSchedule, ScheduleStatus, PaymentStatus } from "../entities/RepaymentSchedule";
import { UploadToCloud } from "../helpers/cloud";

const VAT_RATE = 0.18; // 18% VAT

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
  // ✅ NEW: Repayment modality fields for Step 4
  repaymentModality?: RepaymentModality;
  singlePaymentMonths?: number;
  customSchedule?: CustomScheduleItem[];
  paymentFrequency?: string;
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

    console.log('=== THREE-STEP DISBURSEMENT START ===');

    // ===== STEP 1: FIND CLIENT ACCOUNT AND VALIDATE =====
    const clientAccount = await queryRunner.manager.findOne(ClientBorrowerAccount, {
      where: { accountNumber: data.borrowerAccountNumber, organizationId },
      relations: ['loans', 'loans.analysisReports', 'borrower']
    });

    if (!clientAccount) {
      throw new Error("Client account not found");
    }

    console.log(`📋 Client Account: ${clientAccount.accountNumber}`);
    console.log(`📊 Total Loans for this Account: ${clientAccount.loans?.length || 0}`);
    
    // ===== FIX 1: Handle multiple loans properly - NO STATUS RESTRICTIONS =====
    let targetLoan: Loan | null = null;
    
    if (clientAccount.loans && clientAccount.loans.length > 0) {
      // Log all loans for this account
      clientAccount.loans.forEach(loan => {
        console.log(`   - Loan ${loan.loanId}: Status=${loan.status}, ID=${loan.id}`);
      });
      
      // ✅ PRIORITY 1: If loanId provided in form data, use it to find the specific loan
      if (data.loanId) {
        console.log(`🎯 Form data specifies loanId: ${data.loanId}`);
        targetLoan = clientAccount.loans.find(loan => loan.id === data.loanId) || null;
        
        if (targetLoan) {
          console.log(`✅ Found loan by form loanId: ${targetLoan.loanId} (ID: ${targetLoan.id})`);
        } else {
          console.log(`⚠️ Loan ID ${data.loanId} not found in client account loans`);
        }
      }
      
      // ✅ PRIORITY 2: If no loanId specified or not found, use most recent loan
      if (!targetLoan) {
        const sortedLoans = clientAccount.loans.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        
        targetLoan = sortedLoans[0];
        console.log(`🎯 Selected most recent loan for disbursement`);
      }
    }

    if (!targetLoan) {
      throw new Error("No loan found for this client account");
    }

    console.log(`✅ Processing loan: ${targetLoan.loanId} (ID: ${targetLoan.id}, Status: ${targetLoan.status})`);

    // ===== FIX 2: Check if this specific loan already has repayment schedules =====
    const existingSchedules = await queryRunner.manager.find(RepaymentSchedule, {
      where: { 
        loanId: targetLoan.id
      }
    });

    if (existingSchedules.length > 0) {
      console.log(`⚠️ Found ${existingSchedules.length} existing repayment schedules for loan ${targetLoan.id}`);
      console.log('🗑️ Deleting existing schedules before creating new ones...');
      
      // Delete existing schedules
      await queryRunner.manager.delete(RepaymentSchedule, {
        loanId: targetLoan.id
      });
      
      console.log('✅ Existing schedules deleted');
    }

    // ===== STEP 2: GET APPROVAL CONDITIONS =====
    console.log('🔍 Checking for approved analysis report...');

    let approvedReport = null;
    let approvalConditions = null;
    
    if (!targetLoan.analysisReports || targetLoan.analysisReports.length === 0) {
      console.warn('⚠️ No analysis reports found for this loan. Using loan data as fallback.');
    } else {
      approvedReport = targetLoan.analysisReports.find(
        report => report.reportType === 'approve' && report.isFinalized
      );
      
      if (!approvedReport) {
        approvedReport = targetLoan.analysisReports.find(
          report => report.reportType === 'approve'
        );
      }
      
      if (!approvedReport) {
        approvedReport = targetLoan.analysisReports[0];
        console.log(`⚠️ No approved report found. Using first available report: ${approvedReport.reportId}`);
      }
      
      approvalConditions = approvedReport?.approvalConditions;
    }

    if (!approvalConditions) {
      console.warn('⚠️ No approval conditions found. Using loan data as fallback for approval conditions.');
      approvalConditions = {
        approvedAmount: parseFloat(targetLoan.disbursedAmount) || 0,
        interestRate: parseFloat(targetLoan.annualInterestRate) || 8.5,
        paymentModality: targetLoan.preferredPaymentFrequency || 'monthly',
        repaymentPeriod: targetLoan.termInMonths || 12,
        repaymentPeriodUnit: 'months',
        interestMethod: targetLoan.interestMethod || 'flat',
        gracePeriodMonths: targetLoan.gracePeriodMonths || 0,
        singlePaymentMonths: targetLoan.singlePaymentMonths,
        customSchedule: targetLoan.customRepaymentSchedule
      };
      
      if (!approvalConditions.approvedAmount || approvalConditions.approvedAmount <= 0) {
        const requestedAmount = parseFloat(targetLoan.disbursedAmount) || parseFloat(targetLoan.requestedAmount) || 0;
        if (requestedAmount > 0) {
          approvalConditions.approvedAmount = requestedAmount;
        }
      }
    }

    if (!approvalConditions.approvedAmount || approvalConditions.approvedAmount <= 0) {
      throw new Error("Approved amount is invalid or not set. Cannot proceed with disbursement.");
    }

    if (approvedReport) {
      console.log('✓ Found analysis report:', approvedReport.reportId);
    } else {
      console.log('✓ Proceeding without approved analysis report');
    }

    console.log('✓ Auto-filled data from client account and analysis report');

    // STEP 2: CONTRACT SIGNATURE
    console.log('🔹 STEP 2: Creating contract signature');

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
      createdBy
    });

    const savedContractSignature = await queryRunner.manager.save(ContractSignature, contractSignature);
    console.log('✓ Contract signature created');

    console.log('🔹 STEP 3: Creating mortgage registration');

    const aomaFileUpload = await UploadToCloud(data.notarisedAOMAFile);
    const rdbFeesUpload = await UploadToCloud(data.rdbFeesFile);

    let mortgageCertificateUrl = null;
    if (data.mortgageRegistrationCertificate) {
      const mortgageCertificateUpload = await UploadToCloud(data.mortgageRegistrationCertificate);
      mortgageCertificateUrl = mortgageCertificateUpload.secure_url;
    }
    
    const mortgageRegistration = queryRunner.manager.create(MortgageRegistration, {
      borrowerAccountNumber: data.borrowerAccountNumber,
      loanId: targetLoan.id,
      loanApplicationNumber: targetLoan.loanId,
      notarisedAOMAFileUrl: aomaFileUpload.secure_url,
      rdbFeesFileUrl: rdbFeesUpload.secure_url,
      mortgageRegistrationCertificateUrl: mortgageCertificateUrl,
      organizationId,
      createdBy
    });

    const savedMortgageRegistration = await queryRunner.manager.save(MortgageRegistration, mortgageRegistration);
    console.log('✓ Mortgage registration created');

    // STEP 4: LOAN DISBURSEMENT CALCULATIONS
    console.log('🔹 STEP 4: Calculating disbursement and repayment structure');

    const commissionRate = data.commissionRate;
    const approvedAmount = approvalConditions.approvedAmount;

    const commissionAmount = (commissionRate * approvedAmount) / 100;
    const vatAmount = commissionAmount * VAT_RATE;
    const totalCommissionWithVAT = commissionAmount + vatAmount;

    const insurancePolicyFees = data.insurancePolicyFees || 0;
    const fireInsurancePolicyFees = data.fireInsurancePolicyFees || 0;
    const totalInsuranceFees = insurancePolicyFees + fireInsurancePolicyFees;

    const otherFees = data.otherFees || 0;

    const netAmountPayable = approvedAmount - totalCommissionWithVAT - totalInsuranceFees - otherFees;

    if (netAmountPayable <= 0) {
      throw new Error("Net amount payable cannot be zero or negative. Total deductions exceed approved amount.");
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
      createdBy
    });

    const savedDisbursement = await queryRunner.manager.save(LoanDisbursement, disbursement);
    console.log('✓ Disbursement calculations saved');

    console.log('🔹 Updating loan with repayment modality from Step 4');
    console.log('🔹 Step 4: Processing repayment modality from frontend:', {
      repaymentModality: data.repaymentModality,
      singlePaymentMonths: data.singlePaymentMonths,
      customScheduleLength: data.customSchedule?.length,
      paymentFrequency: data.paymentFrequency,
      hasApprovalConditions: !!approvalConditions
    })

    const repaymentModality = data.repaymentModality || approvalConditions?.repaymentModality || 'multiple_with_interest';
    const singlePaymentMonths = data.singlePaymentMonths !== undefined
      ? data.singlePaymentMonths
      : approvalConditions?.singlePaymentMonths;
    const customSchedule = data.customSchedule || approvalConditions?.customSchedule;

    const paymentFrequency = this.normalizeRepaymentFrequency(
      data.paymentFrequency || approvalConditions.paymentModality
    );

    console.log('🔹 Final repayment parameters:', {
      repaymentModality,
      singlePaymentMonths,
      customScheduleLength: customSchedule?.length,
      paymentFrequency
    });
    
    const interestMethod = this.normalizeInterestMethod(approvalConditions.interestMethod);
    const termInMonths = approvalConditions.repaymentPeriod;
    const totalNumberOfInstallments = this.calculateTotalInstallments(termInMonths, paymentFrequency);

    const today = new Date();
    const firstPaymentDate = this.calculateFirstPaymentDate(today, paymentFrequency);

    const loanAmounts = this.calculateLoanAmounts(
      approvedAmount,
      approvalConditions.interestRate,
      termInMonths,
      paymentFrequency,
      interestMethod
    );

    await queryRunner.manager.update(Loan, targetLoan.id, {
      disbursedAmount: approvedAmount,
      termInMonths: termInMonths,
      repaymentFrequency: paymentFrequency,
      annualInterestRate: approvalConditions.interestRate,
      interestMethod: interestMethod,
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
      isManualSchedule: repaymentModality === 'customized',
      status: LoanStatus.DISBURSED
    });

    const updatedLoan = await queryRunner.manager.findOne(Loan, {
      where: { id: targetLoan.id }
    });

    if (!updatedLoan) {
      throw new Error("Failed to reload loan");
    }

    console.log('🔹 Generating repayment schedule with due dates from today');
    const repaymentSchedule = await this.generateRepaymentScheduleByModality(
      updatedLoan,
      repaymentModality,
      customSchedule,
      singlePaymentMonths
    );

    await queryRunner.manager.save(RepaymentSchedule, repaymentSchedule);
    console.log(`✓ Generated ${repaymentSchedule.length} repayment schedules using ${repaymentModality} modality`);

    await queryRunner.commitTransaction();
    console.log('=== THREE-STEP DISBURSEMENT COMPLETED ===');

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
          repaymentModality: repaymentModality
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


  private async generateRepaymentScheduleByModality(
    loan: Loan,
    modality: string,
    customSchedule?: any[],
    singlePaymentMonths?: number
  ): Promise<RepaymentSchedule[]> {
    console.log(`📊 Generating schedule for modality: ${modality}`);

    const today = new Date();
    const firstPaymentDate = this.calculateFirstPaymentDate(today, loan.repaymentFrequency!);

    switch (modality) {
      case 'single':
        return this.generateSinglePaymentSchedule(loan, singlePaymentMonths, firstPaymentDate);

      case 'multiple_only_interest':
        return this.generateInterestOnlySchedule(loan, firstPaymentDate);

      case 'customized':
        if (!customSchedule || customSchedule.length === 0) {
          throw new Error("Custom schedule is required for customized repayment modality");
        }
        return this.generateCustomizedSchedule(loan, customSchedule, firstPaymentDate);

      case 'multiple_with_interest':
      default:
        return this.generateRepaymentSchedule(loan, firstPaymentDate);
    }
  }

  private generateSinglePaymentSchedule(
    loan: Loan,
    singlePaymentMonths?: number,
    firstPaymentDate?: Date
  ): RepaymentSchedule[] {
    console.log('💰 Generating single payment schedule');

    const principal = loan.disbursedAmount;
    const annualRate = loan.annualInterestRate || 0;
    const months = singlePaymentMonths || loan.termInMonths || 12;

    // Calculate total interest (simple interest)
    const totalInterest = principal * (annualRate / 100) * (months / 12);
    const totalAmount = principal + totalInterest;

    // ✅ ENHANCED: Calculate due date from today + specified months
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

    console.log(`✓ Single payment: ${totalAmount.toFixed(2)} due on ${dueDate.toLocaleDateString()}`);

    return [installment];
  }

  // ========================================
  // ✅ ENHANCED: INTEREST ONLY SCHEDULE
  // ========================================

  private generateInterestOnlySchedule(loan: Loan, firstPaymentDate: Date): RepaymentSchedule[] {
    console.log('📈 Generating interest-only schedule');

    const schedule: RepaymentSchedule[] = [];
    const principal = loan.disbursedAmount;
    const totalTerms = loan.totalNumberOfInstallments || 12;
    const periodicRate = this.getPeriodicRate(loan.annualInterestRate || 0, loan.repaymentFrequency!);
    const periodicInterest = principal * periodicRate;

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
    finalInstallment.dueTotal = Math.round((principal + periodicInterest) * 100) / 100;
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

    console.log(`✓ Generated ${totalTerms - 1} interest-only payments + 1 final payment`);

    return schedule;
  }

private generateCustomizedSchedule(
  loan: Loan,
  customSchedule: CustomScheduleItem[],
  firstPaymentDate: Date
): RepaymentSchedule[] {
  console.log('🎯 Generating customized schedule with user-provided data');

  // ✅ CRITICAL FIX: Use the exact values from the custom schedule without recalculating
  console.log('User-provided custom schedule:', JSON.stringify(customSchedule, null, 2));

  const principal = loan.disbursedAmount;
  const annualRate = loan.annualInterestRate || 0;
  const months = loan.termInMonths || 12;

  // Calculate total from user-provided schedule
  const customTotal = customSchedule.reduce((sum, item) => sum + item.amount, 0);
  console.log(`✓ User-provided total: ${customTotal.toLocaleString()} RWF`);

  // Calculate minimum required based on loan terms
  const minInterest = principal * (annualRate / 100) * (months / 12);
  const minTotal = principal + minInterest;

  console.log('Validation check:', {
    principal: principal.toLocaleString(),
    annualRate,
    months,
    minInterest: minInterest.toLocaleString(),
    minTotal: minTotal.toLocaleString(),
    customTotal: customTotal.toLocaleString(),
    difference: (customTotal - minTotal).toLocaleString()
  });

  // ✅ MODIFIED: Validate total - allow slight rounding differences
  if (Math.abs(customTotal - minTotal) > 100) { // Allow 100 RWF rounding difference
    console.warn(`⚠️  Custom schedule total differs from expected total by ${Math.abs(customTotal - minTotal).toLocaleString()} RWF`);
  }

  const schedule: RepaymentSchedule[] = [];
  let remainingPrincipal = principal;

  // ✅ FIXED: Use the exact principal and interest values from the custom schedule
  customSchedule.forEach((item, index) => {
    const isLast = index === customSchedule.length - 1;

    // ✅ CRITICAL FIX: Use user-provided values directly
    let principalPortion = (item as any).principal || 0;
    let interestPortion = (item as any).interest || 0;
    
    // If principal/interest not provided in the item, calculate proportionally
    if (!principalPortion && !interestPortion) {
      // Fallback to proportional allocation if not provided
      const totalInterestInSchedule = customSchedule.reduce((sum, i) => sum + ((i as any).interest || 0), 0);
      const totalPrincipalInSchedule = customSchedule.reduce((sum, i) => sum + ((i as any).principal || 0), 0);
      
      if (totalPrincipalInSchedule === 0 && totalInterestInSchedule === 0) {
        // Allocate based on remaining principal
        if (isLast) {
          principalPortion = remainingPrincipal;
          interestPortion = item.amount - principalPortion;
        } else {
          // Simple proportional allocation
          principalPortion = (principal / customSchedule.length) * (item.amount / (customTotal / customSchedule.length));
          interestPortion = item.amount - principalPortion;
        }
      }
    }

    // ✅ ENHANCED: Use provided due date or calculate from today
    let dueDate: Date;
    if (item.dueDate) {
      dueDate = new Date(item.dueDate);
    } else {
      // Calculate from today based on installment number
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
    
    // ✅ USE USER-PROVIDED VALUES DIRECTLY
    installment.duePrincipal = Math.round(principalPortion * 100) / 100;
    installment.dueInterest = Math.round(interestPortion * 100) / 100;
    installment.dueTotal = Math.round(item.amount * 100) / 100;

    remainingPrincipal -= principalPortion;
    installment.outstandingPrincipal = Math.round(remainingPrincipal * 100) / 100;
    
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

    console.log(`✓ Installment ${item.installmentNumber}:`, {
      dueDate: dueDate.toLocaleDateString(),
      amount: item.amount.toLocaleString(),
      principal: installment.duePrincipal.toLocaleString(),
      interest: installment.dueInterest.toLocaleString(),
      remainingPrincipal: remainingPrincipal.toLocaleString()
    });

    schedule.push(installment);
  });

  // Final validation
  const totalScheduledPrincipal = schedule.reduce((sum, s) => sum + s.duePrincipal, 0);
  const totalScheduledInterest = schedule.reduce((sum, s) => sum + s.dueInterest, 0);
  const totalScheduledAmount = schedule.reduce((sum, s) => sum + s.dueTotal, 0);

  console.log('Final schedule summary:', {
    totalInstallments: schedule.length,
    totalScheduledPrincipal: totalScheduledPrincipal.toLocaleString(),
    totalScheduledInterest: totalScheduledInterest.toLocaleString(),
    totalScheduledAmount: totalScheduledAmount.toLocaleString(),
    loanPrincipal: principal.toLocaleString(),
    minTotalRequired: minTotal.toLocaleString(),
    finalRemainingPrincipal: remainingPrincipal.toLocaleString(),
    userProvidedTotal: customTotal.toLocaleString()
  });

  if (Math.abs(remainingPrincipal) > 0.01) {
    console.warn(`⚠️  Remaining principal after schedule: ${remainingPrincipal.toFixed(2)}`);
  }

  return schedule;
}

  private generateRepaymentSchedule(loan: Loan, firstPaymentDate: Date): RepaymentSchedule[] {
    const schedule: RepaymentSchedule[] = [];

    const principal = loan.disbursedAmount;
    const totalTerms = loan.totalNumberOfInstallments;
    const annualInterestRate = loan.annualInterestRate;
    const repaymentFrequency = loan.repaymentFrequency;
    const interestMethod = loan.interestMethod;

    if (!principal || principal <= 0) {
      throw new Error("Loan disbursed amount is invalid or not set");
    }

    if (!totalTerms || totalTerms <= 0) {
      throw new Error(`Total number of installments is invalid: ${totalTerms}`);
    }

    if (!annualInterestRate || annualInterestRate <= 0) {
      throw new Error("Annual interest rate is invalid");
    }

    if (!repaymentFrequency) {
      throw new Error("Repayment frequency is not set");
    }

    if (!interestMethod) {
      throw new Error("Interest method is not set");
    }

    console.log('🔹 Generating standard repayment schedule:', {
      principal,
      totalTerms,
      annualInterestRate,
      repaymentFrequency,
      interestMethod,
      firstPaymentDate,
      note: 'Using approved amount (before deductions) for repayment'
    });

    let remainingPrincipal = principal;
    const periodicRate = this.getPeriodicRate(annualInterestRate, repaymentFrequency);

    for (let i = 1; i <= totalTerms; i++) {
      const dueDate = this.calculateInstallmentDueDate(
        firstPaymentDate,
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

  private normalizeRepaymentFrequency(frequency: string): RepaymentFrequency {
    if (!frequency) {
      return RepaymentFrequency.MONTHLY;
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

  private normalizeInterestMethod(method: string | undefined): InterestMethod {
    if (!method) {
      return InterestMethod.FLAT;
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

  private calculateTotalInstallments(termInMonths: number, frequency: RepaymentFrequency): number {
    switch (frequency) {
      case RepaymentFrequency.DAILY:
        return termInMonths * 30;
      case RepaymentFrequency.WEEKLY:
        return Math.ceil(termInMonths * 4.345);
      case RepaymentFrequency.BIWEEKLY:
        return Math.ceil(termInMonths * 2.173);
      case RepaymentFrequency.MONTHLY:
        return termInMonths;
      case RepaymentFrequency.QUARTERLY:
        return Math.ceil(termInMonths / 3);
      case RepaymentFrequency.SEMI_ANNUALLY:
        return Math.ceil(termInMonths / 6);
      case RepaymentFrequency.ANNUALLY:
        return Math.ceil(termInMonths / 12);
      default:
        return termInMonths;
    }
  }

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
      totalInterest = principal * (annualInterestRate / 100) * (termInMonths / 12);
      installmentAmount = (principal + totalInterest) / totalInstallments;
    } else {
      const monthlyRate = annualInterestRate / 100 / 12;
      const monthlyInstallment = (principal * monthlyRate * Math.pow(1 + monthlyRate, termInMonths)) /
        (Math.pow(1 + monthlyRate, termInMonths) - 1);

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
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
    }

    return firstPaymentDate;
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
        dueDate.setMonth(dueDate.getMonth() + (installmentNumber - 1));
        break;
    }

    return dueDate;
  }
}

export default new UpdatedLoanDisbursementService();