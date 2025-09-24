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