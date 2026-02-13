

// @ts-nocheck
import { In } from "typeorm";

import { LoanWorkflowService } from "../services/loanWorkflowService";
import { LoanWorkflow, WorkflowStep } from "../entities/LoanWorkflow";
import { LoanReview, ReviewDecision } from "../entities/LoanReview";
import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { LoanApplicationService, GuarantorFiles, CollateralFiles, BorrowerFiles, InstitutionFiles, ServiceResponse } from "../services/loanApplicationService";
import { BorrowerProfile, Gender, ParentsInformation, RelationshipType } from "../entities/BorrowerProfile";
import { Loan, BorrowerType, MaritalStatus, LoanApprovalData, LoanStatus, ShareholderBoardMemberInfo } from "../entities/Loan";
import { LoanCollateral } from "../entities/LoanCollateral";
import { Organization } from "../entities/Organization";
import { Guarantor, ExtendedGuarantorData } from "../entities/Guarantor";
import { User, UserRole } from "../entities/User";
import { RepaymentSchedule } from "../entities/RepaymentSchedule";
import dbConnection from "../db";
import { parseISO, isValid } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { UploadToCloud } from "../helpers/cloud";
import { ClientBorrowerAccount } from "../entities/ClientBorrowerAccount";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: string;
    organizationId: number | null;
    username: string;
    email: string;
  };
  organizationId?: number;
}



class LoanApplicationController {
  private userRepository = dbConnection.getRepository(User);
  private loanApplicationService: LoanApplicationService;
  private loanWorkflowService: LoanWorkflowService;
  constructor() {
    this.loanApplicationService = new LoanApplicationService(
      dbConnection.getRepository(BorrowerProfile) as any,
      dbConnection.getRepository(Loan) as any,
      dbConnection.getRepository(LoanCollateral) as any,
      dbConnection.getRepository(Organization) as any,
      dbConnection.getRepository(Guarantor) as any,
      dbConnection.getRepository(User) as any,
      dbConnection.getRepository(RepaymentSchedule) as any,

    );
    this.loanWorkflowService = new LoanWorkflowService(
      dbConnection.getRepository(LoanWorkflow) as any,
      dbConnection.getRepository(Loan) as any,
      dbConnection.getRepository(User) as any,
      dbConnection.getRepository(LoanReview) as any
    );
  }




  getDashboardAnalytics = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log('=== GET DASHBOARD ANALYTICS START ===');

      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      // Call service method to get analytics
      const result = await this.loanApplicationService.getDashboardAnalytics(organizationId);

      if (result.success) {
        console.log('✅ Dashboard analytics retrieved successfully');
        res.status(200).json(result);
      } else {
        console.error('❌ Failed to retrieve dashboard analytics:', result.message);
        res.status(500).json(result);
      }

    } catch (error: any) {
      console.error('❌ Get dashboard analytics error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching dashboard analytics",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };


  createLoanApplication = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║  ENHANCED LOAN APPLICATION CREATION WITH AUTO-POPULATION      ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');

      // STEP 1: VALIDATION
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.error('❌ Validation errors:', errors.array());
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      // STEP 2: EXTRACT ORGANIZATION ID
      const organizationId = parseInt(req.params.organizationId);
      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      // ===== NEW: AUTO-POPULATION LOGIC FOR REPEAT/RETURNING BORROWERS =====
      console.log('🔍 STEP 2.1: CHECKING FOR REPEAT/RETURNING BORROWER AUTO-POPULATION');
      let existingBorrowerId: number | null = null;
      let existingClientAccount: any = null;
      let existingBorrowerProfile: any = null;
      const relationshipType = req.body.relationshipWithNDFSP;

      // Check if this is a repeat or returning borrower
      if (relationshipType === RelationshipType.REPEAT_BORROWER || relationshipType === RelationshipType.RETURNING_BORROWER) {

        // Extract identifier based on borrower type
        const borrowerType = req.body.borrowerType || BorrowerType.INDIVIDUAL;
        let identifier: string | null = null;

        if (borrowerType === BorrowerType.INDIVIDUAL) {
          identifier = req.body.nationalId;
          console.log('👤 Individual borrower identifier (National ID):', identifier);
        } else {
          identifier = req.body.institutionProfile?.tinNumber;
          console.log('🏢 Institution borrower identifier (TIN):', identifier);
        }

        if (identifier) {
          // Search for existing borrower based on relationship type
          if (relationshipType === RelationshipType.REPEAT_BORROWER) {
            console.log('🔍 Searching in client_borrower_accounts...');

            // Query client borrower accounts
            const clientAccountRepository = dbConnection.getRepository(ClientBorrowerAccount);
            existingClientAccount = await clientAccountRepository.findOne({
              where: {
                organizationId,
                ...(borrowerType === BorrowerType.INDIVIDUAL
                  ? { nationalId: identifier }
                  : { tinNumber: identifier }
                ),
                isActive: true
              },
              relations: ['borrower', 'loan']
            });

            if (existingClientAccount) {
              console.log('✅ Found existing client borrower account:', existingClientAccount.accountNumber);
              existingBorrowerId = existingClientAccount.borrowerId;
            } else {
              console.log('❌ ERROR: Repeat borrower selected but no client account found');
              res.status(400).json({
                success: false,
                message: `Cannot process repeat borrower without existing client account. Please create client account first for national ID: ${identifier}`
              });
              return;
            }
          } else if (relationshipType === RelationshipType.RETURNING_BORROWER) {
            console.log('🔍 Searching in borrower_profiles...');

            // Query borrower profiles
            const borrowerRepository = dbConnection.getRepository(BorrowerProfile);
            existingBorrowerProfile = await borrowerRepository.findOne({
              where: {
                organizationId,
                nationalId: identifier,
                isActive: true
              }
            });

            if (existingBorrowerProfile) {
              console.log('✅ Found existing borrower profile:', existingBorrowerProfile.borrowerId);
              existingBorrowerId = existingBorrowerProfile.id;
            } else {
              console.log('⚠️ No existing borrower found for returning borrower');
            }
          }

          if (existingBorrowerId) {
            console.log('🎯 Will use existing borrower ID:', existingBorrowerId);
          } else if (relationshipType === RelationshipType.RETURNING_BORROWER) {
            console.log('⚠️ No existing borrower found for returning borrower, will create new borrower profile');
          }
        } else {
          console.log('⚠️ No identifier provided for repeat/returning borrower search');
          if (relationshipType === RelationshipType.REPEAT_BORROWER) {
            res.status(400).json({
              success: false,
              message: "National ID or TIN is required for repeat borrower"
            });
            return;
          }
        }
      }

      if (!existingBorrowerId) {
        console.log('🔍 Checking for existing borrower by national ID...');
        const borrowerType = req.body.borrowerType || BorrowerType.INDIVIDUAL;
        const nationalId = req.body.nationalId;

        if (nationalId) {
          const borrowerRepository = dbConnection.getRepository(BorrowerProfile);
          const existingBorrower = await borrowerRepository.findOne({
            where: {
              organizationId,
              nationalId: nationalId,
              isActive: true
            }
          });

          if (existingBorrower) {
            console.log('✅ Found existing borrower by national ID:', existingBorrower.borrowerId);
            existingBorrowerId = existingBorrower.id;

            // ✅ CRITICAL: For repeat borrowers without client account, throw error
            if (relationshipType === RelationshipType.REPEAT_BORROWER) {
              const clientAccountRepository = dbConnection.getRepository(ClientBorrowerAccount);
              const clientAccount = await clientAccountRepository.findOne({
                where: {
                  organizationId,
                  nationalId: nationalId,
                  isActive: true
                }
              });

              if (!clientAccount) {
                console.log('❌ ERROR: Repeat borrower selected but no client account found');
                res.status(400).json({
                  success: false,
                  message: `Cannot process repeat borrower without existing client account. Please create client account first for national ID: ${nationalId}`
                });
                return;
              }
            }
          }
        }
      }

      // STEP 3: PARSE ADDRESS
      let parsedAddress = req.body.address;
      if (typeof req.body.address === 'string') {
        try {
          parsedAddress = JSON.parse(req.body.address);
        } catch (parseError) {
          res.status(400).json({
            success: false,
            message: "Invalid address format",
          });
          return;
        }
      }

      // STEP 4: DETERMINE BORROWER TYPE
      const borrowerType = req.body.borrowerType || BorrowerType.INDIVIDUAL;
      console.log('   Borrower Type:', borrowerType);

      // STEP 5: PARSE ENHANCED DATA
      let parentsInformation: ParentsInformation | null = null;
      if (req.body.parentsInformation) {
        try {
          parentsInformation = typeof req.body.parentsInformation === 'string'
            ? JSON.parse(req.body.parentsInformation)
            : req.body.parentsInformation;
        } catch (e) {
          console.error('Failed to parse parents information:', e);
        }
      }

      // Parse document descriptions
      const parseDescriptions = (field: string): string[] => {
        if (!req.body[field]) return [];
        try {
          return typeof req.body[field] === 'string'
            ? JSON.parse(req.body[field])
            : req.body[field];
        } catch (e) {
          console.error(`Failed to parse ${field}:`, e);
          return [];
        }
      };

      const borrowerDocumentDescriptions = parseDescriptions('borrowerDocumentDescriptions');
      const occupationSupportingDocDescriptions = parseDescriptions('occupationSupportingDocDescriptions');
      const loanRelevantDocumentDescriptions = parseDescriptions('loanRelevantDocumentDescriptions');
      const institutionRelevantDocumentDescriptions = parseDescriptions('institutionRelevantDocumentDescriptions');
      const shareholderAdditionalDocDescriptions = parseDescriptions('shareholderAdditionalDocDescriptions');
      const boardMemberAdditionalDocDescriptions = parseDescriptions('boardMemberAdditionalDocDescriptions');
      const guarantorDocumentDescriptions = parseDescriptions('guarantorDocumentDescriptions');
      const collateralAdditionalDocDescriptions = parseDescriptions('collateralAdditionalDocDescriptions');

      console.log('📄 Document descriptions parsed:', {
        borrower: borrowerDocumentDescriptions.length,
        occupation: occupationSupportingDocDescriptions.length,
        loanRelevant: loanRelevantDocumentDescriptions.length,
        institution: institutionRelevantDocumentDescriptions.length,
        guarantor: guarantorDocumentDescriptions.length,
        collateral: collateralAdditionalDocDescriptions.length
      });


      const sourceBorrowerId = req.body.sourceBorrowerId
        ? parseInt(req.body.sourceBorrowerId)
        : null;

      const clientAccountId = req.body.clientAccountId
        ? parseInt(req.body.clientAccountId)
        : null;

      console.log('🔍 Received IDs from frontend:', {
        sourceBorrowerId,
        clientAccountId,
        relationshipType: req.body.relationshipWithNDFSP
      });

      const borrowerData = borrowerType === BorrowerType.INDIVIDUAL ? {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        middleName: req.body.middleName || undefined,
        nationalId: req.body.nationalId,
        nationalIdDistrict: req.body.nationalIdDistrict || undefined,
        nationalIdSector: req.body.nationalIdSector || undefined,
        gender: req.body.gender,
        dateOfBirth: this.parseDate(req.body.dateOfBirth),
        placeOfBirth: req.body.placeOfBirth || undefined,
        maritalStatus: req.body.maritalStatus,
        primaryPhone: req.body.primaryPhone,
        alternativePhone: req.body.alternativePhone || undefined,
        email: req.body.email || undefined,
        address: parsedAddress,
        occupation: req.body.occupation || undefined,
        monthlyIncome: req.body.monthlyIncome ? parseFloat(req.body.monthlyIncome) : undefined,
        incomeSource: req.body.incomeSource || undefined,
        relationshipWithNDFSP: relationshipType,
        previousLoansPaidOnTime: req.body.previousLoansPaidOnTime ? parseInt(req.body.previousLoansPaidOnTime) : undefined,
        notes: req.body.borrowerNotes || undefined,
        parentsInformation: parentsInformation || undefined,
      } : {
        firstName: req.body.institutionProfile?.institutionName || 'Institution Borrower',
        lastName: 'N/A',
        nationalId: (() => {
          const tinNumber = req.body.institutionProfile?.tinNumber?.trim();
          if (tinNumber && tinNumber.length > 0) {
            return tinNumber.substring(0, 16);
          }
          const timestamp = Date.now().toString().slice(-10);
          return `I${timestamp.substring(0, 15)}`;
        })(),
        gender: Gender.OTHER,
        dateOfBirth: new Date(),
        maritalStatus: MaritalStatus.SINGLE,
        primaryPhone: req.body.institutionProfile?.contactPhone || req.body.primaryPhone,
        alternativePhone: req.body.alternativePhone || undefined,
        email: req.body.institutionProfile?.contactEmail || req.body.email || undefined,
        address: parsedAddress,
        occupation: 'Institution',
        relationshipWithNDFSP: req.body.relationshipWithNDFSP || RelationshipType.NEW_BORROWER,
        previousLoansPaidOnTime: 0,
        notes: req.body.borrowerNotes || `Institution: ${req.body.institutionProfile?.institutionName}`,
      };

      // STEP 7: PARSE ADDITIONAL DATA
      let incomeSources = null;
      if (req.body.incomeSources) {
        try {
          incomeSources = typeof req.body.incomeSources === 'string'
            ? JSON.parse(req.body.incomeSources)
            : req.body.incomeSources;
        } catch (e) {
          console.error('Failed to parse income sources:', e);
        }
      }

      let spouseInfo = null;
      if (borrowerType === BorrowerType.INDIVIDUAL &&
        req.body.maritalStatus === MaritalStatus.MARRIED &&
        req.body.spouseInfo) {
        try {
          spouseInfo = typeof req.body.spouseInfo === 'string'
            ? JSON.parse(req.body.spouseInfo)
            : req.body.spouseInfo;
        } catch (e) {
          console.error('Failed to parse spouse info:', e);
        }
      }

      let institutionProfile = null;
      if (borrowerType === BorrowerType.INSTITUTION && req.body.institutionProfile) {
        try {
          institutionProfile = typeof req.body.institutionProfile === 'string'
            ? JSON.parse(req.body.institutionProfile)
            : req.body.institutionProfile;
        } catch (e) {
          console.error('Failed to parse institution profile:', e);
        }
      }

      let shareholderBoardMembers: ShareholderBoardMemberInfo[] | null = null;
      if (borrowerType === BorrowerType.INSTITUTION && req.body.shareholderBoardMembers) {
        try {
          const parsed = typeof req.body.shareholderBoardMembers === 'string'
            ? JSON.parse(req.body.shareholderBoardMembers)
            : req.body.shareholderBoardMembers;

          if (Array.isArray(parsed)) {
            shareholderBoardMembers = parsed;
            console.log('✅ Parsed', shareholderBoardMembers.length, 'shareholder/board members');
          }
        } catch (e) {
          console.error('Failed to parse shareholder/board members:', e);
        }
      }

      // STEP 8: PREPARE LOAN DATA
      const loanData = {
        purposeOfLoan: req.body.purposeOfLoan,
        branchName: req.body.branchName,
        businessOfficer: req.body.businessOfficer,
        disbursedAmount: parseFloat(req.body.disbursedAmount),
        businessType: req.body.businessType || null,
        businessStructure: req.body.businessStructure || null,
        economicSector: req.body.economicSector || null,
        notes: req.body.loanNotes || undefined,
        borrowerType: borrowerType,
        institutionProfile: institutionProfile,
        maritalStatus: req.body.maritalStatus || null,
        spouseInfo: spouseInfo,
        shareholderBoardMembers: shareholderBoardMembers,
        incomeSources: incomeSources,
        paymentPeriod: req.body.paymentPeriod || null,
        customPaymentPeriod: req.body.customPaymentPeriod || null,
        paymentFrequency: req.body.paymentFrequency || null,
        preferredPaymentFrequency: req.body.preferredPaymentFrequency || null,
        ...(borrowerType === BorrowerType.INDIVIDUAL && {
          incomeSource: req.body.selectedIncomeSource || req.body.incomeSource || undefined,
          otherIncomeSource: req.body.otherIncomeSource || undefined,
          incomeFrequency: req.body.incomeFrequency || undefined,
          incomeAmount: req.body.incomeAmount ? parseFloat(req.body.incomeAmount) : undefined,
        }),
        borrowerDocumentDescriptions: JSON.stringify(borrowerDocumentDescriptions),
        occupationSupportingDocDescriptions: JSON.stringify(occupationSupportingDocDescriptions),
        loanRelevantDocumentDescriptions: JSON.stringify(loanRelevantDocumentDescriptions),
        institutionRelevantDocumentDescriptions: JSON.stringify(institutionRelevantDocumentDescriptions),
        shareholderAdditionalDocDescriptions: JSON.stringify(shareholderAdditionalDocDescriptions),
        boardMemberAdditionalDocDescriptions: JSON.stringify(boardMemberAdditionalDocDescriptions),
        guarantorDocumentDescriptions: JSON.stringify(guarantorDocumentDescriptions),
        collateralAdditionalDocDescriptions: JSON.stringify(collateralAdditionalDocDescriptions),
        existingBorrowerId: sourceBorrowerId,

      };

      // STEP 9: PREPARE COLLATERAL DATA
      const collateralData = {
        collateralType: req.body.collateralType,
        description: req.body.collateralDescription || '',
        collateralValue: req.body.collateralValue ? parseFloat(req.body.collateralValue) : 0,
        guarantorName: req.body.guarantorName || undefined,
        guarantorPhone: req.body.guarantorPhone || undefined,
        guarantorAddress: req.body.guarantorAddress || undefined,
        upiNumber: req.body.upiNumber || undefined,
        valuationDate: req.body.valuationDate ? this.parseDate(req.body.valuationDate) : undefined,
        valuedBy: req.body.valuedBy || undefined,
        notes: req.body.collateralNotes || undefined,
      };

      // STEP 10: PARSE GUARANTORS
      let guarantorsData: Array<any> = [];
      if (req.body.guarantors) {
        try {
          const parsed = typeof req.body.guarantors === 'string'
            ? JSON.parse(req.body.guarantors)
            : req.body.guarantors;

          if (Array.isArray(parsed)) {
            guarantorsData = parsed;
            console.log('✅ Parsed', guarantorsData.length, 'guarantors');
          }
        } catch (e) {
          console.error('Failed to parse guarantors:', e);
        }
      } else if (req.body.guarantorName && req.body.guarantorPhone) {
        guarantorsData.push({
          name: req.body.guarantorName,
          phone: req.body.guarantorPhone,
          address: req.body.guarantorAddress,
          guaranteedAmount: req.body.collateralValue ? parseFloat(req.body.collateralValue) : undefined,
        });
      }

      const collateralDataWithGuarantors = {
        ...collateralData,
        guarantorsData: guarantorsData.length > 0 ? guarantorsData : undefined,
      };

      // STEP 11: EXTRACT FILES
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      console.log('📁 Files received:', Object.keys(files || {}).join(', '));

      if (files?.guarantorAdditionalDocs) {
        console.log(`📁 guarantorAdditionalDocs: ${files.guarantorAdditionalDocs.length} files`);
        files.guarantorAdditionalDocs.forEach((file, index) => {
          console.log(`   [${index}] ${file.originalname} - ${file.mimetype} - ${file.size} bytes`);
        });
      } else {
        console.log('⚠️ No guarantorAdditionalDocs files received');
      }


      const guarantorFiles: GuarantorFiles = {
        guarantorIdentification: files?.guarantorIdentification || [],
        guarantorCrbReport: files?.guarantorCrbReport || [],
        guarantorAdditionalDocs: files?.guarantorAdditionalDocs || [],
      };



      const collateralFiles: CollateralFiles = {
        proofOfOwnership: files?.proofOfOwnership || [],
        ownerIdentification: files?.ownerIdentification || [],
        legalDocument: files?.legalDocument || [],
        physicalEvidence: files?.physicalEvidence || [],
        valuationReport: files?.valuationReport || [],
        additionalCollateralDocs: files?.additionalCollateralDocs || [],
        upiFile: files?.upiFile || [],
      };

      const borrowerFiles: BorrowerFiles = {
        marriageCertificate: files?.marriageCertificate || [],
        spouseCrbReport: files?.spouseCrbReport || [],
        spouseIdentification: files?.spouseIdentification || [],
        witnessCrbReport: files?.witnessCrbReport || [],
        witnessIdentification: files?.witnessIdentification || [],
        borrowerDocuments: files?.borrowerDocuments || [],
        occupationSupportingDocuments: files?.occupationSupportingDocuments || [],
        loanRelevantDocuments: files?.loanRelevantDocuments || [],
      };

      const institutionFiles: InstitutionFiles = borrowerType === BorrowerType.INSTITUTION ? {
        institutionLegalDocument: files?.institutionLegalDocument || [],
        cooperativeLegalDocument: files?.cooperativeLegalDocument || [],
        otherInstitutionLegalDocument: files?.otherInstitutionLegalDocument || [],
        institutionLicense: files?.institutionLicense || [],
        institutionTradingLicense: files?.institutionTradingLicense || [],
        institutionRegistration: files?.institutionRegistration || [],
        shareholderIdentification: files?.shareholderIdentification || [],
        boardMemberIdentification: files?.boardMemberIdentification || [],
        proofOfShares: files?.proofOfShares || [],
        boardResolution: files?.boardResolution || [],
        shareholderCrbReport: files?.shareholderCrbReport || [],
        boardMemberCrbReport: files?.boardMemberCrbReport || [],
        shareholderAdditionalDocs: files?.shareholderAdditionalDocs || [],
        boardMemberAdditionalDocs: files?.boardMemberAdditionalDocs || [],
        institutionRelevantDocuments: files?.institutionRelevantDocuments || [],
      } : {
        institutionLegalDocument: [],
        cooperativeLegalDocument: [],
        otherInstitutionLegalDocument: [],
        institutionLicense: [],
        institutionTradingLicense: [],
        institutionRegistration: [],
        shareholderIdentification: [],
        boardMemberIdentification: [],
        proofOfShares: [],
        boardResolution: [],
        shareholderCrbReport: [],
        boardMemberCrbReport: [],
        shareholderAdditionalDocs: [],
        boardMemberAdditionalDocs: [],
        institutionRelevantDocuments: [],
      };

      const fileSummary = {
        collateral: Object.values(collateralFiles).reduce((total, arr) => total + arr.length, 0),
        guarantor: Object.values(guarantorFiles).reduce((total, arr) => total + arr.length, 0),
        borrower: Object.values(borrowerFiles).reduce((total, arr) => total + arr.length, 0),
        institution: Object.values(institutionFiles).reduce((total, arr) => total + arr.length, 0),
      };
      console.log('📊 Files summary:', fileSummary);

      // STEP 12: CALL SERVICE (with existing borrower ID)
      console.log('🚀 Calling service to create loan application...');
      const result = await this.loanApplicationService.createCompleteLoanApplication(
        borrowerData,
        loanData,
        collateralDataWithGuarantors,
        organizationId,
        req.user?.id || null,
        collateralFiles,
        guarantorFiles,
        borrowerFiles,
        institutionFiles,
        existingBorrowerId,
        sourceBorrowerId,
        clientAccountId
      );

      // STEP 13: SEND RESPONSE
      if (result.success) {
        console.log('✅ Loan application created successfully');
        console.log('   Loan ID:', result.data?.loan?.loanId);
        if (existingBorrowerId) {
          console.log('   Used existing borrower ID:', existingBorrowerId);
          console.log('   Relationship type:', relationshipType);
        }
        res.status(201).json(result);
      } else {
        console.error('❌ Loan application creation failed:', result.message);
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('❌ CRITICAL ERROR:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error during loan application creation",
        debugInfo: process.env.NODE_ENV === "development" ? {
          error: error.message,
          stack: error.stack
        } : undefined,
      });
    }
  };


  getLoansForAccount = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { organizationId, accountNumber } = req.params;

      const result = await this.loanApplicationService.getLoansForClientAccount(
        accountNumber,
        parseInt(organizationId)
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  };


  getClientAccountDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { organizationId, accountNumber } = req.params;

      const result = await this.loanApplicationService.getClientAccountWithLoans(
        accountNumber,
        parseInt(organizationId)
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  };

  rejectAndCloseLoan = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log('=== REJECT AND CLOSE LOAN ENDPOINT START ===');

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);
      const approvedBy = req.user?.id;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      if (!approvedBy) {
        res.status(401).json({
          success: false,
          message: "User authentication required",
        });
        return;
      }

      // Verify user is Managing Director
      if (req.user?.role !== UserRole.MANAGING_DIRECTOR && req.user?.role !== UserRole.CLIENT) {
        res.status(403).json({
          success: false,
          message: "Only Managing Director can reject and close loans",
        });
        return;
      }

      const { rejectionReason, notes, loanAnalysisNote } = req.body; // ✅ NEW: Get loanAnalysisNote

      const result = await this.loanApplicationService.rejectAndCloseLoan(
        loanId,
        rejectionReason,
        approvedBy,
        organizationId,
        notes,
        loanAnalysisNote // ✅ NEW: Pass loan analysis note
      );

      if (result.success) {
        console.log('✓ Loan rejected and closed successfully');
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('❌ Reject and close loan error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while rejecting and closing loan",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  approveAndCloseLoan = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log('=== APPROVE AND CLOSE LOAN ENDPOINT START ===');

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);
      const approvedBy = req.user?.id;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      if (!approvedBy) {
        res.status(401).json({
          success: false,
          message: "User authentication required",
        });
        return;
      }

      // Verify user is Managing Director
      if (req.user?.role !== UserRole.MANAGING_DIRECTOR && req.user?.role !== UserRole.CLIENT) {
        res.status(403).json({
          success: false,
          message: "Only Managing Director can approve and close loans",
        });
        return;
      }

      const { approvalReason, notes, loanAnalysisNote } = req.body; // ✅ NEW: Get loanAnalysisNote

      const result = await this.loanApplicationService.approveAndCloseLoan(
        loanId,
        approvalReason,
        approvedBy,
        organizationId,
        notes,
        loanAnalysisNote // ✅ NEW: Pass loan analysis note
      );

      if (result.success) {
        console.log('✓ Loan approved and closed successfully');
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('❌ Approve and close loan error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while approving and closing loan",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getPendingLoanApplications = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log('=== GET PENDING LOAN APPLICATIONS START ===');

      const organizationId = parseInt(req.params.organizationId);
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const search = req.query.search as string | undefined;
      const statusFilter = req.query.statusFilter as 'pending' | 'rejected' | 'all' | 'completed' | undefined;
      const userRole = req.user?.role;
      const userId = req.user?.id;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      console.log('📊 Query parameters:', {
        organizationId,
        page,
        limit,
        search: search || 'none',
        statusFilter: statusFilter || 'all',

      });

      // ✅ Call enhanced service method with workflow and analysis reports
      const result = await this.loanApplicationService.getPendingLoanApplicationsWithWorkflow(
        organizationId,
        page,
        limit,
        search,
        statusFilter,
        userRole
      );

      if (result.success) {
        // ✅ NEW: Log analysis report statistics
        const loansWithReports = result.data?.filter((loan: any) =>
          loan.analysisReportSummary !== null
        ).length || 0;

        const totalReports = result.data?.reduce((sum: number, loan: any) =>
          sum + (loan.analysisReportSummary?.totalReports || 0), 0
        ) || 0;

        console.log('✅ Loans retrieved successfully:', {
          totalLoans: result.data?.length || 0,
          loansWithAnalysisReports: loansWithReports,
          totalAnalysisReports: totalReports,
          page,
          totalPages: result.pagination?.totalPages
        });

        res.status(200).json(result);
      } else {
        console.error('❌ Failed to retrieve loans:', result.message);
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error('❌ Get pending loans error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching pending loans",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };


  getCompletedLoans = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const search = req.query.search as string | undefined;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      // Only Managing Director can view completed loans
      if (req.user?.role !== UserRole.MANAGING_DIRECTOR && req.user?.role !== UserRole.CLIENT) {
        res.status(403).json({
          success: false,
          message: "Only Managing Director can view completed loans",
        });
        return;
      }

      const result = await this.loanApplicationService.getPendingLoanApplications(
        organizationId,
        page,
        limit,
        search,
        'completed',
        req.user?.role
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Get completed loans error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching completed loans",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  reopenCompletedLoanForRework = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log('=== REOPEN COMPLETED LOAN FOR REWORK START ===');

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);
      const reopenedBy = req.user?.id;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      if (!reopenedBy) {
        res.status(401).json({
          success: false,
          message: "User authentication required",
        });
        return;
      }

      // Only Managing Director can reopen completed loans
      if (req.user?.role !== UserRole.MANAGING_DIRECTOR && req.user?.role !== UserRole.CLIENT) {
        res.status(403).json({
          success: false,
          message: "Only Managing Director can reopen completed loans",
        });
        return;
      }

      const { reopenReason } = req.body;

      // Find the completed loan
      const loan = await dbConnection.getRepository(Loan).findOne({
        where: { id: loanId, organizationId, isCompleted: true }
      });

      if (!loan) {
        res.status(404).json({
          success: false,
          message: "Completed loan not found",
        });
        return;
      }

      // Reopen the loan by resetting completion status
      await dbConnection.getRepository(Loan).update(loanId, {
        status: LoanStatus.PENDING,
        isCompleted: false,
        completedAt: null,
        completionType: null,
        notes: `${loan.notes || ''}\n\n[REOPENED FOR REWORK by Managing Director on ${new Date().toISOString()}]\nReason: ${reopenReason}`,
        updatedAt: new Date()
      });

      console.log('✓ Completed loan reopened for rework');

      // Reload loan
      const reopenedLoan = await dbConnection.getRepository(Loan).findOne({
        where: { id: loanId },
        relations: ['borrower', 'collaterals', 'organization']
      });

      res.status(200).json({
        success: true,
        message: "Completed loan reopened for rework successfully",
        data: {
          loan: reopenedLoan,
          reopenDetails: {
            reopenedBy,
            reopenedAt: new Date(),
            reopenReason
          }
        }
      });

    } catch (error: any) {
      console.error('❌ Reopen completed loan error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while reopening completed loan",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  forwardLoanToReviewer = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log('=== FORWARD LOAN TO REVIEWER START ===');
      console.log('📋 Form Data Received:');
      console.log('  - reviewMessage length:', req.body.reviewMessage?.length || 0);
      console.log('  - loanAnalysisNote length:', req.body.loanAnalysisNote?.length || 0);
      console.log('  - forwardToIds:', req.body.forwardToIds);
      console.log('  - forwardToRoles:', req.body.forwardToRoles);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);
      const reviewedBy = req.user?.id;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      if (!reviewedBy) {
        res.status(401).json({
          success: false,
          message: "User authentication required",
        });
        return;
      }

      // Parse forwardToIds and forwardToRoles from form data
      const forwardToIds = typeof req.body.forwardToIds === 'string'
        ? JSON.parse(req.body.forwardToIds)
        : req.body.forwardToIds;

      const forwardToRoles = typeof req.body.forwardToRoles === 'string'
        ? JSON.parse(req.body.forwardToRoles)
        : req.body.forwardToRoles;

      // Validate parsed arrays
      if (!Array.isArray(forwardToIds) || forwardToIds.length === 0) {
        res.status(400).json({
          success: false,
          message: "At least one recipient ID is required",
        });
        return;
      }

      if (!Array.isArray(forwardToRoles) || forwardToRoles.length === 0) {
        res.status(400).json({
          success: false,
          message: "At least one recipient role is required",
        });
        return;
      }

      // ✅ Get reviewMessage and loanAnalysisNote from form data
      const reviewMessage = req.body.reviewMessage || '';
      const loanAnalysisNote = req.body.loanAnalysisNote || null;

      console.log('✓ Parsed loanAnalysisNote:', loanAnalysisNote ? 'Present' : 'Missing');

      // Validate review message
      if (!reviewMessage || reviewMessage.trim().length < 10) {
        res.status(400).json({
          success: false,
          message: "Review message must be at least 10 characters",
        });
        return;
      }

      // Handle attachment if provided
      let reviewAttachment = null;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (files?.reviewAttachment && files.reviewAttachment.length > 0) {
        const file = files.reviewAttachment[0];
        const uploadResult = await UploadToCloud(file);
        reviewAttachment = {
          url: uploadResult.secure_url,
          filename: file.originalname
        };
        console.log('✓ Review attachment uploaded:', reviewAttachment.filename);
      }

      let reviewerRole: WorkflowStep;
      let workflowStep: number;

      switch (req.user?.role) {
        case UserRole.CLIENT:
        case UserRole.MANAGING_DIRECTOR:
          reviewerRole = WorkflowStep.MANAGING_DIRECTOR;
          workflowStep = 4;
          break;
        case UserRole.BOARD_DIRECTOR:
          reviewerRole = WorkflowStep.BOARD_DIRECTOR;
          workflowStep = 5;
          break;
        case UserRole.SENIOR_MANAGER:
          reviewerRole = WorkflowStep.SENIOR_MANAGER;
          workflowStep = 3;
          break;
        case UserRole.LOAN_OFFICER:
          reviewerRole = WorkflowStep.LOAN_OFFICER;
          workflowStep = 1;
          break;
        case UserRole.CREDIT_OFFICER:
          reviewerRole = WorkflowStep.CREDIT_OFFICER;
          workflowStep = 2;
          break;
        default:
          reviewerRole = WorkflowStep.CREDIT_OFFICER;
          workflowStep = 2;
      }

      console.log(`✓ User Role: ${req.user?.role}, Mapped to: ${reviewerRole}, Workflow Step: ${workflowStep}`);

      // ✅ Call service method with loanAnalysisNote
      const result = await this.loanApplicationService.addLoanReviewWithWorkflow(
        loanId,
        reviewMessage,
        reviewedBy,
        organizationId,
        {
          reviewerRole: reviewerRole,
          decision: ReviewDecision.FORWARD,
          forwardToIds: forwardToIds,
          forwardToRoles: forwardToRoles,
          workflowStep: workflowStep,
          reviewAttachment: reviewAttachment,
          loanAnalysisNote: loanAnalysisNote // ✅ Pass loan analysis note
        }
      );

      if (result.success) {
        console.log('✅ SUCCESS: Loan forwarded to reviewer');
        console.log('  - Review Message: ✓');
        console.log('  - Loan Analysis Note:', loanAnalysisNote ? '✓ SAVED' : '✗ Not provided');
        console.log('  - Forward To IDs:', forwardToIds);
        console.log('  - Forward To Roles:', forwardToRoles);
        console.log('  - Attachment:', reviewAttachment ? '✓' : '✗');

        res.status(200).json({
          ...result,
          forwardDetails: {
            forwardedToIds: forwardToIds,
            forwardedToRoles: forwardToRoles,
            hasAttachment: !!reviewAttachment,
            hasLoanAnalysisNote: !!loanAnalysisNote,
            reviewerRole: reviewerRole,
            workflowStep: workflowStep
          }
        });
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('❌ Forward loan to reviewer error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while forwarding loan",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };


  forwardToApprovalTeam = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log('=== FORWARD TO APPROVAL TEAM START ===');

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);
      const reviewedBy = req.user?.id;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      if (!reviewedBy) {
        res.status(401).json({
          success: false,
          message: "User authentication required",
        });
        return;
      }

      // Verify user is Managing Director
      if (req.user?.role !== UserRole.CLIENT) {
        res.status(403).json({
          success: false,
          message: "Only Managing Director can forward to approval team",
        });
        return;
      }

      // Parse forwardToIds and forwardToRoles
      const forwardToIds = typeof req.body.forwardToIds === 'string'
        ? JSON.parse(req.body.forwardToIds)
        : req.body.forwardToIds;

      const forwardToRoles = typeof req.body.forwardToRoles === 'string'
        ? JSON.parse(req.body.forwardToRoles)
        : req.body.forwardToRoles;

      // ✅ NEW: Get loanAnalysisNote from request
      const loanAnalysisNote = req.body.loanAnalysisNote || null;

      // Handle attachment if provided
      let reviewAttachment = null;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (files?.reviewAttachment && files.reviewAttachment.length > 0) {
        const file = files.reviewAttachment[0];
        const uploadResult = await UploadToCloud(file);
        reviewAttachment = {
          url: uploadResult.secure_url,
          filename: file.originalname
        };
      }

      // Call service method with loanAnalysisNote
      const result = await this.loanApplicationService.addLoanReviewWithWorkflow(
        loanId,
        req.body.reviewMessage,
        reviewedBy,
        organizationId,
        {
          reviewerRole: WorkflowStep.MANAGING_DIRECTOR,
          decision: ReviewDecision.FORWARD,
          forwardToIds: forwardToIds,
          forwardToRoles: forwardToRoles,
          workflowStep: 4, // Managing Director step
          reviewAttachment: reviewAttachment,
          loanAnalysisNote: loanAnalysisNote // ✅ NEW: Pass loan analysis note
        }
      );

      if (result.success) {
        console.log('✓ Loan forwarded to approval team successfully');
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('❌ Forward to approval team error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while forwarding loan",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  returnLoanForRework = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      console.log('=== RETURN LOAN FOR REWORK START ===');

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);
      const reviewedBy = req.user?.id;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      if (!reviewedBy) {
        res.status(401).json({
          success: false,
          message: "User authentication required",
        });
        return;
      }

      // Verify user has permission (Managing Director, Board Director, or Senior Manager)
      const allowedRoles = [UserRole.CLIENT, UserRole.MANAGER];
      if (!allowedRoles.includes(req.user?.role as UserRole)) {
        res.status(403).json({
          success: false,
          message: "Only Managing Director, Senior Manager, or Board Director can return loans for rework",
        });
        return;
      }

      // Determine reviewer role
      let reviewerRole: WorkflowStep;
      if (req.user?.role === UserRole.CLIENT) {
        reviewerRole = WorkflowStep.MANAGING_DIRECTOR;
      } else {
        reviewerRole = WorkflowStep.BOARD_DIRECTOR;
      }

      // Build detailed return message
      const returnType = req.body.returnType;
      const specificIssues = req.body.specificIssues || [];
      const loanAnalysisNote = req.body.loanAnalysisNote || null; // ✅ NEW: Get loan analysis note

      let fullMessage = `**RETURN FOR REWORK - ${returnType.toUpperCase()}**\n\n`;
      fullMessage += `**Reason:** ${req.body.returnReason}\n\n`;

      if (specificIssues.length > 0) {
        fullMessage += `**Specific Issues:**\n`;
        specificIssues.forEach((issue: string, index: number) => {
          fullMessage += `${index + 1}. ${issue}\n`;
        });
      }

      // Handle attachment if provided
      let reviewAttachment = null;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (files?.reviewAttachment && files.reviewAttachment.length > 0) {
        const file = files.reviewAttachment[0];
        const uploadResult = await UploadToCloud(file);
        reviewAttachment = {
          url: uploadResult.secure_url,
          filename: file.originalname
        };
      }

      // Call service method with loanAnalysisNote
      const result = await this.loanApplicationService.addLoanReviewWithWorkflow(
        loanId,
        fullMessage,
        reviewedBy,
        organizationId,
        {
          reviewerRole: reviewerRole,
          decision: ReviewDecision.REQUEST_INFO,
          forwardToIds: null,
          forwardToRoles: ['loan_officer'],
          workflowStep: reviewerRole === WorkflowStep.MANAGING_DIRECTOR ? 4 :
            reviewerRole === WorkflowStep.SENIOR_MANAGER ? 3 : 2,
          reviewAttachment: reviewAttachment,
          loanAnalysisNote: loanAnalysisNote // ✅ NEW: Pass loan analysis note
        }
      );

      if (result.success) {
        console.log('✓ Loan returned for rework successfully');
        res.status(200).json({
          ...result,
          message: "Loan returned for rework. Review message stored successfully.",
          returnType: returnType
        });
      } else {
        res.status(400).json(result);
      }

    } catch (error: any) {
      console.error('❌ Return loan for rework error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while returning loan for rework",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };


  requestAdditionalDocuments = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const loanId = parseInt(req.params.loanId);
      const organizationId = parseInt(req.params.organizationId);
      const { requestReason, requestedDocuments } = req.body;

      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: "User authentication required"
        });
        return;
      }

      // Validate loan exists and belongs to organization
      const result = await this.loanApplicationService.requestAdditionalDocuments(
        loanId,
        organizationId,
        req.user.id,
        requestReason,
        requestedDocuments
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Request additional documents error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while requesting additional documents",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };


  submitAdditionalDocuments = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const loanId = parseInt(req.params.loanId);
      const organizationId = parseInt(req.params.organizationId);
      const files = req.files as Express.Multer.File[];

      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          message: "User authentication required"
        });
        return;
      }

      if (!files || files.length === 0) {
        res.status(400).json({
          success: false,
          message: "No files uploaded"
        });
        return;
      }

      // Parse document descriptions
      let documentDescriptions: Array<{ documentId: string; description: string }> = [];
      if (req.body.documentDescriptions) {
        try {
          documentDescriptions = typeof req.body.documentDescriptions === 'string'
            ? JSON.parse(req.body.documentDescriptions)
            : req.body.documentDescriptions;
        } catch (e) {
          res.status(400).json({
            success: false,
            message: "Invalid document descriptions format"
          });
          return;
        }
      }

      const result = await this.loanApplicationService.submitAdditionalDocuments(
        loanId,
        organizationId,
        req.user.id,
        files,
        documentDescriptions
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Submit additional documents error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while submitting additional documents",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };


  getDocumentRequestStatus = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const loanId = parseInt(req.params.loanId);
      const organizationId = parseInt(req.params.organizationId);

      const result = await this.loanApplicationService.getDocumentRequestStatus(
        loanId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get document request status error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching document request status",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };


  getLoansWithDocumentRequests = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await this.loanApplicationService.getLoansWithDocumentRequests(
        organizationId,
        page,
        limit
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Get loans with document requests error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching loans with document requests",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };



  getLoanReviews = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const result = await this.loanApplicationService.getLoanReviews(loanId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get loan reviews controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching reviews",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getLoanGuarantors = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const result = await this.loanApplicationService.getLoanGuarantors(loanId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get loan guarantors controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching guarantors",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  updateGuarantor = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const guarantorId = parseInt(req.params.guarantorId);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const updateData = {
        name: req.body.name,
        phone: req.body.phone,
        address: req.body.address,
        guaranteedAmount: req.body.guaranteedAmount,
        isActive: req.body.isActive,
        updatedBy: req.user?.id || null,
      };

      const result = await this.loanApplicationService.updateGuarantor(
        guarantorId,
        updateData,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Update guarantor controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while updating guarantor",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  approveLoanApplication = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      console.log('=== APPROVE LOAN APPLICATION CONTROLLER START ===');

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "User authentication required",
        });
        return;
      }

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      // ✅ Extract approval data (the 6 fields)
      const approvalData: LoanApprovalData = {
        annualInterestRate: parseFloat(req.body.annualInterestRate),
        disbursementDate: this.parseDate(req.body.disbursementDate),
        agreedMaturityDate: this.parseDate(req.body.agreedMaturityDate),
        repaymentFrequency: req.body.repaymentFrequency,
        interestMethod: req.body.interestMethod,
        gracePeriodMonths: req.body.gracePeriodMonths ? parseInt(req.body.gracePeriodMonths) : undefined,
      };

      const notes = req.body.notes;

      console.log('Approval request:', {
        loanId,
        organizationId,
        userId,
        approvalData
      });

      const result = await this.loanApplicationService.approveLoanApplication(
        loanId,
        approvalData,
        userId,
        organizationId,
        notes
      );

      console.log('Approval result:', result.success);
      console.log('=== APPROVE LOAN APPLICATION CONTROLLER END ===');

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Approve loan application controller error:", error);

      res.status(500).json({
        success: false,
        message: "Internal server error during loan approval",
        debugInfo: process.env.NODE_ENV === "development" ? {
          originalMessage: error.message
        } : undefined,
      });
    }
  };
  // In LoanApplicationController class - ENHANCE existing method
  rejectLoanApplication = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      console.log('=== REJECT LOAN APPLICATION CONTROLLER START ===');

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);
      const userId = req.user?.id;
      const userRole = req.user?.role;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "User authentication required",
        });
        return;
      }

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const rejectionReason = req.body.rejectionReason?.trim();
      const notes = req.body.notes;

      if (!rejectionReason || rejectionReason.length < 10) {
        res.status(400).json({
          success: false,
          message: "Rejection reason must be at least 10 characters",
        });
        return;
      }

      console.log('Rejection request:', {
        loanId,
        organizationId,
        userId,
        userRole,
        rejectionReason
      });

      // ✅ NEW: Role-based rejection logic
      let result: ServiceResponse;

      if (userRole === UserRole.LOAN_OFFICER) {
        // LOAN OFFICER can reject only if loan has no workflow OR is assigned to them
        const workflow = await this.loanWorkflowService.getWorkflowForLoan(loanId, organizationId);

        if (!workflow.success || !workflow.data) {
          // No workflow - allow rejection
          result = await this.loanApplicationService.rejectLoanApplication(
            loanId,
            rejectionReason,
            userId,
            organizationId,
            notes
          );
        } else if (workflow.data.currentAssigneeId === userId) {
          // Assigned to them - allow rejection with workflow update
          const workflowResult = await this.loanWorkflowService.advanceWorkflow(
            loanId,
            userId,
            ReviewDecision.REJECT,
            null,
            rejectionReason,
            organizationId
          );

          if (workflowResult.success) {
            result = await this.loanApplicationService.rejectLoanApplication(
              loanId,
              rejectionReason,
              userId,
              organizationId,
              notes
            );
          } else {
            result = workflowResult;
          }
        } else {
          result = {
            success: false,
            message: "You can only reject loans assigned to you or unassigned loans"
          };
        }
      } else if (userRole === UserRole.MANAGER || userRole === UserRole.CLIENT) {
        // MANAGER and CLIENT can reject if assigned to them
        const workflow = await this.loanWorkflowService.getWorkflowForLoan(loanId, organizationId);

        if (!workflow.success || !workflow.data) {
          result = {
            success: false,
            message: "Workflow not found for this loan"
          };
        } else if (workflow.data.currentAssigneeId !== userId) {
          result = {
            success: false,
            message: "You can only reject loans assigned to you"
          };
        } else {
          // Update workflow and reject loan
          const workflowResult = await this.loanWorkflowService.advanceWorkflow(
            loanId,
            userId,
            ReviewDecision.REJECT,
            null,
            rejectionReason,
            organizationId
          );

          if (workflowResult.success) {
            result = await this.loanApplicationService.rejectLoanApplication(
              loanId,
              rejectionReason,
              userId,
              organizationId,
              notes
            );
          } else {
            result = workflowResult;
          }
        }
      } else {
        result = {
          success: false,
          message: "You don't have permission to reject loans"
        };
      }

      console.log('Rejection result:', result.success);
      console.log('=== REJECT LOAN APPLICATION CONTROLLER END ===');

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Reject loan application controller error:", error);

      res.status(500).json({
        success: false,
        message: "Internal server error during loan rejection",
        debugInfo: process.env.NODE_ENV === "development" ? {
          originalMessage: error.message
        } : undefined,
      });
    }
  };

  // Add to LoanApplicationController class

  getRejectedLoanApplications = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;

      const result = await this.loanApplicationService.getRejectedLoanApplications(
        organizationId,
        page,
        limit,
        search
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Get rejected loan applications controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching rejected loan applications",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };


  getLoanPerformanceMetrics = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID"
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID"
        });
        return;
      }

      const result = await this.loanApplicationService
        .getLoanPerformanceMetrics(loanId, organizationId);

      if (result.success && result.data) {
        // FINAL VALIDATION: Ensure compact number formatting
        const formattedData = this.formatMetricsForResponse(result.data);

        res.status(200).json({
          success: true,
          message: "Performance metrics retrieved successfully",
          data: formattedData
        });
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get loan performance metrics controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching performance metrics",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  private formatMetricsForResponse(metrics: any): any {
    const formatted = { ...metrics };

    // Format currency values with proper decimal places
    if (formatted.principalRepaid !== undefined) {
      formatted.principalRepaid = Number(formatted.principalRepaid.toFixed(2));
    }

    if (formatted.balanceOutstanding !== undefined) {
      formatted.balanceOutstanding = Number(formatted.balanceOutstanding.toFixed(2));
    }

    // Format percentages with proper decimal places
    if (formatted.paymentCompletionRate !== undefined) {
      formatted.paymentCompletionRate = Number(formatted.paymentCompletionRate.toFixed(2));
    }

    if (formatted.principalRecoveryRate !== undefined) {
      formatted.principalRecoveryRate = Number(formatted.principalRecoveryRate.toFixed(2));
    }

    return formatted;
  }
  // ORIGINAL: Get loan applications (unchanged)
  getLoanApplications = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const status = req.query.status as string;

      const result = await this.loanApplicationService.getLoanApplications(
        organizationId,
        page,
        limit,
        search,
        status
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Get loan applications controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching loan applications",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ORIGINAL: Get loan application by ID (unchanged)
  getLoanApplicationById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const result = await this.loanApplicationService.getLoanApplicationById(loanId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get loan application by ID controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching loan application",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // Add this method to LoanApplicationController class


  // ORIGINAL: Update loan application (unchanged)
  updateLoanApplication = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const updateData = { ...req.body };
      try {
        if (updateData.dateOfBirth) {
          updateData.dateOfBirth = this.parseDate(updateData.dateOfBirth);
        }
        if (updateData.disbursementDate) {
          updateData.disbursementDate = this.parseDate(updateData.disbursementDate);
        }
        if (updateData.valuationDate) {
          updateData.valuationDate = this.parseDate(updateData.valuationDate);
        }
      } catch (dateError: any) {
        res.status(400).json({
          success: false,
          message: "Invalid date format: " + dateError.message,
        });
        return;
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const collateralFiles: CollateralFiles = {
        proofOfOwnershipUrl: files?.proofOfOwnership?.[0],
        ownerIdentificationUrl: files?.ownerIdentification?.[0],
        legalDocumentUrl: files?.legalDocument?.[0],
        physicalEvidenceUrl: files?.physicalEvidence?.[0],
      };

      const result = await this.loanApplicationService.updateLoanApplication(
        loanId,
        updateData,
        organizationId,
        req.user?.id || null,
        collateralFiles
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message === "Loan application not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error("Update loan application controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during loan application update",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ORIGINAL: Delete loan application (unchanged)
  deleteLoanApplication = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const result = await this.loanApplicationService.deleteLoanApplication(loanId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message === "Loan application not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error("Delete loan application controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during loan application deletion",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ORIGINAL: Get loan application stats (unchanged)
  getLoanApplicationStats = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await this.loanApplicationService.getLoanApplicationStats(organizationId);

      if (result.success && result.data) {
        const enhancedData = {
          ...result.data,
          averageProcessingTime: 7,
          totalDisbursedAmount: result.data.totalDisbursed,
          disbursedApplications: result.data.statusBreakdown?.disbursed || 0,
          rejectedApplications: result.data.statusBreakdown?.rejected || 0,
          approvedApplications: result.data.statusBreakdown?.approved || 0,
          pendingApplications: result.data.statusBreakdown?.pending || 0
        };

        res.status(200).json({
          success: true,
          message: "Loan application statistics retrieved successfully",
          data: enhancedData
        });
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Get loan application stats controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching loan application statistics",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // NEW: Daily interest accrual endpoint
  performDailyInterestAccrual = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await this.loanApplicationService.performDailyInterestAccrual(organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Daily interest accrual controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during daily interest accrual",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // NEW: Get loan with current balances (real-time calculation)
  getLoanCurrentBalances = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const result = await this.loanApplicationService.getLoanWithCurrentBalances(loanId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get loan current balances controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching current balances",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // NEW: Update organization loan balances
  updateOrganizationLoanBalances = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await this.loanApplicationService.updateOrganizationLoanBalances(organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Update organization loan balances controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during loan balance updates",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getPortfolioSummary = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await this.loanApplicationService.getPortfolioSummary(organizationId);

      if (result.success && result.data) {
        // ENHANCE the response to include missing fields
        const enhancedData = {
          ...result.data,
          // Calculate performing/non-performing loans from status breakdown
          performingLoans: result.data.statusBreakdown?.performing || 0,
          nonPerformingLoans: (result.data.totalLoans || 0) - (result.data.statusBreakdown?.performing || 0),
          // Add average interest rate (you might need to calculate this from your loans)
          averageInterestRate: 12.5 // Replace with actual calculation from your service
        };

        res.status(200).json({
          success: true,
          message: "Portfolio summary retrieved successfully",
          data: enhancedData
        });
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Get portfolio summary controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching portfolio summary",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  recalculateLoanBalances = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const currentBalances = await this.loanApplicationService.calculateCurrentLoanBalances(loanId);

      if (!currentBalances) {
        res.status(404).json({
          success: false,
          message: "Loan not found or calculation failed",
        });
        return;
      }

      // Update the loan with calculated balances
      await dbConnection.getRepository(Loan).update(loanId, {
        outstandingPrincipal: currentBalances.outstandingPrincipal,
        accruedInterestToDate: currentBalances.accruedInterestToDate,
        daysInArrears: currentBalances.daysInArrears,
        status: currentBalances.status,
        updatedAt: new Date()
      });

      res.status(200).json({
        success: true,
        message: "Loan balances recalculated successfully",
        data: {
          loanId,
          previousBalances: {
            // These would be the old values before update
          },
          updatedBalances: currentBalances,
          calculationTimestamp: new Date()
        }
      });

    } catch (error: any) {
      console.error("Recalculate loan balances controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during loan balance recalculation",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  getOverdueLoans = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const daysOverdue = parseInt(req.query.daysOverdue as string) || 1;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      // Use the service method
      const result = await this.loanApplicationService.getOverdueLoans(organizationId, daysOverdue);

      if (result.success && result.data) {
        // Transform the data to match frontend expectations
        const transformedOverdueLoans = result.data.overdueLoans.map((loan: any) => ({
          ...loan,
          // Add computed properties for frontend
          borrowerName: loan.borrower ? `${loan.borrower.firstName} ${loan.borrower.lastName}` : 'Unknown',
          borrowerPhone: loan.borrower?.primaryPhone || 'N/A',
          loanAmount: loan.disbursedAmount,
          currentBalance: loan.currentBalances?.outstandingPrincipal || loan.outstandingPrincipal,
          nextPaymentAmount: loan.monthlyInstallmentAmount, // You might need to calculate this
          daysPastDue: loan.currentBalances?.daysInArrears || loan.daysInArrears
        }));

        res.status(200).json({
          success: true,
          message: `Retrieved ${transformedOverdueLoans.length} overdue loans`,
          data: {
            overdueLoans: transformedOverdueLoans,
            summary: result.data.summary
          }
        });
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Get overdue loans controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching overdue loans",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
  // NEW: Bulk update loan statuses based on arrears
  bulkUpdateLoanStatuses = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await this.loanApplicationService.updateOrganizationLoanBalances(organizationId);

      if (result.success) {
        res.status(200).json({
          success: true,
          message: "Bulk loan status update completed successfully",
          data: {
            ...result.data,
            organizationId,
            updateTimestamp: new Date()
          }
        });
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Bulk update loan statuses controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during bulk status update",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // NEW: Get loan classification report
  getLoanClassificationReport = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const loans = await dbConnection.getRepository(Loan)
        .find({
          where: { organizationId },
          relations: ['borrower']
        });

      const classificationData = await Promise.all(
        loans.map(async (loan) => {
          const currentBalances = await this.loanApplicationService.calculateCurrentLoanBalances(loan.id);

          if (!currentBalances) return null;

          return {
            loanId: loan.loanId,
            borrowerName: loan.borrower.fullName,
            disbursedAmount: loan.disbursedAmount,
            outstandingPrincipal: currentBalances.outstandingPrincipal,
            accruedInterest: currentBalances.accruedInterestToDate,
            daysInArrears: currentBalances.daysInArrears,
            classificationCategory: loan.getClassificationCategory(),
            provisioningRate: loan.getProvisioningRate(),
            netExposure: loan.calculateNetExposure(),
            provisionRequired: loan.calculateProvisionRequired(),
            status: currentBalances.status
          };
        })
      );

      const validClassifications = classificationData.filter(item => item !== null);

      const summary = {
        totalLoans: validClassifications.length,
        totalDisbursed: validClassifications.reduce((sum, item) => sum + item!.disbursedAmount, 0),
        totalOutstanding: validClassifications.reduce((sum, item) => sum + (item!.outstandingPrincipal + item!.accruedInterest), 0),
        totalProvisionRequired: validClassifications.reduce((sum, item) => sum + item!.provisionRequired, 0),
        classificationBreakdown: {
          normal: validClassifications.filter(item => item!.classificationCategory === 'Normal/Standard').length,
          watch: validClassifications.filter(item => item!.classificationCategory === 'Watch').length,
          substandard: validClassifications.filter(item => item!.classificationCategory === 'Substandard').length,
          doubtful: validClassifications.filter(item => item!.classificationCategory === 'Doubtful').length,
          loss: validClassifications.filter(item => item!.classificationCategory === 'Loss').length
        }
      };

      res.status(200).json({
        success: true,
        message: "Loan classification report generated successfully",
        data: {
          classificationData: validClassifications,
          summary,
          reportGeneratedAt: new Date()
        }
      });

    } catch (error: any) {
      console.error("Get loan classification report controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while generating classification report",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  private parseDate(dateString: string): Date {
    if (!dateString) {
      throw new Error("Date is required");
    }

    try {
      let parsedDate: Date;

      if (dateString.includes('T')) {
        parsedDate = parseISO(dateString);
      } else {
        const dateParts = dateString.split('-');
        if (dateParts.length !== 3) {
          throw new Error('Invalid date format');
        }

        const year = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]) - 1;
        const day = parseInt(dateParts[2]);

        parsedDate = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
      }

      if (!isValid(parsedDate)) {
        throw new Error('Invalid date format');
      }

      return parsedDate;
    } catch (error) {
      throw new Error(`Invalid date format: ${dateString}. Please use YYYY-MM-DD format.`);
    }
  }
  changeLoanStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      console.log('=== CHANGE LOAN STATUS CONTROLLER DEBUG START ===');
      console.log('Request params:', req.params);
      console.log('Request body:', req.body);
      console.log('User info:', req.user);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('Validation errors:', errors.array());
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const {
        newStatus,
        notes,
        sendEmail = true,
        customMessage,
        dueDate
      } = req.body;

      console.log('Processing status change:', {
        loanId,
        organizationId,
        newStatus,
        notes,
        sendEmail,
        customMessage,
        dueDate,
        userId: req.user?.id
      });


      const result = await this.loanApplicationService.changeLoanStatus(
        loanId,
        newStatus,
        organizationId,
        req.user?.id || null,
        notes || '',
        {
          sendEmail,
          customMessage,
          dueDate
        }
      );

      console.log('Status change result:', {
        success: result.success,
        message: result.message,
        emailSent: result.data?.notification?.emailSent
      });
      console.log('=== CHANGE LOAN STATUS CONTROLLER DEBUG END ===');

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message?.includes('not found') ? 404 :
          result.message?.includes('Invalid status transition') ? 422 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error("Change loan status controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during loan status change",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };


  bulkChangeLoanStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      console.log('=== BULK CHANGE LOAN STATUS CONTROLLER DEBUG START ===');
      console.log('Request body:', req.body);
      console.log('User info:', req.user);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('Validation errors:', errors.array());
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const {
        loanIds,
        newStatus,
        notes,
        sendEmail = true,
        customMessage
      } = req.body;

      console.log('Processing bulk status change:', {
        loanIds,
        organizationId,
        newStatus,
        notes,
        sendEmail,
        customMessage,
        userId: req.user?.id
      });

      // Validate inputs
      if (!Array.isArray(loanIds) || loanIds.length === 0) {
        res.status(400).json({
          success: false,
          message: "loanIds must be a non-empty array",
        });
        return;
      }

      if (!Object.values(LoanStatus).includes(newStatus)) {
        res.status(400).json({
          success: false,
          message: `Invalid loan status. Valid statuses: ${Object.values(LoanStatus).join(', ')}`,
        });
        return;
      }

      // Validate loan IDs are numbers
      const validLoanIds = loanIds.filter(id => Number.isInteger(id) && id > 0);
      if (validLoanIds.length !== loanIds.length) {
        res.status(400).json({
          success: false,
          message: "All loan IDs must be positive integers",
        });
        return;
      }

      const result = await this.loanApplicationService.bulkChangeLoanStatus(
        validLoanIds,
        newStatus,
        organizationId,
        req.user?.id || null,
        notes || '',
        {
          sendEmail,
          customMessage
        }
      );

      console.log('Bulk status change result:', {
        success: result.success,
        message: result.message,
        summary: result.data?.summary
      });
      console.log('=== BULK CHANGE LOAN STATUS CONTROLLER DEBUG END ===');

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Bulk change loan status controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during bulk status change",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Get loans eligible for status change
   */
  getLoansEligibleForStatusChange = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const currentStatus = req.query.currentStatus as LoanStatus;

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      // Validate current status if provided
      if (currentStatus && !Object.values(LoanStatus).includes(currentStatus)) {
        res.status(400).json({
          success: false,
          message: `Invalid current status. Valid statuses: ${Object.values(LoanStatus).join(', ')}`,
        });
        return;
      }

      const result = await this.loanApplicationService.getLoansEligibleForStatusChange(
        organizationId,
        currentStatus
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Get loans eligible for status change controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching eligible loans",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Get valid status transitions for a specific loan
   */
  getValidStatusTransitions = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      // Get loan to check current status
      const loan = await this.loanApplicationService.getLoanApplicationById(loanId, organizationId);

      if (!loan.success || !loan.data) {
        res.status(404).json({
          success: false,
          message: "Loan not found",
        });
        return;
      }

      // Get valid transitions using the private method (we'll need to expose this)
      const currentStatus = loan.data.status;

      // Since we can't access private methods directly, we'll define the logic here
      const getValidTransitions = (status: LoanStatus): LoanStatus[] => {
        const transitions: Record<LoanStatus, LoanStatus[]> = {
          [LoanStatus.PENDING]: [LoanStatus.APPROVED, LoanStatus.DISBURSED],
          [LoanStatus.APPROVED]: [LoanStatus.DISBURSED, LoanStatus.PENDING],
          [LoanStatus.DISBURSED]: [LoanStatus.PERFORMING, LoanStatus.WATCH, LoanStatus.CLOSED],
          [LoanStatus.PERFORMING]: [LoanStatus.WATCH, LoanStatus.SUBSTANDARD, LoanStatus.CLOSED],
          [LoanStatus.WATCH]: [LoanStatus.PERFORMING, LoanStatus.SUBSTANDARD, LoanStatus.DOUBTFUL],
          [LoanStatus.SUBSTANDARD]: [LoanStatus.WATCH, LoanStatus.DOUBTFUL, LoanStatus.LOSS],
          [LoanStatus.DOUBTFUL]: [LoanStatus.SUBSTANDARD, LoanStatus.LOSS, LoanStatus.WRITTEN_OFF],
          [LoanStatus.LOSS]: [LoanStatus.WRITTEN_OFF, LoanStatus.DOUBTFUL],
          [LoanStatus.WRITTEN_OFF]: [],
          [LoanStatus.CLOSED]: []
        };
        return transitions[status] || [];
      };

      const validTransitions = getValidTransitions(currentStatus);

      res.status(200).json({
        success: true,
        message: "Valid status transitions retrieved successfully",
        data: {
          loanId: loan.data.loanId,
          currentStatus,
          validTransitions,
          transitionDescriptions: validTransitions.map(status => ({
            status,
            description: this.getStatusDescription(status),
            severity: this.getStatusSeverity(status)
          }))
        }
      });

    } catch (error: any) {
      console.error("Get valid status transitions controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching valid transitions",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Get status change history for a loan (if you implement status history)
   */
  getLoanStatusHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      // For now, return basic information from loan notes
      // You might want to create a proper LoanStatusHistory entity
      const loan = await this.loanApplicationService.getLoanApplicationById(loanId, organizationId);

      if (!loan.success || !loan.data) {
        res.status(404).json({
          success: false,
          message: "Loan not found",
        });
        return;
      }

      // Parse notes for status changes (basic implementation)
      const statusHistory = this.parseStatusHistoryFromNotes(loan.data.notes || '');

      res.status(200).json({
        success: true,
        message: "Loan status history retrieved successfully",
        data: {
          loanId: loan.data.loanId,
          currentStatus: loan.data.status,
          statusHistory,
          totalChanges: statusHistory.length
        }
      });

    } catch (error: any) {
      console.error("Get loan status history controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching status history",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Helper method to get status description
   */
  private getStatusDescription(status: LoanStatus): string {
    const descriptions: Record<LoanStatus, string> = {
      [LoanStatus.PENDING]: "Application is under review",
      [LoanStatus.APPROVED]: "Loan has been approved for disbursement",
      [LoanStatus.DISBURSED]: "Loan amount has been disbursed",
      [LoanStatus.PERFORMING]: "Loan payments are on schedule",
      [LoanStatus.WATCH]: "Loan requires monitoring due to late payments",
      [LoanStatus.SUBSTANDARD]: "Loan is significantly overdue",
      [LoanStatus.DOUBTFUL]: "Recovery of loan is doubtful",
      [LoanStatus.LOSS]: "Loan is considered a loss",
      [LoanStatus.WRITTEN_OFF]: "Loan has been written off",
      [LoanStatus.CLOSED]: "Loan has been fully repaid"
    };
    return descriptions[status] || "Unknown status";
  }

  /**
   * Helper method to get status severity level
   */
  private getStatusSeverity(status: LoanStatus): 'low' | 'medium' | 'high' | 'critical' {
    const severity: Record<LoanStatus, 'low' | 'medium' | 'high' | 'critical'> = {
      [LoanStatus.PENDING]: 'low',
      [LoanStatus.APPROVED]: 'low',
      [LoanStatus.DISBURSED]: 'low',
      [LoanStatus.PERFORMING]: 'low',
      [LoanStatus.WATCH]: 'medium',
      [LoanStatus.SUBSTANDARD]: 'high',
      [LoanStatus.DOUBTFUL]: 'critical',
      [LoanStatus.LOSS]: 'critical',
      [LoanStatus.WRITTEN_OFF]: 'critical',
      [LoanStatus.CLOSED]: 'low'
    };
    return severity[status] || 'medium';
  }

  /**
   * Helper method to parse status history from notes (basic implementation)
   */
  private parseStatusHistoryFromNotes(notes: string): Array<{
    timestamp: string;
    status: string;
    note: string;
  }> {
    if (!notes) return [];

    const statusChanges: Array<{ timestamp: string; status: string; note: string; }> = [];
    const lines = notes.split('\n');

    for (const line of lines) {
      // Look for lines that match the pattern: [timestamp] Status changed to status: note
      const match = line.match(/^\[([^\]]+)\]\s*Status changed to ([^:]+):\s*(.*)$/);
      if (match) {
        statusChanges.push({
          timestamp: match[1],
          status: match[2].trim(),
          note: match[3].trim()
        });
      }
    }

    return statusChanges.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }


  // ✅ NEW METHOD: Get workflow for loan
  getWorkflowForLoan = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID"
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID"
        });
        return;
      }

      const result = await this.loanWorkflowService.getWorkflowForLoan(
        loanId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error('Get workflow error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching workflow",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };

  // ✅ NEW METHOD: Get workflow history
  getWorkflowHistory = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID"
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID"
        });
        return;
      }

      const result = await this.loanWorkflowService.getWorkflowHistory(
        loanId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error('Get workflow history error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching workflow history",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };


  // ✅ FIXED: getAvailableReviewers method in LoanApplicationController
  // This removes the "Workflow not found" restriction for all roles

  getAvailableReviewers = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);
      const userRole = req.user?.role;
      const userId = req.user?.id;

      console.log('=== GET AVAILABLE REVIEWERS DEBUG START ===');
      console.log('User:', { id: userId, role: userRole });
      console.log('Loan:', { id: loanId, organizationId });

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID"
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID"
        });
        return;
      }

      // ✅ REQUIREMENT 1: LOAN OFFICER - Get ALL higher-level reviewers (no workflow check)
      if (userRole === UserRole.LOAN_OFFICER) {
        const allReviewers = await this.userRepository.find({
          where: {
            organizationId,
            isActive: true,
            role: In([
              UserRole.BOARD_DIRECTOR,
              UserRole.SENIOR_MANAGER,
              UserRole.MANAGING_DIRECTOR
            ])
          },
          select: ['id', 'username', 'email', 'firstName', 'lastName', 'role']
        });

        const formattedReviewers = allReviewers.map(user => ({
          id: user.id,
          name: `${user.firstName || ''} ${user.lastName || user.username}`.trim(),
          email: user.email,
          role: user.role,
          roleLabel: this.getRoleLabel(user.role)
        }));

        console.log(`✓ LOAN OFFICER: Found ${formattedReviewers.length} reviewers`);
        console.log('=== GET AVAILABLE REVIEWERS DEBUG END ===');

        res.status(200).json({
          success: true,
          message: "Available reviewers retrieved successfully",
          data: {
            reviewers: formattedReviewers,
            totalCount: formattedReviewers.length,
            availableRoles: [
              WorkflowStep.BOARD_DIRECTOR,
              WorkflowStep.SENIOR_MANAGER,
              WorkflowStep.MANAGING_DIRECTOR
            ]
          }
        });
        return;
      }

      // ✅ REQUIREMENT 2: BOARD DIRECTOR - Get Senior Managers and Managing Directors (no workflow limitation)
      if (userRole === UserRole.BOARD_DIRECTOR) {
        const availableReviewers = await this.userRepository.find({
          where: {
            organizationId,
            isActive: true,
            role: In([UserRole.SENIOR_MANAGER, UserRole.MANAGING_DIRECTOR])
          },
          select: ['id', 'username', 'email', 'firstName', 'lastName', 'role']
        });

        const formattedReviewers = availableReviewers.map(user => ({
          id: user.id,
          name: `${user.firstName || ''} ${user.lastName || user.username}`.trim(),
          email: user.email,
          role: user.role,
          roleLabel: this.getRoleLabel(user.role)
        }));

        console.log(`✓ BOARD DIRECTOR: Found ${formattedReviewers.length} reviewers`);
        console.log('=== GET AVAILABLE REVIEWERS DEBUG END ===');

        res.status(200).json({
          success: true,
          message: "Available reviewers retrieved successfully",
          data: {
            reviewers: formattedReviewers,
            totalCount: formattedReviewers.length,
            availableRoles: [UserRole.SENIOR_MANAGER, UserRole.MANAGING_DIRECTOR]
          }
        });
        return;
      }

      // ✅ REQUIREMENT 3: SENIOR MANAGER - Get Board Directors and Managing Directors (no workflow limitation)
      if (userRole === UserRole.SENIOR_MANAGER) {
        const availableReviewers = await this.userRepository.find({
          where: {
            organizationId,
            isActive: true,
            role: In([UserRole.BOARD_DIRECTOR, UserRole.MANAGING_DIRECTOR])
          },
          select: ['id', 'username', 'email', 'firstName', 'lastName', 'role']
        });

        const formattedReviewers = availableReviewers.map(user => ({
          id: user.id,
          name: `${user.firstName || ''} ${user.lastName || user.username}`.trim(),
          email: user.email,
          role: user.role,
          roleLabel: this.getRoleLabel(user.role)
        }));

        console.log(`✓ SENIOR MANAGER: Found ${formattedReviewers.length} reviewers`);
        console.log('=== GET AVAILABLE REVIEWERS DEBUG END ===');

        res.status(200).json({
          success: true,
          message: "Available reviewers retrieved successfully",
          data: {
            reviewers: formattedReviewers,
            totalCount: formattedReviewers.length,
            availableRoles: [UserRole.BOARD_DIRECTOR, UserRole.MANAGING_DIRECTOR]
          }
        });
        return;
      }

      // ✅ REQUIREMENT 4: MANAGING DIRECTOR/CLIENT - Final step, no forward options
      if (userRole === UserRole.MANAGING_DIRECTOR || userRole === UserRole.CLIENT) {
        console.log(`✓ ${userRole}: At final approval step`);
        console.log('=== GET AVAILABLE REVIEWERS DEBUG END ===');

        res.status(200).json({
          success: true,
          message: "No forward reviewers available - you are at the final approval step",
          data: {
            reviewers: [],
            totalCount: 0,
            availableRoles: [],
            isFinalStep: true
          }
        });
        return;
      }

      // Default case - no reviewers available
      console.log('✗ No matching role found');
      console.log('=== GET AVAILABLE REVIEWERS DEBUG END ===');

      res.status(200).json({
        success: true,
        message: "No reviewers available",
        data: {
          reviewers: [],
          totalCount: 0,
          availableRoles: []
        }
      });

    } catch (error: any) {
      console.error('Get available reviewers error:', error);
      console.log('=== GET AVAILABLE REVIEWERS DEBUG END ===');

      res.status(500).json({
        success: false,
        message: "Internal server error while fetching available reviewers",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };


  // ✅ NEW METHOD: Get my assigned loans
  getMyAssignedLoans = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "User authentication required"
        });
        return;
      }

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID"
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const statusFilter = req.query.status as any;

      const result = await this.loanWorkflowService.getMyAssignedLoans(
        userId,
        organizationId,
        page,
        limit,
        statusFilter
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error('Get assigned loans error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching assigned loans",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };

  // ✅ NEW METHOD: Reassign loan
  reassignLoan = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array()
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);
      const reassignedBy = req.user?.id;

      if (!reassignedBy) {
        res.status(401).json({
          success: false,
          message: "User authentication required"
        });
        return;
      }

      const { fromUserId, toUserId, reason } = req.body;

      const result = await this.loanWorkflowService.reassignLoan(
        loanId,
        fromUserId,
        toUserId,
        reason,
        organizationId,
        reassignedBy
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error('Reassign loan error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error while reassigning loan",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      });
    }
  };


  private getRoleLabel(role: UserRole): string {
    const labels: Record<string, string> = {
      [UserRole.BOARD_DIRECTOR]: "Board Director",
      [UserRole.SENIOR_MANAGER]: "Senior Manager",
      [UserRole.MANAGING_DIRECTOR]: "Managing Director",
      [UserRole.LOAN_OFFICER]: "Loan Officer",
      [UserRole.STAFF]: "Staff",
      [UserRole.MANAGER]: "Manager",
      [UserRole.CLIENT]: "Client"
    };
    return labels[role] || role;
  }

  // In LoanApplicationController, update addLoanReview method:

  addLoanReview = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      console.log('=== ADD LOAN REVIEW (ENHANCED) START ===');

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);
      const userId = req.user?.id;
      const userRole = req.user?.role;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "User authentication required",
        });
        return;
      }

      const { reviewMessage, decision } = req.body;

      // ✅ ENHANCED: Parse forwardTo as array
      let forwardToIds: number[] | null = null;
      let forwardToRoles: string[] | null = null;

      if (req.body.forwardTo) {
        if (typeof req.body.forwardTo === 'string') {
          try {
            forwardToIds = JSON.parse(req.body.forwardTo);
          } catch (e) {
            forwardToIds = [parseInt(req.body.forwardTo)];
          }
        } else if (Array.isArray(req.body.forwardTo)) {
          forwardToIds = req.body.forwardTo.map(id => parseInt(id));
        }
      }

      if (req.body.forwardToRole) {
        if (typeof req.body.forwardToRole === 'string') {
          try {
            forwardToRoles = JSON.parse(req.body.forwardToRole);
          } catch (e) {
            forwardToRoles = [req.body.forwardToRole];
          }
        } else if (Array.isArray(req.body.forwardToRole)) {
          forwardToRoles = req.body.forwardToRole;
        }
      }

      console.log('Enhanced review request:', {
        loanId,
        organizationId,
        userId,
        userRole,
        decision,
        forwardToIds,
        forwardToRoles,
        messageLength: reviewMessage?.length
      });

      // ✅ ENHANCED: Handle file attachment
      let reviewAttachment = null;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (files?.reviewAttachment && files.reviewAttachment.length > 0) {
        const file = files.reviewAttachment[0];
        const uploadedFile = await UploadToCloud(file);

        reviewAttachment = {
          url: uploadedFile.secure_url,
          filename: file.originalname
        };
        console.log('✓ Review attachment uploaded:', reviewAttachment.filename);
      }

      let result: ServiceResponse;

      // ✅ ENHANCED: LOAN_OFFICER - Can start workflow and forward to multiple users
      if (userRole === UserRole.LOAN_OFFICER) {
        if (!forwardToIds || forwardToIds.length === 0) {
          res.status(400).json({
            success: false,
            message: "forwardTo is required for LOAN OFFICER users"
          });
          return;
        }

        // Validate all forward recipients
        const forwardRecipients = await this.userRepository.find({
          where: {
            id: In(forwardToIds),
            organizationId,
            isActive: true
          }
        });

        if (forwardRecipients.length !== forwardToIds.length) {
          res.status(404).json({
            success: false,
            message: "One or more forward recipients not found"
          });
          return;
        }

        // ✅ FIX: Check if workflow exists first
        let existingWorkflow = await this.loanWorkflowService.getWorkflowForLoan(loanId, organizationId);

        // Initialize workflow only if it doesn't exist
        if (!existingWorkflow.success || !existingWorkflow.data) {
          const workflowResult = await this.loanWorkflowService.initializeWorkflow(
            loanId,
            forwardToIds[0],
            organizationId
          );

          if (!workflowResult.success) {
            // ✅ FIX: If initialization fails due to existing workflow, fetch it
            if (workflowResult.message?.includes('already exists')) {
              existingWorkflow = await this.loanWorkflowService.getWorkflowForLoan(loanId, organizationId);
            } else {
              res.status(400).json(workflowResult);
              return;
            }
          }
        }

        // Add review with workflow context
        result = await this.loanApplicationService.addLoanReviewWithWorkflow(
          loanId,
          reviewMessage,
          userId,
          organizationId,
          {
            reviewerRole: WorkflowStep.LOAN_OFFICER,
            decision: ReviewDecision.FORWARD,
            forwardToIds,
            forwardToRoles,
            workflowStep: 1,
            reviewAttachment
          }
        );


      } else if (userRole === UserRole.BOARD_DIRECTOR || userRole === UserRole.SENIOR_MANAGER) {
        // ✅ ENHANCED: BOARD_DIRECTOR and SENIOR_MANAGER - Can forward to multiple users

        if (decision === ReviewDecision.FORWARD) {
          if (!forwardToIds || forwardToIds.length === 0) {
            res.status(400).json({
              success: false,
              message: "forwardTo is required when forwarding"
            });
            return;
          }

          // Validate all forward recipients
          const forwardRecipients = await this.userRepository.find({
            where: {
              id: In(forwardToIds),
              organizationId,
              isActive: true
            }
          });

          if (forwardRecipients.length !== forwardToIds.length) {
            res.status(404).json({
              success: false,
              message: "One or more forward recipients not found"
            });
            return;
          }

          // ✅ ENHANCED: Role-based validation for all recipients
          let allValid = true;
          let errorMessage = '';

          for (const recipient of forwardRecipients) {
            let canForward = false;
            let allowedRoles: string[] = [];

            if (userRole === UserRole.BOARD_DIRECTOR) {
              allowedRoles = [UserRole.SENIOR_MANAGER, UserRole.MANAGING_DIRECTOR];
              canForward = allowedRoles.includes(recipient.role);
            } else if (userRole === UserRole.SENIOR_MANAGER) {
              allowedRoles = [UserRole.BOARD_DIRECTOR, UserRole.MANAGING_DIRECTOR];
              canForward = allowedRoles.includes(recipient.role);
            }

            if (!canForward) {
              allValid = false;
              errorMessage = `You cannot forward to a ${recipient.role}. Allowed roles: ${allowedRoles.join(', ')}`;
              break;
            }
          }

          if (!allValid) {
            res.status(403).json({
              success: false,
              message: errorMessage
            });
            return;
          }

          // Check if workflow exists, if not create it
          let workflow = await this.loanWorkflowService.getWorkflowForLoan(loanId, organizationId);

          if (!workflow.success || !workflow.data) {
            const initResult = await this.loanWorkflowService.initializeWorkflow(
              loanId,
              forwardToIds[0],
              organizationId
            );

            if (!initResult.success) {
              res.status(400).json(initResult);
              return;
            }

            workflow = await this.loanWorkflowService.getWorkflowForLoan(loanId, organizationId);
          }

          // Advance workflow (use first recipient for workflow advancement)
          const advanceResult = await this.loanWorkflowService.advanceWorkflow(
            loanId,
            userId,
            decision,
            forwardToIds[0],
            reviewMessage,
            organizationId
          );

          if (!advanceResult.success) {
            res.status(400).json(advanceResult);
            return;
          }

          // Determine workflow step
          const workflowStep = workflow.data?.workflowHistory ? workflow.data.workflowHistory.length + 1 : 1;
          const reviewerRole = userRole === UserRole.BOARD_DIRECTOR ? WorkflowStep.BOARD_DIRECTOR : WorkflowStep.SENIOR_MANAGER;

          // Add review with workflow context
          result = await this.loanApplicationService.addLoanReviewWithWorkflow(
            loanId,
            reviewMessage,
            userId,
            organizationId,
            {
              reviewerRole,
              decision: ReviewDecision.FORWARD,
              forwardToIds,
              forwardToRoles,
              workflowStep,
              reviewAttachment
            }
          );

        } else if (decision === ReviewDecision.REJECT) {
          // Handle rejection
          result = await this.loanApplicationService.addLoanReviewWithWorkflow(
            loanId,
            reviewMessage,
            userId,
            organizationId,
            {
              reviewerRole: userRole === UserRole.BOARD_DIRECTOR ? WorkflowStep.BOARD_DIRECTOR : WorkflowStep.SENIOR_MANAGER,
              decision: ReviewDecision.REJECT,
              forwardToIds: null,
              forwardToRoles: null,
              workflowStep: 1,
              reviewAttachment
            }
          );
        } else {
          // REQUEST_INFO or other decisions
          result = await this.loanApplicationService.addLoanReviewWithWorkflow(
            loanId,
            reviewMessage,
            userId,
            organizationId,
            {
              reviewerRole: userRole === UserRole.BOARD_DIRECTOR ? WorkflowStep.BOARD_DIRECTOR : WorkflowStep.SENIOR_MANAGER,
              decision: decision || ReviewDecision.REQUEST_INFO,
              forwardToIds: null,
              forwardToRoles: null,
              workflowStep: 1,
              reviewAttachment
            }
          );
        }

      } else if (userRole === UserRole.MANAGING_DIRECTOR || userRole === UserRole.CLIENT) {
        // ✅ ENHANCED: MANAGING_DIRECTOR/CLIENT - Final approval with attachment support

        if (decision === ReviewDecision.REJECT) {
          result = await this.loanApplicationService.addLoanReviewWithWorkflow(
            loanId,
            reviewMessage,
            userId,
            organizationId,
            {
              reviewerRole: WorkflowStep.MANAGING_DIRECTOR,
              decision: ReviewDecision.REJECT,
              forwardToIds: null,
              forwardToRoles: null,
              workflowStep: 1,
              reviewAttachment
            }
          );
        } else {
          // Add review (approval or info request)
          result = await this.loanApplicationService.addLoanReviewWithWorkflow(
            loanId,
            reviewMessage,
            userId,
            organizationId,
            {
              reviewerRole: WorkflowStep.MANAGING_DIRECTOR,
              decision: decision || ReviewDecision.APPROVE,
              forwardToIds: null,
              forwardToRoles: null,
              workflowStep: 1,
              reviewAttachment
            }
          );
        }

      } else {
        result = {
          success: false,
          message: "You don't have permission to review loans"
        };
      }

      console.log('=== ADD LOAN REVIEW (ENHANCED) END ===');

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Add loan review controller error:", error);

      res.status(500).json({
        success: false,
        message: "Internal server error while adding review",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // In LoanApplicationController class - ADD new method
  startLoanReview = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      console.log('=== START LOAN REVIEW PROCESS ===');

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "User authentication required",
        });
        return;
      }

      const { reviewerId, reviewerRole, reviewMessage } = req.body;

      // Validate inputs
      if (!reviewerId || !reviewerRole) {
        res.status(400).json({
          success: false,
          message: "reviewerId and reviewerRole are required"
        });
        return;
      }

      // Validate reviewer role
      const validRoles = [WorkflowStep.BOARD_DIRECTOR, WorkflowStep.SENIOR_MANAGER, WorkflowStep.MANAGING_DIRECTOR];
      if (!validRoles.includes(reviewerRole)) {
        res.status(400).json({
          success: false,
          message: `Invalid reviewerRole. Must be one of: ${validRoles.join(', ')}`
        });
        return;
      }

      console.log('Starting review process:', {
        loanId,
        organizationId,
        userId,
        reviewerId,
        reviewerRole
      });

      // Initialize workflow
      const workflowResult = await this.loanWorkflowService.initializeWorkflow(
        loanId,
        reviewerId,
        organizationId
      );

      if (!workflowResult.success) {
        res.status(400).json(workflowResult);
        return;
      }

      // Add initial review if message provided
      let reviewResult = { success: true, message: "Review process started" };

      if (reviewMessage && reviewMessage.trim().length >= 10) {
        reviewResult = await this.loanApplicationService.addLoanReviewWithWorkflow(
          loanId,
          reviewMessage,
          userId,
          organizationId,
          {
            reviewerRole: WorkflowStep.LOAN_OFFICER,
            decision: ReviewDecision.FORWARD,
            forwardedToId: reviewerId,
            workflowStep: 1
          }
        );
      }

      if (reviewResult.success) {
        res.status(201).json({
          success: true,
          message: "Loan review process started successfully",
          data: {
            workflow: workflowResult.data,
            review: reviewResult.data?.review
          }
        });
      } else {
        res.status(400).json(reviewResult);
      }

    } catch (error: any) {
      console.error("Start loan review error:", error);

      res.status(500).json({
        success: false,
        message: "Internal server error while starting review process",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };



  extendGuarantor = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);
      const guarantorId = parseInt(req.params.guarantorId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!guarantorId || isNaN(guarantorId)) {
        res.status(400).json({
          success: false,
          message: "Invalid guarantor ID",
        });
        return;
      }

      // Parse date fields if present
      const extendedData: ExtendedGuarantorData = { ...req.body };

      // Handle date fields
      const dateFields = [
        'dateOfBirth',
        'companyRegistrationDate',
        'collateralLastValuationDate',
        'collateralExpiryDate',
        'chequeDate',
        'reportedDate',
        'bouncedChequeDateOfBirth',
        'bouncedChequeCompanyRegDate'
      ];

      for (const field of dateFields) {
        if (req.body[field]) {
          try {
            const parsedDate = parseISO(req.body[field]);
            if (isValid(parsedDate)) {
              extendedData[field] = parsedDate;
            }
          } catch (error) {
            console.warn(`Invalid date format for ${field}`);
          }
        }
      }

      // Call service layer to extend guarantor
      const result = await this.loanApplicationService.extendGuarantor(
        guarantorId,
        organizationId,
        extendedData,
        req.user?.id || null
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Extend guarantor controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during guarantor extension",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };


  getLoanGuarantorsExtended = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const result = await this.loanApplicationService.getLoanGuarantorsExtended(
        loanId,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get extended guarantors controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching guarantors",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };


  getGuarantorsNeedingExtension = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await this.loanApplicationService.getGuarantorsNeedingExtension(
        organizationId,
        page,
        limit
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Get guarantors needing extension controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching guarantors",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };


  bulkExtendGuarantors = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const { guarantorUpdates } = req.body;

      if (!Array.isArray(guarantorUpdates) || guarantorUpdates.length === 0) {
        res.status(400).json({
          success: false,
          message: "guarantorUpdates must be a non-empty array",
        });
        return;
      }

      const result = await this.loanApplicationService.bulkExtendGuarantors(
        guarantorUpdates,
        organizationId,
        req.user?.id || null
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Bulk extend guarantors controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during bulk guarantor extension",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };





  getExistingGuarantorData = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      const result = await this.loanApplicationService.getExistingGuarantorData(
        organizationId,
        page,
        limit
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Get existing guarantor data controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching guarantor data",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Check migration status for specific collaterals
   */
  checkGuarantorMigrationStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const { collateralIds } = req.body;

      if (!Array.isArray(collateralIds) || collateralIds.length === 0) {
        res.status(400).json({
          success: false,
          message: "collateralIds must be a non-empty array",
        });
        return;
      }

      const result = await this.loanApplicationService.checkExistingGuarantors(
        collateralIds,
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Check guarantor migration status controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while checking migration status",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Bulk migrate guarantors from collaterals
   */
  bulkMigrateGuarantors = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const { migrationData } = req.body;

      if (!Array.isArray(migrationData) || migrationData.length === 0) {
        res.status(400).json({
          success: false,
          message: "migrationData must be a non-empty array",
        });
        return;
      }

      // Validate each migration data item
      for (const item of migrationData) {
        if (!item.collateralId || !item.loanId || !item.borrowerId) {
          res.status(400).json({
            success: false,
            message: "Each migration item must have collateralId, loanId, and borrowerId",
          });
          return;
        }
      }

      const result = await this.loanApplicationService.bulkMigrateGuarantors(
        migrationData,
        req.user?.id || null
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Bulk migrate guarantors controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during guarantor migration",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Quick migrate all guarantors at once
   */
  quickMigrateAllGuarantors = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await this.loanApplicationService.quickMigrateAllGuarantors(
        organizationId,
        req.user?.id || null
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Quick migrate all guarantors controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during quick migration",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };


  getAllCollaterals = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string || '';

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await this.loanApplicationService.getAllCollaterals(
        organizationId,
        page,
        limit,
        search
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get all collaterals controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching collaterals",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  /**
   * Extend collateral with additional fields
   */
  extendCollateral = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const collateralId = parseInt(req.params.collateralId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!collateralId || isNaN(collateralId)) {
        res.status(400).json({
          success: false,
          message: "Invalid collateral ID",
        });
        return;
      }

      const extendedData = {
        accountNumber: req.body.accountNumber,
        collateralType: req.body.collateralType,
        upiNumber: req.body.upiNumber,
        collateralValue: req.body.collateralValue,
        collateralLastValuationDate: req.body.collateralLastValuationDate,
        collateralExpiryDate: req.body.collateralExpiryDate,
      };

      const result = await this.loanApplicationService.extendCollateral(
        collateralId,
        organizationId,
        extendedData
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Extend collateral controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while extending collateral",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

}

export default new LoanApplicationController();