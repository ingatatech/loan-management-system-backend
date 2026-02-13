// @ts-nocheck

import { Repository, In } from "typeorm";
import { Loan, LoanStatus, BusinessType, EconomicSector, RepaymentFrequency } from "../entities/Loan";
import { BorrowerProfile, Gender } from "../entities/BorrowerProfile";
import { LoanClassification, LoanClass } from "../entities/LoanClassification";

interface SupplementaryInfoResponse {
  success: boolean;
  message: string;
  data?: {
    reportPeriod: {
      quarter: string;
      year: number;
      startDate: string;
      endDate: string;
    };
    outstandingLoans: {
      numberByCategory: any;
      valueByGender: any;
      valueBySector: any;
      classification: any;
    };
    newLoans: {
      numberByCategory: any;
      valueByGender: any;
      valueBySector: any;
      validation: any;
    };
  };
}

export class SupplementaryInformationService {
  constructor(
    private loanRepository: Repository<Loan>,
    private borrowerRepository: Repository<BorrowerProfile>,
    private classificationRepository: Repository<LoanClassification>
  ) {}

  async getSupplementaryInformation(organizationId: number): Promise<SupplementaryInfoResponse> {
    try {
      console.log('=== GET SUPPLEMENTARY INFORMATION START ===');
      
      // Calculate current quarter
      const today = new Date();
      const currentQuarter = Math.floor(today.getMonth() / 3) + 1;
      const currentYear = today.getFullYear();
      
      // Calculate quarter date range
      const quarterStartMonth = (currentQuarter - 1) * 3;
      const quarterStartDate = new Date(currentYear, quarterStartMonth, 1);
      const quarterEndDate = new Date(currentYear, quarterStartMonth + 3, 0);

      console.log('Quarter Info:', {
        quarter: currentQuarter,
        year: currentYear,
        startDate: quarterStartDate.toISOString().split('T')[0],
        endDate: quarterEndDate.toISOString().split('T')[0]
      });

      // Get Outstanding Loans Data (Quarter End)
      const outstandingLoans = await this.getOutstandingLoansData(
        organizationId,
        quarterEndDate
      );

      // Get New Loans Data (This Quarter)
      const newLoans = await this.getNewLoansData(
        organizationId,
        quarterStartDate,
        quarterEndDate
      );

      return {
        success: true,
        message: "Supplementary information retrieved successfully",
        data: {
          reportPeriod: {
            quarter: `Q${currentQuarter}`,
            year: currentYear,
            startDate: quarterStartDate.toISOString().split('T')[0],
            endDate: quarterEndDate.toISOString().split('T')[0]
          },
          outstandingLoans,
          newLoans
        }
      };

    } catch (error: any) {
      console.error('Error fetching supplementary information:', error);
      return {
        success: false,
        message: error.message || "Failed to retrieve supplementary information"
      };
    }
  }

  private async getOutstandingLoansData(organizationId: number, asOfDate: Date) {
    console.log('Fetching outstanding loans data...');

    // Filter: Only QUARTERLY loans with active statuses
    const quarterlyLoans = await this.loanRepository
      .createQueryBuilder('loan')
      .leftJoinAndSelect('loan.borrower', 'borrower')
      .leftJoinAndSelect('loan.classifications', 'classifications')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.repaymentFrequency = :frequency', { 
        frequency: RepaymentFrequency.QUARTERLY 
      })
      .andWhere('loan.status IN (:...statuses)', {
        statuses: [
          LoanStatus.PERFORMING,
          LoanStatus.WATCH,
          LoanStatus.SUBSTANDARD,
          LoanStatus.DOUBTFUL
        ]
      })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .getMany();

    console.log(`Found ${quarterlyLoans.length} quarterly loans`);

    // 1. Number of Loans by Category
    const numberByCategory = this.calculateNumberByCategory(quarterlyLoans);

    // 2. Value of Loans by Gender
    const valueByGender = this.calculateValueByGender(quarterlyLoans);

    // 3. Value of Loans by Economic Sector
    const valueBySector = this.calculateValueBySector(quarterlyLoans);

    // 4. Loan Classification
    const classification = await this.calculateLoanClassification(
      organizationId,
      quarterlyLoans,
      asOfDate
    );

    // Validation
    const grossLoans = valueByGender.total.amount;
    const genderValidation = {
      isValid: Math.abs(grossLoans - valueByGender.total.amount) < 0.01,
      message: grossLoans === valueByGender.total.amount 
        ? "Value by Gender equals Gross Loans" 
        : "Value by Gender does NOT equal Gross Loans"
    };

    const sectorValidation = {
      isValid: Math.abs(grossLoans - valueBySector.total.amount) < 0.01,
      message: grossLoans === valueBySector.total.amount 
        ? "Value by Sector equals Gross Loans" 
        : "Value by Sector does NOT equal Gross Loans"
    };

    valueByGender.validation = genderValidation;
    valueBySector.validation = sectorValidation;

    return {
      numberByCategory,
      valueByGender,
      valueBySector,
      classification
    };
  }

  private calculateNumberByCategory(loans: Loan[]) {
    let menCount = 0;
    let womenCount = 0;
    let groupsAndEntitiesCount = 0;

    for (const loan of loans) {
      if (!loan.borrower) continue;

      // Groups & Entities: Based on businessType
      if (loan.businessType && [
        BusinessType.PUBLIC_COMPANY,
        BusinessType.PRIVATE_COMPANY,
        BusinessType.COOPERATIVE,
        BusinessType.PARTNERSHIP,
        BusinessType.FOUNDATION
      ].includes(loan.businessType)) {
        groupsAndEntitiesCount++;
      } 
      // Men: Male individual borrowers
      else if (loan.borrower.gender === Gender.MALE) {
        menCount++;
      }
      // Women: Female individual borrowers
      else if (loan.borrower.gender === Gender.FEMALE) {
        womenCount++;
      }
    }

    return {
      men: { 
        count: menCount, 
        description: "Active male borrowers" 
      },
      women: { 
        count: womenCount, 
        description: "Active female borrowers" 
      },
      groupsAndEntities: { 
        count: groupsAndEntitiesCount, 
        description: "Active business/organization borrowers" 
      },
      total: { 
        count: menCount + womenCount + groupsAndEntitiesCount 
      }
    };
  }

  private calculateValueByGender(loans: Loan[]) {
    let menAmount = 0;
    let womenAmount = 0;
    let groupsAndEntitiesAmount = 0;

    for (const loan of loans) {
      if (!loan.borrower) continue;

      const outstandingPrincipal = Number(loan.outstandingPrincipal) || 0;

      // Groups & Entities
      if (loan.businessType && [
        BusinessType.PUBLIC_COMPANY,
        BusinessType.PRIVATE_COMPANY,
        BusinessType.COOPERATIVE,
        BusinessType.PARTNERSHIP,
        BusinessType.FOUNDATION
      ].includes(loan.businessType)) {
        groupsAndEntitiesAmount += outstandingPrincipal;
      }
      // Men
      else if (loan.borrower.gender === Gender.MALE) {
        menAmount += outstandingPrincipal;
      }
      // Women
      else if (loan.borrower.gender === Gender.FEMALE) {
        womenAmount += outstandingPrincipal;
      }
    }

    const total = menAmount + womenAmount + groupsAndEntitiesAmount;

    return {
      men: { amount: Math.round(menAmount * 100) / 100 },
      women: { amount: Math.round(womenAmount * 100) / 100 },
      groupsAndEntities: { amount: Math.round(groupsAndEntitiesAmount * 100) / 100 },
      total: { amount: Math.round(total * 100) / 100 }
    };
  }

  private calculateValueBySector(loans: Loan[]) {
    let agriculture = 0;
    let publicWorks = 0;
    let commerce = 0;
    let transport = 0;
    let others = 0;

    for (const loan of loans) {
      const outstandingPrincipal = Number(loan.outstandingPrincipal) || 0;

      switch (loan.economicSector) {
        case EconomicSector.AGRICULTURE_LIVESTOCK_FISHING:
          agriculture += outstandingPrincipal;
          break;
        case EconomicSector.PUBLIC_WORKS_CONSTRUCTION:
          publicWorks += outstandingPrincipal;
          break;
        case EconomicSector.COMMERCE_RESTAURANTS_HOTELS:
          commerce += outstandingPrincipal;
          break;
        case EconomicSector.TRANSPORT_WAREHOUSES:
          transport += outstandingPrincipal;
          break;
        default:
          others += outstandingPrincipal;
      }
    }

    const total = agriculture + publicWorks + commerce + transport + others;

    return {
      agriculture: { 
        amount: Math.round(agriculture * 100) / 100,
        description: "Agriculture, Livestock, Fishing"
      },
      publicWorks: { 
        amount: Math.round(publicWorks * 100) / 100,
        description: "Public Works, Construction"
      },
      commerce: { 
        amount: Math.round(commerce * 100) / 100,
        description: "Commerce, Restaurants, Hotels"
      },
      transport: { 
        amount: Math.round(transport * 100) / 100,
        description: "Transport, Warehouses"
      },
      others: { 
        amount: Math.round(others * 100) / 100,
        description: "All other business types"
      },
      total: { 
        amount: Math.round(total * 100) / 100 
      }
    };
  }

  private async calculateLoanClassification(
    organizationId: number,
    loans: Loan[],
    asOfDate: Date
  ) {
    const classification = {
      current: { count: 0, amount: 0, description: "Loans 0 days overdue" },
      watch: { count: 0, amount: 0, description: "Loans 1-89 days late" },
      substandard: { count: 0, amount: 0, description: "Loans 90-179 days late" },
      doubtful: { count: 0, amount: 0, description: "Loans 180-359 days late" },
      loss: { count: 0, amount: 0, description: "Loans 360+ days late" },
      restructured: { count: 0, amount: 0, description: "Modified loan terms" },
      total: { count: 0, amount: 0 }
    };

    for (const loan of loans) {
      const outstandingPrincipal = Number(loan.outstandingPrincipal) || 0;
      const daysOverdue = loan.daysInArrears || 0;

      // Classify based on days overdue
      if (daysOverdue === 0) {
        classification.current.count++;
        classification.current.amount += outstandingPrincipal;
      } else if (daysOverdue >= 1 && daysOverdue <= 89) {
        classification.watch.count++;
        classification.watch.amount += outstandingPrincipal;
      } else if (daysOverdue >= 90 && daysOverdue <= 179) {
        classification.substandard.count++;
        classification.substandard.amount += outstandingPrincipal;
      } else if (daysOverdue >= 180 && daysOverdue <= 359) {
        classification.doubtful.count++;
        classification.doubtful.amount += outstandingPrincipal;
      } else if (daysOverdue >= 360) {
        classification.loss.count++;
        classification.loss.amount += outstandingPrincipal;
      }

      // Check for restructured loans (based on notes containing "restructur")
      if (loan.notes && loan.notes.toLowerCase().includes('restructur')) {
        classification.restructured.count++;
        classification.restructured.amount += outstandingPrincipal;
      }

      classification.total.count++;
      classification.total.amount += outstandingPrincipal;
    }

    // Round amounts
    Object.keys(classification).forEach(key => {
      if (key !== 'total') {
        classification[key].amount = Math.round(classification[key].amount * 100) / 100;
      }
    });
    classification.total.amount = Math.round(classification.total.amount * 100) / 100;

    // Validation
    const validation = {
      isValid: classification.total.count === loans.length,
      message: classification.total.count === loans.length
        ? "Classification Total equals Gross Loans"
        : "Classification Total does NOT equal Gross Loans"
    };

    return {
      ...classification,
      validation
    };
  }

  private async getNewLoansData(
    organizationId: number,
    quarterStartDate: Date,
    quarterEndDate: Date
  ) {
    console.log('Fetching new loans data...');

    // Filter: QUARTERLY loans disbursed in current quarter
    const newQuarterlyLoans = await this.loanRepository
      .createQueryBuilder('loan')
      .leftJoinAndSelect('loan.borrower', 'borrower')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.repaymentFrequency = :frequency', { 
        frequency: RepaymentFrequency.QUARTERLY 
      })
      .andWhere('loan.disbursementDate >= :startDate', { startDate: quarterStartDate })
      .andWhere('loan.disbursementDate <= :endDate', { endDate: quarterEndDate })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .getMany();

    console.log(`Found ${newQuarterlyLoans.length} new quarterly loans`);

    // 1. Number of New Loans
    const numberByCategory = this.calculateNumberByCategory(newQuarterlyLoans);

    // 2. Value of New Loans by Gender (using disbursedAmount)
    const valueByGender = this.calculateNewLoansValueByGender(newQuarterlyLoans);

    // 3. Value of New Loans by Sector (using disbursedAmount)
    const valueBySector = this.calculateNewLoansValueBySector(newQuarterlyLoans);

    // Validation: Gender MUST EQUAL Sector
    const validation = {
      genderEqualsSector: Math.abs(valueByGender.total.amount - valueBySector.total.amount) < 0.01,
      message: valueByGender.total.amount === valueBySector.total.amount
        ? "New Loans by Gender EQUALS New Loans by Sector"
        : "ERROR: New Loans by Gender does NOT EQUAL New Loans by Sector"
    };

    return {
      numberByCategory,
      valueByGender,
      valueBySector,
      validation
    };
  }

  private calculateNewLoansValueByGender(loans: Loan[]) {
    let menAmount = 0;
    let womenAmount = 0;
    let groupsAndEntitiesAmount = 0;

    for (const loan of loans) {
      if (!loan.borrower) continue;

      const disbursedAmount = Number(loan.disbursedAmount) || 0;

      // Groups & Entities
      if (loan.businessType && [
        BusinessType.PUBLIC_COMPANY,
        BusinessType.PRIVATE_COMPANY,
        BusinessType.COOPERATIVE,
        BusinessType.PARTNERSHIP,
        BusinessType.FOUNDATION
      ].includes(loan.businessType)) {
        groupsAndEntitiesAmount += disbursedAmount;
      }
      // Men
      else if (loan.borrower.gender === Gender.MALE) {
        menAmount += disbursedAmount;
      }
      // Women
      else if (loan.borrower.gender === Gender.FEMALE) {
        womenAmount += disbursedAmount;
      }
    }

    const total = menAmount + womenAmount + groupsAndEntitiesAmount;

    return {
      men: { 
        amount: Math.round(menAmount * 100) / 100,
        description: "Amount lent to new male clients"
      },
      women: { 
        amount: Math.round(womenAmount * 100) / 100,
        description: "Amount lent to new female clients"
      },
      groupsAndEntities: { 
        amount: Math.round(groupsAndEntitiesAmount * 100) / 100,
        description: "Amount lent to new organizations"
      },
      total: { 
        amount: Math.round(total * 100) / 100 
      }
    };
  }

  private calculateNewLoansValueBySector(loans: Loan[]) {
    let agriculture = 0;
    let publicWorks = 0;
    let commerce = 0;
    let transport = 0;
    let others = 0;

    for (const loan of loans) {
      const disbursedAmount = Number(loan.disbursedAmount) || 0;

      switch (loan.economicSector) {
        case EconomicSector.AGRICULTURE_LIVESTOCK_FISHING:
          agriculture += disbursedAmount;
          break;
        case EconomicSector.PUBLIC_WORKS_CONSTRUCTION:
          publicWorks += disbursedAmount;
          break;
        case EconomicSector.COMMERCE_RESTAURANTS_HOTELS:
          commerce += disbursedAmount;
          break;
        case EconomicSector.TRANSPORT_WAREHOUSES:
          transport += disbursedAmount;
          break;
        default:
          others += disbursedAmount;
      }
    }

    const total = agriculture + publicWorks + commerce + transport + others;

    return {
      agriculture: { 
        amount: Math.round(agriculture * 100) / 100,
        description: "New loans to farming sector"
      },
      publicWorks: { 
        amount: Math.round(publicWorks * 100) / 100,
        description: "New loans to construction"
      },
      commerce: { 
        amount: Math.round(commerce * 100) / 100,
        description: "New loans to retail/hospitality"
      },
      transport: { 
        amount: Math.round(transport * 100) / 100,
        description: "New loans to transport sector"
      },
      others: { 
        amount: Math.round(others * 100) / 100,
        description: "New loans to other sectors"
      },
      total: { 
        amount: Math.round(total * 100) / 100 
      }
    };
  }
}