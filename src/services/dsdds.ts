import { In } from "typeorm";
import { LoanWorkflowService } from "../services/loanWorkflowService";
import { LoanWorkflow, WorkflowStep } from "../entities/LoanWorkflow";
import { LoanReview, ReviewDecision } from "../entities/LoanReview";
import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { LoanApplicationService, GuarantorFiles, CollateralFiles, BorrowerFiles, InstitutionFiles, ServiceResponse } from "../services/loanApplicationService";
import { BorrowerProfile, Gender, ParentsInformation, RelationshipType } from "../entities/BorrowerProfile";
import { Loan, BorrowerType, InstitutionType, MaritalStatus, LoanApprovalData, LoanStatus, ShareholderBoardMemberInfo } from "../entities/Loan";
import { LoanCollateral } from "../entities/LoanCollateral";
import { Organization } from "../entities/Organization";
import { Guarantor, ExtendedGuarantorData } from "../entities/Guarantor";
import { User, UserRole } from "../entities/User";
import { RepaymentSchedule } from "../entities/RepaymentSchedule";
import dbConnection from "../db";
import { parseISO, isValid } from 'date-fns';

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
      dbConnection.getRepository(RepaymentSchedule) as any
    );
    this.loanWorkflowService = new LoanWorkflowService(
      dbConnection.getRepository(LoanWorkflow) as any,
      dbConnection.getRepository(Loan) as any,
      dbConnection.getRepository(User) as any,
      dbConnection.getRepository(LoanReview) as any
    );
  }



  private parseDate(dateString: string): Date {
    if (!dateString) return new Date();
    const parsed = parseISO(dateString);
    return isValid(parsed) ? parsed : new Date();
  }
}

export default new LoanApplicationController();