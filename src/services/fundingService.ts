// @ts-nocheck
import type { Repository } from "typeorm"
import { BorrowingStatus, type Borrowing } from "../entities/Borrowing"
import type { GrantedFunds } from "../entities/GrantedFunds"
import type { OperationalFunds } from "../entities/OperationalFunds"
import type { Organization } from "../entities/Organization"
import { ShareCapital } from "../entities/ShareCapital"
import { IndividualShareholder } from "../entities/IndividualShareholder"
import { InstitutionShareholder } from "../entities/InstitutionShareholder"
import { UploadToCloud } from "../helpers/cloud"
import { ShareCapitalContribution } from "../entities/ShareCapitalContribution"
import { ShareCapitalRequest } from "../interfaces/funding.interface";

export class FundingService {
  constructor(
    private borrowingRepository: Repository<Borrowing>,
    private grantedFundsRepository: Repository<GrantedFunds>,
    private operationalFundsRepository: Repository<OperationalFunds>,
    private shareCapitalRepository: Repository<ShareCapital>,
    private organizationRepository: Repository<Organization>,
    private individualShareholderRepository: Repository<IndividualShareholder>,
    private institutionShareholderRepository: Repository<InstitutionShareholder>,
  ) {}


async recordBorrowingRepayment(borrowingId: number, repayments: any[]) {


  if (!repayments || !Array.isArray(repayments)) {
    throw new Error("repayments must be an array");
  }

  if (repayments.length === 0) {
    throw new Error("At least one repayment is required");
  }

  // Find the borrowing record
  const borrowing = await this.borrowingRepository.findOne({
    where: { id: borrowingId }
  });

  if (!borrowing) {
    throw new Error("Borrowing record not found");
  }

  if (!borrowing.repaymentHistory) {
    borrowing.repaymentHistory = [];
  }

  const toDecimal = (value: any, decimals: number = 2): number => {
    if (value === null || value === undefined) return 0;
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    return parseFloat(num.toFixed(decimals));
  };

  // Get current amounts as numbers with proper decimal handling
  const currentAmountBorrowed = toDecimal(borrowing.amountBorrowed);
  const currentAmountPaid = toDecimal(borrowing.amountPaid);
  const currentOutstandingBalance = toDecimal(borrowing.outstandingBalance);
  

  const recordedRepayments = [];
  let totalRepaymentAmount = 0;

  for (let i = 0; i < repayments.length; i++) {
    const repayment = repayments[i];

    // Validate required fields
    if (!repayment.amount) {
      throw new Error(`Repayment ${i + 1}: Amount is required`);
    }
    if (!repayment.paymentDate) {
      throw new Error(`Repayment ${i + 1}: Payment date is required`);
    }
    if (!repayment.paymentMethod) {
      throw new Error(`Repayment ${i + 1}: Payment method is required`);
    }
        if (!repayment.interestAmount) {
      throw new Error(`Repayment ${i + 1}: Interest amount is required`);
    }
    if (!repayment.paymentReference) {
      throw new Error(`Repayment ${i + 1}: Payment reference is required`);
    }
        if (!repayment.interestAmount) {
      throw new Error(`Repayment ${i + 1}: Interest amount is required`);
    }

    // Convert amount to number with proper decimal handling
    const amount = toDecimal(repayment.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error(`Repayment ${i + 1}: Invalid repayment amount`);
    }

    // Validate that repayment doesn't exceed remaining principal
    const remainingPrincipal = currentAmountBorrowed - (currentAmountPaid + totalRepaymentAmount);
    const roundedRemainingPrincipal = toDecimal(remainingPrincipal);

    if (amount > roundedRemainingPrincipal + 0.01) { // Allow small rounding differences
      throw new Error(`Repayment ${i + 1}: Repayment amount (${amount}) exceeds remaining principal (${roundedRemainingPrincipal})`);
    }

    // Create repayment record for history with exact amount
    const repaymentRecord = {
      amount: amount,
      paymentDate: new Date(repayment.paymentDate).toISOString().split('T')[0],
      paymentMethod: repayment.paymentMethod,
      paymentReference: repayment.paymentReference,
      interestAmount: repayment.interestAmount,
      notes: repayment.notes || '',
      recordedAt: new Date()
    };

    // Use the entity method to add repayment
    borrowing.addRepaymentToHistory(repaymentRecord);
    recordedRepayments.push(repaymentRecord);

    // Update totals
    totalRepaymentAmount = toDecimal(totalRepaymentAmount + amount);

  }


  // Calculate new amounts with proper decimal handling
  const newAmountPaid = toDecimal(currentAmountPaid + totalRepaymentAmount);
  const newOutstandingBalance = toDecimal(currentAmountBorrowed - newAmountPaid);
  
  // Update borrowing amounts
  borrowing.amountPaid = newAmountPaid;
  borrowing.outstandingBalance = Math.max(0, newOutstandingBalance);

  // Update status if fully paid (account for small rounding differences)
  if (borrowing.outstandingBalance <= 0.01) {
    borrowing.status = BorrowingStatus.FULLY_PAID;
    borrowing.outstandingBalance = 0; // Set to exact 0 if fully paid
  }



  if (borrowing.paymentSchedule && borrowing.paymentSchedule.length > 0) {
    this.updatePaymentScheduleForRepayment(borrowing, repayments, totalRepaymentAmount);
  } else {
    // console.log("⚠️ [SERVICE DEBUG] No payment schedule to update");
  }

  // Save the updated borrowing record
  const updatedBorrowing = await this.borrowingRepository.save(borrowing);


  return {
    borrowing: updatedBorrowing,
    recordedRepayments,
    totalAmountPaid: totalRepaymentAmount,
    newOutstandingBalance: updatedBorrowing.outstandingBalance
  };
}

private updatePaymentScheduleForRepayment(borrowing: Borrowing, repayments: any[], totalRepaymentAmount: number): void {
  
  if (!borrowing.paymentSchedule || borrowing.paymentSchedule.length === 0) {
    return;
  }

  // Get pending installments
  const pendingInstallments = borrowing.paymentSchedule.filter(item => !item.isPaid);
  if (pendingInstallments.length === 0) {
    return;
  }

  // Sort pending installments by due date
  pendingInstallments.sort((a, b) => 
    new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

  let remainingAmount = totalRepaymentAmount;

  for (const installment of pendingInstallments) {
    if (remainingAmount <= 0) {
      break;
    }

    const installmentRemaining = installment.totalAmount - (installment.paidAmount || 0);
    const amountToApply = Math.min(remainingAmount, installmentRemaining);

    
    // Update installment
    installment.paidAmount = (installment.paidAmount || 0) + amountToApply;
    installment.isPaid = installment.paidAmount >= installment.totalAmount;
    
    if (installment.isPaid) {
      // Use the first repayment date
      const paymentDate = repayments[0]?.paymentDate || new Date().toISOString().split('T')[0];
      installment.paidDate = new Date(paymentDate);
    } 
    remainingAmount -= amountToApply;
  }

}

async updateOperationalFundsAmount(
  operationalId: number, 
  updateData: { 
    amount: number | string; 
    type: 'injection' | 'withdrawal';
    description: string;
    transactionReference?: string;
    notes?: string;
    date?: Date;
  },
  performedBy?: number,
  performedByName?: string
) {


  // Find the operational fund
  const operationalFund = await this.operationalFundsRepository.findOne({ 
    where: { id: operationalId } 
  });
  
  if (!operationalFund) {
    throw new Error("Operational fund record not found");
  }

  const amount = typeof updateData.amount === 'string' 
    ? parseFloat(updateData.amount) 
    : Number(updateData.amount);
    
  if (isNaN(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number");
  }

  // Update operational fund based on type
  let historyEntry;
  if (updateData.type === 'injection') {
    historyEntry = operationalFund.addInjection(
      amount,
      updateData.description,
      performedBy,
      performedByName,
      updateData.transactionReference,
      updateData.notes
    );
  } else if (updateData.type === 'withdrawal') {
    historyEntry = operationalFund.addWithdrawal(
      amount,
      updateData.description,
      performedBy,
      performedByName,
      updateData.transactionReference,
      updateData.notes
    );
  } else {
    throw new Error("Invalid update type. Must be 'injection' or 'withdrawal'");
  }

  // If date is provided, update the history entry date
  if (updateData.date && operationalFund.operationalHistory.length > 0) {
    const lastEntry = operationalFund.operationalHistory[operationalFund.operationalHistory.length - 1];
    lastEntry.date = new Date(updateData.date);
  }


  const updatedOperationalFund = await this.operationalFundsRepository.save(operationalFund);

  return updatedOperationalFund;
}
async getOperationalHistory(operationalId: number): Promise<{
  fundDetails: {
    id: number;
    fundSource: string;
    fundSourceDescription: string;
    amountCommitted: number;
    amountUtilized: number;
    amountReserved: number;
    status: string;
    availableAmount: number;
    utilizationPercentage: number;
  };
  history: any[];
  totals: {
    injections: number;
    withdrawals: number;
    netChange: number;
  };
}> {
  const operationalFund = await this.operationalFundsRepository.findOne({ 
    where: { id: operationalId } 
  });
  
  if (!operationalFund) {
    throw new Error("Operational fund record not found");
  }

  return {
    fundDetails: {
      id: operationalFund.id,
      fundSource: operationalFund.fundSource,
      fundSourceDescription: operationalFund.fundSourceDescription,
      amountCommitted: operationalFund.amountCommitted,
      amountUtilized: operationalFund.amountUtilized,
      amountReserved: operationalFund.amountReserved,
      status: operationalFund.status,
      availableAmount: operationalFund.getAvailableAmount(),
      utilizationPercentage: operationalFund.getUtilizationPercentage()
    },
    history: operationalFund.operationalHistory || [],
    totals: {
      injections: operationalFund.getTotalInjections(),
      withdrawals: operationalFund.getTotalWithdrawals(),
      netChange: operationalFund.getTotalInjections() - operationalFund.getTotalWithdrawals()
    }
  };
}




  async recordBorrowing(borrowingData: Partial<Borrowing>, organizationId: number) {
    const organization = await this.organizationRepository.findOne({ where: { id: organizationId } })
    if (!organization) {
      throw new Error("Organization not found")
    }

    const borrowing = this.borrowingRepository.create({
      ...borrowingData,
      organization,
    })

    return await this.borrowingRepository.save(borrowing)
  }

  async recordGrantedFunds(grantData: Partial<GrantedFunds>, organizationId: number) {


    // Step 1: Find organization
    const organization = await this.organizationRepository.findOne({ where: { id: organizationId } })
    if (!organization) {
      throw new Error("Organization not found")
    }

    // Step 2: Clean and validate date fields
    const cleanedGrantData = this.cleanDateFields(grantData);
    // Step 3: Validate required dates
    this.validateRequiredDates(cleanedGrantData);

    const processedData = this.processDateFields(cleanedGrantData);

    if (processedData.grantConditions) {
      processedData.grantConditions = processedData.grantConditions.map((condition: any) => ({
        ...condition,
        dueDate: condition.dueDate ? new Date(condition.dueDate) : undefined,
        completedDate: condition.completedDate ? new Date(condition.completedDate) : undefined
      }));
    }


    if (processedData.milestones) {
      processedData.milestones = processedData.milestones.map((milestone: any) => ({
        ...milestone,
        targetDate: milestone.targetDate ? new Date(milestone.targetDate) : undefined,
        completionDate: milestone.completionDate ? new Date(milestone.completionDate) : undefined
      }));
    }


    try {
      // Step 7: Create entity
      const grantedFunds = this.grantedFundsRepository.create({
        ...processedData,
        organization,
      });


      const savedEntity = await this.grantedFundsRepository.save(grantedFunds);

      return savedEntity;
    } catch (saveError: any) {

      throw new Error(`Failed to save granted funds: ${saveError.message}`);
    }
  }

  private cleanDateFields(data: any): any {
    const cleaned = { ...data };
    
    // List of date fields that might be empty strings
    const dateFields = [
      'grantDate',
      'disbursementDate', 
      'projectStartDate',
      'projectEndDate',
      'nextReportDue'
    ];

    dateFields.forEach(field => {
      if (cleaned[field] === "" || cleaned[field] === null) {
        delete cleaned[field];
      }
    });

    // Clean numeric fields that might be empty strings
    const numericFields = ['amountDisbursed', 'amountUtilized'];
    numericFields.forEach(field => {
      if (cleaned[field] === "" || cleaned[field] === null) {
        cleaned[field] = 0;
      }
    });

    // Clean string fields
    const stringFields = ['reportingFrequency', 'grantAgreementUrl', 'projectProposalUrl'];
    stringFields.forEach(field => {
      if (cleaned[field] === "") {
        cleaned[field] = null;
      }
    });

    // Clean array fields
    const arrayFields = ['reportingDocuments', 'complianceDocuments', 'milestones'];
    arrayFields.forEach(field => {
      if (cleaned[field] && Array.isArray(cleaned[field]) && cleaned[field].length === 0) {
        cleaned[field] = null;
      }
    });

    return cleaned;
  }

  private validateRequiredDates(data: any): void {
    const requiredDateFields = ['grantDate', 'projectStartDate', 'projectEndDate'];
    
    for (const field of requiredDateFields) {
      if (!data[field]) {
        throw new Error(`${field} is required and cannot be empty`);
      }
      
      // Validate date format
      const date = new Date(data[field]);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date format for ${field}: ${data[field]}`);
      }
    }
  }

  private processDateFields(data: any): any {
    const processed = { ...data };
    
    const dateFields = [
      'grantDate',
      'disbursementDate',
      'projectStartDate', 
      'projectEndDate',
      'nextReportDue'
    ];

    dateFields.forEach(field => {
      if (processed[field] && typeof processed[field] === 'string') {
        try {
          const dateValue = new Date(processed[field]);
          if (!isNaN(dateValue.getTime())) {
            processed[field] = dateValue;
          } else {
            delete processed[field];
          }
        } catch (error) {
          delete processed[field];
        }
      }
    });

    return processed;
  }


  // In FundingService.ts - Add or verify this method exists
async deleteShareCapitalById(id: number) {
  const shareCapital = await this.shareCapitalRepository.findOne({ 
    where: { id },
    relations: ["contributions"] // Include contributions if needed
  });
  
  if (!shareCapital) {
    throw new Error("Share capital record not found");
  }

  // Optionally: Handle any cleanup needed before deletion
  // For example, if you want to delete associated contributions first
  if (shareCapital.contributions && shareCapital.contributions.length > 0) {
    await this.shareCapitalRepository.manager.transaction(async manager => {
      // Delete contributions first (if cascade delete is not set in DB)
      for (const contribution of shareCapital.contributions) {
        await manager.delete(ShareCapitalContribution, contribution.id);
      }
      // Then delete the share capital
      await manager.delete(ShareCapital, id);
    });
  } else {
    // If no contributions, just delete the share capital
    return await this.shareCapitalRepository.delete(id);
  }
}

async getOperationalFundsByOrganization(organizationId: number): Promise<any[]> {
  const funds = await this.operationalFundsRepository.find({
    where: { organization: { id: organizationId } },
    order: { createdAt: 'DESC' }
  });

 
  return funds.map(fund => ({
    ...fund,
    currentBalance: fund.getCurrentBalance(),
    totalInjections: fund.getTotalInjections(),
    totalWithdrawals: fund.getTotalWithdrawals(),
    availableAmount: fund.getAvailableAmount()
  }));
}

async recordOperationalFunds(operationalData: Partial<OperationalFunds>, organizationId: number) {
  const organization = await this.organizationRepository.findOne({ where: { id: organizationId } });
  if (!organization) {
    throw new Error("Organization not found");
  }

  // Check if operational funds already exist for this organization
  const existingFunds = await this.operationalFundsRepository.findOne({
    where: { organization: { id: organizationId } }
  });

  if (existingFunds) {
    throw new Error("Operational funds already exist for this organization. Only one operational fund account is allowed.");
  }

  const operationalFunds = this.operationalFundsRepository.create({
    ...operationalData,
    organization,
  });

  return await this.operationalFundsRepository.save(operationalFunds);
}




  async updateBorrowing(id: number, updateData: Partial<Borrowing>) {
    const borrowing = await this.borrowingRepository.findOne({ where: { id } })
    if (!borrowing) {
      throw new Error("Borrowing record not found")
    }

    Object.assign(borrowing, updateData)
    return await this.borrowingRepository.save(borrowing)
  }

  async deleteBorrowing(id: number) {
    return await this.borrowingRepository.delete(id)
  }
async recordShareCapital(
  shareCapitalData: ShareCapitalRequest, 
  organizationId: number, 
  files?: { paymentProof?: Express.Multer.File[] },
  performedBy?: number,
  performedByName?: string
) {
  console.log('========== START RECORD SHARE CAPITAL ==========');
  console.log('Step 1: Received request with data:', {
    organizationId,
    shareholderId: shareCapitalData.shareholderId,
    shareholderType: shareCapitalData.shareholderType,
    numberOfShares: shareCapitalData.numberOfShares,
    valuePerShare: shareCapitalData.valuePerShare,
    dateOfContribution: shareCapitalData.dateOfContribution,
    typeOfShare: shareCapitalData.typeOfShare,
    hasPaymentProof: !!files?.paymentProof,
    performedBy,
    performedByName
  });

  const organization = await this.organizationRepository.findOne({ 
    where: { id: organizationId } 
  });
  
  if (!organization) {
    console.error('Step 2: Organization not found for ID:', organizationId);
    throw new Error("Organization not found");
  }
  console.log('Step 2: Organization found:', { id: organization.id, name: organization.name });

  const { shareholderId, shareholderType } = shareCapitalData;
  
  if (!shareholderId || !shareholderType) {
    console.error('Step 3: Missing shareholder ID or type', { shareholderId, shareholderType });
    throw new Error("Shareholder ID and type are required");
  }
  console.log('Step 3: Shareholder validation passed');

  let shareholder: IndividualShareholder | InstitutionShareholder | null = null;

  if (shareholderType === 'individual') {
    console.log('Step 4: Looking for individual shareholder with ID:', shareholderId);
    shareholder = await this.individualShareholderRepository.findOne({ 
      where: { id: shareholderId, organization: { id: organizationId } } 
    });
  } else if (shareholderType === 'institution') {
    console.log('Step 4: Looking for institution shareholder with ID:', shareholderId);
    shareholder = await this.institutionShareholderRepository.findOne({ 
      where: { id: shareholderId, organization: { id: organizationId } } 
    });
  }

  if (!shareholder) {
    console.error('Step 5: Shareholder not found for ID:', shareholderId, 'Type:', shareholderType);
    throw new Error("Shareholder not found");
  }
  console.log('Step 5: Shareholder found:', { 
    id: shareholder.id, 
    name: shareholderType === 'individual' 
      ? `${(shareholder as IndividualShareholder).firstname} ${(shareholder as IndividualShareholder).lastname}`
      : (shareholder as InstitutionShareholder).institutionName
  });

  // Handle payment proof upload
  let paymentProofUrl = null;
  if (files?.paymentProof && files.paymentProof.length > 0) {
    console.log('Step 6: Processing payment proof upload, file size:', files.paymentProof[0].size);
    try {
      const uploadResult = await UploadToCloud(files.paymentProof[0]);
      paymentProofUrl = uploadResult.secure_url;
      console.log('Step 6: Payment proof uploaded successfully:', paymentProofUrl);
    } catch (uploadError: any) {
      console.error('Step 6: Payment proof upload failed:', uploadError.message);
      throw new Error(`Failed to upload payment proof: ${uploadError.message}`);
    }
  } else {
    console.log('Step 6: No payment proof file provided');
  }

  // Parse and validate numbers
  console.log('Step 7: Parsing number values...');
  const numberOfShares = Math.floor(Number(shareCapitalData.numberOfShares) || 0);
  const valuePerShare = Number(Number(shareCapitalData.valuePerShare).toFixed(2));
  
  console.log('Step 7: Parsed values:', { 
    originalNumberOfShares: shareCapitalData.numberOfShares,
    parsedNumberOfShares: numberOfShares,
    originalValuePerShare: shareCapitalData.valuePerShare,
    parsedValuePerShare: valuePerShare
  });
  
  if (numberOfShares <= 0) {
    console.error('Step 7: Invalid number of shares:', numberOfShares);
    throw new Error("Number of shares must be greater than 0");
  }
  
  if (valuePerShare <= 0) {
    console.error('Step 7: Invalid value per share:', valuePerShare);
    throw new Error("Value per share must be greater than 0");
  }
  console.log('Step 7: Number validation passed');

  const contributionDate = shareCapitalData.dateOfContribution 
    ? new Date(shareCapitalData.dateOfContribution) 
    : new Date();
  console.log('Step 8: Contribution date:', contributionDate);

  // Find existing share capital record for this shareholder
  console.log('Step 9: Checking for existing share capital record...');
  let shareCapital = await this.shareCapitalRepository.findOne({
    where: {
      shareholderId,
      shareholderType,
      organization: { id: organizationId }
    },
    relations: ["individualShareholder", "institutionShareholder", "contributions"]
  });

  if (shareCapital) {
    console.log('Step 9: Found existing share capital record:', {
      id: shareCapital.id,
      totalShares: shareCapital.totalNumberOfShares,
      totalValue: shareCapital.totalContributedCapitalValue,
      contributionCount: shareCapital.contributionCount
    });
  } else {
    console.log('Step 9: No existing share capital record found, will create new one');
  }

  console.log('Step 10: Starting database transaction...');
  const result = await this.shareCapitalRepository.manager.transaction(async manager => {
    console.log('Step 10: Transaction started');

    if (shareCapital) {
      console.log('Step 11: Adding contribution to existing share capital ID:', shareCapital.id);
      
      // Add new contribution to existing record - this updates shareCapital's totals
      const contribution = shareCapital.addContribution(
        numberOfShares,
        valuePerShare,
        contributionDate,
        shareCapitalData.typeOfShare,
        {
          paymentMethod: shareCapitalData.paymentDetails.paymentMethod || '',
          paymentDate: shareCapitalData.paymentDetails.paymentDate ? new Date(shareCapitalData.paymentDetails.paymentDate) : new Date(),
          paymentReference: shareCapitalData.paymentDetails.paymentReference || '',
          bankName: shareCapitalData.paymentDetails.bankName || null,
          accountNumber: shareCapitalData.paymentDetails.accountNumber || null,
          transactionId: shareCapitalData.paymentDetails.transactionId || null,
          paymentProofUrl: paymentProofUrl
        },
        shareCapitalData.notes,
        performedBy,
        performedByName
      );

      console.log('Step 12: Contribution object created:', {
        hasShareCapital: !!contribution.shareCapital,
        shareCapitalId: contribution.shareCapital?.id,
        numberOfShares: contribution.numberOfShares,
        valuePerShare: contribution.valuePerShare
      });

      // IMPORTANT: Save the share capital first to ensure it's updated
      console.log('Step 13: Updating share capital record...');
      const updatedShareCapital = await manager.save(ShareCapital, shareCapital);
      console.log('Step 13: Share capital updated:', {
        id: updatedShareCapital.id,
        totalShares: updatedShareCapital.totalNumberOfShares,
        totalValue: updatedShareCapital.totalContributedCapitalValue
      });

      // Now set the shareCapitalId on the contribution explicitly
      contribution.shareCapitalId = updatedShareCapital.id;
      
      // Save the contribution separately
      console.log('Step 14: Saving contribution to database...');
      const savedContribution = await manager.save(ShareCapitalContribution, contribution);
      console.log('Step 14: Contribution saved with ID:', savedContribution.id, 'shareCapitalId:', savedContribution.shareCapitalId);

      const previousTotal = Number(updatedShareCapital.totalContributedCapitalValue) - (numberOfShares * valuePerShare);
      console.log('Step 15: Calculated previous total:', previousTotal);

      return {
        id: updatedShareCapital.id,
        shareholderId: updatedShareCapital.shareholderId,
        shareholderType: updatedShareCapital.shareholderType,
        totalNumberOfShares: updatedShareCapital.totalNumberOfShares,
        totalContributedCapitalValue: updatedShareCapital.totalContributedCapitalValue,
        averageValuePerShare: updatedShareCapital.averageValuePerShare,
        contributionCount: updatedShareCapital.contributionCount,
        firstContributionDate: updatedShareCapital.firstContributionDate,
        lastContributionDate: updatedShareCapital.lastContributionDate,
        isNewRecord: false,
        contribution: {
          id: savedContribution.id,
          contributionDate: savedContribution.contributionDate,
          shareType: savedContribution.shareType,
          numberOfShares: savedContribution.numberOfShares,
          valuePerShare: savedContribution.valuePerShare,
          totalValue: savedContribution.totalValue,
          paymentDetails: savedContribution.paymentDetails,
          notes: savedContribution.notes,
          recordedByName: savedContribution.recordedByName
        },
        previousTotal,
        newTotal: updatedShareCapital.totalContributedCapitalValue
      };

    } else {
      // Create new share capital record
      const totalValue = numberOfShares * valuePerShare;
      console.log('Step 11: Creating new share capital record with total value:', totalValue);
      
      // Create the share capital first
      const newShareCapital = manager.create(ShareCapital, {
        shareholderId,
        shareholderType,
        organization,
        individualShareholder: shareholderType === 'individual' ? shareholder as IndividualShareholder : null,
        institutionShareholder: shareholderType === 'institution' ? shareholder as InstitutionShareholder : null,
        totalNumberOfShares: numberOfShares,
        totalContributedCapitalValue: Number(totalValue.toFixed(2)),
        averageValuePerShare: valuePerShare,
        contributionCount: 1,
        firstContributionDate: contributionDate,
        lastContributionDate: contributionDate,
        notes: shareCapitalData.notes || null,
        createdBy: performedBy || null,
        updatedBy: performedBy || null
      });

      console.log('Step 12: New share capital object created (before save):', {
        shareholderId: newShareCapital.shareholderId,
        shareholderType: newShareCapital.shareholderType,
        totalNumberOfShares: newShareCapital.totalNumberOfShares,
        organizationId: newShareCapital.organizationId
      });

      // Save the share capital first to generate an ID
      console.log('Step 13: Saving new share capital to database...');
      const savedShareCapital = await manager.save(ShareCapital, newShareCapital);
      console.log('Step 13: Share capital saved with ID:', savedShareCapital.id);

      // Now create the contribution with the saved shareCapital ID
      console.log('Step 14: Creating contribution for share capital ID:', savedShareCapital.id);
      const contribution = manager.create(ShareCapitalContribution, {
        shareCapitalId: savedShareCapital.id, // Set the ID directly
        contributionDate,
        shareType: shareCapitalData.typeOfShare,
        numberOfShares,
        valuePerShare,
        totalValue: Number(totalValue.toFixed(2)),
        paymentDetails: {
          paymentMethod: shareCapitalData.paymentDetails.paymentMethod || '',
          paymentDate: shareCapitalData.paymentDetails.paymentDate ? new Date(shareCapitalData.paymentDetails.paymentDate) : new Date(),
          paymentReference: shareCapitalData.paymentDetails.paymentReference || '',
          bankName: shareCapitalData.paymentDetails.bankName || null,
          accountNumber: shareCapitalData.paymentDetails.accountNumber || null,
          transactionId: shareCapitalData.paymentDetails.transactionId || null,
          paymentProofUrl: paymentProofUrl
        },
        notes: shareCapitalData.notes || null,
        recordedBy: performedBy || null,
        recordedByName: performedByName || null
      });

      console.log('Step 15: Contribution object created:', {
        shareCapitalId: contribution.shareCapitalId,
        numberOfShares: contribution.numberOfShares,
        valuePerShare: contribution.valuePerShare
      });

      // Save the contribution
      console.log('Step 16: Saving contribution to database...');
      const savedContribution = await manager.save(ShareCapitalContribution, contribution);
      console.log('Step 16: Contribution saved with ID:', savedContribution.id, 'shareCapitalId:', savedContribution.shareCapitalId);

      console.log('Step 17: Transaction completed successfully for new share capital');

      return {
        id: savedShareCapital.id,
        shareholderId: savedShareCapital.shareholderId,
        shareholderType: savedShareCapital.shareholderType,
        totalNumberOfShares: savedShareCapital.totalNumberOfShares,
        totalContributedCapitalValue: savedShareCapital.totalContributedCapitalValue,
        averageValuePerShare: savedShareCapital.averageValuePerShare,
        contributionCount: savedShareCapital.contributionCount,
        firstContributionDate: savedShareCapital.firstContributionDate,
        lastContributionDate: savedShareCapital.lastContributionDate,
        isNewRecord: true,
        contribution: {
          id: savedContribution.id,
          contributionDate: savedContribution.contributionDate,
          shareType: savedContribution.shareType,
          numberOfShares: savedContribution.numberOfShares,
          valuePerShare: savedContribution.valuePerShare,
          totalValue: savedContribution.totalValue,
          paymentDetails: savedContribution.paymentDetails,
          notes: savedContribution.notes,
          recordedByName: savedContribution.recordedByName
        },
        previousTotal: 0,
        newTotal: savedShareCapital.totalContributedCapitalValue
      };
    }
  });

  console.log('========== END RECORD SHARE CAPITAL - SUCCESS ==========');
  console.log('Final result:', {
    id: result.id,
    isNewRecord: result.isNewRecord,
    contributionCount: result.contributionCount,
    contributionId: result.contribution.id
  });

  return result;
}

async getShareCapitalByOrganization(organizationId: number) {
  return await this.shareCapitalRepository.find({
    where: { organization: { id: organizationId } },
    relations: ["individualShareholder", "institutionShareholder", "contributions"],
    order: { lastContributionDate: "DESC" }
  });
}

  async updateShareCapital(id: number, updateData: Partial<ShareCapital>, files?: { paymentProof?: Express.Multer.File[] }) {
    const shareCapital = await this.shareCapitalRepository.findOne({ 
      where: { id },
      relations: ["individualShareholder", "institutionShareholder"]
    })
    if (!shareCapital) {
      throw new Error("Share capital record not found")
    }

    // Handle payment proof upload if provided
    if (files?.paymentProof && files.paymentProof.length > 0) {
      try {
        const uploadResult = await UploadToCloud(files.paymentProof[0]);
        updateData.paymentDetails = {
          ...updateData.paymentDetails,
          paymentProofUrl: uploadResult.secure_url
        };
      } catch (uploadError: any) {
        throw new Error(`Failed to upload payment proof: ${uploadError.message}`);
      }
    }

    const allowedUpdateFields = [
      'paymentDetails',
      'notes',
      'isVerified',
      'isActive',
      'contributionCertificateUrl',
      'additionalDocuments'
    ];

    const filteredUpdateData: Partial<ShareCapital> = {};
    allowedUpdateFields.forEach(field => {
      if (updateData[field as keyof ShareCapital] !== undefined) {
        filteredUpdateData[field as keyof ShareCapital] = updateData[field as keyof ShareCapital];
      }
    });

    Object.assign(shareCapital, filteredUpdateData)
    return await this.shareCapitalRepository.save(shareCapital)
  }


async getFundingStructure(organizationId: number) {
  const borrowings = await this.borrowingRepository.find({
    where: { organization: { id: organizationId } },
  })

  const grants = await this.grantedFundsRepository.find({
    where: { organization: { id: organizationId } },
  })

  const operational = await this.operationalFundsRepository.find({
    where: { organization: { id: organizationId } },
  })

  const shareCapitals = await this.shareCapitalRepository.find({
    where: { organization: { id: organizationId } },
    relations: ["individualShareholder", "institutionShareholder", "contributions"], 
  })

  const totalBorrowings = this.calculateTotalBorrowings(borrowings);
  const totalGrants = this.calculateTotalGrants(grants);
  const totalOperational = this.calculateTotalOperational(operational);
  const totalShareCapital = this.calculateTotalShareCapital(shareCapitals);
  
  // Calculate overall total
  const totalFundingStructure = totalBorrowings + totalGrants + totalOperational + totalShareCapital;

  return {
    borrowings,
    grants,
    operational,
    shareCapitals,
    summary: {
      totalBorrowings,
      totalGrants,
      totalOperational,
      totalShareCapital,
      totalFundingStructure,
      breakdown: {
        borrowingsPercentage: totalFundingStructure > 0 ? (totalBorrowings / totalFundingStructure) * 100 : 0,
        grantsPercentage: totalFundingStructure > 0 ? (totalGrants / totalFundingStructure) * 100 : 0,
        operationalPercentage: totalFundingStructure > 0 ? (totalOperational / totalFundingStructure) * 100 : 0,
        shareCapitalPercentage: totalFundingStructure > 0 ? (totalShareCapital / totalFundingStructure) * 100 : 0,
      },
      counts: {
        borrowings: borrowings.length,
        grants: grants.length,
        operational: operational.length,
        shareCapitals: shareCapitals.length,
      }
    }
  }
}

  private calculateTotalBorrowings(borrowings: Borrowing[]): number {
    return borrowings.reduce((total, borrowing) => {
      // Use amountBorrowed for total borrowing amount
      const amount = parseFloat(String(borrowing.amountBorrowed || 0));
      return total + amount;
    }, 0);
  }

  private calculateTotalGrants(grants: GrantedFunds[]): number {
    return grants.reduce((total, grant) => {
      // Use amountGranted for total grant amount
      const amount = parseFloat(String(grant.amountGranted || 0));
      return total + amount;
    }, 0);
  }

  private calculateTotalOperational(operational: OperationalFunds[]): number {
    return operational.reduce((total, fund) => {
      // Use amountCommitted for total operational funds
      const amount = parseFloat(String(fund.amountCommitted || 0));
      return total + amount;
    }, 0);
  }

  private calculateTotalShareCapital(shareCapitals: ShareCapital[]): number {
    return shareCapitals.reduce((total, shareCapital) => {
      // Use totalContributedCapitalValue for share capital
      const amount = parseFloat(String(shareCapital.totalContributedCapitalValue || 0));
      return total + amount;
    }, 0);
  }


async updateGrantedFunds(id: number, updateData: Partial<GrantedFunds>) {
  
  const grantedFunds = await this.grantedFundsRepository.findOne({ where: { id } })
  if (!grantedFunds) {
    throw new Error("Granted funds record not found")
  }

  // Clean and process date fields
  const cleanedUpdateData = this.cleanDateFields(updateData);
  this.validateRequiredDates(cleanedUpdateData);
  const processedData = this.processDateFields(cleanedUpdateData);

  // Process grant conditions if provided
  if (processedData.grantConditions) {
    processedData.grantConditions = processedData.grantConditions.map((condition: any) => ({
      ...condition,
      dueDate: condition.dueDate ? new Date(condition.dueDate) : undefined,
      completedDate: condition.completedDate ? new Date(condition.completedDate) : undefined
    }));
  }

  // Process milestones if provided
  if (processedData.milestones) {
    processedData.milestones = processedData.milestones.map((milestone: any) => ({
      ...milestone,
      targetDate: milestone.targetDate ? new Date(milestone.targetDate) : undefined,
      completionDate: milestone.completionDate ? new Date(milestone.completionDate) : undefined
    }));
  }

  Object.assign(grantedFunds, processedData)

  try {
    const savedEntity = await this.grantedFundsRepository.save(grantedFunds)
    return savedEntity
  } catch (saveError: any) {
    throw new Error(`Failed to update granted funds: ${saveError.message}`)
  }
}

async deleteGrantedFunds(id: number) {
  const grantedFunds = await this.grantedFundsRepository.findOne({ where: { id } })
  if (!grantedFunds) {
    throw new Error("Granted funds record not found")
  }

  return await this.grantedFundsRepository.delete(id)
}

async updateOperationalFunds(id: number, updateData: Partial<OperationalFunds>) {
  const operationalFunds = await this.operationalFundsRepository.findOne({ where: { id } })
  if (!operationalFunds) {
    throw new Error("Operational funds record not found")
  }

  Object.assign(operationalFunds, updateData)
  return await this.operationalFundsRepository.save(operationalFunds)
}

async deleteOperationalFunds(id: number) {
  const operationalFunds = await this.operationalFundsRepository.findOne({ where: { id } })
  if (!operationalFunds) {
    throw new Error("Operational funds record not found")
  }

  return await this.operationalFundsRepository.delete(id)
}
}