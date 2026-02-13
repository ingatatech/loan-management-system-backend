// @ts-nocheck

// Import the email template functions from organizationEmailTemplates.tsx
import { 
  sendOrganizationActivationEmail,
  sendOrganizationDeactivationEmail 
} from '../templates/organizationEmailTemplates';

/**
 * Sends email notification when organization is activated
 * @param organizationData - Organization data with admin user info
 * @param activatedByUser - User who performed the activation
 */
export const sendActivationNotification = async (
  organizationData: any,
  activatedByUser: { username: string; email: string }
): Promise<void> => {
  try {
    // Get admin user email from the organization's users array
    let adminEmail = null;
    let organizationName = organizationData.name;

    // First try to get email from organization.email field (organization admin email)
    if (organizationData.email) {
      adminEmail = organizationData.email;
    } 
    // If not found, try to get from the first user in users array (admin user)
    else if (organizationData.users && organizationData.users.length > 0) {
      // Find the first user with client role (which is the admin)
      const adminUser = organizationData.users.find(user => user.role === 'client');
      if (adminUser && adminUser.email) {
        adminEmail = adminUser.email;
      }
    }
    // Last resort: try to get from adminUser property if it exists
    else if (organizationData.adminUser && organizationData.adminUser.email) {
      adminEmail = organizationData.adminUser.email;
    }

    if (!adminEmail) {
      throw new Error('No admin email found for organization activation notification');
    }

    const activatedBy = `${activatedByUser.username} (${activatedByUser.email})`;

    // Send activation email notification to the dynamic admin email
    await sendOrganizationActivationEmail(
      organizationName,
      adminEmail, // This is now dynamic based on organization data
      activatedBy
    );

    console.log(`Activation notification sent to ${adminEmail} for organization: ${organizationName}`);
  } catch (error) {
    console.error('Failed to send activation notification:', error);
    throw new Error(`Failed to send activation notification: ${error}`);
  }
};

/**
 * Sends email notification when organization is deactivated
 * @param organizationData - Organization data with admin user info
 * @param deactivatedByUser - User who performed the deactivation
 */
export const sendDeactivationNotification = async (
  organizationData: any,
  deactivatedByUser: { username: string; email: string }
): Promise<void> => {
  try {
    // Get admin user email from the organization's users array
    let adminEmail = null;
    let organizationName = organizationData.name;

    // First try to get email from organization.email field (organization admin email)
    if (organizationData.email) {
      adminEmail = organizationData.email;
    } 
    // If not found, try to get from the first user in users array (admin user)
    else if (organizationData.users && organizationData.users.length > 0) {
      // Find the first user with client role (which is the admin)
      const adminUser = organizationData.users.find(user => user.role === 'client');
      if (adminUser && adminUser.email) {
        adminEmail = adminUser.email;
      }
    }
    // Last resort: try to get from adminUser property if it exists
    else if (organizationData.adminUser && organizationData.adminUser.email) {
      adminEmail = organizationData.adminUser.email;
    }

    if (!adminEmail) {
      throw new Error('No admin email found for organization deactivation notification');
    }

    const deactivatedBy = `${deactivatedByUser.username} (${deactivatedByUser.email})`;

    // Send deactivation email notification to the dynamic admin email
    await sendOrganizationDeactivationEmail(
      organizationName,
      adminEmail, // This is now dynamic based on organization data
      deactivatedBy
    );

    console.log(`Deactivation notification sent to ${adminEmail} for organization: ${organizationName}`);
  } catch (error) {
    console.error('Failed to send deactivation notification:', error);
    throw new Error(`Failed to send deactivation notification: ${error}`);
  }
};

/**
 * Enhanced activate organization function with email notification
 * Use this in your organizationService.activateOrganization method
 */
export const activateOrganizationWithNotification = async (
  organizationId: number,
  activatedByUserId: number,
  organizationRepository: any,
  userRepository: any
): Promise<any> => {
  try {
    // Get organization with relations
    const organization = await organizationRepository.findOne({
      where: { id: organizationId },
      relations: ['users']
    });

    if (!organization) {
      return {
        success: false,
        message: 'Organization not found'
      };
    }

    // Get user who activated
    const activatedByUser = await userRepository.findOne({
      where: { id: activatedByUserId }
    });

    if (!activatedByUser) {
      return {
        success: false,
        message: 'Activating user not found'
      };
    }

    // Update organization status
    organization.isActive = true;
    organization.updatedBy = activatedByUserId;
    await organizationRepository.save(organization);

    // Send activation notification email
    await sendActivationNotification(organization, activatedByUser);

    return {
      success: true,
      message: 'Organization activated successfully and notification sent',
      data: organization
    };
  } catch (error) {
    console.error('Error in activateOrganizationWithNotification:', error);
    return {
      success: false,
      message: 'Failed to activate organization',
      error: error
    };
  }
};

/**
 * Enhanced deactivate organization function with email notification
 * Use this in your organizationService.deactivateOrganization method
 */
export const deactivateOrganizationWithNotification = async (
  organizationId: number,
  deactivatedByUserId: number,
  organizationRepository: any,
  userRepository: any
): Promise<any> => {
  try {
    // Get organization with relations
    const organization = await organizationRepository.findOne({
      where: { id: organizationId },
      relations: ['users']
    });

    if (!organization) {
      return {
        success: false,
        message: 'Organization not found'
      };
    }

    // Get user who deactivated
    const deactivatedByUser = await userRepository.findOne({
      where: { id: deactivatedByUserId }
    });

    if (!deactivatedByUser) {
      return {
        success: false,
        message: 'Deactivating user not found'
      };
    }

    // Update organization status
    organization.isActive = false;
    organization.updatedBy = deactivatedByUserId;
    await organizationRepository.save(organization);

    // Send deactivation notification email
    await sendDeactivationNotification(organization, deactivatedByUser);

    return {
      success: true,
      message: 'Organization deactivated successfully and notification sent',
      data: organization
    };
  } catch (error) {
    console.error('Error in deactivateOrganizationWithNotification:', error);
    return {
      success: false,
      message: 'Failed to deactivate organization',
      error: error
    };
  }
};