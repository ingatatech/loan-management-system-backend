// @ts-nocheck
import { Repository } from "typeorm";
import { LoanWorkflow, WorkflowStep, WorkflowStatus, WorkflowHistoryEntry } from "../entities/LoanWorkflow";
import { Loan, LoanStatus } from "../entities/Loan";
import { User, UserRole } from "../entities/User";
import { LoanReview, ReviewDecision } from "../entities/LoanReview";

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

export interface AvailableReviewer {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  currentWorkload: number;
  isAvailable: boolean;
}

export class LoanWorkflowService {
  constructor(
    private workflowRepository: Repository<LoanWorkflow>,
    private loanRepository: Repository<Loan>,
    private userRepository: Repository<User>,
    private reviewRepository: Repository<LoanReview>
  ) {}

/**
 * Initialize workflow when loan is created
 * ✅ FIXED: Check if workflow already exists before creating
 */

async initializeWorkflow(
  loanId: number,
  initialAssigneeId: number,
  organizationId: number
): Promise<ServiceResponse> {
  try {
    console.log('=== INITIALIZE WORKFLOW START ===');
    console.log({ loanId, initialAssigneeId, organizationId });

    // ✅ FIX: Check if workflow already exists
    const existingWorkflow = await this.workflowRepository.findOne({
      where: { loanId, organizationId }
    });

    if (existingWorkflow) {
      console.log('✓ Workflow already exists, returning existing workflow:', existingWorkflow.id);
      return {
        success: true,
        message: "Workflow already exists for this loan",
        data: existingWorkflow
      };
    }

    // Get assignee details
    const assignee = await this.userRepository.findOne({
      where: { id: initialAssigneeId, organizationId }
    });

    if (!assignee) {
      return {
        success: false,
        message: "Initial assignee not found"
      };
    }

    // Create workflow
    const workflow = this.workflowRepository.create({
      loanId,
      currentStep: WorkflowStep.LOAN_OFFICER,
      currentAssigneeId: initialAssigneeId,
      status: WorkflowStatus.IN_PROGRESS,
      organizationId,
      workflowHistory: [{
        timestamp: new Date(),
        action: 'created',
        toUserId: initialAssigneeId,
        toUserName: `${assignee.firstName || ''} ${assignee.lastName || assignee.username}`.trim(),
        toUserRole: assignee.role,
        toStep: WorkflowStep.LOAN_OFFICER,
        message: 'Loan workflow initialized'
      }],
      startedAt: new Date()
    });

    const savedWorkflow = await this.workflowRepository.save(workflow);
    console.log('✓ Workflow initialized:', savedWorkflow.id);

    return {
      success: true,
      message: "Workflow initialized successfully",
      data: savedWorkflow
    };

  } catch (error: any) {
    console.error('Initialize workflow error:', error);
    return {
      success: false,
      message: error.message || "Failed to initialize workflow"
    };
  }
}

  /**
   * Get workflow for a loan
   */
  async getWorkflowForLoan(
    loanId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const workflow = await this.workflowRepository.findOne({
        where: { loanId, organizationId },
        relations: ['loan', 'loan.borrower', 'currentAssignee']
      });

      if (!workflow) {
        return {
          success: false,
          message: "Workflow not found for this loan"
        };
      }

      return {
        success: true,
        message: "Workflow retrieved successfully",
        data: workflow
      };

    } catch (error: any) {
      console.error('Get workflow error:', error);
      return {
        success: false,
        message: "Failed to retrieve workflow"
      };
    }
  }

  /**
   * Get available reviewers for next step
   */
  async getAvailableReviewers(
    organizationId: number,
    targetStep: WorkflowStep
  ): Promise<ServiceResponse<AvailableReviewer[]>> {
    try {
      // Map workflow step to user role
      const roleMap: Record<WorkflowStep, UserRole> = {
        [WorkflowStep.LOAN_OFFICER]: UserRole.STAFF,
        [WorkflowStep.BOARD_DIRECTOR]: UserRole.MANAGER,
        [WorkflowStep.SENIOR_MANAGER]: UserRole.MANAGER,
        [WorkflowStep.MANAGING_DIRECTOR]: UserRole.CLIENT
      };

      const targetRole = roleMap[targetStep];

      // Get active users with target role
      const users = await this.userRepository.find({
        where: {
          organizationId,
          role: targetRole,
          isActive: true
        }
      });

      // Calculate workload for each user
      const reviewers: AvailableReviewer[] = await Promise.all(
        users.map(async (user) => {
          const workload = await this.workflowRepository.count({
            where: {
              currentAssigneeId: user.id,
              status: WorkflowStatus.IN_PROGRESS,
              organizationId
            }
          });

          return {
            id: user.id,
            name: `${user.firstName || ''} ${user.lastName || user.username}`.trim(),
            email: user.email,
            role: user.role,
            currentWorkload: workload,
            isAvailable: workload < 10 // Max 10 pending loans
          };
        })
      );

      // Sort by workload (ascending)
      reviewers.sort((a, b) => a.currentWorkload - b.currentWorkload);

      return {
        success: true,
        message: "Available reviewers retrieved successfully",
        data: reviewers
      };

    } catch (error: any) {
      console.error('Get available reviewers error:', error);
      return {
        success: false,
        message: "Failed to retrieve available reviewers",
        data: []
      };
    }
  }

  /**
   * Reassign loan to different reviewer at same step
   */
  async reassignLoan(
    loanId: number,
    fromUserId: number,
    toUserId: number,
    reason: string,
    organizationId: number,
    reassignedBy: number
  ): Promise<ServiceResponse> {
    try {
      const workflow = await this.workflowRepository.findOne({
        where: { loanId, organizationId }
      });

      if (!workflow) {
        return {
          success: false,
          message: "Workflow not found"
        };
      }

      if (workflow.currentAssigneeId !== fromUserId) {
        return {
          success: false,
          message: "Loan is not currently assigned to the specified user"
        };
      }

      const toUser = await this.userRepository.findOne({
        where: { id: toUserId, organizationId, isActive: true }
      });

      if (!toUser) {
        return {
          success: false,
          message: "Target user not found or inactive"
        };
      }

      const fromUser = await this.userRepository.findOne({
        where: { id: fromUserId }
      });

      const reassigner = await this.userRepository.findOne({
        where: { id: reassignedBy }
      });

      workflow.currentAssigneeId = toUserId;
      workflow.addHistoryEntry({
        timestamp: new Date(),
        action: 'reassigned',
        fromUserId,
        fromUserName: fromUser ? `${fromUser.firstName || ''} ${fromUser.lastName || fromUser.username}`.trim() : 'Unknown',
        toUserId,
        toUserName: `${toUser.firstName || ''} ${toUser.lastName || toUser.username}`.trim(),
        toUserRole: toUser.role,
        message: `Reassigned by ${reassigner?.firstName || ''} ${reassigner?.lastName || reassigner?.username || 'Unknown'}: ${reason}`
      });

      const savedWorkflow = await this.workflowRepository.save(workflow);

      return {
        success: true,
        message: "Loan reassigned successfully",
        data: savedWorkflow
      };

    } catch (error: any) {
      console.error('Reassign loan error:', error);
      return {
        success: false,
        message: error.message || "Failed to reassign loan"
      };
    }
  }

  /**
   * Enhanced getMyAssignedLoans with role-based filtering
   */
  async getMyAssignedLoans(
    userId: number,
    organizationId: number,
    page: number = 1,
    limit: number = 10,
    statusFilter?: string,
    userRole?: UserRole
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;

      const queryBuilder = this.workflowRepository
        .createQueryBuilder('workflow')
        .leftJoinAndSelect('workflow.loan', 'loan')
        .leftJoinAndSelect('loan.borrower', 'borrower')
        .leftJoinAndSelect('workflow.currentAssignee', 'assignee')
        .where('workflow.currentAssigneeId = :userId', { userId })
        .andWhere('workflow.organizationId = :organizationId', { organizationId });

      // Apply role-based filtering
      if (userRole === UserRole.CLIENT) {
        // CLIENT: Only show loans at MANAGING_DIRECTOR step
        queryBuilder.andWhere('workflow.currentStep = :step', { 
          step: WorkflowStep.MANAGING_DIRECTOR 
        });
      } else if (userRole === UserRole.MANAGER) {
        // MANAGER: Show loans at BOARD_DIRECTOR or SENIOR_MANAGER steps
        queryBuilder.andWhere('workflow.currentStep IN (:...steps)', { 
          steps: [WorkflowStep.BOARD_DIRECTOR, WorkflowStep.SENIOR_MANAGER] 
        });
      }

      if (statusFilter) {
        queryBuilder.andWhere('workflow.status = :status', { status: statusFilter });
      } else {
        queryBuilder.andWhere('workflow.status = :status', { status: WorkflowStatus.IN_PROGRESS });
      }

      const [workflows, totalItems] = await queryBuilder
        .orderBy('workflow.createdAt', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      const totalPages = Math.ceil(totalItems / limit);

      // Enhance loans with workflow information
      const enhancedLoans = workflows.map(workflow => ({
        ...workflow.loan,
        workflowStatus: workflow.status,
        currentStep: workflow.currentStep,
        assignedTo: workflow.currentAssignee,
        assignedAt: workflow.startedAt,
        workflowId: workflow.id
      }));

      return {
        success: true,
        message: "Assigned loans retrieved successfully",
        data: enhancedLoans,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        }
      };

    } catch (error: any) {
      console.error('Get assigned loans error:', error);
      return {
        success: false,
        message: "Failed to retrieve assigned loans"
      };
    }
  }

  /**
   * Enhanced advanceWorkflow with better validation
   */
  async advanceWorkflow(
    loanId: number,
    reviewerId: number,
    decision: ReviewDecision,
    nextAssigneeId: number | null,
    reviewMessage: string,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      console.log('=== ADVANCE WORKFLOW ENHANCED START ===');

      const workflow = await this.workflowRepository.findOne({
        where: { loanId, organizationId },
        relations: ['currentAssignee', 'loan']
      });

      if (!workflow) {
        return {
          success: false,
          message: "Workflow not found"
        };
      }



      const reviewer = await this.userRepository.findOne({
        where: { id: reviewerId }
      });

      if (!reviewer) {
        return {
          success: false,
          message: "Reviewer not found"
        };
      }

      // Handle different decisions
      if (decision === ReviewDecision.FORWARD) {
        if (!nextAssigneeId) {
          return {
            success: false,
            message: "Next assignee is required when forwarding"
          };
        }

        const nextAssignee = await this.userRepository.findOne({
          where: { id: nextAssigneeId, organizationId }
        });

        if (!nextAssignee) {
          return {
            success: false,
            message: "Next assignee not found"
          };
        }

        const nextStep = workflow.getNextStep();
        if (!nextStep) {
          return {
            success: false,
            message: "Loan is already at final step"
          };
        }

        // Update workflow
        workflow.currentStep = nextStep;
        workflow.currentAssigneeId = nextAssigneeId;
        workflow.addHistoryEntry({
          timestamp: new Date(),
          action: 'forwarded',
          fromUserId: reviewerId,
          fromUserName: `${reviewer.firstName || ''} ${reviewer.lastName || reviewer.username}`.trim(),
          fromUserRole: reviewer.role,
          toUserId: nextAssigneeId,
          toUserName: `${nextAssignee.firstName || ''} ${nextAssignee.lastName || nextAssignee.username}`.trim(),
          toUserRole: nextAssignee.role,
          fromStep: workflow.currentStep,
          toStep: nextStep,
          message: reviewMessage,
          decision: decision
        });

      } else if (decision === ReviewDecision.APPROVE) {
        if (workflow.isAtFinalStep()) {
          // Final approval
          workflow.status = WorkflowStatus.COMPLETED;
          workflow.completedAt = new Date();
          workflow.addHistoryEntry({
            timestamp: new Date(),
            action: 'approved',
            fromUserId: reviewerId,
            fromUserName: `${reviewer.firstName || ''} ${reviewer.lastName || reviewer.username}`.trim(),
            fromUserRole: reviewer.role,
            fromStep: workflow.currentStep,
            message: reviewMessage,
            decision: decision
          });

          // Update loan status to APPROVED
          await this.loanRepository.update(loanId, {
            status: LoanStatus.APPROVED,
            approvedBy: reviewerId,
            approvedAt: new Date()
          });
        } else {
          return {
            success: false,
            message: "Cannot approve at this step. Use FORWARD to move to next step."
          };
        }

      } else if (decision === ReviewDecision.REJECT) {
        workflow.status = WorkflowStatus.REJECTED;
        workflow.completedAt = new Date();
        workflow.addHistoryEntry({
          timestamp: new Date(),
          action: 'rejected',
          fromUserId: reviewerId,
          fromUserName: `${reviewer.firstName || ''} ${reviewer.lastName || reviewer.username}`.trim(),
          fromUserRole: reviewer.role,
          fromStep: workflow.currentStep,
          message: reviewMessage,
          decision: decision
        });

        // Update loan status to REJECTED
        await this.loanRepository.update(loanId, {
          status: LoanStatus.REJECTED,
          rejectedBy: reviewerId,
          rejectedAt: new Date(),
          rejectionReason: reviewMessage
        });
      }

      const savedWorkflow = await this.workflowRepository.save(workflow);
      console.log('✓ Workflow advanced successfully');

      return {
        success: true,
        message: "Workflow advanced successfully",
        data: savedWorkflow
      };

    } catch (error: any) {
      console.error('Advance workflow error:', error);
      return {
        success: false,
        message: error.message || "Failed to advance workflow"
      };
    }
  }

/**
 * ✅ FIXED: Get workflow history for a loan with actual user data
 * This method now returns empty array when no workflow is found
 */
async getWorkflowHistory(
  loanId: number,
  organizationId: number
): Promise<ServiceResponse> {
  try {
    console.log('=== GET WORKFLOW HISTORY START ===');
    console.log({ loanId, organizationId });

    const workflow = await this.workflowRepository.findOne({
      where: { loanId, organizationId }
    });

    // ✅ FIX: Return empty array with success true when no workflow found
    if (!workflow) {
      console.log('✓ No workflow found, returning empty history');
      console.log('=== GET WORKFLOW HISTORY END ===');
      
      return {
        success: true,
        message: "Workflow history retrieved successfully",
        data: {
          workflow: null,
          history: [],
          currentStep: null,
          status: null,
          totalDuration: null,
          currentStepDuration: null
        }
      };
    }

    // ✅ FIX: Collect all unique user IDs from history
    const userIds = new Set<number>();
    (workflow.workflowHistory || []).forEach(entry => {
      if (entry.fromUserId) userIds.add(entry.fromUserId);
      if (entry.toUserId) userIds.add(entry.toUserId);
    });

    // ✅ FIX: Fetch all users in one query for efficiency
    const users = await this.userRepository.findByIds(Array.from(userIds));
    const userMap = new Map(users.map(user => [user.id, user]));

    // ✅ FIX: Enrich history with actual user data from database
    const enrichedHistory = (workflow.workflowHistory || []).map(entry => {
      const fromUser = entry.fromUserId ? userMap.get(entry.fromUserId) : null;
      const toUser = entry.toUserId ? userMap.get(entry.toUserId) : null;

      return {
        ...entry,
        // Override stored names with actual database names
        fromUserName: fromUser 
          ? `${fromUser.firstName || ''} ${fromUser.lastName || fromUser.username}`.trim() 
          : entry.fromUserName || null,
        toUserName: toUser 
          ? `${toUser.firstName || ''} ${toUser.lastName || toUser.username}`.trim() 
          : entry.toUserName || null,
        // Add full user objects
        fromUser: fromUser ? {
          id: fromUser.id,
          name: `${fromUser.firstName || ''} ${fromUser.lastName || fromUser.username}`.trim(),
          email: fromUser.email,
          role: fromUser.role
        } : null,
        toUser: toUser ? {
          id: toUser.id,
          name: `${toUser.firstName || ''} ${toUser.lastName || toUser.username}`.trim(),
          email: toUser.email,
          role: toUser.role
        } : null
      };
    });

    console.log('✓ Enriched history entries:', enrichedHistory.length);
    console.log('=== GET WORKFLOW HISTORY END ===');

    return {
      success: true,
      message: "Workflow history retrieved successfully",
      data: {
        workflow,
        history: enrichedHistory,
        currentStep: workflow.currentStep,
        status: workflow.status,
        totalDuration: workflow.getTotalDuration(),
        currentStepDuration: workflow.getCurrentStepDuration()
      }
    };

  } catch (error: any) {
    console.error('Get workflow history error:', error);
    console.log('=== GET WORKFLOW HISTORY END ===');
    
    return {
      success: false,
      message: "Failed to retrieve workflow history"
    };
  }
}
}