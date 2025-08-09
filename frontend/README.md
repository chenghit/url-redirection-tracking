# URL Redirection Analytics Dashboard - Frontend

A modern, responsive React-based web dashboard that transforms your serverless URL redirection tracking system into a comprehensive analytics platform with real-time monitoring, interactive visualizations, and advanced data analysis capabilities.

## 🎯 Project Purpose

This frontend application serves as the user interface for the [URL Redirection Tracking System](../README.md), providing stakeholders with powerful tools to:

### **Business Intelligence & Analytics**
- **Real-time KPI Monitoring**: Track total redirections, unique sources, success rates, and performance metrics
- **Interactive Data Visualization**: Charts, graphs, and tables for trend analysis and pattern recognition
- **Advanced Filtering & Search**: Filter data by date ranges, source attribution, destination URLs, and custom criteria
- **Data Export Capabilities**: Export analytics data in CSV/JSON formats for reporting and further analysis

### **System Monitoring & Operations**
- **Health Dashboard**: Monitor system components (Lambda, DynamoDB, SQS, API Gateway) in real-time
- **Performance Metrics**: Track response times, error rates, and system throughput
- **Operational Insights**: Identify bottlenecks, monitor capacity, and ensure system reliability

### **User Experience**
- **Mobile-First Design**: Responsive interface accessible on desktop, tablet, and mobile devices
- **Accessibility Compliant**: WCAG 2.1 AA standards for inclusive user experience
- **Intuitive Navigation**: User-friendly interface requiring no technical expertise

## 🏗️ Architecture Overview

### **Frontend Technology Stack**
```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Application                     │
├─────────────────────────────────────────────────────────────┤
│ • React 19 + TypeScript  │ • Chart.js Visualizations      │
│ • Vite Build System      │ • Axios HTTP Client             │
│ • Tailwind CSS Styling  │ • React Router Navigation       │
└─────────────────────────────────────────────────────────────┘
```

### **AWS Infrastructure Architecture**
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   End Users     │───▶│   CloudFront     │───▶│   API Gateway   │
│  (Web Browser)  │    │   Distribution   │    │   (Backend)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │    S3 Bucket     │
                       │ (Static Assets)  │
                       └──────────────────┘
```

### **Key Infrastructure Components**

#### **AWS S3 Bucket**
- **Purpose**: Static website hosting for React application
- **Security**: Private bucket with Origin Access Control (OAC)
- **Features**: Versioning enabled for rollback capabilities
- **Access**: Only accessible via CloudFront distribution

#### **AWS CloudFront Distribution**
- **Purpose**: Global CDN for fast content delivery and API routing
- **Origins**: 
  - S3 bucket for static assets (HTML, CSS, JS, images)
  - API Gateway for backend API calls (`/analytics/*`, `/health*`)
- **Security**: HTTPS enforcement, security headers, API key injection
- **Caching**: Optimized caching policies for performance

#### **API Integration Strategy**
- **Development Mode**: Direct API calls using `VITE_CLOUDFRONT_URL`
- **Production Mode**: Relative paths routed through CloudFront
- **Authentication**: API keys automatically injected via CloudFront custom headers
- **Error Handling**: Automatic retry logic with exponential backoff

### **Application Structure**
```
src/
├── components/          # Reusable UI components
│   ├── charts/         # Chart.js visualizations
│   ├── forms/          # Form components and filters
│   ├── layout/         # Navigation and layout components
│   └── common/         # Shared UI elements
├── pages/              # Main application pages
│   ├── Dashboard.tsx   # Main analytics dashboard
│   ├── Analytics.tsx   # Advanced data analysis
│   └── Health.tsx      # System monitoring
├── services/           # API integration layer
│   ├── api-client.ts   # HTTP client with retry logic
│   ├── analytics-service.ts
│   └── health-service.ts
├── hooks/              # Custom React hooks
├── utils/              # Utility functions
└── types/              # TypeScript type definitions
```

## ⚠️ Security Considerations

> **IMPORTANT SECURITY NOTICE**: This frontend implementation does not include built-in authentication or WAF protection for the web dashboard itself. The current setup is designed for internal company use where access control is handled through separate corporate security measures.

### **For GitHub Users and Public Deployments**

If you're deploying this system for public or production use, you **MUST** implement additional security measures:

#### **Required Security Enhancements:**
1. **Authentication & Authorization**
   - Implement user authentication (AWS Cognito, Auth0, or custom solution)
   - Add role-based access control (RBAC) for different user types
   - Secure session management and token handling

2. **WAF Protection for Frontend**
   - Deploy AWS WAF v2 for the CloudFront distribution
   - Configure rate limiting rules for the web dashboard
   - Add geo-blocking and IP allowlisting as needed
   - Implement bot protection and DDoS mitigation

3. **Additional Security Measures**
   - Enable CloudFront access logging for audit trails
   - Implement Content Security Policy (CSP) headers
   - Add request signing or additional API authentication layers
   - Consider VPN or private network access for sensitive environments

#### **Current Security Features (Backend Only):**
- ✅ API key authentication for backend endpoints (`/analytics/*`, `/health*`)
- ✅ WAF protection for API Gateway with rate limiting
- ✅ HTTPS enforcement and security headers via CloudFront
- ✅ Origin Access Control (OAC) for S3 bucket security

#### **Security Gaps (Frontend Dashboard):**
- ❌ No user authentication for dashboard access
- ❌ No WAF protection specifically for frontend routes
- ❌ No session management or user authorization
- ❌ Dashboard is publicly accessible via CloudFront URL

**Please ensure you implement appropriate security measures before deploying to production environments.**

## 🚀 Deployment Guide

### **Prerequisites**
Before deploying the frontend, ensure you have:

- ✅ **Node.js 18+** installed
- ✅ **AWS CLI** configured with appropriate credentials
- ✅ **Backend infrastructure** already deployed (URL Redirection Tracking System)
- ✅ **Access permissions** to AWS S3, CloudFront, and API Gateway

### **Step-by-Step Deployment Procedure**

#### **Step 1: Environment Setup (CRITICAL)**
> ⚠️ **IMPORTANT**: This step is mandatory and must be completed first. The CloudFront deployment will fail if the API key value cannot be read from the environment configuration.

```bash
# Navigate to the project root directory
cd /path/to/url-redirect-tracker

# Run the automated environment setup script
./scripts/setup-frontend-config.sh
```

**What this script does:**
- Retrieves API Gateway URL from the deployed backend stack
- Extracts API key value from AWS API Gateway
- Creates `.env` file in the frontend directory with required configuration
- Validates that all required environment variables are set

**Expected output:**
```
✅ Backend stack found: UrlRedirectionTrackingStack
✅ API Gateway URL retrieved: https://your-api-id.execute-api.ap-northeast-1.amazonaws.com/prod
✅ API Key retrieved successfully
✅ Environment configuration created: frontend/.env
✅ Configuration validation passed
```

#### **Step 2: Deploy AWS Infrastructure (CDK)**
Deploy the S3 bucket and CloudFront distribution using CDK:

```bash
# Navigate to project root directory (if not already there)
cd /path/to/url-redirect-tracker

# Deploy the frontend infrastructure stack
cdk deploy FrontendStack
```

**What this creates:**
- S3 bucket for static website hosting with versioning enabled
- CloudFront distribution with custom origins for API routing
- Origin Access Control (OAC) for secure S3 access
- API key injection via CloudFront custom headers

**Expected output:**
```
✅ FrontendStack: deploying...
✅ FrontendStack: creating CloudFormation changeset...

Outputs:
FrontendStack.FrontendS3BucketName = url-redirection-frontend-abc123
FrontendStack.FrontendCloudFrontDistributionUrl = https://d1234567890abc.cloudfront.net
FrontendStack.FrontendCloudFrontDistributionId = E1234567890ABC

✅ FrontendStack: deployment complete!
```

#### **Step 3: Install Dependencies**
```bash
# Navigate to frontend directory
cd frontend

# Install all required dependencies
npm install
```

#### **Step 4: Build the Application**
Choose the appropriate build command for your target environment:

```bash
# For production deployment
npm run build:production

# For staging deployment
npm run build:staging

# For development deployment
npm run build:development
```

#### **Step 5: Upload Assets to S3**
Upload the built application to the S3 bucket and invalidate CloudFront cache:

```bash
# Deploy to production environment (uploads to S3 and invalidates CloudFront)
npm run deploy:production

# Deploy to staging environment
npm run deploy:staging

# Deploy to development environment
npm run deploy:development
```

**What this does:**
- Uploads built assets (HTML, CSS, JS, images) to the S3 bucket
- Sets appropriate content types and cache headers
- Creates CloudFront cache invalidation for immediate updates
- Verifies successful deployment

#### **Step 6: Verify Deployment**
After deployment completes, you'll receive output similar to:

```
✅ Deployment completed successfully!

📊 Frontend Dashboard URLs:
   Production:  https://d1234567890abc.cloudfront.net
   Staging:     https://d0987654321def.cloudfront.net

🔧 Infrastructure Details:
   S3 Bucket:           url-redirection-frontend-abc123
   CloudFront ID:       E1234567890ABC
   Origin Access Control: E0987654321DEF

⏱️  CloudFront propagation may take 5-15 minutes for global availability.
```

**Verification Steps:**
1. **Access the dashboard** using the provided CloudFront URL
2. **Test API connectivity** by navigating to the Health page (`/health`)
3. **Verify data loading** on the main Dashboard page
4. **Check mobile responsiveness** by accessing from mobile devices

### **Alternative Deployment Methods**

#### **Complete Pipeline Deployment**
For a full CI/CD pipeline experience with automated testing, building, and deployment:

> ⚠️ **Prerequisites**: The FrontendStack infrastructure must already be deployed via CDK before running the pipeline.

```bash
# First, ensure infrastructure is deployed
cdk deploy FrontendStack

# Then run the complete pipeline
npm run pipeline:production
```

**What the pipeline does:**
- Runs environment setup (`manage-environment.sh apply`)
- Performs pre-deployment checks (Git status, infrastructure validation)
- Runs tests, linting, and type checking
- Builds the application with optimizations
- Deploys assets to S3 and invalidates CloudFront cache
- Runs post-deployment verification tests
- Sends deployment notifications

#### **Manual Deployment with Custom Options**
For advanced users who need custom deployment options:

```bash
# Step 1: Environment setup (if not already done)
../scripts/setup-frontend-config.sh

# Step 2: Deploy infrastructure (if not already done)
cdk deploy FrontendStack

# Step 3: Build manually with custom options
npm run build
# OR with environment-specific build
../scripts/build-frontend.sh -e production --skip-tests --clean

# Step 4: Deploy with specific AWS profile and region
../scripts/deploy-frontend.sh -e production -p your-aws-profile -r ap-northeast-1
```

#### **Individual Script Usage**
For granular control over each deployment step:

```bash
# Environment management
../scripts/manage-environment.sh apply production

# Build with specific options
../scripts/build-frontend.sh -e production --skip-tests --skip-lint --clean

# Deploy with custom settings
../scripts/deploy-frontend.sh -e production --skip-backup --wait-for-invalidation

# Health check after deployment
../scripts/health-check.sh -e production
```

### **Rollback Procedure**
If you need to rollback to a previous version:
```bash
# Rollback to previous deployment
../scripts/rollback-frontend.sh -e production

# Rollback to specific version
../scripts/rollback-frontend.sh -e production -v 1.2.3
```

## 🛠️ Development Workflow

### **Local Development**
```bash
# Start development server with hot reload
npm run dev

# Access local development server
# http://localhost:5173
```

### **Code Quality & Testing**
```bash
# Run linting
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Format code with Prettier
npm run format

# Type checking
npm run type-check

# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Run end-to-end tests
npm run e2e

# Run accessibility tests
npm run test:accessibility
```

### **Performance & Security Audits**
```bash
# Run comprehensive performance audit
npm run audit:performance

# Run Lighthouse audit
npm run audit:lighthouse

# Cross-browser compatibility testing
npm run test:browsers
```

## Usage

### Main Dashboard (`/`)
- View key performance indicators (total redirections, unique sources, success rates)
- Interactive charts showing redirection trends and source attribution
- Recent activity feed with latest redirection events

### Analytics Page (`/analytics`)
- Advanced filtering by date ranges, source attribution, and destination URLs
- Detailed data tables with sorting and pagination
- Export functionality for CSV/JSON data downloads
- Multiple chart visualizations for data analysis

### Health Monitoring (`/health`)
- Real-time system status for all AWS components
- Performance metrics including response times and error rates
- Component-specific health checks (Lambda, DynamoDB, SQS, API Gateway)

## Configuration

### Environment Variables
The setup script creates a `.env` file with:
- `VITE_CLOUDFRONT_URL` - CloudFront distribution URL for API calls
- `VITE_API_BASE_URL` - Direct API Gateway URL (reference only)
- `API_KEY_VALUE` - API key for deployment pipeline
- Application metadata (name, version, environment)

### Build Configuration
- **Vite**: Modern build tool with HMR and optimizations
- **TypeScript**: Strict type checking enabled
- **ESLint + Prettier**: Code quality and formatting
- **Tailwind CSS**: Utility-first styling with responsive design

## Development Scripts

```bash
# Development
npm run dev                    # Start dev server with HMR
npm run build                  # Production build
npm run preview               # Preview production build

# Code Quality
npm run lint                  # Run ESLint
npm run type-check           # TypeScript validation
npm run format              # Format with Prettier

# Testing
npm test                     # Run unit tests
npm run e2e                  # End-to-end tests
npm run test:accessibility   # WCAG 2.1 AA compliance tests
```

## Browser Support

- **Desktop**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **Mobile**: iOS Safari 14+, Chrome Mobile 90+
- **Accessibility**: WCAG 2.1 AA compliant with screen reader support

## Troubleshooting

### Common Issues

**API Connection Problems**:
```bash
# Check environment configuration
cat .env

# Test API connectivity
curl -I https://your-cloudfront-domain.cloudfront.net/health

# Regenerate configuration
../scripts/setup-frontend-config.sh
```

**Build Issues**:
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Type checking
npm run type-check
```

**Development Server Issues**:
```bash
# Clear Vite cache
rm -rf node_modules/.vite
npm run dev
```

## Support

For issues and questions:
1. Check system health at `/health`
2. Review browser console for errors
3. Verify API connectivity and configuration
4. Create issue in the main repository

---

Built with React, TypeScript, and AWS serverless technologies.
