# Multi-Tenant Loan Management System - Backend

A comprehensive, secure, and scalable multi-tenant loan management system built with Node.js, TypeScript, and PostgreSQL.

## Overview

This backend system provides a complete loan management solution with strict tenant isolation, role-based access control, and comprehensive data management capabilities for financial institutions.

## Features

### Core Features
- **Multi-Tenant Architecture**: Complete tenant isolation with organization-based data segregation
- **Role-Based Access Control**: System Owner and Client roles with granular permissions
- **Secure Authentication**: JWT-based authentication with password reset functionality
- **File Management**: Cloud storage integration with Cloudinary for document uploads
- **Data Validation**: Comprehensive input validation and sanitization
- **API Rate Limiting**: Protection against abuse with configurable rate limits

### Business Functionality
- **Organization Management**: Complete organization profiles with categories and services
- **Shareholder Management**: Individual and institutional shareholder tracking
- **Share Capital Management**: Capital contribution tracking with payment details
- **Funding Management**: Borrowing, grants, and operational funds tracking
- **Management Team**: Board directors and senior management profiles
- **Document Management**: Secure document upload and storage

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with TypeORM
- **Authentication**: JWT tokens
- **File Storage**: Cloudinary
- **Validation**: Express Validator
- **Security**: Helmet, CORS, Rate Limiting
- **Documentation**: OpenAPI/Swagger ready

The server will start on `http://localhost:3000`

## API Documentation

### Authentication Endpoints

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin_user",
  "password": "securepassword123"
}
```

#### Request Password Reset
```http
POST /api/auth/request-password-reset
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### Organization Endpoints

#### Create Organization (System Owner only)
```http
POST /api/organizations
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Example Microfinance",
  "selectedCategories": ["Microfinance", "Banking"],
  "address": {
    "country": "Rwanda",
    "province": "Kigali",
    "district": "Gasabo"
  },
  "tinNumber": "123456789",
  "website": "https://example.com",
  "email": "info@example.com",
  "phone": "+250788123456",
  "adminUsername": "admin_user",
  "adminEmail": "admin@example.com",
  "adminPassword": "SecurePassword123!",
  "adminPhone": "+250788654321"
}
```

#### Get Organizations
```http
GET /api/organizations?page=1&limit=10&search=microfinance
Authorization: Bearer <jwt_token>
```

#### Update Organization
```http
PUT /api/organizations/1
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Updated Organization Name",
  "description": "Updated description"
}
```

### Shareholder Endpoints

#### Create Individual Shareholder
```http
POST /api/organizations/1/shareholders/individual
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "firstname": "John",
  "lastname": "Doe",
  "idPassport": "1234567890123456",
  "occupation": "Business Owner",
  "phone": "+250788123456",
  "email": "john.doe@example.com",
  "physicalAddress": {
    "country": "Rwanda",
    "province": "Kigali",
    "district": "Gasabo"
  }
}
```

## Security Features

### Tenant Isolation
- Every database query automatically filters by organization ID
- Cross-tenant data access is strictly prevented
- Security violations are logged and monitored

### Authentication & Authorization
- JWT-based stateless authentication
- Role-based access control (RBAC)
- Password complexity requirements
- Account lockout after failed attempts

### Data Protection
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CSRF protection
- Rate limiting

## Database Schema

The system uses the following main entities:

- **User**: System users with role-based access
- **Organization**: Tenant organizations
- **Category**: Service categories per organization  
- **Service**: Financial services offered
- **IndividualShareholder**: Individual shareholders
- **InstitutionShareholder**: Corporate shareholders
- **ShareCapital**: Capital contributions
- **Borrowing**: Loan information
- **GrantedFunds**: Grant funding details
- **OperationalFunds**: Operational funding
- **BoardDirector**: Board member profiles
- **SeniorManagement**: Management team profiles

## Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run migration:generate  # Generate database migration
npm run migration:run      # Run pending migrations
npm run lint         # Run ESLint
npm run test         # Run tests
```

### Code Quality
- TypeScript for type safety
- ESLint for code quality
- Prettier for formatting
- Comprehensive validation
- Error handling

## Deployment

### Production Build
```bash
npm run build
npm start
```

### Environment Variables for Production
```env
NODE_ENV=production
PORT=3000
DB_HOST=your_production_db_host
# ... other production values
```

### Docker Deployment
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
```

## Monitoring & Logging

- Request/response logging
- Error tracking and reporting
- Performance monitoring
- Security event logging
- Database query logging

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is proprietary and confidential.

## Support

For support and questions, please contact the development team.