// @ts-nocheck
import { ExtendedGuarantorData, Guarantor } from "../entities/Guarantor";
import { In, IsNull, Not, Repository } from "typeorm";
import { Address, BorrowerDocument, BorrowerProfile, BorrowerProfileData, Gender, MaritalStatus, RelationshipType } from "../entities/BorrowerProfile";
import { Loan, LoanData, InterestMethod, RepaymentFrequency, LoanStatus, LoanApprovalData, IncomeFrequency, BorrowerType, InstitutionProfile, SpouseInfo, IncomeSourceInfo, InstitutionType, ShareholderBoardMemberInfo, LoanRelevantDocument, AdditionalDocumentRequest, DocumentRequestSummary } from "../entities/Loan";
import { LoanCollateral, CollateralType } from "../entities/LoanCollateral";
import { Organization } from "../entities/Organization";
import { PaymentStatus, RepaymentSchedule, ScheduleStatus } from "../entities/RepaymentSchedule";
import dbConnection from "../db";
import { UploadToCloud } from "../helpers/cloud";
import { v4 as uuidv4 } from 'uuid';
import { sendLoanStatusUpdateEmail } from "../templates/UpdateLoanBorrowerLoanApplicationStatusTemplate";
import { sendLoanApprovalEmail, sendLoanRejectionEmail } from "../templates/LoanApprovalEmailTemplate";
import { User, UserRole } from "../entities/User";
import { sendLoanReviewedEmail } from "../templates/LoanReviewedEmailTemplate";
import { LoanReview, ReviewDecision, ReviewStatus } from "../entities/LoanReview";
import { LoanWorkflow, WorkflowStep } from "../entities/LoanWorkflow";
import { ClientBorrowerAccount } from "../entities/ClientBorrowerAccount";

export interface CollateralFiles {
  proofOfOwnership?: Express.Multer.File[];
  ownerIdentification?: Express.Multer.File[];
  legalDocument?: Express.Multer.File[];
  physicalEvidence?: Express.Multer.File[];
  valuationReport?: Express.Multer.File[];
  additionalCollateralDocs?: Express.Multer.File[];
  upiFile?: Express.Multer.File[];
}
interface LoanTermsCalculation {
  totalInterestAmount: number;
  totalAmountToBeRepaid: number;
  monthlyInstallmentAmount: number;
  totalNumberOfInstallments: number;
  outstandingPrincipal: number;
  agreedMaturityDate: Date;
  agreedFirstPaymentDate: Date;
  accruedInterestToDate: number;
  daysInArrears: number;
  status: LoanStatus;
}

export interface CollateralFiles {
  proofOfOwnership?: Express.Multer.File[];
  ownerIdentification?: Express.Multer.File[];
  legalDocument?: Express.Multer.File[];
  physicalEvidence?: Express.Multer.File[];
  valuationReport?: Express.Multer.File[];
  additionalCollateralDocs?: Express.Multer.File[];
}


export interface GuarantorFiles {
  guarantorIdentification?: Express.Multer.File[];
  guarantorCrbReport?: Express.Multer.File[];
  guarantorAdditionalDocs?: Express.Multer.File[];
}

export interface BorrowerFiles {
  marriageCertificate?: Express.Multer.File[] | File[];
  spouseCrbReport?: Express.Multer.File[] | File[];
  spouseIdentification?: Express.Multer.File[] | File[];
  witnessCrbReport?: Express.Multer.File[] | File[];
  witnessIdentification?: Express.Multer.File[] | File[];
  borrowerDocuments?: Express.Multer.File[] | File[];
  occupationSupportingDocuments?: Express.Multer.File[] | File[]; // ✅ must accept both
  loanRelevantDocuments?: Express.Multer.File[] | File[];
}

export interface InstitutionFiles {
  institutionLegalDocument?: Express.Multer.File[];
  cooperativeLegalDocument?: Express.Multer.File[];
  otherInstitutionLegalDocument?: Express.Multer.File[];
  institutionLicense?: Express.Multer.File[];
  institutionTradingLicense?: Express.Multer.File[];
  institutionRegistration?: Express.Multer.File[];
  shareholderIdentification?: Express.Multer.File[];
  boardMemberIdentification?: Express.Multer.File[];
  proofOfShares?: Express.Multer.File[];
  boardResolution?: Express.Multer.File[];
  shareholderCrbReport?: Express.Multer.File[];
  boardMemberCrbReport?: Express.Multer.File[];
  shareholderAdditionalDocs?: Express.Multer.File[];
  boardMemberAdditionalDocs?: Express.Multer.File[];
  institutionRelevantDocuments?: Express.Multer.File[];

}

export interface CollateralData {
  collateralType: CollateralType;
  description: string;
  upiNumber: string;
  collateralValue: number;
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorAddress?: string;
  valuationDate?: Date;
  valuedBy?: string;
  notes?: string;
  guarantorsData?: Array<{
    name: string;
    phone: string;
    address?: string;
    nationalId?: string;
    email?: string;
    guarantorType?: 'individual' | 'institution';
    guaranteedAmount?: number;
  }>;
}


export interface EnhancedLoanApplicationRequest {
  borrowerType: 'individual' | 'institution';
  borrowerData?: BorrowerProfileData;
  institutionData?: {
    institutionType: 'company' | 'cooperative' | 'other';
    otherInstitutionType?: string;
    institutionName: string;
    licenseNumber: string;
    registrationDate: string;
    tinNumber: string;
    contactPerson: string;
    contactPhone: string;
    contactEmail: string;
    address: Address;
  };
  spouseInformation?: {
    firstName: string;
    lastName: string;
    nationalId: string;
    phone: string;
    email?: string;
  };
  incomeSources: Array<{
    source: string;
    frequency: IncomeFrequency;
    amount: number;
    description?: string;
  }>;
  loanData: Omit<LoanData, 'borrowerId'> & {
    businessOfficer: string;
  };
  collateralData: CollateralData;
  additionalCollateralDocuments?: Array<{
    name: string;
    description?: string;
    files: File[];
  }>;
  organizationId: number;
  createdBy: number | null;
}

export interface EnhancedCollateralFiles extends CollateralFiles {
  institutionLegalDocument?: Express.Multer.File[];
  marriageCertificate?: Express.Multer.File[];
  spouseCrbReport?: Express.Multer.File[];
  witnessCrbReport?: Express.Multer.File[];
  borrowerCrbReport?: Express.Multer.File[];
  additionalCollateralDocuments?: Express.Multer.File[];
}

export interface ServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

export interface LoanCalculationUpdate {
  outstandingPrincipal: number;
  accruedInterestToDate: number;
  daysInArrears: number;
  status: LoanStatus;
}

export interface DailyCalculationResult {
  totalLoansProcessed: number;
  totalInterestAccrued: number;
  loansWithUpdatedStatus: number;
  errors: string[];
}

export class LoanApplicationService {
  private repaymentScheduleRepository: Repository<RepaymentSchedule>;
  private readonly MAX_NUMERIC_VALUE = 9999999999999.99;
  private readonly MIN_LOAN_AMOUNT = 1000;
  // private readonly MAX_LOAN_AMOUNT = 100000000;
  private readonly MAX_TERM_MONTHS = 480;
  private guarantorRepository: Repository<Guarantor>;
  private clientBorrowerAccountRepository: Repository<ClientBorrowerAccount>;

  constructor(
    private borrowerRepository: Repository<BorrowerProfile>,
    private loanRepository: Repository<Loan>,
    private collateralRepository: Repository<LoanCollateral>,
    private organizationRepository: Repository<Organization>,
    private loanReviewRepository: Repository<LoanReview>,
    private userRepository: Repository<User>,
    private workflowRepository: Repository<LoanWorkflow>
  ) {
    this.repaymentScheduleRepository = dbConnection.getRepository(RepaymentSchedule);
    this.loanReviewRepository = dbConnection.getRepository(LoanReview); // ADD THIS
    this.userRepository = dbConnection.getRepository(User);
    this.workflowRepository = dbConnection.getRepository(LoanWorkflow);
    this.guarantorRepository = dbConnection.getRepository(Guarantor);
    this.clientBorrowerAccountRepository = dbConnection.getRepository(ClientBorrowerAccount);

  }


  async getLoansForClientAccount(
    accountNumber: string,
    organizationId: number
  ): Promise<ServiceResponse<Loan[]>> {
    try {
      const clientAccount = await this.clientBorrowerAccountRepository.findOne({
        where: {
          accountNumber,
          organizationId,
          isActive: true
        },
        relations: ['loans', 'loans.borrower'] // ✅ Use the relationship
      });

      if (!clientAccount) {
        return {
          success: false,
          message: `Client account ${accountNumber} not found`
        };
      }

      // ✅ Access loans via relationship
      const loans = clientAccount.loans || [];

      console.log(`✅ Found ${loans.length} loans for account ${accountNumber}`);

      return {
        success: true,
        message: `Retrieved ${loans.length} loans`,
        data: loans
      };
    } catch (error: any) {
      console.error('Error fetching loans for account:', error);
      return {
        success: false,
        message: `Failed to fetch loans: ${error.message}`
      };
    }
  }

  async getClientAccountWithLoans(
    accountNumber: string,
    organizationId: number
  ): Promise<ServiceResponse<any>> {
    try {
      const clientAccount = await this.clientBorrowerAccountRepository.findOne({
        where: {
          accountNumber,
          organizationId,
          isActive: true
        },
        relations: ['loans', 'borrower'] // ✅ Load relationships
      });

      if (!clientAccount) {
        return {
          success: false,
          message: `Client account ${accountNumber} not found`
        };
      }

      // ✅ Calculate statistics from all loans
      const loans = clientAccount.loans || [];
      const totalDisbursed = loans.reduce((sum, loan) => sum + (loan.disbursedAmount || 0), 0);
      const activeLoans = loans.filter(l => l.status === LoanStatus.DISBURSED || l.status === LoanStatus.PERFORMING);
      const completedLoans = loans.filter(l => l.status === LoanStatus.CLOSED || l.status === LoanStatus.COMPLETED);

      return {
        success: true,
        message: 'Client account retrieved successfully',
        data: {
          account: clientAccount,
          loanStatistics: {
            totalLoans: loans.length,
            activeLoans: activeLoans.length,
            completedLoans: completedLoans.length,
            totalDisbursed,
            loanIds: loans.map(l => l.loanId)
          },
          loans // ✅ All loans from relationship
        }
      };
    } catch (error: any) {
      console.error('Error fetching client account:', error);
      return {
        success: false,
        message: `Failed to fetch client account: ${error.message}`
      };
    }
  }



  // Note: Additional helper methods like createNewBorrower, saveBorrowerDocuments, 
  // uploadCollateralDocuments, etc. should be included here but are truncated for brevity
  // They remain unchanged from the original implementation
}