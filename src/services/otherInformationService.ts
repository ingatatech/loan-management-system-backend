import { Repository } from "typeorm";
import { Borrowing, LenderType, BorrowingStatus } from "../entities/Borrowing";
import { Loan, LoanStatus, BusinessType } from "../entities/Loan";
import { User } from "../entities/User";
import { BoardDirector } from "../entities/BoardDirector";
import { IndividualShareholder } from "../entities/IndividualShareholder";
import { InstitutionShareholder } from "../entities/InstitutionShareholder";
import { Gender } from "../entities/BorrowerProfile"; 

interface OtherInformationResponse {
  success: boolean;
  message: string;
  data?: {
    borrowings: any;
    womenEnterprises: any;
    smes: any;
    youthEntities: any;
    loanApplications: any;
    staffNumbers: any;
    boardMembers: any;
    shareholders: any;
  };
}

export class OtherInformationService {
  constructor(
    private borrowingRepository: Repository<Borrowing>,
    private loanRepository: Repository<Loan>,
    private userRepository: Repository<User>,
    private boardDirectorRepository: Repository<BoardDirector>,
    private individualShareholderRepository: Repository<IndividualShareholder>,
    private institutionShareholderRepository: Repository<InstitutionShareholder>
  ) {}

  async getOtherInformation(organizationId: number): Promise<OtherInformationResponse> {
    try {
      // Execute all queries in parallel for better performance
      const [
        borrowingsData,
        womenEnterprisesData,
        smesData,
        youthEntitiesData,
        loanApplicationsData,
        staffNumbersData,
        boardMembersData,
        shareholdersData
      ] = await Promise.all([
        this.getBorrowingsData(organizationId),
        this.getWomenEnterprisesData(organizationId),
        this.getSMEsData(organizationId),
        this.getYouthEntitiesData(organizationId),
        this.getLoanApplicationsData(organizationId),
        this.getStaffNumbersData(organizationId),
        this.getBoardMembersData(organizationId),
        this.getShareholdersData(organizationId)
      ]);

      return {
        success: true,
        message: "Other information retrieved successfully",
        data: {
          borrowings: borrowingsData,
          womenEnterprises: womenEnterprisesData,
          smes: smesData,
          youthEntities: youthEntitiesData,
          loanApplications: loanApplicationsData,
          staffNumbers: staffNumbersData,
          boardMembers: boardMembersData,
          shareholders: shareholdersData
        }
      };
    } catch (error: any) {
      console.error('Error fetching other information:', error);
      return {
        success: false,
        message: error.message || "Failed to retrieve other information"
      };
    }
  }

  private async getBorrowingsData(organizationId: number) {
    // Get borrowing from shareholders (PRIVATE_LENDER)
    const shareholdersBorrowing = await this.borrowingRepository
      .createQueryBuilder('borrowing')
      .select('COALESCE(SUM(borrowing.amountBorrowed), 0)', 'amount')
      .where('borrowing.organizationId = :organizationId', { organizationId })
      .andWhere('borrowing.isActive = :isActive', { isActive: true })
      .andWhere('borrowing.status = :status', { status: BorrowingStatus.ACTIVE })
      .andWhere('borrowing.lenderType = :lenderType', { lenderType: LenderType.PRIVATE_LENDER })
      .getRawOne();

    // Get borrowing from related parties (could be same as PRIVATE_LENDER or specific type)
    const relatedPartiesBorrowing = await this.borrowingRepository
      .createQueryBuilder('borrowing')
      .select('COALESCE(SUM(borrowing.amountBorrowed), 0)', 'amount')
      .where('borrowing.organizationId = :organizationId', { organizationId })
      .andWhere('borrowing.isActive = :isActive', { isActive: true })
      .andWhere('borrowing.status = :status', { status: BorrowingStatus.ACTIVE })
      .andWhere('borrowing.lenderType = :lenderType', { lenderType: LenderType.PRIVATE_LENDER })
      .getRawOne();

    // Get borrowing from banks
    const banksBorrowing = await this.borrowingRepository
      .createQueryBuilder('borrowing')
      .select('COALESCE(SUM(borrowing.amountBorrowed), 0)', 'amount')
      .where('borrowing.organizationId = :organizationId', { organizationId })
      .andWhere('borrowing.isActive = :isActive', { isActive: true })
      .andWhere('borrowing.status = :status', { status: BorrowingStatus.ACTIVE })
      .andWhere('borrowing.lenderType = :lenderType', { lenderType: LenderType.BANK })
      .getRawOne();

    // Get borrowing from other sources
    const otherSourcesBorrowing = await this.borrowingRepository
      .createQueryBuilder('borrowing')
      .select('COALESCE(SUM(borrowing.amountBorrowed), 0)', 'amount')
      .where('borrowing.organizationId = :organizationId', { organizationId })
      .andWhere('borrowing.isActive = :isActive', { isActive: true })
      .andWhere('borrowing.status = :status', { status: BorrowingStatus.ACTIVE })
      .andWhere('borrowing.lenderType NOT IN (:...excludedTypes)', { 
        excludedTypes: [LenderType.BANK, LenderType.PRIVATE_LENDER] 
      })
      .getRawOne();

    const shareholdersAmount = Number(shareholdersBorrowing.amount) || 0;
    const relatedPartiesAmount = Number(relatedPartiesBorrowing.amount) || 0;
    const banksAmount = Number(banksBorrowing.amount) || 0;
    const otherSourcesAmount = Number(otherSourcesBorrowing.amount) || 0;

    const total = shareholdersAmount + relatedPartiesAmount + banksAmount + otherSourcesAmount;

    return {
      shareholders: {
        amount: shareholdersAmount,
        description: "Loans from company owners"
      },
      relatedParties: {
        amount: relatedPartiesAmount,
        description: "Loans from sister companies"
      },
      banks: {
        amount: banksAmount,
        description: "Loans from commercial banks"
      },
      otherSources: {
        amount: otherSourcesAmount,
        description: "Loans from other lenders"
      },
      total: {
        amount: total,
        description: "Total borrowings"
      }
    };
  }

  private async getWomenEnterprisesData(organizationId: number) {
    // Number of disbursed loans to women enterprises - FIXED: Remove LOWER() from enum
    const disbursedCount = await this.loanRepository
      .createQueryBuilder('loan')
      .innerJoin('loan.borrower', 'borrower')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.status = :status', { status: LoanStatus.DISBURSED })
      .andWhere('borrower.gender = :gender', { gender: Gender.FEMALE }) // FIXED: Use enum directly
      .getCount();

    // Number of outstanding loans to women enterprises - FIXED: Remove LOWER() from enum
    const outstandingCount = await this.loanRepository
      .createQueryBuilder('loan')
      .innerJoin('loan.borrower', 'borrower')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.status IN (:...statuses)', { 
        statuses: [LoanStatus.PERFORMING, LoanStatus.WATCH, LoanStatus.SUBSTANDARD, LoanStatus.DOUBTFUL] 
      })
      .andWhere('borrower.gender = :gender', { gender: Gender.FEMALE }) // FIXED: Use enum directly
      .getCount();

    // Value of disbursed loans to women enterprises - FIXED: Remove LOWER() from enum
    const disbursedValue = await this.loanRepository
      .createQueryBuilder('loan')
      .innerJoin('loan.borrower', 'borrower')
      .select('COALESCE(SUM(loan.disbursedAmount), 0)', 'value')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.status = :status', { status: LoanStatus.DISBURSED })
      .andWhere('borrower.gender = :gender', { gender: Gender.FEMALE }) // FIXED: Use enum directly
      .getRawOne();

    // Value of outstanding loans to women enterprises - FIXED: Remove LOWER() from enum
    const outstandingValue = await this.loanRepository
      .createQueryBuilder('loan')
      .innerJoin('loan.borrower', 'borrower')
      .select('COALESCE(SUM(loan.outstandingPrincipal), 0)', 'value')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.status IN (:...statuses)', { 
        statuses: [LoanStatus.PERFORMING, LoanStatus.WATCH, LoanStatus.SUBSTANDARD, LoanStatus.DOUBTFUL] 
      })
      .andWhere('borrower.gender = :gender', { gender: Gender.FEMALE }) // FIXED: Use enum directly
      .getRawOne();

    return {
      disbursedCount: {
        value: disbursedCount,
        description: "New loans to women-owned businesses"
      },
      outstandingCount: {
        value: outstandingCount,
        description: "Active loans to women-owned businesses"
      },
      disbursedValue: {
        value: Number(disbursedValue.value) || 0,
        description: "Amount lent to women-owned businesses"
      },
      outstandingValue: {
        value: Number(outstandingValue.value) || 0,
        description: "Balance from women-owned businesses"
      }
    };
  }

  private async getSMEsData(organizationId: number) {
    // Number of disbursed loans to SMEs
    const disbursedCount = await this.loanRepository
      .createQueryBuilder('loan')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.businessType = :businessType', { businessType: BusinessType.SMALL })
      .andWhere('loan.status = :status', { status: LoanStatus.DISBURSED })
      .getCount();

    // Number of outstanding loans to SMEs
    const outstandingCount = await this.loanRepository
      .createQueryBuilder('loan')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.businessType = :businessType', { businessType: BusinessType.SMALL })
      .andWhere('loan.status IN (:...statuses)', { 
        statuses: [LoanStatus.PERFORMING, LoanStatus.WATCH, LoanStatus.SUBSTANDARD, LoanStatus.DOUBTFUL] 
      })
      .getCount();

    // Value of disbursed loans to SMEs
    const disbursedValue = await this.loanRepository
      .createQueryBuilder('loan')
      .select('COALESCE(SUM(loan.disbursedAmount), 0)', 'value')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.businessType = :businessType', { businessType: BusinessType.SMALL })
      .andWhere('loan.status = :status', { status: LoanStatus.DISBURSED })
      .getRawOne();

    // Value of outstanding loans to SMEs
    const outstandingValue = await this.loanRepository
      .createQueryBuilder('loan')
      .select('COALESCE(SUM(loan.outstandingPrincipal), 0)', 'value')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.businessType = :businessType', { businessType: BusinessType.SMALL })
      .andWhere('loan.status IN (:...statuses)', { 
        statuses: [LoanStatus.PERFORMING, LoanStatus.WATCH, LoanStatus.SUBSTANDARD, LoanStatus.DOUBTFUL] 
      })
      .getRawOne();

    return {
      disbursedCount: {
        value: disbursedCount,
        description: "New loans to small businesses"
      },
      outstandingCount: {
        value: outstandingCount,
        description: "Active loans to small businesses"
      },
      disbursedValue: {
        value: Number(disbursedValue.value) || 0,
        description: "Amount lent to small businesses"
      },
      outstandingValue: {
        value: Number(outstandingValue.value) || 0,
        description: "Balance from small businesses"
      }
    };
  }

  private async getYouthEntitiesData(organizationId: number) {
    // Number of disbursed loans to youth entities
    const disbursedCount = await this.loanRepository
      .createQueryBuilder('loan')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.businessType = :businessType', { businessType: BusinessType.YOUTH_BUSINESS })
      .andWhere('loan.status = :status', { status: LoanStatus.DISBURSED })
      .getCount();

    // Number of outstanding loans to youth entities
    const outstandingCount = await this.loanRepository
      .createQueryBuilder('loan')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.businessType = :businessType', { businessType: BusinessType.YOUTH_BUSINESS })
      .andWhere('loan.status IN (:...statuses)', { 
        statuses: [LoanStatus.PERFORMING, LoanStatus.WATCH, LoanStatus.SUBSTANDARD, LoanStatus.DOUBTFUL] 
      })
      .getCount();

    // Value of disbursed loans to youth entities
    const disbursedValue = await this.loanRepository
      .createQueryBuilder('loan')
      .select('COALESCE(SUM(loan.disbursedAmount), 0)', 'value')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.businessType = :businessType', { businessType: BusinessType.YOUTH_BUSINESS })
      .andWhere('loan.status = :status', { status: LoanStatus.DISBURSED })
      .getRawOne();

    // Value of outstanding loans to youth entities
    const outstandingValue = await this.loanRepository
      .createQueryBuilder('loan')
      .select('COALESCE(SUM(loan.outstandingPrincipal), 0)', 'value')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.businessType = :businessType', { businessType: BusinessType.YOUTH_BUSINESS })
      .andWhere('loan.status IN (:...statuses)', { 
        statuses: [LoanStatus.PERFORMING, LoanStatus.WATCH, LoanStatus.SUBSTANDARD, LoanStatus.DOUBTFUL] 
      })
      .getRawOne();

    return {
      disbursedCount: {
        value: disbursedCount,
        description: "New loans to youth businesses"
      },
      outstandingCount: {
        value: outstandingCount,
        description: "Active loans to youth businesses"
      },
      disbursedValue: {
        value: Number(disbursedValue.value) || 0,
        description: "Amount lent to youth businesses"
      },
      outstandingValue: {
        value: Number(outstandingValue.value) || 0,
        description: "Balance from youth businesses"
      }
    };
  }

  private async getLoanApplicationsData(organizationId: number) {
    // Number of loans applied for
    const appliedCount = await this.loanRepository
      .createQueryBuilder('loan')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .getCount();

    // Number of loans rejected
    const rejectedCount = await this.loanRepository
      .createQueryBuilder('loan')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.status = :status', { status: LoanStatus.REJECTED })
      .getCount();

    // Amount of loans applied for
    const appliedAmount = await this.loanRepository
      .createQueryBuilder('loan')
      .select('COALESCE(SUM(loan.disbursedAmount), 0)', 'amount')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .getRawOne();

    // Amount of loans rejected
    const rejectedAmount = await this.loanRepository
      .createQueryBuilder('loan')
      .select('COALESCE(SUM(loan.disbursedAmount), 0)', 'amount')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.status = :status', { status: LoanStatus.REJECTED })
      .getRawOne();

    return {
      appliedCount: {
        value: appliedCount,
        description: "Total applications received"
      },
      rejectedCount: {
        value: rejectedCount,
        description: "Applications not approved"
      },
      appliedAmount: {
        value: Number(appliedAmount.amount) || 0,
        description: "Total amount requested"
      },
      rejectedAmount: {
        value: Number(rejectedAmount.amount) || 0,
        description: "Total amount rejected"
      }
    };
  }

  private async getStaffNumbersData(organizationId: number) {
    // Note: User entity may need a gender field added
    // For now, returning placeholder data
    
    const men = await this.userRepository
      .createQueryBuilder('user')
      .where('user.organizationId = :organizationId', { organizationId })
      .andWhere('user.isActive = :isActive', { isActive: true })
      .andWhere('user.role NOT IN (:...excludedRoles)', { 
        excludedRoles: ['client', 'system_owner'] 
      })
      .getCount();

    // Since gender field doesn't exist in User entity yet
    // Return total as men and 0 as women
    // This should be updated once gender field is added
    
    return {
      men: {
        value: men,
        description: "Male employees"
      },
      women: {
        value: 0,
        description: "Female employees (gender field needs to be added to User entity)"
      },
      total: {
        value: men,
        description: "Total staff"
      }
    };
  }

  private async getBoardMembersData(organizationId: number) {
    // Note: BoardDirector entity may need a gender field added
    
    const totalDirectors = await this.boardDirectorRepository
      .createQueryBuilder('director')
      .where('director.organizationId = :organizationId', { organizationId })
      .andWhere('director.isActive = :isActive', { isActive: true })
      .getCount();

    // Since gender field doesn't exist in BoardDirector entity yet
    // Return placeholder data
    
    return {
      men: {
        value: totalDirectors,
        description: "Male directors (gender field needs to be added to BoardDirector entity)"
      },
      women: {
        value: 0,
        description: "Female directors (gender field needs to be added to BoardDirector entity)"
      },
      total: {
        value: totalDirectors,
        description: "Total board members"
      }
    };
  }

  private async getShareholdersData(organizationId: number) {
    // Count individual male shareholders - FIXED: Remove LOWER() from enum comparison
    const menCount = await this.individualShareholderRepository
      .createQueryBuilder('shareholder')
      .where('shareholder.organizationId = :organizationId', { organizationId })
      .andWhere('shareholder.isActive = :isActive', { isActive: true })
      .andWhere('shareholder.gender = :gender', { gender: 'male' }) // FIXED: Direct comparison
      .getCount();

    // Count individual female shareholders - FIXED: Remove LOWER() from enum comparison
    const womenCount = await this.individualShareholderRepository
      .createQueryBuilder('shareholder')
      .where('shareholder.organizationId = :organizationId', { organizationId })
      .andWhere('shareholder.isActive = :isActive', { isActive: true })
      .andWhere('shareholder.gender = :gender', { gender: 'female' }) // FIXED: Direct comparison
      .getCount();

    // Count institution shareholders
    const legalEntitiesCount = await this.institutionShareholderRepository
      .createQueryBuilder('institution')
      .where('institution.organizationId = :organizationId', { organizationId })
      .andWhere('institution.isActive = :isActive', { isActive: true })
      .getCount();

    const total = menCount + womenCount + legalEntitiesCount;

    return {
      men: {
        value: menCount,
        description: "Male shareholders"
      },
      women: {
        value: womenCount,
        description: "Female shareholders"
      },
      legalEntities: {
        value: legalEntitiesCount,
        description: "Company shareholders"
      },
      total: {
        value: total,
        description: "Total shareholders"
      }
    };
  }
}