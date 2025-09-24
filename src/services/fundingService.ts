// @ts-nocheck

import type { Repository } from "typeorm"
import type { Borrowing } from "../entities/Borrowing"
import type { GrantedFunds } from "../entities/GrantedFunds"
import type { OperationalFunds } from "../entities/OperationalFunds"
import type { Organization } from "../entities/Organization"
import { ShareCapital } from "../entities/ShareCapital"
import { IndividualShareholder } from "../entities/IndividualShareholder"
import { InstitutionShareholder } from "../entities/InstitutionShareholder"
import { UploadToCloud } from "../helpers/cloud"

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
    console.log("🚀 [DEBUG] Step 1: Starting recordGrantedFunds");
    console.log("📝 [DEBUG] Input grantData:", JSON.stringify(grantData, null, 2));
    console.log("🏢 [DEBUG] Organization ID:", organizationId);

    // Step 1: Find organization
    console.log("🔍 [DEBUG] Step 2: Finding organization...");
    const organization = await this.organizationRepository.findOne({ where: { id: organizationId } })
    if (!organization) {
      console.error("❌ [DEBUG] Organization not found with ID:", organizationId);
      throw new Error("Organization not found")
    }
    console.log("✅ [DEBUG] Organization found:", organization.name);

    // Step 2: Clean and validate date fields
    console.log("🧹 [DEBUG] Step 3: Cleaning date fields...");
    const cleanedGrantData = this.cleanDateFields(grantData);
    console.log("📅 [DEBUG] Cleaned grant data:", JSON.stringify(cleanedGrantData, null, 2));

    // Step 3: Validate required dates
    console.log("✔️ [DEBUG] Step 4: Validating required dates...");
    this.validateRequiredDates(cleanedGrantData);

    // Step 4: Convert date strings to Date objects
    console.log("🔄 [DEBUG] Step 5: Converting date strings to Date objects...");
    const processedData = this.processDateFields(cleanedGrantData);
    console.log("📆 [DEBUG] Processed data with Date objects:", JSON.stringify(processedData, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    }, 2));

    // Step 5: Process grant conditions
    console.log("📋 [DEBUG] Step 6: Processing grant conditions...");
    if (processedData.grantConditions) {
      processedData.grantConditions = processedData.grantConditions.map((condition: any) => ({
        ...condition,
        dueDate: condition.dueDate ? new Date(condition.dueDate) : undefined,
        completedDate: condition.completedDate ? new Date(condition.completedDate) : undefined
      }));
    }
    console.log("📋 [DEBUG] Processed grant conditions:", JSON.stringify(processedData.grantConditions, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    }, 2));

    // Step 6: Process milestones
    console.log("🎯 [DEBUG] Step 7: Processing milestones...");
    if (processedData.milestones) {
      processedData.milestones = processedData.milestones.map((milestone: any) => ({
        ...milestone,
        targetDate: milestone.targetDate ? new Date(milestone.targetDate) : undefined,
        completionDate: milestone.completionDate ? new Date(milestone.completionDate) : undefined
      }));
    }
    console.log("🎯 [DEBUG] Processed milestones:", JSON.stringify(processedData.milestones, (key, value) => {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    }, 2));

    try {
      // Step 7: Create entity
      console.log("🏗️ [DEBUG] Step 8: Creating GrantedFunds entity...");
      const grantedFunds = this.grantedFundsRepository.create({
        ...processedData,
        organization,
      });
      console.log("📝 [DEBUG] Created entity (before save):", JSON.stringify(grantedFunds, (key, value) => {
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      }, 2));

      // Step 8: Save entity
      console.log("💾 [DEBUG] Step 9: Saving entity to database...");
      const savedEntity = await this.grantedFundsRepository.save(grantedFunds);
      console.log("✅ [DEBUG] Successfully saved entity with ID:", savedEntity.id);

      return savedEntity;
    } catch (saveError: any) {
      console.error("❌ [DEBUG] Database save error:", saveError);
      console.error("❌ [DEBUG] Error details:", {
        message: saveError.message,
        detail: saveError.detail,
        constraint: saveError.constraint,
        column: saveError.column,
        dataType: saveError.dataType,
        value: saveError.value
      });
      throw new Error(`Failed to save granted funds: ${saveError.message}`);
    }
  }

  private cleanDateFields(data: any): any {
    console.log("🧹 [DEBUG] Cleaning date fields in data...");
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
        console.log(`🧹 [DEBUG] Removing empty date field: ${field} (was: "${cleaned[field]}")`);
        delete cleaned[field];
      } else if (cleaned[field]) {
        console.log(`✅ [DEBUG] Date field ${field} has value: ${cleaned[field]}`);
      }
    });

    // Clean string fields that might affect dates
    const stringFields = ['reportingFrequency'];
    stringFields.forEach(field => {
      if (cleaned[field] === "") {
        console.log(`🧹 [DEBUG] Converting empty string to null for: ${field}`);
        cleaned[field] = null;
      }
    });

    return cleaned;
  }

  private validateRequiredDates(data: any): void {
    console.log("✔️ [DEBUG] Validating required dates...");
    const requiredDateFields = ['grantDate', 'projectStartDate', 'projectEndDate'];
    
    for (const field of requiredDateFields) {
      if (!data[field]) {
        console.error(`❌ [DEBUG] Missing required date field: ${field}`);
        throw new Error(`${field} is required and cannot be empty`);
      }
      
      // Validate date format
      const date = new Date(data[field]);
      if (isNaN(date.getTime())) {
        console.error(`❌ [DEBUG] Invalid date format for field: ${field}, value: ${data[field]}`);
        throw new Error(`Invalid date format for ${field}: ${data[field]}`);
      }
      console.log(`✅ [DEBUG] Valid date for ${field}: ${data[field]}`);
    }
  }

  private processDateFields(data: any): any {
    console.log("🔄 [DEBUG] Processing date fields...");
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
            console.log(`🔄 [DEBUG] Converted ${field}: ${data[field]} -> ${dateValue.toISOString()}`);
          } else {
            console.error(`❌ [DEBUG] Failed to convert ${field}: ${data[field]}`);
            delete processed[field];
          }
        } catch (error) {
          console.error(`❌ [DEBUG] Error processing date field ${field}:`, error);
          delete processed[field];
        }
      }
    });

    return processed;
  }

  async recordOperationalFunds(operationalData: Partial<OperationalFunds>, organizationId: number) {
    const organization = await this.organizationRepository.findOne({ where: { id: organizationId } })
    if (!organization) {
      throw new Error("Organization not found")
    }

    const operationalFunds = this.operationalFundsRepository.create({
      ...operationalData,
      organization,
    })

    return await this.operationalFundsRepository.save(operationalFunds)
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

// src/services/fundingService.ts - FIXED recordShareCapital method

async recordShareCapital(
  shareCapitalData: Partial<ShareCapital>, 
  organizationId: number, 
  files?: { paymentProof?: Express.Multer.File[] }
) {
  console.log("🚀 [SERVICE DEBUG] Starting recordShareCapital");
  console.log("📝 [SERVICE DEBUG] Input data:", JSON.stringify(shareCapitalData, null, 2));
  
  const organization = await this.organizationRepository.findOne({ 
    where: { id: organizationId } 
  });
  
  if (!organization) {
    throw new Error("Organization not found");
  }

  // Validate shareholder exists
  const { shareholderId, shareholderType } = shareCapitalData;
  let shareholder: IndividualShareholder | InstitutionShareholder | null = null;

  if (shareholderType === 'individual') {
    shareholder = await this.individualShareholderRepository.findOne({ 
      where: { id: shareholderId, organization: { id: organizationId } } 
    });
  } else if (shareholderType === 'institution') {
    shareholder = await this.institutionShareholderRepository.findOne({ 
      where: { id: shareholderId, organization: { id: organizationId } } 
    });
  }

  if (!shareholder) {
    throw new Error("Shareholder not found");
  }

  // Handle payment proof upload
  let paymentProofUrl = null;
  if (files?.paymentProof && files.paymentProof.length > 0) {
    try {
      const uploadResult = await UploadToCloud(files.paymentProof[0]);
      paymentProofUrl = uploadResult.secure_url;
    } catch (uploadError: any) {
      throw new Error(`Failed to upload payment proof: ${uploadError.message}`);
    }
  }

  // 🔧 FIX: Ensure numeric types before processing
  const numberOfShares = Number(shareCapitalData.numberOfShares) || 0;
  const valuePerShare = Number(shareCapitalData.valuePerShare) || 0;
  
  console.log("🔢 [SERVICE DEBUG] Parsed numberOfShares:", numberOfShares, typeof numberOfShares);
  console.log("🔢 [SERVICE DEBUG] Parsed valuePerShare:", valuePerShare, typeof valuePerShare);

  // Check for existing share capital record
  const existingShareCapital = await this.shareCapitalRepository.findOne({
    where: {
      shareholderId,
      shareholderType,
      organization: { id: organizationId }
    },
    relations: ["individualShareholder", "institutionShareholder"]
  });

  // Use transaction to prevent race conditions
  return await this.shareCapitalRepository.manager.transaction(async manager => {
    if (existingShareCapital) {
      // UPDATE EXISTING RECORD
      console.log("🔄 [SERVICE DEBUG] Updating existing record");
      console.log("📊 [SERVICE DEBUG] Current shares in DB:", existingShareCapital.numberOfShares, typeof existingShareCapital.numberOfShares);
      
      // 🔧 FIX: Ensure the existing record has numeric values
      existingShareCapital.numberOfShares = Number(existingShareCapital.numberOfShares) || 0;
      existingShareCapital.valuePerShare = Number(existingShareCapital.valuePerShare) || 0;
      
      console.log("📊 [SERVICE DEBUG] After conversion - Current shares:", existingShareCapital.numberOfShares);
      
      // Add new contribution
      existingShareCapital.addContribution(
        numberOfShares,
        valuePerShare,
        {
          paymentMethod: shareCapitalData.paymentDetails?.paymentMethod || '',
          paymentDate: shareCapitalData.paymentDetails?.paymentDate ? new Date(shareCapitalData.paymentDetails.paymentDate) : new Date(),
          paymentReference: shareCapitalData.paymentDetails?.paymentReference || '',
          bankName: shareCapitalData.paymentDetails?.bankName,
          accountNumber: shareCapitalData.paymentDetails?.accountNumber,
          transactionId: shareCapitalData.paymentDetails?.transactionId,
          paymentProofUrl: paymentProofUrl
        }
      );

      console.log("📊 [SERVICE DEBUG] After addContribution - Total shares:", existingShareCapital.numberOfShares);
      console.log("📊 [SERVICE DEBUG] After addContribution - Total value:", existingShareCapital.totalContributedCapitalValue);

      // Update notes
      if (shareCapitalData.notes) {
        existingShareCapital.notes = existingShareCapital.notes 
          ? `${existingShareCapital.notes}\n---\n${new Date().toISOString()}: ${shareCapitalData.notes}`
          : shareCapitalData.notes;
      }

      // Update date of contribution to latest
      if (shareCapitalData.dateOfContribution) {
        existingShareCapital.dateOfContribution = new Date(shareCapitalData.dateOfContribution);
      }

      // 🔧 FIX: Explicitly ensure numeric types before save
      const recordToSave = {
        ...existingShareCapital,
        numberOfShares: Number(existingShareCapital.numberOfShares),
        valuePerShare: Number(existingShareCapital.valuePerShare),
        totalContributedCapitalValue: Number(existingShareCapital.totalContributedCapitalValue),
        contributionCount: Number(existingShareCapital.contributionCount)
      };

      console.log("💾 [SERVICE DEBUG] Saving record:", {
        numberOfShares: recordToSave.numberOfShares,
        valuePerShare: recordToSave.valuePerShare,
        totalContributedCapitalValue: recordToSave.totalContributedCapitalValue,
        contributionCount: recordToSave.contributionCount
      });

      const updatedRecord = await manager.save(ShareCapital, recordToSave);
      
      console.log("✅ [SERVICE DEBUG] Saved record:", {
        id: updatedRecord.id,
        numberOfShares: updatedRecord.numberOfShares,
        valuePerShare: updatedRecord.valuePerShare,
        totalContributedCapitalValue: updatedRecord.totalContributedCapitalValue,
        contributionCount: updatedRecord.contributionCount
      });

      return updatedRecord;

    } else {
      // CREATE NEW RECORD
      console.log("🆕 [SERVICE DEBUG] Creating new share capital record");
      
      const shareCapital = manager.create(ShareCapital, {
        ...shareCapitalData,
        numberOfShares: numberOfShares, // Already converted to number
        valuePerShare: valuePerShare,   // Already converted to number
        organization,
        individualShareholder: shareholderType === 'individual' ? shareholder as IndividualShareholder : null,
        institutionShareholder: shareholderType === 'institution' ? shareholder as InstitutionShareholder : null,
        contributionCount: 1,
        firstContributionDate: shareCapitalData.dateOfContribution ? new Date(shareCapitalData.dateOfContribution) : new Date(),
        lastContributionDate: null
      });

      // Add payment proof URL
      if (paymentProofUrl) {
        shareCapital.paymentDetails = {
          ...shareCapital.paymentDetails,
          paymentProofUrl,
          paymentProofUrls: [paymentProofUrl]
        };
      }

      const newRecord = await manager.save(shareCapital);
      console.log("✅ [SERVICE DEBUG] Created new record:", {
        id: newRecord.id,
        numberOfShares: newRecord.numberOfShares,
        valuePerShare: newRecord.valuePerShare,
        totalContributedCapitalValue: newRecord.totalContributedCapitalValue
      });
      
      return newRecord;
    }
  });
}

  async getShareCapitalByOrganization(organizationId: number) {
    // This now returns aggregated records (one per shareholder)
    return await this.shareCapitalRepository.find({
      where: { organization: { id: organizationId } },
      relations: ["individualShareholder", "institutionShareholder"],
      order: { dateOfContribution: "DESC" }
    })
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

    // IMPORTANT: When updating aggregated record, don't change numberOfShares or totalContributedCapitalValue directly
    // Only allow updates to metadata fields
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
      relations: ["individualShareholder", "institutionShareholder"],
    })

    // NEW: Calculate total sums from actual data
    const totalBorrowings = this.calculateTotalBorrowings(borrowings);
    const totalGrants = this.calculateTotalGrants(grants);
    const totalOperational = this.calculateTotalOperational(operational);
    const totalShareCapital = this.calculateTotalShareCapital(shareCapitals);
    
    // NEW: Calculate overall total
    const totalFundingStructure = totalBorrowings + totalGrants + totalOperational + totalShareCapital;

    return {
      borrowings,
      grants,
      operational,
      shareCapitals,
      // NEW: Add summary with totals while maintaining original structure
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
  console.log("🔄 [SERVICE DEBUG] Starting updateGrantedFunds for ID:", id);
  
  const grantedFunds = await this.grantedFundsRepository.findOne({ where: { id } })
  if (!grantedFunds) {
    console.error("❌ [SERVICE DEBUG] Granted funds not found with ID:", id);
    throw new Error("Granted funds record not found")
  }

  // Clean and process date fields
  console.log("🧹 [SERVICE DEBUG] Cleaning and processing update data...");
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

  console.log("📝 [SERVICE DEBUG] Applying update to entity...");
  Object.assign(grantedFunds, processedData)

  try {
    const savedEntity = await this.grantedFundsRepository.save(grantedFunds)
    console.log("✅ [SERVICE DEBUG] Successfully updated granted funds with ID:", savedEntity.id);
    return savedEntity
  } catch (saveError: any) {
    console.error("❌ [SERVICE DEBUG] Database save error:", saveError);
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